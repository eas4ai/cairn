// The two commands that answer what the evidence establishes:
// `verify`, which evaluates every obligation against the policy and
// compares its machine view of coverage with the evidence map, and
// `sync-map`, the one action that writes that map (ENG-197, ENG-200).

import { readRegistry, type Adapter } from "./adapters.ts";
import { authorityLabel, configuredAuthority, ciConfiguration, inCi, type Configured } from "./authority.ts";
import { digest } from "./digest.ts";
import { assess, evaluate, isAuthoritative, type Evaluation, type Present, type Verdict } from "./evaluate.ts";
import {readRecords, type StoredRecord} from "./evidence.ts";
import { readDisproof, readMisses, standingDisproof, standingMisses, writeDisproof, type Miss } from "./history.ts";
import { dependencySets } from "./execution.ts";
import { applyRowChanges, compare, machineView, projectRow, readMap, rowText, type RowChange } from "./map.ts";
import type { Obligation } from "./obligations.ts";
import { compareStrength, requiredText, type Finding } from "./policy.ts";
import { downgradeFinding, isObligationCandidate, loadObligations, printFindings, requirePolicy } from "./project.ts";
import { boundaryLines, dependencyLines, environmentLines, short } from "./render.ts";
import { currentSnapshot } from "./snapshot.ts";
import { readCorpus } from "./specs.ts";
import { EMPTY_STORE, findGrant, readTrustStore, trustStoreInsideRepository } from "./trust.ts";
import { fingerprintEnvironment, listValidators, readValidator, validatorDigest, type ValidatorDef } from "./validators.ts";

