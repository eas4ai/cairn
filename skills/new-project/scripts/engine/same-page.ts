// Same Page Conformance -- the engine's command line.
//
//   same-page elaborate                      project Agreed requirements into obligations
//   same-page verify [--as-developer]        evaluate every obligation against the policy
//   same-page trust <validator>              grant execution trust, outside the repository
//   same-page trust --environment <name>     trust a named environment for this repository
//   same-page trust --adapter <name>         trust a registered adapter for this repository
//   same-page run [validator...] [--as-developer] [--environment <name>]
//   same-page challenge [validator...] [--as-developer] [--environment <name>]
//   same-page attest <REQ-ID> --by <actor> --expires <date> --description <text>
//                   [--bindings a,b] [--addresses-falsifier] [--inspection-only]
//   same-page acknowledge <REQ-ID>           acknowledge a disproof-clearing revision
//   same-page policy confirm                 accept a policy downgrade
//   same-page sync-map                       write the machine view into the evidence map
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
import { BUILTIN, adapterHas, adapterVersion, readRegistry, registrationPath, type Adapter } from "./adapters.ts";
import { authorityLabel, ciActor, ciConfiguration, configuredAuthority, inCi, type Authority, type Configured } from "./authority.ts";
import { assess, evaluate, isAuthoritative, type Evaluation, type Present, type Verdict } from "./evaluate.ts";
import {
  CHALLENGE_ASSUMPTIONS,
  COMMAND_ASSUMPTIONS,
  FORMAL_ASSUMPTIONS,
  MANUAL_ASSUMPTIONS,
  dependencyChain,
  residualRisk,
  stamp,
  readAcknowledgment,
  readDisproof,
  readRecords,
  readWeak,
  standingDisproof,
  writeWeak,
  writeAcknowledgment,
  writeDisproof,
  writeRecord,
  writeRun,
  type Closure,
  type EvidenceRecord,
  type StoredRecord,
} from "./evidence.ts";
import { applyRowChanges, compare, machineView, projectRow, readMap, rowText, type RowChange } from "./map.ts";
import { completeRef, obligationDigest, obligationPath, obligationsDir, obligationText, projectObligation, readObligation, writeObligation, type Obligation } from "./obligations.ts";
import { compareStrength, defaultPolicy, loadPolicy, policyText, requiredText, type Finding, type Policy } from "./policy.ts";
import { currentSnapshot } from "./snapshot.ts";
import { readCorpus, type Requirement } from "./specs.ts";
import { EMPTY_STORE, findAdapterGrant, findEnvironmentGrant, findGrant, gitActor, grant, grantAdapter, grantEnvironment, readTrustStore, trustPath, trustStoreInsideRepository, type TrustStore } from "./trust.ts";
import { closureArgv, computeInputSet, environmentLabel, fingerprintEnvironment, listValidators, readValidator, runChallenge, runValidator, validatorDigest, type EnvironmentInput, type InputSet, type ValidatorDef } from "./validators.ts";
import type { YamlMap } from "./yaml.ts";

const USAGE = "usage: same-page <elaborate|verify|trust|run|challenge|attest|acknowledge|policy|sync-map> ... [--root DIR]";

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
  for (const d of ["obligations", "validators", "evidence", "cache", "artifacts"]) mkdirSync(join(base, d), { recursive: true });
  const ignore = join(base, ".gitignore");
  if (!existsSync(ignore)) writeFileSync(ignore, "# Derived execution state stays uncommitted (ENG-190, ENG-193, ENG-194).\nevidence/\ncache/\nartifacts/\n");
  else if (!readFileSync(ignore, "utf8").split("\n").includes("artifacts/")) writeFileSync(ignore, readFileSync(ignore, "utf8").replace(/\n?$/, "\n") + "artifacts/\n");
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
    const ci = ciConfiguration(root);
    writeFileSync(policyPath, policyText(defaultPolicy(dirs, ci ? "ci" : "local")));
    process.stdout.write(`wrote .same-page/policy.yaml (specs: ${dirs.join(", ")}; authority ${ci ? `ci, CI configuration at ${ci}` : "local, no CI configuration"})\n`);
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

// ------------------------------------------------------- dependency sets

