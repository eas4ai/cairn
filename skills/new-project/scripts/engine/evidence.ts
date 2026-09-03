// Evidence records (ENG-026 through ENG-050), their identity (ENG-140
// through ENG-145), the boundary they claim freshness inside (ENG-130
// through ENG-133), the dependency chain that established it (ENG-124
// through ENG-129), manual evidence (ENG-180 through ENG-183), standing
// disproofs and their acknowledgment (ENG-111 through ENG-120). All of
// it is derived local state under .same-page/evidence/ (ENG-190,
// ENG-194): one directory per requirement, one file per record, never
// deleted by the engine.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { adapterHas, type Adapter, type AdapterName } from "./adapters.ts";
import { AUTHORITIES, evidenceRoot, authorityLabel, type Authority } from "./authority.ts";
import { METHODS, type Finding, type Method } from "./policy.ts";
import type { TrustContext } from "./trust.ts";
import { MECHANISMS, type Mechanism } from "./validators.ts";
import type { EnvironmentInput } from "./validators.ts";
import { parseYaml, stringifyYaml, type YamlMap, type YamlValue } from "./yaml.ts";

export const BINDING_BASES = ["none", "attested", "backend"] as const;
export const SENSITIVITIES = ["unchallenged", "challenged", "not_applicable"] as const;
export const FRESHNESS = ["current", "stale", "unknown"] as const;
export const PROVENANCE = ["conservative", "adapter_derived", "traced_supplemental"] as const;
export const SCOPES = ["repository", "package", "unknown"] as const;

// What a challenged record carries (ENG-035, ENG-036, ENG-037): the
// mechanism, the reviewable artifact, whether the challenge derives
// from the confirmed falsifier, and the falsifier digest it realizes.
export type ChallengeFacts = { mechanism: Mechanism; artifact: string; from_falsifier: boolean; falsifier_digest: string | null };

// ENG-166, ENG-167: a proof establishes the formalized obligation under
// its declared preconditions and trusted computing base. What it never
// establishes is that the sentence and the model say the same thing.
export const FORMAL_ASSUMPTIONS = [
  "a formal result establishes the formalized obligation under its declared preconditions, assumptions, and trusted computing base",
  "the correspondence between the requirement sentence and the formal model stays an assumption",
];

export const CHALLENGE_ASSUMPTIONS = ["a challenge raises sensitivity; the correspondence between the requirement sentence and the validator stays an assumption"];

export type Binding = { actor: string; actor_type: "developer" | "agent"; timestamp: string; snapshot: string; developer_confirmed: boolean };

// Every input whose change ends `current` (ENG-140, ENG-141), stored as
// one block. Policy is never in it (ENG-143). The dependency fingerprint
// at the repository scope is the snapshot itself: the boundary's content
// is the tree. External contracts are declared by adapters that hold a
// capability for them; the command and manual adapters declare none.
export type Identity = {
  snapshot: string | null;
  requirement: string;
  requirement_digest: string;
  falsifier_digest: string;
  obligation_digest: string;
  validator_digest: string | null;
  adapter: AdapterName;
  adapter_version: string;
  dependency_fingerprint: string | null;
  environment: EnvironmentInput[];
  // Inputs a supplemental trace named (ENG-041): they widen the
  // identity and never narrow the scope.
  traced: string[];
  traced_fingerprint: string | null;
  contracts: string[];
};

export const IDENTITY_KEYS = ["snapshot", "requirement", "requirement_digest", "falsifier_digest", "obligation_digest", "validator_digest", "adapter", "adapter_version", "dependency_fingerprint", "environment", "contracts"] as const;
const POLICY_KEYS = ["policy", "profile", "required", "require"];

export type Scope = (typeof SCOPES)[number];