export function verify(root: string, asDeveloper: boolean): number {
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
  const configured: Configured = configuredAuthority(root, policy);
  // The present value of every identity input (ENG-142): validator
  // digests, and each usable validator's environment fingerprint,
  // computed once (ENG-151: exactly the declared inputs).
  const registry = readRegistry();
  out.push(...registry.findings);
  const present: Present = { snapshot: snapshotId, validatorDigests: new Map(), environments: new Map(), closures: new Map(), traces: new Map(), adapters: registry.adapters };
  const defs = new Map<string, ValidatorDef>();
  const store = trustStoreInsideRepository(root) ? EMPTY_STORE : readTrustStore();
  const trusted = new Set<string>();
  const ciContext = inCi(process.env) && ciConfiguration(root) !== null;
  for (const name of listValidators(root)) {
    const v = readValidator(root, name);
    const d = v.def ? validatorDigest(v.def) : null;
    present.validatorDigests.set(name, d);
    if (v.def) defs.set(name, v.def);
    // ENG-059: a declared environment command runs during verify only
    // under a trust context: the grant that covers this definition,
    // owner-controlled CI, or --as-developer.
    if (v.def && d && (asDeveloper || ciContext || findGrant(store, root, name, d))) trusted.add(name);
    out.push(...v.findings);
  }
  const recordsById = new Map<string, StoredRecord[]>();
  const missesByValidator = new Map<string, Miss[]>();
  const clearedByObligation = new Map<string, { validator: string; miss: Miss }[]>();
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
    const { records, findings: rf } = readRecords(root, id, registry.adapters);
    out.push(...rf);
    recordsById.set(id, records);
    for (const r of records) {
      if (r.validator && defs.has(r.validator) && !present.environments.has(r.validator)) {
        const def = defs.get(r.validator)!;
        const may = trusted.has(r.validator);
        present.environments.set(r.validator, fingerprintEnvironment(root, def, may));
        // Recomputing a closure or a trace runs a command, so it needs
        // the same trust the validator holds (ENG-059).
        if (may) {
          const sets = dependencySets(root, def, store, registry.adapters, []);
          present.closures.set(r.validator, sets.closureSet);
          present.traces.set(r.validator, sets.trace);
        } else {
          present.closures.set(r.validator, null);
          present.traces.set(r.validator, null);
        }
      }
    }
    // ENG-173, ENG-174: what each mechanism behind this obligation has
    // failed to notice. A miss belongs to the validator, so it counts
    // here whichever requirement it was recorded against; a cleared
    // miss is history and withdraws nothing.
    const standingByValidator = new Map<string, Miss[]>();
    const cleared: { validator: string; miss: Miss }[] = [];
    for (const name of [...new Set(records.map((r) => r.validator).filter((v): v is string => v !== null))]) {
      if (!missesByValidator.has(name)) missesByValidator.set(name, readMisses(root, name));
      const all = missesByValidator.get(name)!;
      const live = standingMisses(all);
      if (live.length) standingByValidator.set(name, live);
      for (const m of all) if (m.cleared_at !== null) cleared.push({ validator: name, miss: m });
    }
    for (const [name, live] of standingByValidator)
      for (const m of live)
        out.push({
          where: m.run,
          message: `weak sensitivity: ${name} passed the ${m.mechanism} challenge ${m.artifact}, which realizes the confirmed falsifier of ${m.requirement}; the mechanism does not notice that violating state, so no challenged claim of ${name} stands, ${id} included. Run \`same-page challenge ${name}\` again once the mechanism notices it`,
          rule: "ENG-173",
        });
    const assessed = assess({ ...o, required }, records, present, now, standingByValidator);
    const standing = standingDisproof(root, id, records);
    const history = standing ? null : readDisproof(root, id);
    // A profile may name the authority its evidence comes from (ENG-071);
    // otherwise the configured authority applies.
    const authorityFor = profile.require.authority ? { authority: profile.require.authority, name: policy.authority_name } : { authority: configured.authority, name: configured.name };
    let ev = evaluate({ ...o, required }, assessed, invalid, standing, history, authorityFor);
    if (ev.verdict === "FAILING") {
      const failing = assessed.find((a) => a.freshness === "current" && a.record.result === "fail")!;
      const disproof = { requirement: id, requirement_digest: o.requirement_digest, falsifier_digest: o.falsifier_digest, sentence: o.sentence, falsifier: o.falsifier, verdict: "FAILING" as const, snapshot: failing.record.identity.snapshot ?? "unknown", record: failing.record.path, recorded_at: now.toISOString() };
      writeDisproof(root, disproof);
      ev = { ...ev, standing: disproof, history: null };
    }
    clearedByObligation.set(id, cleared);
    evaluations.push(ev);
  }
  for (const r of corpus.requirements) {
    if (isObligationCandidate(r) && !obligations.has(r.id))
      out.push({ where: `${r.file}:${r.line}`, message: `${r.id} is Agreed and has no obligation; run \`same-page elaborate\``, rule: "ENG-206" });
  }
  // ENG-198, ENG-199: the machine view of coverage against the map.
  const map = readMap(root, policy.specs);
  let disagreements = 0;
  for (const [id] of [...obligations.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (map.files.length === 0 || !recordsById.has(id)) continue;
    const row = map.rows.get(id) ?? null;
    const msg = compare(machineView(recordsById.get(id)!), row);
    if (msg) {
      disagreements++;
      out.push({ where: row ? `${row.file}:${row.line}` : map.files[0]!, message: `${id}: ${msg}; run \`same-page sync-map\` to write the machine view, or correct the map`, rule: "ENG-199" });
    }
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
        // ENG-159: a record of another authority is named as such.
        const auth = isAuthoritative(r, ev.authority) ? "" : `authority ${authorityLabel(r.authority, r.authority_name)}, non-authoritative; `;
        lines.push(`  ${i === 0 ? "Evidence:   " : "            "} ${r.kind} ${who} ${r.result} (${state}; ${auth}binding ${r.binding_basis}; ${r.sensitivity}; ${r.path})`);
      });
    }
    // ENG-034, ENG-173: what the mechanisms have demonstrated about
    // noticing the falsifier.
    const challenged = ev.records.filter((a) => a.record.sensitivity === "challenged");
    const demoted = ev.records.filter((a) => a.demoted !== null);
    const sensitivity = challenged.length
      ? `challenged (${[...new Set(challenged.map((a) => `${a.record.challenge!.mechanism} ${a.record.challenge!.artifact}${a.record.challenge!.from_falsifier ? ", falsifier-derived" : ""}`))].join("; ")})`
      : demoted.length
        ? `weak: ${[...new Set(demoted.map((a) => a.demoted!))].join("; ")}`
        : ev.records.length === 0
          ? "no evidence"
          : "unchallenged: no challenge has demonstrated that the mechanism notices the falsifier";
    lines.push(`  Sensitivity: ${sensitivity}`);
    // A cleared miss is history: the mechanism was blind to that state
    // once, and a subsequent challenge showed it notices it now.
    for (const { validator, miss } of clearedByObligation.get(ev.id) ?? [])
      lines.push(`  Prior weak sensitivity: ${validator} passed the ${miss.mechanism} challenge ${miss.artifact} at ${miss.recorded_at}; cleared ${miss.cleared_at}`);
    const live = ev.records.filter((a) => !a.expired);
    const freshness = ev.records.length === 0 ? "no evidence" : live.some((a) => a.freshness === "current") ? "current" : live.some((a) => a.freshness === "stale") ? "stale" : live.some((a) => a.freshness === "unknown") ? "unknown" : "expired";
    lines.push(`  Freshness:   ${freshness}`);
    lines.push(`  Authority:   ${authorityLabel(ev.authority.authority, ev.authority.name)} @ ${snapshotId ?? "unknown (no snapshot)"}`);
    if (recs.length === 0) {
      lines.push("  Boundary:    none recorded (no evidence)");
      lines.push("  Dependency:  none established (no evidence)");
      lines.push("  Environment: none recorded");
      lines.push("  Residual risk: everything; no evidence is inside any boundary");
    } else {
      boundaryLines(recs).forEach((b, i) => lines.push(`  ${i === 0 ? "Boundary:   " : "            "} ${b}`));
      dependencyLines(recs).forEach((d, i) => lines.push(`  ${i === 0 ? "Dependency: " : "            "} ${d}`));
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
  const mapLine = map.files.length === 0 ? "no evidence map under the spec directories" : `${disagreements} map disagreement(s) with ${map.files.join(", ")}`;
  process.stdout.write(
    `same-page verify: ${evaluations.length} obligation(s): ${counts.SUFFICIENT} SUFFICIENT, ${counts.INSUFFICIENT} INSUFFICIENT, ${counts.BLOCKED} BLOCKED, ${counts.FAILING} FAILING; ${out.length} finding(s); ${mapLine}; authority ${authorityLabel(configured.authority, configured.name)} (${configured.source}) @ ${snapshotId ?? "unknown (no snapshot)"}\n`
  );
  const allSufficient = evaluations.every((v) => v.verdict === "SUFFICIENT");
  return out.length === 0 && allSufficient ? 0 : 1;
}