// What a validator's declarations establish now: the adapter closure
// that narrows its boundary, and the supplemental trace that widens it.
// A closure needs a registered adapter with
// can_establish_complete_dependencies (ENG-055, ENG-056) and a grant
// the developer wrote outside the repository (ENG-061, ENG-064);
// without either, the engine keeps the conservative floor and says so.
type Sets = { closure: Closure | null; closureSet: InputSet | null; trace: InputSet | null };

function dependencySets(root: string, def: ValidatorDef, store: TrustStore, adapters: Record<string, Adapter>, out: Finding[]): Sets {
  const where = `.same-page/validators/${def.name}.yaml`;
  let closure: Closure | null = null;
  let closureSet: InputSet | null = null;
  if (def.closure) {
    const a = adapters[def.closure.adapter];
    if (!a) {
      out.push({ where, message: `closure adapter ${def.closure.adapter} is not registered; register it in ${registrationPath()}, outside this repository`, rule: "ENG-055" });
    } else if (!adapterHas(adapters, a.name, "can_establish_complete_dependencies")) {
      out.push({ where, message: `adapter ${a.name} is registered without can_establish_complete_dependencies, so it cannot establish a closure; the conservative floor stands`, rule: "ENG-056" });
    } else {
      const g = findAdapterGrant(store, root, a.name, a.version);
      if (!g) {
        out.push({ where, message: `adapter ${a.name} ${a.version} is not trusted for this repository; run \`same-page trust --adapter ${a.name}\`. Until then the boundary stays the repository`, rule: "ENG-064" });
      } else {
        const set = computeInputSet(root, def.cwd, closureArgv(a.name, a.command, def.closure), def.timeout);
        closureSet = set;
        if (set.error !== null) out.push({ where, message: `adapter ${a.name} could not establish the closure (${set.error}); the boundary stays the repository`, rule: "ENG-124" });
        else closure = { adapter: a.name, version: a.version, project: def.closure.project, inputs: set.inputs.length, grantedBy: g.actor };
      }
    }
  }
  let trace: InputSet | null = null;
  if (def.trace) {
    trace = computeInputSet(root, def.cwd, def.trace.command, def.timeout);
    if (trace.error !== null) out.push({ where, message: `the supplemental trace could not be computed (${trace.error}); it names no inputs and narrows nothing`, rule: "ENG-041" });
  }
  return { closure, closureSet, trace };
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
    const where = r.boundary.scope === "package" ? `${r.boundary.scope} ${r.boundary.project ?? "?"} (${r.dependency.inputs} input(s)) inside ${r.boundary.root}` : `${r.boundary.scope} at ${r.boundary.root}`;
    const traced = r.identity.traced.length ? `; ${r.identity.traced.length} traced input(s)` : "";
    const text = `${where}; ${who}${r.identity.validator_digest ? ` (${short(r.identity.validator_digest)})` : ""}; ${env}${traced}`;
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

// One line per distinct dependency scope among an entry's records: an
// entry with both a repository-scoped and a narrowed record states
// both, so no line implies more than its own record established
// (ENG-132).
function dependencyLines(records: EvidenceRecord[]): string[] {
  const seen = new Map<string, string>();
  for (const r of records) {
    const d = r.dependency;
    const text = `${d.scope} via chain step ${d.step} (${d.chain.map((c) => `${c.step} ${c.mechanism}: ${c.outcome}`).join("; ")}); narrowing: ${d.narrowing}`;
    seen.set(text, text);
  }
  return [...seen.values()];
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
    const weak = readWeak(root, id);
    // ENG-173: a challenge the validator passed is reported, whatever
    // the verdict is.
    for (const w of weak)
      out.push({ where: w.run, message: `weak sensitivity for ${id}: ${w.validator} passed the ${w.mechanism} challenge ${w.artifact}, which realizes the confirmed falsifier; the mechanism does not notice the violating state`, rule: "ENG-173" });
    const assessed = assess({ ...o, required }, records, present, now, weak);
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

// ---------------------------------------------------------------- trust

function trust(root: string, name: string | undefined, environment: string | undefined, adapter: string | undefined): number {
  const chosen = [name, environment, adapter].filter((x) => x !== undefined && x !== "").length;
  if (chosen !== 1) {
    process.stderr.write("usage: same-page trust <validator> | same-page trust --environment <name> | same-page trust --adapter <name>\n");
    return 2;
  }
  if (trustStoreInsideRepository(root)) {
    process.stderr.write(`same-page: the trust store ${trustPath()} is inside the repository it would authorize; set SAME_PAGE_HOME outside it (ENG-062)\n`);
    return 2;
  }
  if (adapter) {
    // ENG-055, ENG-056, ENG-065: a grant names a registered adapter and
    // the version it carries now.
    const registry = readRegistry();
    printFindings(registry.findings);
    const a = registry.adapters[adapter];
    if (!a) {
      process.stderr.write(`same-page: adapter ${adapter} is not registered. Built-in: ${Object.keys(BUILTIN).join(", ")}. Register others in ${registrationPath()}, outside this repository\n`);
      return 2;
    }
    const g = grantAdapter(root, a.name, a.version, gitActor(root));
    process.stdout.write(`trusted adapter ${a.name} ${a.version} (${a.capabilities.length ? a.capabilities.join(", ") : "no capabilities"}) for ${g.repository} by ${g.actor}; recorded in ${trustPath()}\n`);
    return 0;
  }
  if (environment) {
    const g = grantEnvironment(root, environment, gitActor(root));
    process.stdout.write(`trusted environment ${environment} for ${g.repository} by ${g.actor}; recorded in ${trustPath()}. Runs there: same-page run --environment ${environment}\n`);
    return 0;
  }
  name = name!;
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

type Shared = { context: NonNullable<EvidenceRecord["execution_trust"]>; authority: Authority; name: string | null };

// The trust context and authority a whole invocation runs under, when
// it is not per validator: a named environment the developer trusted,
// or owner-controlled CI (ENG-060).
function sharedContext(root: string, environment: string | undefined, store: ReturnType<typeof readTrustStore>, out: Finding[]): Shared | null | "error" {
  if (environment) {
    const g = findEnvironmentGrant(store, root, environment);
    if (!g) {
      out.push({ where: trustPath(), message: `environment ${environment} is not trusted for this repository; run \`same-page trust --environment ${environment}\``, rule: "ENG-058" });
      return "error";
    }
    return { context: { context: "named-environment", actor: `${environment} (${g.actor})` }, authority: "named-environment", name: environment };
  }
  if (inCi(process.env)) {
    const ci = ciConfiguration(root);
    if (!ci) {
      out.push({ where: root, message: "CI is set in the environment but the repository carries no CI configuration at a recognized path; nothing anchors trust for a ci run", rule: "ENG-060" });
      return "error";
    }
    return { context: { context: "ci", actor: ciActor(process.env) }, authority: "ci", name: null };
  }
  return null;
}

function run(root: string, names: string[], asDeveloper: boolean, environment: string | undefined): number {
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
  const shared: Shared | null = resolved;
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
    let context: NonNullable<EvidenceRecord["execution_trust"]>;
    const authority: Authority = shared ? shared.authority : "local";
    const authorityName = shared ? shared.name : null;
    if (shared) context = shared.context;
    else if (g) context = { context: "trust-record", actor: g.actor };
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
    const sets = dependencySets(root, def, store, registry.adapters, out);
    const dependency = dependencyChain(snapshotId, sets.closure);
    const declared = def.environment.map(environmentLabel);
    const narrowed = dependency.scope === "package";
    const fingerprint = narrowed ? sets.closureSet!.fingerprint : snapshotId;
    const provenance: EvidenceRecord["dependency_provenance"] = sets.trace && sets.trace.error === null ? "traced_supplemental" : narrowed ? "adapter_derived" : "conservative";
    const freshness: EvidenceRecord["freshness"] =
      (narrowed || snapshotId !== null) && environment.every((e) => e.error === null) && (!sets.trace || sets.trace.error === null) ? "current" : "unknown";
    const result = runValidator(root, def);
    executed++;
    const runId = `${stamp(new Date(result.started_at))}-${name}`;
    const runPath = writeRun(
      root,
      runId,
      {
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
      } as YamlMap,
      authority,
      authorityName
    );
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
          dependency_fingerprint: fingerprint,
          environment: environment.map((e) => ({ ...e })),
          traced: sets.trace && sets.trace.error === null ? [...sets.trace.inputs] : [],
          traced_fingerprint: sets.trace && sets.trace.error === null ? sets.trace.fingerprint : null,
          contracts: [],
        },
        execution_trust: context,
        binding_basis: attested ? "attested" : "none",
        binding: attested ? { actor: ref.actor!, actor_type: ref.attested_by!, timestamp: ref.attested_at!, snapshot: ref.snapshot!, developer_confirmed: ref.developer_confirmed === true } : null,
        sensitivity: "unchallenged",
        challenge: null,
        freshness,
        boundary: { scope: dependency.scope, root, project: sets.closure ? sets.closure.project : null, validator: name, environment: declared },
        dependency,
        dependency_provenance: provenance,
        assumptions: def.kind === "formal" ? [...COMMAND_ASSUMPTIONS, ...FORMAL_ASSUMPTIONS] : [...COMMAND_ASSUMPTIONS],
        residual_risk: residualRisk(dependency, declared, "command"),
        authority,
        authority_name: authorityName,
        manual: null,
      };
      writeRecord(root, rec, name);
      recordsWritten++;
    }
    const envText = environment.length ? `; environment ${environment.map((e) => `${e.input} = ${e.error !== null ? `not computed (${e.error})` : short(e.value)}`).join(", ")}` : "; no environment inputs declared";
    process.stdout.write(`ran ${name}: ${result.result}${result.exit_code !== null ? ` (exit ${result.exit_code})` : ""}${result.error ? ` ${result.error}` : ""} under ${context.context}; ${bound.length} record(s) at ${snapshotId ?? "unknown (no snapshot)"}, authority ${authorityLabel(authority, authorityName)}${envText}\n`);
  }
  printFindings(out);
  process.stdout.write(`same-page run: ${executed} validator(s) executed, ${recordsWritten} record(s) written, ${out.length} finding(s)\n`);
  return out.length === 0 ? 0 : 1;
}

