// Same Page Conformance -- the engine's command line.
//
//   same-page elaborate                      project Agreed requirements into obligations
//   same-page verify [--as-developer]        evaluate every obligation against the policy
//   same-page trust <validator>              grant execution trust, outside the repository
//   same-page run [validator...] [--as-developer]
//   same-page attest <REQ-ID> --by <actor> --expires <date> --description <text>
//                   [--bindings a,b] [--addresses-falsifier] [--inspection-only]
//   same-page acknowledge <REQ-ID>           acknowledge a disproof-clearing revision
//   same-page policy confirm                 accept a policy downgrade
//
// Run with node 22.18+ (`node --disable-warning=ExperimentalWarning
// same-page.ts ...`) or bun; no dependencies. Exit codes: 0 no findings
// and every verdict SUFFICIENT; 1 findings or a verdict below
// SUFFICIENT; 2 usage or configuration error.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { digest } from "./digest.ts";
import { adapterVersion } from "./adapters.ts";
import { assess, evaluate, type Evaluation, type Present, type Verdict } from "./evaluate.ts";
import {
  COMMAND_ASSUMPTIONS,
  MANUAL_ASSUMPTIONS,
  dependencyChain,
  residualRisk,
  stamp,
  readAcknowledgment,
  readDisproof,
  readRecords,
  standingDisproof,
  writeAcknowledgment,
  writeDisproof,
  writeRecord,
  writeRun,
  type EvidenceRecord,
} from "./evidence.ts";
import { completeRef, obligationDigest, obligationPath, obligationsDir, obligationText, projectObligation, readObligation, writeObligation, type Obligation } from "./obligations.ts";
import { compareStrength, defaultPolicy, loadPolicy, policyText, requiredText, type Finding, type Policy } from "./policy.ts";
import { currentSnapshot } from "./snapshot.ts";
import { readCorpus, type Requirement } from "./specs.ts";
import { findGrant, gitActor, grant, readTrustStore, trustPath, trustStoreInsideRepository } from "./trust.ts";
import { environmentLabel, fingerprintEnvironment, listValidators, readValidator, runValidator, validatorDigest, type EnvironmentInput, type ValidatorDef } from "./validators.ts";
import type { YamlMap } from "./yaml.ts";

const USAGE = "usage: same-page <elaborate|verify|trust|run|attest|acknowledge|policy> ... [--root DIR]";

function gitRoot(from: string): string | null {
  const r = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd: from, encoding: "utf8" });
  if (r.error || r.status !== 0) return null;
  const out = r.stdout.trim();
  return out === "" ? null : out;
}

function projectRoot(opt: string | undefined): string {
  if (opt) return resolve(opt);
  return gitRoot(process.cwd()) ?? process.cwd();
}

function specSetDirs(root: string): string[] {
  const env = process.env["SAME_PAGE_SPECS_DIR"];
  if (env) return [isAbsolute(env) ? relative(root, env) : env];
  const base = join(root, "docs", "specs");
  if (!existsSync(base)) return [];
  const out: string[] = [];
  for (const name of readdirSync(base).sort()) {
    if (existsSync(join(base, name, "00-overview.md"))) out.push(`docs/specs/${name}`);
  }
  return out;
}

function printFindings(findings: Finding[]): void {
  for (const f of findings) process.stdout.write(`${f.where}\n  ${f.message} (${f.rule})\n\n`);
}

function readPolicyFile(root: string): { policy: Policy | null; findings: Finding[] } {
  const path = join(root, ".same-page", "policy.yaml");
  return loadPolicy(readFileSync(path, "utf8"));
}

function ensureLayout(root: string): void {
  const base = join(root, ".same-page");
  for (const d of ["obligations", "validators", "evidence", "cache"]) mkdirSync(join(base, d), { recursive: true });
  const ignore = join(base, ".gitignore");
  if (!existsSync(ignore)) writeFileSync(ignore, "# Derived execution state stays uncommitted (ENG-190, ENG-193).\nevidence/\ncache/\n");
}

function isObligationCandidate(r: Requirement): boolean {
  return r.authority === "agreed" && !r.withdrawn && (r.keyword === "MUST" || r.keyword === "MUST NOT");
}

function requirePolicy(root: string, command: string): { policy: Policy; findings: Finding[] } | number {
  const policyPath = join(root, ".same-page", "policy.yaml");
  if (!existsSync(policyPath)) {
    process.stderr.write("same-page: no .same-page/policy.yaml; run `same-page elaborate` first\n");
    return 2;
  }
  const { policy, findings } = readPolicyFile(root);
  if (!policy) {
    printFindings(findings);
    process.stdout.write(`same-page ${command}: ${findings.length} finding(s) in the policy file\n`);
    return 1;
  }
  return { policy, findings };
}