// ---------------------------------------------------------------- sync-map

// ENG-200: the one engine write to the evidence map, explicit. Rows
// whose machine view disagrees are rewritten; an obligation with no row
// gets one; every other byte of the file stays.
export function syncMap(root: string): number {
  const loaded = requirePolicy(root, "sync-map");
  if (typeof loaded === "number") return loaded;
  const { policy } = loaded;
  const { obligations, findings } = loadObligations(root);
  const out: Finding[] = [...findings];
  const map = readMap(root, policy.specs);
  if (map.files.length === 0) {
    process.stderr.write(`same-page: no conformance.md under ${policy.specs.join(", ")}; nothing to synchronize\n`);
    return 2;
  }
  const byFile = new Map<string, RowChange[]>();
  let citations = 0;
  for (const [id] of [...obligations.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const { records, findings: rf } = readRecords(root, id);
    out.push(...rf);
    const view = machineView(records);
    const row = map.rows.get(id) ?? null;
    const msg = compare(view, row);
    if (!msg) continue;
    const next = projectRow(id, view, row);
    const file = row ? row.file : map.files[0]!;
    const changes = byFile.get(file) ?? [];
    changes.push({ id, text: rowText(id, next.coverage, next.method, next.evidence), line: row ? row.line : null });
    byFile.set(file, changes);
    if (next.citationNeeded) citations++;
    process.stdout.write(`${id}: ${row ? `${row.coverage} ${row.method}` : "no row"} -> ${next.coverage} ${next.method}${next.evidence ? ` (${next.evidence})` : ""}${next.citationNeeded ? " -- cite the evidence by hand" : ""}\n`);
  }
  let written = 0;
  let added = 0;
  for (const [file, changes] of byFile) {
    const r = applyRowChanges(root, file, changes);
    written += r.written;
    added += r.added;
    for (const id of r.unplaced) out.push({ where: file, message: `${id} has no table for its prefix in the map; add the table by hand`, rule: "ENG-195" });
  }
  printFindings(out);
  process.stdout.write(`same-page sync-map: ${written} row(s) rewritten, ${added} row(s) added${citations ? `, ${citations} citation(s) to fill in` : ""}, ${out.length} finding(s); the map stays the human claim register (ENG-195)\n`);
  return out.length === 0 ? 0 : 1;
}
