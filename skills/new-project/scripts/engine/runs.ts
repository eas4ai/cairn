// The two commands that execute a mechanism and record what it did.
//
// `run` executes a validator and writes one evidence record per
// obligation that lists it. `challenge` executes the challenges a
// validator declares and records what they demonstrated about noticing
// the confirmed falsifier (ENG-170 through ENG-175). Both run only
// under an execution trust context, both resolve that context and their
// dependency set through execution.ts, and both build their records
// there, so neither can drift from the other.

import { readRegistry } from "./adapters.ts";
import { authorityLabel } from "./authority.ts";
import { digest } from "./digest.ts";
import {stamp, writeRecord, writeRun, type EvidenceRecord} from "./evidence.ts";
import { clearMiss, recordMiss } from "./history.ts";
import { buildRecord, resolveInputs, resolveTrust, sharedContext, type Shared } from "./execution.ts";
import type { Obligation } from "./obligations.ts";
import type { Finding } from "./policy.ts";
import { loadObligations, printFindings, requirePolicy } from "./project.ts";
import { short } from "./render.ts";
import { currentSnapshot } from "./snapshot.ts";
import { readCorpus } from "./specs.ts";
import { gitActor, readTrustStore, trustPath, trustStoreInsideRepository } from "./trust.ts";
import { readValidator, runChallenge, runValidator, type ValidatorDef } from "./validators.ts";
import type { YamlMap } from "./yaml.ts";

// What both commands need before they touch a validator: the policy,
// the obligations, the trust store, the adapter registry, the shared
// execution context, and the snapshot.
type Session = {
  corpus: ReturnType<typeof readCorpus>;
  obligations: Map<string, Obligation>;
  out: Finding[];
  store: ReturnType<typeof readTrustStore>;
  adapters: ReturnType<typeof readRegistry>["adapters"];
  actor: string;
  shared: Shared | null;
  listed: Map<string, Obligation[]>;
  targets: string[];
  snapshotId: string | null;
};

function open_(root: string, names: string[], environment: string | undefined, verb: "run" | "challenge"): Session | number {
  const loaded = requirePolicy(root, verb);
  if (typeof loaded === "number") return loaded;
  const { policy } = loaded;
  const corpus = readCorpus(root, policy.specs);
  const { obligations, findings } = loadObligations(root);
  const out: Finding[] = [...findings];
  if (trustStoreInsideRepository(root)) {
    process.stderr.write(`same-page: the trust store ${trustPath()} is inside the repository; set SAME_PAGE_HOME outside it (ENG-062)\n`);
    return 2;
  }
  const store = readTrustStore();
  const registry = readRegistry();
  out.push(...registry.findings);
  const actor = gitActor(root);
  // The execution trust context and the authority of the evidence it
  // produces (ENG-060): a named environment the developer trusted, CI
  // under owner-controlled configuration, or, per validator below, a
  // trust record or an explicit developer invocation, both local.
  const resolved = sharedContext(root, environment, store, out);
  if (resolved === "error") {
    printFindings(out);
    return 1;
  }
  // Which validators: the named ones, else every one an obligation lists.
  const listed = new Map<string, Obligation[]>();
  for (const o of obligations.values()) for (const v of o.validators) listed.set(v.name, [...(listed.get(v.name) ?? []), o]);
  const snapshot = currentSnapshot(root);
  return {
    corpus,
    obligations,
    out,
    store,
    adapters: registry.adapters,
    actor,
    shared: resolved,
    listed,
    targets: names.length ? names : [...listed.keys()].sort(),
    snapshotId: snapshot?.id ?? null,
  };
}