// The chain of ENG-124, as run for one record: the first step that
// succeeded fixed the scope. Steps one and two consult the adapter
// registry; step three is the repository snapshot; step four is the
// answer when nothing established a boundary (ENG-126).
export type ChainStep = { step: number; mechanism: string; outcome: string };
// `narrowing` is "none" at the conservative floor, and otherwise the
// reviewable act that narrowed it (ENG-129): which adapter, at which
// version, over which project, establishing how many inputs.
export type Dependency = { scope: Scope; step: number; chain: ChainStep[]; narrowing: string; inputs: number };

// The envelope inside which the record claims freshness (ENG-130): the
// scope, the root it was established for, the validator definition (its
// digest is on the identity), and the declared environment inputs. The
// record's assumptions axis names the boundary's assumptions.
export type Boundary = { scope: Scope; root: string; project: string | null; validator: string | null; environment: string[] };

export type EvidenceRecord = {
  requirement: string;
  kind: Method;
  adapter: AdapterName;
  validator: string | null;
  result: "pass" | "fail" | "error";
  run: string | null;
  recorded_at: string;
  identity: Identity;
  execution_trust: { context: TrustContext; actor: string } | null;
  binding_basis: (typeof BINDING_BASES)[number];
  binding: Binding | null;
  sensitivity: (typeof SENSITIVITIES)[number];
  challenge: ChallengeFacts | null;
  freshness: (typeof FRESHNESS)[number];
  boundary: Boundary;
  dependency: Dependency;
  dependency_provenance: (typeof PROVENANCE)[number];
  assumptions: string[];
  residual_risk: string[];
  authority: Authority;
  authority_name: string | null;
  manual: { actor: string; description: string; bindings: string[]; expires: string; addresses_falsifier: boolean } | null;
};

export const COMMAND_ASSUMPTIONS = ["the declared environment inputs are the inputs that decide this validator's result"];
export const MANUAL_ASSUMPTIONS = ["manual evidence: the actor's account is the mechanism", "manual evidence declares no environment inputs"];

// The chain of ENG-124, taking the first step that succeeds. Step one
// succeeds when a trusted adapter established a complete closure; the
// narrowing it performed is recorded as a reviewable act (ENG-129).
export type Closure = { adapter: string; version: string; project: string; inputs: number; grantedBy: string };

export function dependencyChain(snapshot: string | null, closure: Closure | null): Dependency {
  const chain: ChainStep[] = [
    {
      step: 1,
      mechanism: "trusted adapter dependency closure",
      outcome: closure ? `established: ${closure.adapter} ${closure.version} over ${closure.project}, ${closure.inputs} input(s)` : "no mechanism",
    },
    { step: 2, mechanism: "package or service boundary", outcome: "no mechanism" },
    { step: 3, mechanism: "repository boundary", outcome: snapshot === null ? "not established: the snapshot cannot be computed" : `established: ${snapshot}` },
  ];
  if (closure)
    return {
      scope: "package",
      step: 1,
      chain,
      narrowing: `${closure.adapter} ${closure.version} established a complete closure of ${closure.inputs} input(s) over ${closure.project}, trusted for this repository by ${closure.grantedBy}`,
      inputs: closure.inputs,
    };
  if (snapshot !== null) return { scope: "repository", step: 3, chain, narrowing: "none", inputs: 0 };
  chain.push({ step: 4, mechanism: "none", outcome: "freshness unknown" });
  return { scope: "unknown", step: 4, chain, narrowing: "none", inputs: 0 };
}

// ENG-133, ENG-152: what the boundary does not cover, stated on the
// record so `same-page verify` can state it on the entry.
export function residualRisk(dep: Dependency, environment: string[], adapter: AdapterName): string[] {
  const out: string[] = [];
  out.push(
    dep.scope === "repository"
      ? "inputs outside the repository root: system packages, services, the network, and anything the snapshot does not contain"
      : dep.scope === "package"
        ? `inputs outside the ${dep.inputs}-input closure the adapter established, and the assumption that the runner it drove is the tool it claims to be`
        : "no dependency scope was established; nothing is inside a boundary"
  );
  if (adapter === "manual") out.push("environment drift: manual evidence declares no environment inputs, so no drift is detected");
  else out.push(environment.length ? `environment drift outside the declared inputs (${environment.join(", ")})` : "environment drift: no environment inputs are declared, so no drift is detected");
  return out;
}

