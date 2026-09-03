// The lines `same-page verify` prints for one obligation: the
// boundaries its records claim, the environment each validator
// fingerprinted, and the dependency scope each record established. One
// line per distinct answer, so no line implies more than its own record
// established (ENG-132).

import type { EvidenceRecord } from "./evidence.ts";

export function short(v: string | null): string {
  if (v === null) return "none";
  return v.startsWith("sha256:") ? v.slice(0, 19) : v;
}

// One line per distinct boundary among an entry's records: the same
// validator at the same root and declaration is one boundary.
export function boundaryLines(records: EvidenceRecord[]): string[] {
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

export function environmentLines(records: EvidenceRecord[]): string[] {
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
export function dependencyLines(records: EvidenceRecord[]): string[] {
  const seen = new Map<string, string>();
  for (const r of records) {
    const d = r.dependency;
    const text = `${d.scope} via chain step ${d.step} (${d.chain.map((c) => `${c.step} ${c.mechanism}: ${c.outcome}`).join("; ")}); narrowing: ${d.narrowing}`;
    seen.set(text, text);
  }
  return [...seen.values()];
}