export function run(root: string, names: string[], asDeveloper: boolean, environment: string | undefined): number {
  const s = open_(root, names, environment, "run");
  if (typeof s === "number") return s;
  const { out, snapshotId } = s;
  let executed = 0;
  let recordsWritten = 0;
  if (snapshotId === null) out.push({ where: root, message: "the repository snapshot cannot be computed (a directory or file is unreadable); no chain step establishes a boundary, so every record written now has unknown freshness", rule: "ENG-126" });
  for (const name of s.targets) {
    const v = readValidator(root, name);
    if (!v.def) {
      out.push(...v.findings);
      continue;
    }
    const def: ValidatorDef = v.def;
    const trust = resolveTrust({ root, def, store: s.store, shared: s.shared, asDeveloper, actor: s.actor, verb: "run", out });
    if (!trust) continue;
    const bound = s.listed.get(name) ?? [];
    if (bound.length === 0) {
      out.push({ where: `.same-page/validators/${name}.yaml`, message: `${name} is listed on no obligation; nothing to record`, rule: "ENG-012" });
      continue;
    }
    const vr = resolveInputs({ root, def, trust, store: s.store, adapters: s.adapters, snapshotId, reportEnvironmentErrors: true, out });
    const freshness: EvidenceRecord["freshness"] = (vr.narrowed || snapshotId !== null) && vr.environmentOk && vr.traceOk ? "current" : "unknown";
    const result = runValidator(root, def);
    executed++;
    const runId = `${stamp(new Date(result.started_at))}-${name}`;
    const runPath = writeRun(
      root,
      runId,
      {
        validator: name,
        validator_digest: vr.digest,
        command: [...def.command],
        cwd: def.cwd,
        shell: def.shell,
        started_at: result.started_at,
        duration_ms: result.duration_ms,
        exit_code: result.exit_code,
        signal: result.signal,
        result: result.result,
        error: result.error,
        stdout: result.stdout,
        stderr: result.stderr,
      } as YamlMap,
      vr.authority,
      vr.authorityName
    );
    for (const o of bound) {
      const req = s.corpus.requirements.find((r) => r.id === o.requirement);
      const rec = buildRecord({ vr, o, req, root, actor: s.actor, snapshotId, result: result.result, runPath, recordedAt: new Date().toISOString(), freshness, challenge: null });
      writeRecord(root, rec, name);
      recordsWritten++;
    }
    const envText = vr.environment.length
      ? `; environment ${vr.environment.map((e) => `${e.input} = ${e.error !== null ? `not computed (${e.error})` : short(e.value)}`).join(", ")}`
      : "; no environment inputs declared";
    process.stdout.write(
      `ran ${name}: ${result.result}${result.exit_code !== null ? ` (exit ${result.exit_code})` : ""}${result.error ? ` ${result.error}` : ""} under ${vr.context.context}; ${bound.length} record(s) at ${snapshotId ?? "unknown (no snapshot)"}, authority ${authorityLabel(vr.authority, vr.authorityName)}${envText}\n`
    );
  }
  printFindings(out);
  process.stdout.write(`same-page run: ${executed} validator(s) executed, ${recordsWritten} record(s) written, ${out.length} finding(s)\n`);
  return out.length === 0 ? 0 : 1;
}