export function evidenceDir(root: string, id: string): string {
  return join(root, ".same-page", "evidence", id);
}

function isMap(v: YamlValue | undefined): v is YamlMap {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

let counter = 0;
export function stamp(d: Date): string {
  counter++;
  return d.toISOString().replace(/[-:]/g, "").replace(/\.(\d+)Z$/, "$1Z") + String(counter).padStart(3, "0");
}

// A run's captured output travels with the evidence of its authority:
// under evidence/ for local runs, inside the artifact otherwise.
export function writeRun(root: string, id: string, data: YamlMap, authority: Authority, name: string | null): string {
  const rel = `${evidenceRoot(authority, name)}/runs`;
  const dir = join(root, rel);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${id}.yaml`);
  writeFileSync(path, stringifyYaml(data, ["Same Page validator run: captured output. Never parsed for evidence axes."]));
  return `${rel}/${id}.yaml`;
}

function environmentToYaml(env: EnvironmentInput[]): YamlValue[] {
  return env.map((e) => ({ input: e.input, value: e.value, error: e.error }) as YamlMap);
}

export function recordToYaml(r: EvidenceRecord): YamlMap {
  const m: YamlMap = {
    requirement: r.requirement,
    kind: r.kind,
    adapter: r.adapter,
    validator: r.validator,
    result: r.result,
    run: r.run,
    recorded_at: r.recorded_at,
    identity: {
      snapshot: r.identity.snapshot,
      requirement: r.identity.requirement,
      requirement_digest: r.identity.requirement_digest,
      falsifier_digest: r.identity.falsifier_digest,
      obligation_digest: r.identity.obligation_digest,
      validator_digest: r.identity.validator_digest,
      adapter: r.identity.adapter,
      adapter_version: r.identity.adapter_version,
      dependency_fingerprint: r.identity.dependency_fingerprint,
      environment: environmentToYaml(r.identity.environment),
      traced: [...r.identity.traced],
      traced_fingerprint: r.identity.traced_fingerprint,
      contracts: [...r.identity.contracts],
    },
    execution_trust: r.execution_trust ? ({ ...r.execution_trust } as YamlMap) : null,
    binding_basis: r.binding_basis,
    binding: r.binding ? ({ ...r.binding } as YamlMap) : null,
    sensitivity: r.sensitivity,
    challenge: r.challenge ? ({ ...r.challenge } as YamlMap) : null,
    freshness: r.freshness,
    boundary: { scope: r.boundary.scope, root: r.boundary.root, project: r.boundary.project, validator: r.boundary.validator, environment: [...r.boundary.environment] },
    dependency: { scope: r.dependency.scope, step: r.dependency.step, chain: r.dependency.chain.map((c) => ({ ...c }) as YamlMap), narrowing: r.dependency.narrowing, inputs: r.dependency.inputs },
    dependency_provenance: r.dependency_provenance,
    assumptions: [...r.assumptions],
    residual_risk: [...r.residual_risk],
    authority: r.authority,
    authority_name: r.authority_name,
    manual: r.manual ? ({ ...r.manual, bindings: [...r.manual.bindings] } as YamlMap) : null,
  };
  return m;
}

// ENG-160, ENG-194: a record is written where its authority's evidence
// is read, and nowhere else.
export function writeRecord(root: string, r: EvidenceRecord, label: string): string {
  const rel = `${evidenceRoot(r.authority, r.authority_name)}/${r.requirement}`;
  const dir = join(root, rel);
  mkdirSync(dir, { recursive: true });
  const name = `${stamp(new Date(r.recorded_at))}-${label}.yaml`;
  writeFileSync(join(dir, name), stringifyYaml(recordToYaml(r), [r.authority === "local" ? "Same Page evidence record. Derived local state; the engine never deletes it." : `Same Page evidence record, authority ${authorityLabel(r.authority, r.authority_name)}. An artifact; the engine never deletes it.`]));
  return `${rel}/${name}`;
}

export type StoredRecord = EvidenceRecord & { path: string };

function oneOf<T extends readonly string[]>(set: T, v: YamlValue | undefined): v is T[number] {
  return typeof v === "string" && (set as readonly string[]).includes(v);
}

function strOrNull(v: YamlValue | undefined): string | null {
  return typeof v === "string" ? v : null;
}

function strings(v: YamlValue | undefined): string[] {
  return Array.isArray(v) ? v.map((x) => String(x)) : [];
}

function parseIdentity(raw: YamlValue | undefined, where: string, findings: Finding[]): Identity | null {
  if (!isMap(raw)) {
    findings.push({ where, message: "record has no identity block, so nothing can establish its freshness; run the validator again", rule: "ENG-141" });
    return null;
  }
  const missing = IDENTITY_KEYS.filter((k) => raw[k] === undefined);
  if (missing.length) findings.push({ where, message: `record identity lacks input(s): ${missing.join(", ")}`, rule: "ENG-141" });
  const policy = Object.keys(raw).filter((k) => POLICY_KEYS.includes(k));
  if (policy.length) findings.push({ where, message: `record identity carries policy (${policy.join(", ")}); policy is never an identity input`, rule: "ENG-143" });
  const env = raw["environment"];
  if (!Array.isArray(env) || !env.every((e) => isMap(e) && typeof e["input"] === "string")) findings.push({ where, message: "identity environment must be a list of fingerprinted inputs (input, value, error)", rule: "ENG-141" });
  if (findings.length) return null;
  const adapter = raw["adapter"];
  return {
    snapshot: strOrNull(raw["snapshot"]),
    requirement: String(raw["requirement"]),
    requirement_digest: String(raw["requirement_digest"]),
    falsifier_digest: String(raw["falsifier_digest"]),
    obligation_digest: String(raw["obligation_digest"]),
    validator_digest: strOrNull(raw["validator_digest"]),
    adapter: adapter === "manual" ? "manual" : "command",
    adapter_version: String(raw["adapter_version"]),
    dependency_fingerprint: strOrNull(raw["dependency_fingerprint"]),
    environment: (env as YamlMap[]).map((e) => ({ input: String(e["input"]), value: strOrNull(e["value"]), error: strOrNull(e["error"]) })),
    traced: strings(raw["traced"]),
    traced_fingerprint: strOrNull(raw["traced_fingerprint"]),
    contracts: strings(raw["contracts"]),
  };
}

function parseBoundary(raw: YamlValue | undefined, where: string, findings: Finding[]): Boundary | null {
  if (!isMap(raw)) {
    findings.push({ where, message: "record has no recorded verification boundary", rule: "ENG-130" });
    return null;
  }
  if (!oneOf(SCOPES, raw["scope"]) || typeof raw["root"] !== "string" || !Array.isArray(raw["environment"])) {
    findings.push({ where, message: "a boundary records scope, root, validator, and the declared environment inputs", rule: "ENG-130" });
    return null;
  }
  return { scope: raw["scope"], root: raw["root"], project: strOrNull(raw["project"]), validator: strOrNull(raw["validator"]), environment: strings(raw["environment"]) };
}

function parseDependency(raw: YamlValue | undefined, where: string, findings: Finding[], adapters: Record<string, Adapter>): Dependency | null {
  if (!isMap(raw)) {
    findings.push({ where, message: "record has no dependency scope; the chain that established it is not recorded", rule: "ENG-124" });
    return null;
  }
  const scope = raw["scope"];
  if (!oneOf(SCOPES, scope)) {
    findings.push({ where, message: `dependency scope ${String(scope)} is narrower than the repository and no registered mechanism established its completeness; the conservative floor is the repository`, rule: "ENG-128" });
    return null;
  }
  const narrowing = typeof raw["narrowing"] === "string" ? (raw["narrowing"] as string) : "";
  // ENG-128, ENG-129: a narrowed scope names the reviewable act that
  // narrowed it, and that act names a registered adapter holding
  // can_establish_complete_dependencies.
  if (scope === "package") {
    if (narrowing === "none" || narrowing === "") {
      findings.push({ where, message: "a dependency scope narrower than the repository names the reviewable act that established its completeness", rule: "ENG-129" });
      return null;
    }
    const named = Object.keys(adapters).find((n) => narrowing.startsWith(`${n} `));
    if (!named || !adapterHas(adapters, named, "can_establish_complete_dependencies")) {
      findings.push({ where, message: `the narrowing act names no registered adapter that can establish complete dependencies: ${narrowing}`, rule: "ENG-128" });
      return null;
    }
  } else if (narrowing !== "none") {
    findings.push({ where, message: `dependency narrowing ${narrowing} claims an act at the conservative floor; a record at repository scope narrows nothing`, rule: "ENG-129" });
    return null;
  }
  const chain = raw["chain"];
  if (!Array.isArray(chain) || !chain.every((c) => isMap(c) && typeof c["step"] === "number")) {
    findings.push({ where, message: "dependency chain must list the steps taken in order", rule: "ENG-124" });
    return null;
  }
  const step = raw["step"];
  const inputs = raw["inputs"];
  return {
    scope,
    step: typeof step === "number" ? step : scope === "package" ? 1 : scope === "repository" ? 3 : 4,
    chain: (chain as YamlMap[]).map((c) => ({ step: c["step"] as number, mechanism: String(c["mechanism"] ?? ""), outcome: String(c["outcome"] ?? "") })),
    narrowing,
    inputs: typeof inputs === "number" ? inputs : 0,
  };
}

export type Location = { authority: Authority; name: string | null };

export function parseRecord(raw: YamlValue, where: string, location: Location | null = null, adapters: Record<string, Adapter> = {}): { record: EvidenceRecord | null; findings: Finding[] } {
  const findings: Finding[] = [];
  if (!isMap(raw)) return { record: null, findings: [{ where, message: "an evidence record is a mapping", rule: "ENG-026" }] };
  // ENG-159: every record states its authority; ENG-194: the stated
  // authority is the one its location holds.
  const authority = raw["authority"];
  const authorityName = typeof raw["authority_name"] === "string" ? (raw["authority_name"] as string) : null;
  if (!oneOf(AUTHORITIES, authority)) findings.push({ where, message: `record states no authority; it must be one of ${AUTHORITIES.join(", ")}`, rule: "ENG-159" });
  else if (location && (authority !== location.authority || (authority === "named-environment" && authorityName !== location.name)))
    findings.push({ where, message: `record states authority ${authorityLabel(authority, authorityName)} but lies where ${authorityLabel(location.authority, location.name)} evidence is read; a record is stored only where its own authority's evidence is read`, rule: "ENG-194" });
  const missing = ["kind", "binding_basis", "sensitivity", "freshness", "dependency_provenance", "assumptions"].filter((k) => raw[k] === undefined);
  if (missing.length) findings.push({ where, message: `record lacks axis field(s): ${missing.join(", ")}`, rule: "ENG-026" });
  if (!oneOf(METHODS, raw["kind"])) findings.push({ where, message: `kind must be one of ${METHODS.join(", ")}`, rule: "ENG-027" });
  if (!oneOf(BINDING_BASES, raw["binding_basis"])) findings.push({ where, message: `binding_basis must be one of ${BINDING_BASES.join(", ")}`, rule: "ENG-029" });
  if (!oneOf(SENSITIVITIES, raw["sensitivity"])) findings.push({ where, message: `sensitivity must be one of ${SENSITIVITIES.join(", ")}`, rule: "ENG-034" });
  if (!oneOf(FRESHNESS, raw["freshness"])) findings.push({ where, message: `freshness must be one of ${FRESHNESS.join(", ")}`, rule: "ENG-038" });
  if (!oneOf(PROVENANCE, raw["dependency_provenance"])) findings.push({ where, message: `dependency_provenance must be one of ${PROVENANCE.join(", ")}`, rule: "ENG-040" });
  if (raw["binding_basis"] === "attested") {
    const b = raw["binding"];
    const ok = isMap(b) && typeof b["actor"] === "string" && (b["actor_type"] === "developer" || b["actor_type"] === "agent") && typeof b["timestamp"] === "string" && typeof b["snapshot"] === "string" && typeof b["developer_confirmed"] === "boolean";
    if (!ok) findings.push({ where, message: "an attested binding records actor, actor_type, timestamp, snapshot, developer_confirmed", rule: "ENG-030" });
  }
  if (raw["binding_basis"] === "backend") findings.push({ where, message: "no registered adapter can establish a backend binding", rule: "ENG-032" });
  // ENG-035 through ENG-037, ENG-171: what a challenged record must carry.
  const ch = raw["challenge"];
  if (raw["sensitivity"] === "challenged") {
    if (!isMap(ch)) findings.push({ where, message: "a challenged record names its challenge mechanism and artifact", rule: "ENG-035" });
    else {
      if (typeof ch["mechanism"] !== "string" || !(MECHANISMS as readonly string[]).includes(ch["mechanism"] as string)) findings.push({ where, message: `a challenged record names a mechanism from ${MECHANISMS.join(", ")}`, rule: "ENG-035" });
      if (typeof ch["artifact"] !== "string" || ch["artifact"] === "") findings.push({ where, message: "a challenged record cites a reviewable challenge artifact", rule: "ENG-171" });
      if (ch["from_falsifier"] !== true && ch["from_falsifier"] !== false) findings.push({ where, message: "a challenged record states whether the challenge derives from the confirmed falsifier", rule: "ENG-036" });
      if (ch["from_falsifier"] === true && (typeof ch["falsifier_digest"] !== "string" || ch["falsifier_digest"] === "")) findings.push({ where, message: "a falsifier-derived challenge cites the digest of the falsifier it realizes", rule: "ENG-037" });
    }
  }
  const identity = parseIdentity(raw["identity"], where, findings);
  // A record with no identity at all has no boundary or chain worth
  // reporting separately: one finding names the record.
  if (!isMap(raw["identity"])) return { record: null, findings };
  const boundary = parseBoundary(raw["boundary"], where, findings);
  const dependency = parseDependency(raw["dependency"], where, findings, adapters);
  if (!Array.isArray(raw["residual_risk"])) findings.push({ where, message: "record states no residual risk outside its boundary", rule: "ENG-133" });
  if (findings.length || !identity || !boundary || !dependency) return { record: null, findings };
  if (identity.snapshot === null && raw["freshness"] !== "unknown") findings.push({ where, message: "a record with no snapshot has unknown freshness; no chain step established a boundary", rule: "ENG-126" });
  if (identity.snapshot !== null && dependency.scope === "unknown") findings.push({ where, message: "a record with a snapshot established at least the repository boundary", rule: "ENG-124" });
  if (findings.length) return { record: null, findings };
  const s = (k: string): string | null => strOrNull(raw[k]);
  const et = raw["execution_trust"];
  const manual = raw["manual"];
  const b = raw["binding"];
  return {
    record: {
      requirement: s("requirement") ?? "",
      kind: raw["kind"] as Method,
      adapter: identity.adapter,
      validator: s("validator"),
      result: (s("result") as EvidenceRecord["result"]) ?? "error",
      run: s("run"),
      recorded_at: s("recorded_at") ?? "",
      identity,
      execution_trust: isMap(et) && typeof et["context"] === "string" ? { context: et["context"] as TrustContext, actor: typeof et["actor"] === "string" ? et["actor"] : "" } : null,
      binding_basis: raw["binding_basis"] as EvidenceRecord["binding_basis"],
      binding: isMap(b)
        ? { actor: String(b["actor"]), actor_type: b["actor_type"] as Binding["actor_type"], timestamp: String(b["timestamp"]), snapshot: String(b["snapshot"]), developer_confirmed: b["developer_confirmed"] === true }
        : null,
      sensitivity: raw["sensitivity"] as EvidenceRecord["sensitivity"],
      challenge: isMap(ch)
        ? { mechanism: ch["mechanism"] as Mechanism, artifact: String(ch["artifact"]), from_falsifier: ch["from_falsifier"] === true, falsifier_digest: strOrNull(ch["falsifier_digest"]) }
        : null,
      freshness: raw["freshness"] as EvidenceRecord["freshness"],
      boundary,
      dependency,
      dependency_provenance: raw["dependency_provenance"] as EvidenceRecord["dependency_provenance"],
      assumptions: strings(raw["assumptions"]),
      residual_risk: strings(raw["residual_risk"]),
      authority: raw["authority"] as Authority,
      authority_name: authorityName,
      manual: isMap(manual)
        ? {
            actor: String(manual["actor"] ?? ""),
            description: String(manual["description"] ?? ""),
            bindings: strings(manual["bindings"]),
            expires: String(manual["expires"] ?? ""),
            addresses_falsifier: manual["addresses_falsifier"] === true,
          }
        : null,
    },
    findings,
  };
}

// Every location evidence is read from: local derived state, the CI
// artifact, and one artifact per named environment present.
export function evidenceLocations(root: string): Location[] {
  const out: Location[] = [{ authority: "local", name: null }, { authority: "ci", name: null }];
  const envs = join(root, ".same-page", "artifacts", "environments");
  if (existsSync(envs)) for (const name of readdirSync(envs).sort()) out.push({ authority: "named-environment", name });
  return out;
}

export function readRecords(root: string, id: string, adapters: Record<string, Adapter> = {}): { records: StoredRecord[]; findings: Finding[] } {
  const records: StoredRecord[] = [];
  const findings: Finding[] = [];
  for (const location of evidenceLocations(root)) {
    const rel = `${evidenceRoot(location.authority, location.name)}/${id}`;
    const dir = join(root, rel);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir).sort()) {
      if (!name.endsWith(".yaml") || name.startsWith("disproof")) continue;
      const where = `${rel}/${name}`;
      let raw: YamlValue;
      try {
        raw = parseYaml(readFileSync(join(dir, name), "utf8"));
      } catch (e) {
        findings.push({ where, message: (e as Error).message, rule: "ENG-026" });
        continue;
      }
      const r = parseRecord(raw, where, location, adapters);
      if (r.record) records.push({ ...r.record, path: where });
      else findings.push(...r.findings);
    }
  }
  records.sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
  return { records, findings };
}

