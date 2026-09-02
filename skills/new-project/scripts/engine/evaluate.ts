// Policy evaluation (ENG-080 through ENG-088) over the evidence records
// of one obligation, with layer L2 freshness: a record is current when
// the snapshot, the validator definition, and the obligation digests
// are unchanged since it was produced; otherwise unknown (the widest
// sound boundary, ENG-039; narrower boundaries and `stale` are L3).
// Verdict order is FAILING, BLOCKED, INSUFFICIENT, SUFFICIENT
// (ENG-081); a current failing result dominates any profile (ENG-083);
// a missing precondition is BLOCKED with its reason (ENG-084).

import type { Disproof, StoredRecord } from "./evidence.ts";
import type { Obligation } from "./obligations.ts";
import type { Clause, Profile } from "./policy.ts";

export type Verdict = "FAILING" | "BLOCKED" | "INSUFFICIENT" | "SUFFICIENT";

export type Assessed = { record: StoredRecord; freshness: "current" | "unknown"; expired: boolean; why: string };

export type Evaluation = {
  id: string;
  verdict: Verdict;
  reason: string | null;
  required: Profile["require"];
  records: Assessed[];
  assumptions: string[];
  standing: Disproof | null;
  history: Disproof | null;
};

export function assess(o: Obligation, records: StoredRecord[], snapshot: string, validatorDigests: Map<string, string | null>, now: Date): Assessed[] {
  return records.map((record) => {
    const reasons: string[] = [];
    if (record.requirement_digest !== o.requirement_digest || record.falsifier_digest !== o.falsifier_digest) reasons.push("recorded for a prior requirement or falsifier text");
    if (record.snapshot !== snapshot) reasons.push(`recorded at ${record.snapshot}, current snapshot ${snapshot}`);
    if (record.validator) {
      const d = validatorDigests.get(record.validator);
      if (d === undefined) reasons.push(`validator ${record.validator} is not defined now`);
      else if (d === null) reasons.push(`validator ${record.validator} definition is invalid now`);
      else if (d !== record.validator_digest) reasons.push(`validator ${record.validator} definition changed`);
    }
    let expired = false;
    if (record.manual && record.manual.expires) {
      const exp = new Date(record.manual.expires);
      if (!Number.isNaN(exp.getTime()) && exp.getTime() <= now.getTime()) {
        expired = true;
        reasons.push(`manual evidence expired ${record.manual.expires}`);
      }
    }
    return { record, freshness: reasons.length ? "unknown" : "current", expired, why: reasons.join("; ") };
  });
}

function basisRank(b: string | undefined): number {
  return b === "backend" ? 2 : b === "attested" ? 1 : 0;
}

function clauseSatisfied(c: Clause, rs: StoredRecord[]): boolean {
  if ("kind" in c) {
    return rs.some((r) => r.result === "pass" && r.kind === c.kind && (r.kind !== "manual" || r.manual?.addresses_falsifier === true));
  }
  return rs.some((r) => r.result === "pass" && r.sensitivity === c.sensitivity);
}

// ENG-070: composition. Every all-clause holds, at least one any-clause
// holds, and a binding requirement holds on some passing record. A
// manual record that did not address the falsifier satisfies `inspected`
// only (ENG-184, ENG-185).
export function satisfies(req: Profile["require"], rs: StoredRecord[]): boolean {
  const usable = rs.filter((r) => r.result === "pass");
  if (usable.length === 0) return false;
  if (req.all && !req.all.every((c) => clauseSatisfied(c, usable))) return false;
  if (req.any && req.any.length > 0 && !req.any.some((c) => clauseSatisfied(c, usable))) return false;
  if (req.binding) {
    const need = basisRank(req.binding.basis);
    const conf = req.binding.developer_confirmed === true;
    if (!usable.some((r) => basisRank(r.binding_basis) >= need && (!conf || r.binding?.developer_confirmed === true))) return false;
  }
  return true;
}

export function evaluate(o: Obligation, assessed: Assessed[], invalidReason: string | null, standing: Disproof | null, history: Disproof | null): Evaluation {
  const required = o.required;
  const assumptions = [...new Set(assessed.flatMap((a) => a.record.assumptions))];
  const base = { id: o.requirement, required, records: assessed, assumptions, standing, history };
  const current = assessed.filter((a) => a.freshness === "current" && !a.expired).map((a) => a.record);
  // FAILING first (ENG-081, ENG-082): a current failing result.
  const failing = current.find((r) => r.result === "fail");
  if (failing) return { ...base, verdict: "FAILING", reason: `${failing.validator ?? "manual"} demonstrated the falsifier at ${failing.snapshot} (${failing.path})` };
  // BLOCKED (ENG-084): a precondition the engine cannot establish.
  if (invalidReason) return { ...base, verdict: "BLOCKED", reason: invalidReason };
  const errored = current.find((r) => r.result === "error");
  if (errored) return { ...base, verdict: "BLOCKED", reason: `validator ${errored.validator ?? "?"} did not complete (${errored.path})` };
  if (satisfies(required, current)) return { ...base, verdict: "SUFFICIENT", reason: null };
  const notCurrent = assessed.filter((a) => a.freshness === "unknown" && !a.expired).map((a) => a.record);
  if (satisfies(required, [...current, ...notCurrent])) {
    const first = assessed.find((a) => a.freshness === "unknown" && !a.expired)!;
    return { ...base, verdict: "BLOCKED", reason: `freshness cannot be established: ${first.why}; run the validators again at this snapshot` };
  }
  return { ...base, verdict: "INSUFFICIENT", reason: null };
}
