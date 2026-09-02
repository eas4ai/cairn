// Evidence records (ENG-026 through ENG-050), manual evidence (ENG-180
// through ENG-183), standing disproofs and their acknowledgment
// (ENG-111 through ENG-120). All of it is derived local state under
// .same-page/evidence/ (ENG-190, ENG-194): one directory per
// requirement, one file per record, never deleted by the engine.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AdapterName } from "./adapters.ts";
import { METHODS, type Finding, type Method } from "./policy.ts";
import type { TrustContext } from "./trust.ts";
import { parseYaml, stringifyYaml, type YamlMap, type YamlValue } from "./yaml.ts";

export const BINDING_BASES = ["none", "attested", "backend"] as const;
export const SENSITIVITIES = ["unchallenged", "challenged", "not_applicable"] as const;
export const FRESHNESS = ["current", "stale", "unknown"] as const;
export const PROVENANCE = ["conservative", "adapter_derived", "traced_supplemental"] as const;

export type Binding = { actor: string; actor_type: "developer" | "agent"; timestamp: string; snapshot: string; developer_confirmed: boolean };

export type EvidenceRecord = {
  requirement: string;
  kind: Method;
  adapter: AdapterName;
  validator: string | null;
  validator_digest: string | null;
  result: "pass" | "fail" | "error";
  run: string | null;
  recorded_at: string;
  snapshot: string;
  requirement_digest: string;
  falsifier_digest: string;
  execution_trust: { context: TrustContext; actor: string } | null;
  binding_basis: (typeof BINDING_BASES)[number];
  binding: Binding | null;
  sensitivity: (typeof SENSITIVITIES)[number];
  freshness: (typeof FRESHNESS)[number];
  boundary: "repository";
  dependency_provenance: (typeof PROVENANCE)[number];
  assumptions: string[];
  authority: "local";
  manual: { actor: string; description: string; bindings: string[]; expires: string; addresses_falsifier: boolean } | null;
};

export const L2_ASSUMPTIONS = ["environment not fingerprinted (layer L3)"];

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