// ---------------------------------------------------------------- disproofs

export type Disproof = {
  requirement: string;
  requirement_digest: string;
  falsifier_digest: string;
  sentence: string;
  falsifier: string;
  verdict: "FAILING";
  snapshot: string;
  record: string;
  recorded_at: string;
};

export function disproofPath(root: string, id: string): string {
  return join(evidenceDir(root, id), "disproof.yaml");
}

export function readDisproof(root: string, id: string): Disproof | null {
  const p = disproofPath(root, id);
  if (!existsSync(p)) return null;
  const raw = parseYaml(readFileSync(p, "utf8"));
  if (!isMap(raw)) return null;
  const s = (k: string) => (typeof raw[k] === "string" ? (raw[k] as string) : "");
  return { requirement: s("requirement"), requirement_digest: s("requirement_digest"), falsifier_digest: s("falsifier_digest"), sentence: s("sentence"), falsifier: s("falsifier"), verdict: "FAILING", snapshot: s("snapshot"), record: s("record"), recorded_at: s("recorded_at") };
}

export function writeDisproof(root: string, d: Disproof): void {
  mkdirSync(evidenceDir(root, d.requirement), { recursive: true });
  writeFileSync(disproofPath(root, d.requirement), stringifyYaml({ ...d } as YamlMap, ["Same Page standing disproof. Preserved as history; never deleted or hidden by the engine (ENG-117, ENG-118)."]));
}