// ---------------------------------------------------------------- challenge

// `same-page challenge` runs the challenges a validator declares, under
// the same execution trust as `run` (ENG-059). The command realizes the
// violating state and runs the validator, so its exit status is the
// validator's: nonzero means the validator noticed, and the record
// carries sensitivity `challenged` with the mechanism, artifact, and
// falsifier digest (ENG-035 through ENG-037). Zero means the validator
// passed under the violating state: weak sensitivity, recorded and
// reported, and no challenged claim of that validator stands (ENG-173,
// ENG-174).
function challenge(root: string, names: string[], asDeveloper: boolean, environment: string | undefined): number {
  const loaded = requirePolicy(root, "challenge");
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
  const resolved = sharedContext(root, environment, store, out);
  if (resolved === "error") {
    printFindings(out);
    return 1;
  }
  const shared: Shared | null = resolved;
  const listed = new Map<string, Obligation[]>();
  for (const o of obligations.values()) for (const v of o.validators) listed.set(v.name, [...(listed.get(v.name) ?? []), o]);
  const targets = names.length ? names : [...listed.keys()].sort();
  const snapshot = currentSnapshot(root);
  const snapshotId = snapshot?.id ?? null;
  let executed = 0;
  let recordsWritten = 0;
  let weakWritten = 0;
  for (const name of targets) {
    const v = readValidator(root, name);
    if (!v.def) {
      out.push(...v.findings);
      continue;
    }
    const def: ValidatorDef = v.def;
    if (def.challenges.length === 0) continue;
    const d = validatorDigest(def);
    const g = findGrant(store, root, name, d);
    let context: NonNullable<EvidenceRecord["execution_trust"]>;
    const authority: Authority = shared ? shared.authority : "local";
    const authorityName = shared ? shared.name : null;
    if (shared) context = shared.context;
    else if (g) context = { context: "trust-record", actor: g.actor };
    else if (asDeveloper) context = { context: "developer-invocation", actor };
    else {
      out.push({ where: `.same-page/validators/${name}.yaml`, message: `${name} is not trusted for this repository at its current definition (${d}); run \`same-page trust ${name}\`, or the developer runs \`same-page challenge ${name} --as-developer\``, rule: "ENG-058" });
      continue;
    }
    const bound = listed.get(name) ?? [];
    const environmentInputs: EnvironmentInput[] = fingerprintEnvironment(root, def, true);
    const sets = dependencySets(root, def, store, registry.adapters, out);
    const dependency = dependencyChain(snapshotId, sets.closure);
    const declared = def.environment.map(environmentLabel);
    const narrowed = dependency.scope === "package";
    const fingerprint = narrowed ? sets.closureSet!.fingerprint : snapshotId;
    const provenance: EvidenceRecord["dependency_provenance"] = sets.trace && sets.trace.error === null ? "traced_supplemental" : narrowed ? "adapter_derived" : "conservative";
    for (const c of def.challenges) {
      // A falsifier-derived challenge realizes one requirement's
      // falsifier, so its record belongs to that requirement only
      // (ENG-037); a challenge that is not falsifier-derived speaks for
      // every obligation the validator is bound to.
      let subjects: Obligation[];
      if (c.from_falsifier) {
        const o = obligations.get(c.requirement!);
        if (!o) {
          out.push({ where: `.same-page/validators/${name}.yaml`, message: `challenge ${c.mechanism} names requirement ${c.requirement}, which has no obligation; elaborate first`, rule: "ENG-206" });
          continue;
        }
        if (!o.validators.some((x) => x.name === name)) {
          out.push({ where: `.same-page/validators/${name}.yaml`, message: `challenge ${c.mechanism} names requirement ${c.requirement}, which does not list validator ${name}; a challenge speaks for a mechanism the requirement uses`, rule: "ENG-037" });
          continue;
        }
        subjects = [o];
      } else {
        if (bound.length === 0) {
          out.push({ where: `.same-page/validators/${name}.yaml`, message: `${name} is listed on no obligation; nothing to record`, rule: "ENG-012" });
          continue;
        }
        subjects = bound;
      }
      const result = runChallenge(root, def, c);
      executed++;
      const runId = `${stamp(new Date(result.started_at))}-${name}-challenge`;
      const runPath = writeRun(
        root,
        runId,
        {
          validator: name,
          validator_digest: d,
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
        authority,
        authorityName
      );
      // The challenge command's status is the validator's under the
      // violating state: pass means the validator did not notice.
      const noticed = result.result === "fail";
      if (result.result === "error") {
        out.push({ where: `.same-page/validators/${name}.yaml`, message: `challenge ${c.mechanism} ${c.artifact} did not complete (${result.error ?? "unknown"}); no sensitivity is claimed (${runPath})`, rule: "ENG-172" });
        process.stdout.write(`challenged ${name} with ${c.mechanism} ${c.artifact}: did not complete; no claim\n`);
        continue;
      }
      for (const o of subjects) {
        const req = corpus.requirements.find((r) => r.id === o.requirement);
        const falsifierDigest = req && req.falsifier !== null ? digest(req.falsifier) : o.falsifier_digest;
        if (!noticed) {
          const weakPathRel = writeWeak(
            root,
            { requirement: o.requirement, validator: name, mechanism: c.mechanism, artifact: c.artifact, from_falsifier: c.from_falsifier, snapshot: snapshotId, run: runPath, recorded_at: new Date().toISOString() },
            authority,
            authorityName
          );
          weakWritten++;
          out.push({ where: weakPathRel, message: `weak sensitivity for ${o.requirement}: ${name} passed the ${c.mechanism} challenge ${c.artifact}, which realizes the confirmed falsifier; the mechanism does not notice the violating state`, rule: "ENG-173" });
          continue;
        }
        const ref = completeRef(o.validators.find((x) => x.name === name) ?? { name }, snapshotId ?? "unknown", actor);
        const attested = ref.attested_by !== undefined;
        const rec: EvidenceRecord = {
          requirement: o.requirement,
          kind: def.kind,
          adapter: "command",
          validator: name,
          result: "pass",
          run: runPath,
          recorded_at: new Date().toISOString(),
          identity: {
            snapshot: snapshotId,
            requirement: o.requirement,
            requirement_digest: req ? digest(req.text) : o.requirement_digest,
            falsifier_digest: falsifierDigest,
            obligation_digest: obligationDigest(o),
            validator_digest: d,
            adapter: "command",
            adapter_version: adapterVersion("command"),
            dependency_fingerprint: fingerprint,
            environment: environmentInputs.map((e) => ({ ...e })),
            traced: sets.trace && sets.trace.error === null ? [...sets.trace.inputs] : [],
            traced_fingerprint: sets.trace && sets.trace.error === null ? sets.trace.fingerprint : null,
            contracts: [],
          },
          execution_trust: context,
          binding_basis: attested ? "attested" : "none",
          binding: attested ? { actor: ref.actor!, actor_type: ref.attested_by!, timestamp: ref.attested_at!, snapshot: ref.snapshot!, developer_confirmed: ref.developer_confirmed === true } : null,
          sensitivity: "challenged",
          challenge: { mechanism: c.mechanism, artifact: c.artifact, from_falsifier: c.from_falsifier, falsifier_digest: c.from_falsifier ? falsifierDigest : null },
          freshness: (narrowed || snapshotId !== null) && environmentInputs.every((e) => e.error === null) ? "current" : "unknown",
          boundary: { scope: dependency.scope, root, project: sets.closure ? sets.closure.project : null, validator: name, environment: declared },
          dependency,
          dependency_provenance: provenance,
          assumptions: def.kind === "formal" ? [...COMMAND_ASSUMPTIONS, ...CHALLENGE_ASSUMPTIONS, ...FORMAL_ASSUMPTIONS] : [...COMMAND_ASSUMPTIONS, ...CHALLENGE_ASSUMPTIONS],
          residual_risk: residualRisk(dependency, declared, "command"),
          authority,
          authority_name: authorityName,
          manual: null,
        };
        writeRecord(root, rec, `${name}-challenge`);
        recordsWritten++;
      }
      process.stdout.write(`challenged ${name} with ${c.mechanism} ${c.artifact}${c.from_falsifier ? ` (falsifier-derived, ${c.requirement})` : ""}: ${noticed ? "the validator noticed" : "the validator passed under the violating state"} (exit ${result.exit_code}) under ${context.context}; ${subjects.length} ${noticed ? "record" : "weak-sensitivity record"}(s) at ${snapshotId ?? "unknown (no snapshot)"}\n`);
    }
  }
  printFindings(out);
  process.stdout.write(`same-page challenge: ${executed} challenge(s) run, ${recordsWritten} challenged record(s), ${weakWritten} weak-sensitivity record(s), ${out.length} finding(s)\n`);
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
  const dependency = dependencyChain(snapshotId, null);
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
      traced: [],
      traced_fingerprint: null,
      contracts: [],
    },
    execution_trust: null,
    binding_basis: "attested",
    binding: { actor: opts.by, actor_type: "developer", timestamp: now, snapshot: snapshotId ?? "unknown", developer_confirmed: true },
    sensitivity: "not_applicable",
    challenge: null,
    freshness: snapshotId === null ? "unknown" : "current",
    boundary: { scope: dependency.scope, root, project: null, validator: null, environment: [] },
    dependency,
    dependency_provenance: "conservative",
    assumptions: [...MANUAL_ASSUMPTIONS],
    residual_risk: residualRisk(dependency, [], "manual"),
    authority: "local",
    authority_name: null,
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

// ---------------------------------------------------------------- sync-map

// ENG-200: the one engine write to the evidence map, explicit. Rows
// whose machine view disagrees are rewritten; an obligation with no row
// gets one; every other byte of the file stays.
function syncMap(root: string): number {
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
        environment: { type: "string" },
        adapter: { type: "string" },
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
      return trust(root, rest[0], str("environment"), str("adapter"));
    case "run":
      return run(root, rest, flag("as-developer"), str("environment"));
    case "challenge":
      return challenge(root, rest, flag("as-developer"), str("environment"));
    case "attest":
      return attest(root, rest[0], { by: str("by"), expires: str("expires"), description: str("description"), bindings: str("bindings"), addressesFalsifier: flag("addresses-falsifier"), inspectionOnly: flag("inspection-only") });
    case "acknowledge":
      return acknowledge(root, rest[0]);
    case "policy":
      return rest[0] === "confirm" ? policyConfirm(root) : usage();
    case "sync-map":
      return rest.length === 0 ? syncMap(root) : usage();
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