function loadObligations(root: string): { obligations: Map<string, Obligation>; findings: Finding[] } {
  const dir = obligationsDir(root);
  const obligations = new Map<string, Obligation>();
  const findings: Finding[] = [];
  const files = existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith(".yaml")).sort() : [];
  for (const name of files) {
    const where = `.same-page/obligations/${name}`;
    const id = name.slice(0, -5);
    const read = readObligation(join(dir, name), where);
    if (!read.obligation) {
      findings.push(...read.findings);
      continue;
    }
    if (read.obligation.requirement !== id) {
      findings.push({ where, message: `file is named ${id} but keys on ${read.obligation.requirement}`, rule: "ENG-013" });
      continue;
    }
    obligations.set(id, read.obligation);
  }
  return { obligations, findings };
}

function downgradeFinding(id: string, old: Obligation["required"], next: Obligation["required"], effect: string): Finding {
  return {
    where: `.same-page/obligations/${id}.yaml`,
    message: `policy downgrade for ${id}: required was [${requiredText(old)}], the policy now requires [${requiredText(next)}]; ${effect}. Evaluated under the old requirement until \`same-page policy confirm\``,
    rule: "ENG-102",
  };
}

// ---------------------------------------------------------------- elaborate

function elaborate(root: string): number {
  const policyPath = join(root, ".same-page", "policy.yaml");
  if (!existsSync(policyPath)) {
    const dirs = specSetDirs(root);
    if (dirs.length === 0) {
      process.stderr.write("same-page: no spec set found (docs/specs/<project>/00-overview.md) and no SAME_PAGE_SPECS_DIR; nothing to elaborate\n");
      return 2;
    }
    ensureLayout(root);
    writeFileSync(policyPath, policyText(defaultPolicy(dirs)));
    process.stdout.write(`wrote .same-page/policy.yaml (specs: ${dirs.join(", ")})\n`);
  }
  ensureLayout(root);
  const loaded = requirePolicy(root, "elaborate");
  if (typeof loaded === "number") return loaded;
  const { policy } = loaded;
  const corpus = readCorpus(root, policy.specs);
  const snapshot = currentSnapshot(root);
  const actor = gitActor(root);
  const out: Finding[] = corpus.duplicates.map((d) => ({ where: "spec set", message: d, rule: "ENG-012" }));
  const wanted = new Map<string, Requirement>();
  for (const r of corpus.requirements) {
    if (r.authority !== "agreed" || r.withdrawn) continue;
    const where = `${r.file}:${r.line}`;
    if (r.keyword === "MAY") {
      if (r.falsifier !== null) out.push({ where, message: `${r.id} is a permission-only MAY and carries a falsifier`, rule: "ENG-024" });
      continue;
    }
    if (r.keyword === null) continue;
    if (r.falsifier === null) {
      out.push({ where, message: `${r.id} is Agreed and has no Falsifier line; confirm one before elaboration`, rule: "ENG-205" });
      continue;
    }
    wanted.set(r.id, r);
  }
  let written = 0;
  let unchanged = 0;
  let held = 0;
  for (const [id, r] of [...wanted.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const path = obligationPath(root, id);
    let existing: Obligation | null = null;
    if (existsSync(path)) {
      const read = readObligation(path, relative(root, path));
      if (read.obligation) existing = read.obligation;
      else out.push(...read.findings.map((f) => ({ ...f, message: `${f.message}; regenerated from the spec` })));
    }
    // ENG-112: a revision of an obligation with a standing disproof is
    // held until the developer acknowledges it.
    if (existing && (existing.requirement_digest !== digest(r.text) || existing.falsifier_digest !== digest(r.falsifier!))) {
      const { records } = readRecords(root, id);
      const standing = standingDisproof(root, id, records);
      if (standing) {
        const ack = readAcknowledgment(root, id);
        const acknowledged = ack && ack.new_requirement_digest === digest(r.text) && ack.new_falsifier_digest === digest(r.falsifier!) && ack.prior_requirement_digest === existing.requirement_digest;
        if (!acknowledged) {
          held++;
          out.push({
            where: `${r.file}:${r.line}`,
            message: [
              `disproof-clearing revision of ${id}.`,
              `Prior requirement: ${existing.sentence}`,
              `Prior falsifier: ${existing.falsifier}`,
              `Prior verdict: FAILING at ${standing.snapshot} (${standing.record})`,
              `Proposed requirement: ${r.text}`,
              `Proposed falsifier: ${r.falsifier}`,
              `Reason: the revision changes the ${existing.requirement_digest !== digest(r.text) ? "requirement" : "falsifier"} the disproof was recorded against, so the disproof no longer binds the revised obligation.`,
              `The obligation is held; run \`same-page acknowledge ${id}\` after the developer acknowledges that this revision clears or changes the standing disproof, and record it in the spec's Decisions and revisions`,
            ].join("\n  "),
            rule: "ENG-112",
          });
          continue;
        }
      }
    }
    const projection = projectObligation(r, policy, existing, snapshot?.id ?? "unknown", actor);
    if (projection.downgrade) out.push(downgradeFinding(id, projection.downgrade.old, projection.downgrade.new, "sufficiency under the new requirement is not evaluated until confirmed"));
    if (writeObligation(path, projection.obligation)) written++;
    else unchanged++;
  }
  for (const name of existsSync(obligationsDir(root)) ? readdirSync(obligationsDir(root)).sort() : []) {
    if (!name.endsWith(".yaml")) continue;
    const id = name.slice(0, -5);
    if (!wanted.has(id)) {
      const req = corpus.requirements.find((r) => r.id === id);
      const why = !req ? "no spec defines it" : req.withdrawn ? "the requirement is withdrawn" : req.authority !== "agreed" ? `the requirement is ${req.authority}, not Agreed` : "the requirement no longer carries MUST or MUST NOT";
      out.push({ where: `.same-page/obligations/${name}`, message: `stale obligation ${id}: ${why}; delete the file or restore the requirement`, rule: "ENG-010" });
    }
  }
  printFindings(out);
  process.stdout.write(`same-page elaborate: ${wanted.size} obligation(s) (${written} written, ${unchanged} unchanged${held ? `, ${held} held` : ""}), ${out.length} finding(s)\n`);
  return out.length === 0 ? 0 : 1;
}

// ---------------------------------------------------------------- verify

function short(v: string | null): string {
  if (v === null) return "none";
  return v.startsWith("sha256:") ? v.slice(0, 19) : v;
}

// One line per distinct boundary among an entry's records: the same
// validator at the same root and declaration is one boundary.
function boundaryLines(records: EvidenceRecord[]): string[] {
  const seen = new Map<string, string>();
  for (const r of records) {
    const who = r.validator ?? (r.manual ? `manual by ${r.manual.actor}` : r.kind);
    const env = r.boundary.environment.length ? `environment inputs: ${r.boundary.environment.join(", ")}` : "no environment inputs declared";
    const text = `${r.boundary.scope} at ${r.boundary.root}; ${who}${r.identity.validator_digest ? ` (${short(r.identity.validator_digest)})` : ""}; ${env}`;
    seen.set(text, text);
  }
  return [...seen.values()];
}

function environmentLines(records: EvidenceRecord[]): string[] {
  const out: string[] = [];
  const latestByValidator = new Map<string, EvidenceRecord>();
  for (const r of records) if (r.validator) latestByValidator.set(r.validator, r);
  for (const [name, r] of [...latestByValidator.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (r.identity.environment.length === 0) {
      out.push(`${name}: no environment inputs declared`);
      continue;
    }
    out.push(`${name}: ${r.identity.environment.map((e) => `${e.input} = ${e.error !== null ? `not computed (${e.error})` : short(e.value)}`).join(", ")}`);
  }
  return out;
}

function dependencyLine(records: EvidenceRecord[]): string {
  const d = records[records.length - 1]!.dependency;
  return `${d.scope} via chain step ${d.step} (${d.chain.map((c) => `${c.step} ${c.mechanism}: ${c.outcome}`).join("; ")}); narrowing: ${d.narrowing}`;
}

function verify(root: string, asDeveloper: boolean): number {
  const loaded = requirePolicy(root, "verify");
  if (typeof loaded === "number") return loaded;
  const { policy } = loaded;
  const corpus = readCorpus(root, policy.specs);
  const byId = new Map(corpus.requirements.map((r) => [r.id, r] as const));
  const snapshot = currentSnapshot(root);
  const snapshotId = snapshot?.id ?? null;
  const now = new Date();
  const out: Finding[] = corpus.duplicates.map((d) => ({ where: "spec set", message: d, rule: "ENG-012" }));
  if (snapshotId === null) out.push({ where: root, message: "the repository snapshot cannot be computed (a directory or file is unreadable); no chain step establishes a boundary and every record's freshness is unknown", rule: "ENG-126" });
  const { obligations, findings } = loadObligations(root);
  out.push(...findings);
  // The present value of every identity input (ENG-142): validator
  // digests, and each usable validator's environment fingerprint,
  // computed once (ENG-151: exactly the declared inputs).
  const present: Present = { snapshot: snapshotId, validatorDigests: new Map(), environments: new Map() };
  const defs = new Map<string, ValidatorDef>();
  const store = trustStoreInsideRepository(root) ? { version: 1, grants: [] } : readTrustStore();
  const trusted = new Set<string>();
  for (const name of listValidators(root)) {
    const v = readValidator(root, name);
    const d = v.def ? validatorDigest(v.def) : null;
    present.validatorDigests.set(name, d);
    if (v.def) defs.set(name, v.def);
    // ENG-059: a declared environment command runs during verify only
    // under the grant that covers this definition, or --as-developer.
    if (v.def && d && (asDeveloper || findGrant(store, root, name, d))) trusted.add(name);
    out.push(...v.findings);
  }
  const evaluations: Evaluation[] = [];
  for (const [id, o] of [...obligations.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const where = `.same-page/obligations/${id}.yaml`;
    const req = byId.get(id);
    if (!req || !isObligationCandidate(req)) {
      out.push({ where, message: `${id} has no Agreed MUST or MUST NOT requirement behind it; the obligation is invalid`, rule: "ENG-010" });
      continue;
    }
    let invalid: string | null = null;
    const reasons: string[] = [];
    if (digest(req.text) !== o.requirement_digest) reasons.push("the requirement text changed");
    if (req.falsifier === null) reasons.push("the requirement has no Falsifier line now");
    else if (digest(req.falsifier) !== o.falsifier_digest) reasons.push("the confirmed falsifier changed");
    if (reasons.length) {
      invalid = `obligation digest mismatch: ${reasons.join("; ")}; run \`same-page elaborate\` to regenerate it from the confirmed requirement`;
      out.push({ where, message: `invalid obligation ${id}: ${reasons.join("; ")}; run \`same-page elaborate\` to regenerate it from the confirmed requirement`, rule: "ENG-019" });
    }
    const profile = policy.profiles[o.profile];
    if (!profile) {
      out.push({ where, message: `${id} names profile ${o.profile}, which the policy does not define`, rule: "ENG-016" });
      continue;
    }
    // ENG-101, ENG-103: a downgrade holds the recorded requirement.
    let required = o.required;
    if (Object.keys(required).length === 0) required = profile.require;
    else {
      const cmp = compareStrength(required, profile.require);
      if (cmp === "weaker") out.push(downgradeFinding(id, required, profile.require, "the verdict below is under the old requirement"));
      else required = profile.require;
    }
    for (const v of o.validators) {
      if (!present.validatorDigests.has(v.name)) out.push({ where, message: `${id} lists validator ${v.name}, which has no definition under .same-page/validators/`, rule: "ENG-161" });
    }
    const { records, findings: rf } = readRecords(root, id);
    out.push(...rf);
    for (const r of records) {
      if (r.validator && defs.has(r.validator) && !present.environments.has(r.validator)) present.environments.set(r.validator, fingerprintEnvironment(root, defs.get(r.validator)!, trusted.has(r.validator)));
    }
    const assessed = assess({ ...o, required }, records, present, now);
    const standing = standingDisproof(root, id, records);
    const history = standing ? null : readDisproof(root, id);
    let ev = evaluate({ ...o, required }, assessed, invalid, standing, history);
    if (ev.verdict === "FAILING") {
      const failing = assessed.find((a) => a.freshness === "current" && a.record.result === "fail")!;
      const disproof = { requirement: id, requirement_digest: o.requirement_digest, falsifier_digest: o.falsifier_digest, sentence: o.sentence, falsifier: o.falsifier, verdict: "FAILING" as const, snapshot: failing.record.identity.snapshot ?? "unknown", record: failing.record.path, recorded_at: now.toISOString() };
      writeDisproof(root, disproof);
      ev = { ...ev, standing: disproof, history: null };
    }
    evaluations.push(ev);
  }
  for (const r of corpus.requirements) {
    if (isObligationCandidate(r) && !obligations.has(r.id))
      out.push({ where: `${r.file}:${r.line}`, message: `${r.id} is Agreed and has no obligation; run \`same-page elaborate\``, rule: "ENG-206" });
  }
  for (const ev of evaluations) {
    const o = obligations.get(ev.id)!;
    const lines = [`${ev.id}  ${ev.verdict}`];
    if (ev.reason && ev.verdict !== "SUFFICIENT") lines.push(`  Reason:      ${ev.reason}`);
    lines.push(`  Requirement: ${o.sentence}`);
    lines.push(`  Required:    ${requiredText(ev.required)}`);
    const recs = ev.records.map((a) => a.record);
    if (ev.records.length === 0) lines.push("  Evidence:    none");
    else {
      ev.records.forEach((a, i) => {
        const r = a.record;
        const who = r.validator ?? (r.manual ? `manual by ${r.manual.actor}` : r.kind);
        const state = a.expired ? `expired: ${a.why}` : a.freshness === "current" ? "current" : `${a.freshness}: ${a.why}`;
        lines.push(`  ${i === 0 ? "Evidence:   " : "            "} ${r.kind} ${who} ${r.result} (${state}; binding ${r.binding_basis}; ${r.sensitivity}; ${r.path})`);
      });
    }
    const live = ev.records.filter((a) => !a.expired);
    const freshness = ev.records.length === 0 ? "no evidence" : live.some((a) => a.freshness === "current") ? "current" : live.some((a) => a.freshness === "stale") ? "stale" : live.some((a) => a.freshness === "unknown") ? "unknown" : "expired";
    lines.push(`  Freshness:   ${freshness}`);
    lines.push(`  Authority:   local @ ${snapshotId ?? "unknown (no snapshot)"}`);
    if (recs.length === 0) {
      lines.push("  Boundary:    none recorded (no evidence)");
      lines.push("  Dependency:  none established (no evidence)");
      lines.push("  Environment: none recorded");
      lines.push("  Residual risk: everything; no evidence is inside any boundary");
    } else {
      boundaryLines(recs).forEach((b, i) => lines.push(`  ${i === 0 ? "Boundary:   " : "            "} ${b}`));
      lines.push(`  Dependency:  ${dependencyLine(recs)}`);
      const env = environmentLines(recs);
      if (env.length === 0) lines.push("  Environment: none recorded (manual evidence)");
      else env.forEach((e, i) => lines.push(`  ${i === 0 ? "Environment:" : "            "} ${e}`));
      lines.push(`  Residual risk: ${ev.residual_risk.join("; ")}`);
    }
    lines.push(`  Assumptions: ${ev.assumptions.length ? ev.assumptions.join("; ") : "none recorded"}`);
    if (ev.standing) lines.push(`  Standing disproof: FAILING at ${ev.standing.snapshot} (${ev.standing.record})`);
    else if (ev.history) lines.push(`  Prior disproof: FAILING at ${ev.history.snapshot} (${ev.history.record}); no longer the last verdict`);
    process.stdout.write(lines.join("\n") + "\n\n");
  }
  printFindings(out);
  const counts: Record<Verdict, number> = { FAILING: 0, BLOCKED: 0, INSUFFICIENT: 0, SUFFICIENT: 0 };
  for (const ev of evaluations) counts[ev.verdict]++;
  process.stdout.write(
    `same-page verify: ${evaluations.length} obligation(s): ${counts.SUFFICIENT} SUFFICIENT, ${counts.INSUFFICIENT} INSUFFICIENT, ${counts.BLOCKED} BLOCKED, ${counts.FAILING} FAILING; ${out.length} finding(s); authority local @ ${snapshotId ?? "unknown (no snapshot)"}\n`
  );
  const allSufficient = evaluations.every((v) => v.verdict === "SUFFICIENT");
  return out.length === 0 && allSufficient ? 0 : 1;
}

// ---------------------------------------------------------------- trust

function trust(root: string, name: string | undefined): number {
  if (!name) {
    process.stderr.write("usage: same-page trust <validator>\n");
    return 2;
  }
  if (trustStoreInsideRepository(root)) {
    process.stderr.write(`same-page: the trust store ${trustPath()} is inside the repository it would authorize; set SAME_PAGE_HOME outside it (ENG-062)\n`);
    return 2;
  }
  const v = readValidator(root, name);
  if (!v.def) {
    printFindings(v.findings);
    return 1;
  }
  const d = validatorDigest(v.def);
  const g = grant(root, name, d, gitActor(root));
  process.stdout.write(`trusted ${name} (${d}) for ${g.repository} by ${g.actor}; recorded in ${trustPath()}\n`);
  return 0;
}

// ---------------------------------------------------------------- run

function run(root: string, names: string[], asDeveloper: boolean): number {
  const loaded = requirePolicy(root, "run");
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
  const actor = gitActor(root);
  // Which validators: the named ones, else every one an obligation lists.
  const listed = new Map<string, Obligation[]>();
  for (const o of obligations.values()) for (const v of o.validators) listed.set(v.name, [...(listed.get(v.name) ?? []), o]);
  const targets = names.length ? names : [...listed.keys()].sort();
  let executed = 0;
  let recordsWritten = 0;
  const snapshot = currentSnapshot(root);
  const snapshotId = snapshot?.id ?? null;
  if (snapshotId === null) out.push({ where: root, message: "the repository snapshot cannot be computed (a directory or file is unreadable); no chain step establishes a boundary, so every record written now has unknown freshness", rule: "ENG-126" });
  for (const name of targets) {
    const v = readValidator(root, name);
    if (!v.def) {
      out.push(...v.findings);
      continue;
    }
    const def: ValidatorDef = v.def;
    const d = validatorDigest(def);
    const g = findGrant(store, root, name, d);
    let context: EvidenceRecord["execution_trust"];
    if (g) context = { context: "trust-record", actor: g.actor };
    else if (asDeveloper) context = { context: "developer-invocation", actor };
    else {
      out.push({ where: `.same-page/validators/${name}.yaml`, message: `${name} is not trusted for this repository at its current definition (${d}); run \`same-page trust ${name}\`, or the developer runs \`same-page run ${name} --as-developer\``, rule: "ENG-058" });
      continue;
    }
    const bound = listed.get(name) ?? [];
    if (bound.length === 0) {
      out.push({ where: `.same-page/validators/${name}.yaml`, message: `${name} is listed on no obligation; nothing to record`, rule: "ENG-012" });
      continue;
    }
    // ENG-150, ENG-151: exactly the declared environment inputs, taken
    // beside the run. An input that cannot be computed leaves the
    // record's freshness unknown (ENG-126).
    const environment: EnvironmentInput[] = fingerprintEnvironment(root, def, true);
    for (const e of environment) if (e.error !== null) out.push({ where: `.same-page/validators/${name}.yaml`, message: `environment input ${e.input} cannot be computed (${e.error}); records written now have unknown freshness`, rule: "ENG-126" });
    const dependency = dependencyChain("command", snapshotId);
    const declared = def.environment.map(environmentLabel);
    const freshness: EvidenceRecord["freshness"] = snapshotId !== null && environment.every((e) => e.error === null) ? "current" : "unknown";
    const result = runValidator(root, def);
    executed++;
    const runId = `${stamp(new Date(result.started_at))}-${name}`;
    const runPath = writeRun(root, runId, {
      validator: name,
      validator_digest: d,
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
    } as YamlMap);
    for (const o of bound) {
      const ref = completeRef(o.validators.find((x) => x.name === name)!, snapshotId ?? "unknown", actor);
      const attested = ref.attested_by !== undefined;
      const req = corpus.requirements.find((r) => r.id === o.requirement);
      const rec: EvidenceRecord = {
        requirement: o.requirement,
        kind: def.kind,
        adapter: "command",
        validator: name,
        result: result.result,
        run: runPath,
        recorded_at: new Date().toISOString(),
        identity: {
          snapshot: snapshotId,
          requirement: o.requirement,
          requirement_digest: req ? digest(req.text) : o.requirement_digest,
          falsifier_digest: req && req.falsifier !== null ? digest(req.falsifier) : o.falsifier_digest,
          obligation_digest: obligationDigest(o),
          validator_digest: d,
          adapter: "command",
          adapter_version: adapterVersion("command"),
          dependency_fingerprint: snapshotId,
          environment: environment.map((e) => ({ ...e })),
          contracts: [],
        },
        execution_trust: context,
        binding_basis: attested ? "attested" : "none",
        binding: attested ? { actor: ref.actor!, actor_type: ref.attested_by!, timestamp: ref.attested_at!, snapshot: ref.snapshot!, developer_confirmed: ref.developer_confirmed === true } : null,
        sensitivity: "unchallenged",
        freshness,
        boundary: { scope: dependency.scope, root, validator: name, environment: declared },
        dependency,
        dependency_provenance: "conservative",
        assumptions: [...COMMAND_ASSUMPTIONS],
        residual_risk: residualRisk(dependency, declared, "command"),
        authority: "local",
        manual: null,
      };
      writeRecord(root, rec, name);
      recordsWritten++;
    }
    const envText = environment.length ? `; environment ${environment.map((e) => `${e.input} = ${e.error !== null ? `not computed (${e.error})` : short(e.value)}`).join(", ")}` : "; no environment inputs declared";
    process.stdout.write(`ran ${name}: ${result.result}${result.exit_code !== null ? ` (exit ${result.exit_code})` : ""}${result.error ? ` ${result.error}` : ""} under ${context.context}; ${bound.length} record(s) at ${snapshotId ?? "unknown (no snapshot)"}${envText}\n`);
  }
  printFindings(out);
  process.stdout.write(`same-page run: ${executed} validator(s) executed, ${recordsWritten} record(s) written, ${out.length} finding(s)\n`);
  return out.length === 0 ? 0 : 1;
}

// ---------------------------------------------------------------- attest

function attest(root: string, id: string | undefined, opts: { by?: string; expires?: string; description?: string; bindings?: string; addressesFalsifier: boolean; inspectionOnly: boolean }): number {
  if (!id || !opts.by || !opts.expires || !opts.description) {
    process.stderr.write("usage: same-page attest <REQ-ID> --by <actor> --expires <YYYY-MM-DD> --description <text> [--bindings a,b] [--addresses-falsifier] [--inspection-only]\n");
    return 2;
  }
  const loaded = requirePolicy(root, "attest");
  if (typeof loaded === "number") return loaded;
  const { obligations, findings } = loadObligations(root);
  const out: Finding[] = [...findings];
  const o = obligations.get(id);
  if (!o) {
    out.push({ where: `.same-page/obligations/${id}.yaml`, message: `${id} has no obligation; elaborate first`, rule: "ENG-206" });
    printFindings(out);
    return 1;
  }
  if (Number.isNaN(new Date(opts.expires).getTime())) {
    out.push({ where: "--expires", message: "expiry must be a date (YYYY-MM-DD)", rule: "ENG-181" });
    printFindings(out);
    return 1;
  }
  const bindings = (opts.bindings ?? "").split(",").map((s) => s.trim()).filter((s) => s !== "");
  for (const b of bindings) if (!existsSync(join(root, b))) out.push({ where: b, message: `bound path does not exist in the snapshot`, rule: "ENG-209" });
  if (out.length) {
    printFindings(out);
    return 1;
  }
  const snapshot = currentSnapshot(root);
  const snapshotId = snapshot?.id ?? null;
  if (snapshotId === null) {
    printFindings([{ where: root, message: "the repository snapshot cannot be computed (a directory or file is unreadable); no chain step establishes a boundary, so the record written now has unknown freshness", rule: "ENG-126" }]);
  }
  const now = new Date().toISOString();
  const dependency = dependencyChain("manual", snapshotId);
  const rec: EvidenceRecord = {
    requirement: id,
    kind: opts.inspectionOnly ? "inspected" : "manual",
    adapter: "manual",
    validator: null,
    result: "pass",
    run: null,
    recorded_at: now,
    identity: {
      snapshot: snapshotId,
      requirement: id,
      requirement_digest: o.requirement_digest,
      falsifier_digest: o.falsifier_digest,
      obligation_digest: obligationDigest(o),
      validator_digest: null,
      adapter: "manual",
      adapter_version: adapterVersion("manual"),
      dependency_fingerprint: snapshotId,
      environment: [],
      contracts: [],
    },
    execution_trust: null,
    binding_basis: "attested",
    binding: { actor: opts.by, actor_type: "developer", timestamp: now, snapshot: snapshotId ?? "unknown", developer_confirmed: true },
    sensitivity: "not_applicable",
    freshness: snapshotId === null ? "unknown" : "current",
    boundary: { scope: dependency.scope, root, validator: null, environment: [] },
    dependency,
    dependency_provenance: "conservative",
    assumptions: [...MANUAL_ASSUMPTIONS],
    residual_risk: residualRisk(dependency, [], "manual"),
    authority: "local",
    manual: { actor: opts.by, description: opts.description, bindings, expires: opts.expires, addresses_falsifier: !opts.inspectionOnly && opts.addressesFalsifier },
  };
  const path = writeRecord(root, rec, opts.inspectionOnly ? "inspected" : "manual");
  process.stdout.write(`recorded ${rec.kind} evidence for ${id} by ${opts.by}, expires ${opts.expires}, at ${snapshotId ?? "unknown (no snapshot)"}: ${path}\n`);
  return snapshotId === null ? 1 : 0;
}

// ---------------------------------------------------------------- acknowledge

function acknowledge(root: string, id: string | undefined): number {
  if (!id) {
    process.stderr.write("usage: same-page acknowledge <REQ-ID>\n");
    return 2;
  }
  const loaded = requirePolicy(root, "acknowledge");
  if (typeof loaded === "number") return loaded;
  const { policy } = loaded;
  const { obligations } = loadObligations(root);
  const o = obligations.get(id);
  const req = readCorpus(root, policy.specs).requirements.find((r) => r.id === id);
  const { records } = readRecords(root, id);
  const standing = standingDisproof(root, id, records);
  if (!o || !req || !standing || req.falsifier === null) {
    process.stdout.write(`same-page acknowledge: ${id} has no standing disproof awaiting a revision\n`);
    return 1;
  }
  writeAcknowledgment(root, {
    requirement: id,
    actor: gitActor(root),
    acknowledged_at: new Date().toISOString(),
    prior_requirement_digest: o.requirement_digest,
    prior_falsifier_digest: o.falsifier_digest,
    new_requirement_digest: digest(req.text),
    new_falsifier_digest: digest(req.falsifier),
  });
  process.stdout.write(`acknowledged: the revision of ${id} clears or changes the standing disproof recorded at ${standing.snapshot}; the prior disproof stays as history. Record this in the spec's Decisions and revisions, then run \`same-page elaborate\`\n`);
  return 0;
}

// ---------------------------------------------------------------- policy confirm

function policyConfirm(root: string): number {
  const loaded = requirePolicy(root, "policy confirm");
  if (typeof loaded === "number") return loaded;
  const { policy } = loaded;
  const { obligations, findings } = loadObligations(root);
  printFindings(findings);
  let changed = 0;
  for (const [id, o] of [...obligations.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const profile = policy.profiles[o.profile];
    if (!profile) continue;
    if (compareStrength(o.required, profile.require) !== "equal") {
      process.stdout.write(`${id}: required [${requiredText(o.required)}] -> [${requiredText(profile.require)}]\n`);
      const next: Obligation = { ...o, required: profile.require };
      writeFileSync(obligationPath(root, id), obligationText(next));
      changed++;
    }
  }
  process.stdout.write(`same-page policy confirm: ${changed} obligation(s) now carry the current policy requirement; record the confirmed change in the spec's Decisions and revisions\n`);
  return 0;
}

// ---------------------------------------------------------------- main

function main(): number {
  let parsed;
  try {
    parsed = parseArgs({
      args: process.argv.slice(2),
      options: {
        root: { type: "string" },
        "as-developer": { type: "boolean" },
        by: { type: "string" },
        expires: { type: "string" },
        description: { type: "string" },
        bindings: { type: "string" },
        "addresses-falsifier": { type: "boolean" },
        "inspection-only": { type: "boolean" },
      },
      allowPositionals: true,
      strict: true,
    });
  } catch (e) {
    process.stderr.write(`same-page: ${(e as Error).message}\n${USAGE}\n`);
    return 2;
  }
  const [command, ...rest] = parsed.positionals;
  const str = (k: string): string | undefined => (typeof parsed.values[k] === "string" ? (parsed.values[k] as string) : undefined);
  const flag = (k: string): boolean => parsed.values[k] === true;
  if (!command) {
    process.stderr.write(`${USAGE}\n`);
    return 2;
  }
  const root = projectRoot(str("root"));
  switch (command) {
    case "elaborate":
      return rest.length === 0 ? elaborate(root) : usage();
    case "verify":
      return rest.length === 0 ? verify(root, flag("as-developer")) : usage();
    case "trust":
      return trust(root, rest[0]);
    case "run":
      return run(root, rest, flag("as-developer"));
    case "attest":
      return attest(root, rest[0], { by: str("by"), expires: str("expires"), description: str("description"), bindings: str("bindings"), addressesFalsifier: flag("addresses-falsifier"), inspectionOnly: flag("inspection-only") });
    case "acknowledge":
      return acknowledge(root, rest[0]);
    case "policy":
      return rest[0] === "confirm" ? policyConfirm(root) : usage();
    default:
      process.stderr.write(`same-page: unknown command ${command}\n`);
      return usage();
  }
}

function usage(): number {
  process.stderr.write(`${USAGE}\n`);
  return 2;
}

process.exit(main());