export type Acknowledgment = { requirement: string; actor: string; acknowledged_at: string; prior_requirement_digest: string; prior_falsifier_digest: string; new_requirement_digest: string; new_falsifier_digest: string };

export function acknowledgmentPath(root: string, id: string): string {
  return join(evidenceDir(root, id), "disproof-acknowledged.yaml");
}

export function readAcknowledgment(root: string, id: string): Acknowledgment | null {
  const p = acknowledgmentPath(root, id);
  if (!existsSync(p)) return null;
  const raw = parseYaml(readFileSync(p, "utf8"));
  if (!isMap(raw)) return null;
  const s = (k: string) => (typeof raw[k] === "string" ? (raw[k] as string) : "");
  return { requirement: s("requirement"), actor: s("actor"), acknowledged_at: s("acknowledged_at"), prior_requirement_digest: s("prior_requirement_digest"), prior_falsifier_digest: s("prior_falsifier_digest"), new_requirement_digest: s("new_requirement_digest"), new_falsifier_digest: s("new_falsifier_digest") };
}

export function writeAcknowledgment(root: string, a: Acknowledgment): void {
  mkdirSync(evidenceDir(root, a.requirement), { recursive: true });
  writeFileSync(acknowledgmentPath(root, a.requirement), stringifyYaml({ ...a } as YamlMap, ["Same Page: the developer acknowledged that a revision clears or changes a standing disproof (ENG-115)."]));
}

