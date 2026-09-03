// What the engine keeps after the fact and never deletes: the standing
// disproof a failing result leaves (ENG-111 through ENG-120), the
// developer's acknowledgment of a revision that clears one, and the
// misses a challenge recorded against a mechanism (ENG-173, ENG-174).
// All of it is derived local state, and all of it survives the thing it
// describes: a revision does not erase what was disproved, and a fix
// does not erase that the mechanism was once blind.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { evidenceRoot, type Authority } from "./authority.ts";
import { evidenceDir, evidenceLocations, type StoredRecord } from "./evidence.ts";
import type { Mechanism } from "./validators.ts";
import { parseYaml, stringifyYaml, type YamlMap, type YamlValue } from "./yaml.ts";

function isMap(v: YamlValue | undefined): v is YamlMap {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function strOrNull(v: YamlValue | undefined): string | null {
  return typeof v === "string" ? v : null;
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

// -------------------------------------------------------- weak sensitivity

// ENG-173, ENG-174: a challenge the validator passed. Sensitivity is a
// property of the mechanism, not of one requirement, so a miss is
// recorded against the validator and withdraws that validator's
// challenged claims wherever they stand. The record names which
// requirement's falsifier the challenge realized, for review.
//
// A miss is cleared when the same challenge -- the same mechanism on
// the same artifact -- is run again and the validator notices it. The
// cleared entry stays in the file as history, with the moment it was
// cleared; only an uncleared miss withdraws a claim.
export type Miss = {
  mechanism: Mechanism;
  artifact: string;
  requirement: string;
  from_falsifier: boolean;
  snapshot: string | null;
  run: string;
  recorded_at: string;
  cleared_at: string | null;
  cleared_run: string | null;
};

export type Mechanism_Record = { validator: string; misses: Miss[] };

export function mechanismPath(root: string, validator: string, authority: Authority, name: string | null): string {
  return join(root, evidenceRoot(authority, name), "_mechanisms", `${validator}.yaml`);
}

function parseMiss(raw: YamlValue): Miss | null {
  if (!isMap(raw)) return null;
  const s = (k: string) => (typeof raw[k] === "string" ? (raw[k] as string) : "");
  if (!s("mechanism") || !s("artifact")) return null;
  return {
    mechanism: s("mechanism") as Mechanism,
    artifact: s("artifact"),
    requirement: s("requirement"),
    from_falsifier: raw["from_falsifier"] === true,
    snapshot: strOrNull(raw["snapshot"]),
    run: s("run"),
    recorded_at: s("recorded_at"),
    cleared_at: strOrNull(raw["cleared_at"]),
    cleared_run: strOrNull(raw["cleared_run"]),
  };
}

// Every miss recorded against one validator, across every authority's
// evidence.
export function readMisses(root: string, validator: string): Miss[] {
  const out: Miss[] = [];
  for (const location of evidenceLocations(root)) {
    const p = mechanismPath(root, validator, location.authority, location.name);
    if (!existsSync(p)) continue;
    const raw = parseYaml(readFileSync(p, "utf8"));
    if (!isMap(raw) || !Array.isArray(raw["misses"])) continue;
    for (const m of raw["misses"]) {
      const parsed = parseMiss(m);
      if (parsed) out.push(parsed);
    }
  }
  return out;
}

// Only an uncleared miss withdraws a claim (ENG-174).
export function standingMisses(misses: Miss[]): Miss[] {
  return misses.filter((m) => m.cleared_at === null);
}

function writeMisses(root: string, validator: string, misses: Miss[], authority: Authority, name: string | null): string {
  const rel = `${evidenceRoot(authority, name)}/_mechanisms/${validator}.yaml`;
  mkdirSync(join(root, evidenceRoot(authority, name), "_mechanisms"), { recursive: true });
  writeFileSync(
    join(root, rel),
    stringifyYaml({ validator, misses: misses.map((m) => ({ ...m }) as YamlMap) } as YamlMap, [
      "Same Page weak sensitivity: challenges this validator passed while the",
      "confirmed falsifier was realized. An uncleared miss withdraws every",
      "challenged claim of this validator (ENG-173, ENG-174). A miss is cleared",
      "when the same challenge is run again and the validator notices it; the",
      "entry stays as history.",
    ])
  );
  return rel;
}

// Record a miss, replacing any earlier entry for the same challenge.
export function recordMiss(root: string, validator: string, miss: Miss, authority: Authority, name: string | null): string {
  const misses = readMisses(root, validator).filter((m) => !(m.mechanism === miss.mechanism && m.artifact === miss.artifact));
  misses.push(miss);
  return writeMisses(root, validator, misses, authority, name);
}

// Clear the miss this challenge left, if any. Returns the cleared entry.
export function clearMiss(root: string, validator: string, mechanism: Mechanism, artifact: string, at: string, run: string, authority: Authority, name: string | null): Miss | null {
  const misses = readMisses(root, validator);
  const target = misses.find((m) => m.mechanism === mechanism && m.artifact === artifact && m.cleared_at === null);
  if (!target) return null;
  target.cleared_at = at;
  target.cleared_run = run;
  writeMisses(root, validator, misses, authority, name);
  return target;
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