// `same-page challenge` runs the challenges a validator declares, under
// the same execution trust as `run` (ENG-059). The command realizes the
// violating state and runs the validator, so its exit status is the
// validator's: nonzero means the validator noticed, and the record
// carries sensitivity `challenged` with the mechanism, artifact, and
// falsifier digest (ENG-035 through ENG-037). Zero means the validator
// passed under the violating state: weak sensitivity, recorded against
// the validator and reported, and no challenged claim of it stands
// (ENG-173, ENG-174).
export function challenge(root: string, names: string[], asDeveloper: boolean, environment: string | undefined): number {
  const s = open_(root, names, environment, "challenge");
  if (typeof s === "number") return s;
  const { out, snapshotId } = s;
  let executed = 0;
  let recordsWritten = 0;
  let weakWritten = 0;
  let cleared = 0;
  for (const name of s.targets) {
    const v = readValidator(root, name);
    if (!v.def) {
      out.push(...v.findings);
      continue;
    }
    const def: ValidatorDef = v.def;
    if (def.challenges.length === 0) continue;
    const trust = resolveTrust({ root, def, store: s.store, shared: s.shared, asDeveloper, actor: s.actor, verb: "challenge", out });
    if (!trust) continue;
    const vr = resolveInputs({ root, def, trust, store: s.store, adapters: s.adapters, snapshotId, reportEnvironmentErrors: false, out });
    const freshness: EvidenceRecord["freshness"] = (vr.narrowed || snapshotId !== null) && vr.environmentOk ? "current" : "unknown";
    for (const c of def.challenges) {
      // Every challenge names what it speaks for: the one requirement
      // whose falsifier it realizes, or the list the developer
      // confirmed. Nothing is claimed by default.
      const named = c.from_falsifier ? [c.requirement!] : c.requirements;
      const subjects: Obligation[] = [];
      let bad = false;
      for (const id of named) {
        const o = s.obligations.get(id);
        if (!o) {
          out.push({ where: `.same-page/validators/${name}.yaml`, message: `challenge ${c.mechanism} names requirement ${id}, which has no obligation; elaborate first`, rule: "ENG-206" });
          bad = true;
          continue;
        }
        if (!o.validators.some((x) => x.name === name)) {
          out.push({ where: `.same-page/validators/${name}.yaml`, message: `challenge ${c.mechanism} names requirement ${id}, which does not list validator ${name}; a challenge speaks for a mechanism the requirement uses`, rule: "ENG-037" });
          bad = true;
          continue;
        }
        subjects.push(o);
      }
      if (bad || subjects.length === 0) continue;
      const result = runChallenge(root, def, c);
      executed++;
      const runId = `${stamp(new Date(result.started_at))}-${name}-challenge`;
      const runPath = writeRun(
        root,
        runId,
        {
          validator: name,
          validator_digest: vr.digest,
          challenge_mechanism: c.mechanism,
          challenge_artifact: c.artifact,
          from_falsifier: c.from_falsifier,
          requirement: c.requirement,
          command: [...c.command],
          cwd: def.cwd,
          started_at: result.started_at,
          duration_ms: result.duration_ms,
          exit_code: result.exit_code,
          signal: result.signal,
          result: result.result,
          error: result.error,
          stdout: result.stdout,
          stderr: result.stderr,
        } as YamlMap,
        vr.authority,
        vr.authorityName
      );
      // The challenge command's status is the validator's under the
      // violating state: pass means the validator did not notice.
      const noticed = result.result === "fail";
      const at = new Date().toISOString();
      if (result.result === "error") {
        out.push({ where: `.same-page/validators/${name}.yaml`, message: `challenge ${c.mechanism} ${c.artifact} did not complete (${result.error ?? "unknown"}); no sensitivity is claimed (${runPath})`, rule: "ENG-172" });
        process.stdout.write(`challenged ${name} with ${c.mechanism} ${c.artifact}: did not complete; no claim\n`);
        continue;
      }
      // A miss belongs to the mechanism, so it is recorded once against
      // the validator, not once per subject (ENG-174).
      if (!noticed) {
        const rel = recordMiss(
          root,
          name,
          { mechanism: c.mechanism, artifact: c.artifact, requirement: subjects[0]!.requirement, from_falsifier: c.from_falsifier, snapshot: snapshotId, run: runPath, recorded_at: at, cleared_at: null, cleared_run: null },
          vr.authority,
          vr.authorityName
        );
        weakWritten++;
        out.push({
          where: rel,
          message: `weak sensitivity: ${name} passed the ${c.mechanism} challenge ${c.artifact}, which realizes the confirmed falsifier of ${subjects[0]!.requirement}; the mechanism does not notice that violating state, so no challenged claim of ${name} stands`,
          rule: "ENG-173",
        });
        process.stdout.write(
          `challenged ${name} with ${c.mechanism} ${c.artifact}${c.from_falsifier ? ` (falsifier-derived, ${c.requirement})` : ""}: the validator passed under the violating state (exit ${result.exit_code}) under ${vr.context.context}; weak sensitivity recorded for ${name}\n`
        );
        continue;
      }
      const clearedMiss = clearMiss(root, name, c.mechanism, c.artifact, at, runPath, vr.authority, vr.authorityName);
      if (clearedMiss) {
        cleared++;
        process.stdout.write(`cleared the weak sensitivity ${name} carried since ${clearedMiss.recorded_at}: the ${c.mechanism} challenge ${c.artifact} is noticed now\n`);
      }
      for (const o of subjects) {
        const req = s.corpus.requirements.find((r) => r.id === o.requirement);
        const falsifierDigest = req && req.falsifier !== null ? digest(req.falsifier) : o.falsifier_digest;
        const rec = buildRecord({
          vr,
          o,
          req,
          root,
          actor: s.actor,
          snapshotId,
          result: "pass",
          runPath,
          recordedAt: new Date().toISOString(),
          freshness,
          challenge: { mechanism: c.mechanism, artifact: c.artifact, from_falsifier: c.from_falsifier, falsifier_digest: c.from_falsifier ? falsifierDigest : null },
        });
        writeRecord(root, rec, `${name}-challenge`);
        recordsWritten++;
      }
      process.stdout.write(
        `challenged ${name} with ${c.mechanism} ${c.artifact}${c.from_falsifier ? ` (falsifier-derived, ${c.requirement})` : ""}: the validator noticed (exit ${result.exit_code}) under ${vr.context.context}; ${subjects.length} record(s) at ${snapshotId ?? "unknown (no snapshot)"}\n`
      );
    }
  }
  printFindings(out);
  process.stdout.write(`same-page challenge: ${executed} challenge(s) run, ${recordsWritten} challenged record(s), ${weakWritten} weak-sensitivity record(s), ${cleared} cleared, ${out.length} finding(s)\n`);
  return out.length === 0 ? 0 : 1;
}