// ---------------------------------------------------------------- weak sensitivity

// ENG-173, ENG-174: a challenge the validator passed. Recorded per
// requirement and validator, so every earlier challenged claim of that
// validator stops counting and `verify` reports it. History, like a
// disproof: the engine writes it and never deletes it.
export type WeakSensitivity = { requirement: string; validator: string; mechanism: Mechanism; artifact: string; from_falsifier: boolean; snapshot: string | null; run: string; recorded_at: string };

export function weakPath(root: string, id: string, authority: Authority, name: string | null): string {
  return join(root, evidenceRoot(authority, name), id, "weak-sensitivity.yaml");
}

export function readWeak(root: string, id: string): WeakSensitivity[] {
  const out: WeakSensitivity[] = [];
  for (const location of evidenceLocations(root)) {
    const p = weakPath(root, id, location.authority, location.name);
    if (!existsSync(p)) continue;
    const raw = parseYaml(readFileSync(p, "utf8"));
    if (!isMap(raw)) continue;
    const s = (k: string) => (typeof raw[k] === "string" ? (raw[k] as string) : "");
    out.push({ requirement: s("requirement"), validator: s("validator"), mechanism: s("mechanism") as Mechanism, artifact: s("artifact"), from_falsifier: raw["from_falsifier"] === true, snapshot: strOrNull(raw["snapshot"]), run: s("run"), recorded_at: s("recorded_at") });
  }
  return out;
}

export function writeWeak(root: string, w: WeakSensitivity, authority: Authority, name: string | null): string {
  const p = weakPath(root, w.requirement, authority, name);
  mkdirSync(join(root, evidenceRoot(authority, name), w.requirement), { recursive: true });
  writeFileSync(p, stringifyYaml({ ...w } as YamlMap, ["Same Page weak sensitivity: this validator passed a challenge that realizes the", "confirmed falsifier, so no challenged claim of it counts (ENG-173, ENG-174)."]));
  return `${evidenceRoot(authority, name)}/${w.requirement}/weak-sensitivity.yaml`;
}

// A disproof stands while the latest record for the requirement is a
// failing result (ENG-111), whatever that record's freshness is now: a
// stale counterexample is still the last thing observed.
export function standingDisproof(root: string, id: string, records: StoredRecord[]): Disproof | null {
  const d = readDisproof(root, id);
  if (!d) return null;
  const latest = records[records.length - 1];
  if (!latest || latest.result !== "fail") return null;
  return d;
}