export function writeRun(root: string, id: string, data: YamlMap): string {
  const dir = join(root, ".same-page", "evidence", "runs");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${id}.yaml`);
  writeFileSync(path, stringifyYaml(data, ["Same Page validator run: captured output. Never parsed for evidence axes."]));
  return `.same-page/evidence/runs/${id}.yaml`;
}

export function recordToYaml(r: EvidenceRecord): YamlMap {
  const m: YamlMap = {
    requirement: r.requirement,
    kind: r.kind,
    adapter: r.adapter,
    validator: r.validator,
    validator_digest: r.validator_digest,
    result: r.result,
    run: r.run,
    recorded_at: r.recorded_at,
    snapshot: r.snapshot,
    requirement_digest: r.requirement_digest,
    falsifier_digest: r.falsifier_digest,
    execution_trust: r.execution_trust ? ({ ...r.execution_trust } as YamlMap) : null,
    binding_basis: r.binding_basis,
    binding: r.binding ? ({ ...r.binding } as YamlMap) : null,
    sensitivity: r.sensitivity,
    freshness: r.freshness,
    boundary: r.boundary,
    dependency_provenance: r.dependency_provenance,
    assumptions: [...r.assumptions],
    authority: r.authority,
    manual: r.manual ? ({ ...r.manual, bindings: [...r.manual.bindings] } as YamlMap) : null,
  };
  return m;
}

export function writeRecord(root: string, r: EvidenceRecord, label: string): string {
  const dir = evidenceDir(root, r.requirement);
  mkdirSync(dir, { recursive: true });
  const name = `${stamp(new Date(r.recorded_at))}-${label}.yaml`;
  writeFileSync(join(dir, name), stringifyYaml(recordToYaml(r), ["Same Page evidence record. Derived local state; the engine never deletes it."]));
  return `.same-page/evidence/${r.requirement}/${name}`;
}

export type StoredRecord = EvidenceRecord & { path: string };

function oneOf<T extends readonly string[]>(set: T, v: YamlValue | undefined): v is T[number] {
  return typeof v === "string" && (set as readonly string[]).includes(v);
}

export function parseRecord(raw: YamlValue, where: string): { record: EvidenceRecord | null; findings: Finding[] } {
  const findings: Finding[] = [];
  if (!isMap(raw)) return { record: null, findings: [{ where, message: "an evidence record is a mapping", rule: "ENG-026" }] };
  const missing = ["kind", "binding_basis", "sensitivity", "freshness", "dependency_provenance", "assumptions"].filter((k) => raw[k] === undefined);
  if (missing.length) findings.push({ where, message: `record lacks axis field(s): ${missing.join(", ")}`, rule: "ENG-026" });
  if (!oneOf(METHODS, raw["kind"])) findings.push({ where, message: `kind must be one of ${METHODS.join(", ")}`, rule: "ENG-027" });
  if (!oneOf(BINDING_BASES, raw["binding_basis"])) findings.push({ where, message: `binding_basis must be one of ${BINDING_BASES.join(", ")}`, rule: "ENG-029" });
  if (!oneOf(SENSITIVITIES, raw["sensitivity"])) findings.push({ where, message: `sensitivity must be one of ${SENSITIVITIES.join(", ")}`, rule: "ENG-034" });
  if (!oneOf(FRESHNESS, raw["freshness"])) findings.push({ where, message: `freshness must be one of ${FRESHNESS.join(", ")}`, rule: "ENG-038" });
  if (!oneOf(PROVENANCE, raw["dependency_provenance"])) findings.push({ where, message: `dependency_provenance must be one of ${PROVENANCE.join(", ")}`, rule: "ENG-040" });
  if (typeof raw["snapshot"] !== "string" || raw["snapshot"] === "") findings.push({ where, message: "record has no snapshot", rule: "ENG-046" });
  if (raw["binding_basis"] === "attested") {
    const b = raw["binding"];
    const ok = isMap(b) && typeof b["actor"] === "string" && (b["actor_type"] === "developer" || b["actor_type"] === "agent") && typeof b["timestamp"] === "string" && typeof b["snapshot"] === "string" && typeof b["developer_confirmed"] === "boolean";
    if (!ok) findings.push({ where, message: "an attested binding records actor, actor_type, timestamp, snapshot, developer_confirmed", rule: "ENG-030" });
  }
  if (raw["binding_basis"] === "backend") findings.push({ where, message: "no registered adapter can establish a backend binding", rule: "ENG-032" });
  if (raw["sensitivity"] === "challenged") findings.push({ where, message: "no challenge mechanism exists to record a challenged sensitivity", rule: "ENG-035" });
  if (findings.length) return { record: null, findings };
  const s = (k: string): string | null => (typeof raw[k] === "string" ? (raw[k] as string) : null);
  const et = raw["execution_trust"];
  const manual = raw["manual"];
  const b = raw["binding"];
  return {
    record: {
      requirement: s("requirement") ?? "",
      kind: raw["kind"] as Method,
      adapter: (s("adapter") as AdapterName) ?? "command",
      validator: s("validator"),
      validator_digest: s("validator_digest"),
      result: (s("result") as EvidenceRecord["result"]) ?? "error",
      run: s("run"),
      recorded_at: s("recorded_at") ?? "",
      snapshot: s("snapshot") ?? "",
      requirement_digest: s("requirement_digest") ?? "",
      falsifier_digest: s("falsifier_digest") ?? "",
      execution_trust: isMap(et) && typeof et["context"] === "string" ? { context: et["context"] as TrustContext, actor: typeof et["actor"] === "string" ? et["actor"] : "" } : null,
      binding_basis: raw["binding_basis"] as EvidenceRecord["binding_basis"],
      binding: isMap(b)
        ? { actor: String(b["actor"]), actor_type: b["actor_type"] as Binding["actor_type"], timestamp: String(b["timestamp"]), snapshot: String(b["snapshot"]), developer_confirmed: b["developer_confirmed"] === true }
        : null,
      sensitivity: raw["sensitivity"] as EvidenceRecord["sensitivity"],
      freshness: raw["freshness"] as EvidenceRecord["freshness"],
      boundary: "repository",
      dependency_provenance: raw["dependency_provenance"] as EvidenceRecord["dependency_provenance"],
      assumptions: Array.isArray(raw["assumptions"]) ? (raw["assumptions"] as YamlValue[]).map((a) => String(a)) : [],
      authority: "local",
      manual: isMap(manual)
        ? {
            actor: String(manual["actor"] ?? ""),
            description: String(manual["description"] ?? ""),
            bindings: Array.isArray(manual["bindings"]) ? (manual["bindings"] as YamlValue[]).map((x) => String(x)) : [],
            expires: String(manual["expires"] ?? ""),
            addresses_falsifier: manual["addresses_falsifier"] === true,
          }
        : null,
    },
    findings,
  };
}

export function readRecords(root: string, id: string): { records: StoredRecord[]; findings: Finding[] } {
  const dir = evidenceDir(root, id);
  const records: StoredRecord[] = [];
  const findings: Finding[] = [];
  if (!existsSync(dir)) return { records, findings };
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith(".yaml") || name.startsWith("disproof")) continue;
    const where = `.same-page/evidence/${id}/${name}`;
    let raw: YamlValue;
    try {
      raw = parseYaml(readFileSync(join(dir, name), "utf8"));
    } catch (e) {
      findings.push({ where, message: (e as Error).message, rule: "ENG-026" });
      continue;
    }
    const r = parseRecord(raw, where);
    if (r.record) records.push({ ...r.record, path: where });
    else findings.push(...r.findings);
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

// A disproof stands while the latest record for the requirement is a
// failing result (ENG-111).
export function standingDisproof(root: string, id: string, records: StoredRecord[]): Disproof | null {
  const d = readDisproof(root, id);
  if (!d) return null;
  const latest = records[records.length - 1];
  if (!latest || latest.result !== "fail") return null;
  return d;
}
