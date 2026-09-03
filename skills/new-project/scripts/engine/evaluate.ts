// Policy evaluation (ENG-080 through ENG-088) over the evidence records
// of one obligation, with layer L3 freshness: a record is `current` when
// every identity input matches the present value, `stale` when one is
// known to differ, and `unknown` when one cannot be computed (ENG-142,
// ENG-126). The boundary is the repository, the conservative floor of
// the chain (ENG-124, ENG-125). Verdict order is FAILING, BLOCKED,
// INSUFFICIENT, SUFFICIENT (ENG-081); a current failing result dominates
// any profile (ENG-083); a missing precondition, freshness unknown
// included, is BLOCKED with its reason (ENG-084); stale evidence is
// shown and the verdict is INSUFFICIENT with the re-run named (ENG-085,
// ENG-088). Only evidence of the configured authority at the exact
// snapshot can satisfy a profile (ENG-155, ENG-160); non-authoritative
// evidence is shown with its authority (ENG-159), and a current failing
// result from any authority is FAILING: a demonstrated counterexample
// is never hidden behind authority.

import { BUILTIN, adapterVersion, type Adapter } from "./adapters.ts";
import { authorityLabel, sameAuthority, type Authority } from "./authority.ts";
import type { StoredRecord } from "./evidence.ts";
import type { Disproof, Miss } from "./history.ts";
import { obligationDigest, type Obligation } from "./obligations.ts";
import type { Clause, Profile } from "./policy.ts";
import type { EnvironmentInput, InputSet } from "./validators.ts";

export type Verdict = "FAILING" | "BLOCKED" | "INSUFFICIENT" | "SUFFICIENT";

export type Freshness = "current" | "stale" | "unknown";

export type Assessed = { record: StoredRecord; freshness: Freshness; expired: boolean; why: string; demoted: string | null };

// The present value of every identity input the engine can compute:
// the snapshot (null when no chain step established a boundary), each
// validator's definition digest (undefined: not defined; null:
// invalid), and each validator's environment fingerprint (null when the
// definition is unusable).
export type Present = {
  snapshot: string | null;
  validatorDigests: Map<string, string | null>;
  environments: Map<string, EnvironmentInput[] | null>;
  // The dependency sets as they stand now, per validator: the adapter
  // closure that narrows the boundary, and the supplemental trace that
  // widens it.
  closures: Map<string, InputSet | null>;
  traces: Map<string, InputSet | null>;
  adapters: Record<string, Adapter>;
};

export type Evaluation = {
  id: string;
  verdict: Verdict;
  reason: string | null;
  authority: { authority: Authority; name: string | null };
  required: Profile["require"];
  records: Assessed[];
  assumptions: string[];
  residual_risk: string[];
  standing: Disproof | null;
  history: Disproof | null;
};

function short(v: string | null): string {
  if (v === null) return "none";
  return v.startsWith("sha256:") ? v.slice(0, 19) : v;
}

// ENG-142: compare every recorded identity input with its present
// value. An input that cannot be computed now, or was not computed when
// the record was made, is unknown; unknown wins over stale.
// `misses` are the uncleared misses of every validator that produced a
// record here, whichever requirement each was recorded against
// (ENG-174: the claim belongs to the mechanism).
export function assess(o: Obligation, records: StoredRecord[], present: Present, now: Date, misses: Map<string, Miss[]> = new Map()): Assessed[] {
  const obligation = obligationDigest(o);
  return records.map((record) => {
    const id = record.identity;
    const unknown: string[] = [];
    const stale: string[] = [];
    const narrowed = record.dependency.scope === "package";
    if (id.snapshot === null && !narrowed) unknown.push("recorded with no snapshot: no chain step established a boundary at run time");
    if (present.snapshot === null && !narrowed) unknown.push("the repository snapshot cannot be computed now");
    if (id.requirement_digest !== o.requirement_digest || id.falsifier_digest !== o.falsifier_digest) stale.push("recorded for a prior requirement or falsifier text");
    if (id.obligation_digest !== obligation) stale.push("the obligation changed since the record (locator, keyword, or validator names)");
    // A record at the conservative floor is bound to the whole
    // snapshot; a narrowed record is bound to its closure instead, so a
    // change outside the closure leaves it current (ENG-125 holds
    // inside the recorded boundary, ENG-132).
    if (!narrowed) {
      if (id.snapshot !== null && present.snapshot !== null && id.snapshot !== present.snapshot) stale.push(`recorded at ${id.snapshot}, current snapshot ${present.snapshot}`);
      if (id.dependency_fingerprint !== id.snapshot) stale.push("the dependency fingerprint does not match the snapshot it was recorded for");
    } else if (record.validator) {
      const now = present.closures.get(record.validator);
      if (now === undefined || now === null) unknown.push(`the ${record.dependency.narrowing.split(" ")[0] ?? "adapter"} closure cannot be recomputed now`);
      else if (now.error !== null) unknown.push(`the adapter closure cannot be recomputed now (${now.error})`);
      else if (now.fingerprint !== id.dependency_fingerprint) stale.push(`the adapter closure changed: ${now.inputs.length} input(s) now fingerprint differently`);
    }
    const registry = Object.keys(present.adapters).length ? present.adapters : BUILTIN;
    if (id.adapter_version !== adapterVersion(id.adapter, registry)) stale.push(`adapter ${id.adapter} was version ${id.adapter_version}, now ${adapterVersion(id.adapter, registry)}`);
    // A supplemental trace widens the identity: what it named is an
    // input like any other (ENG-041).
    // A trace that could not be computed when the record was written
    // left inputs out of its identity, so nothing here can establish
    // that the record is current (ENG-126, ENG-140).
    if (id.traced_error !== null) unknown.push(`the supplemental trace was not computed at run time (${id.traced_error})`);
    if (id.traced_fingerprint !== null && record.validator) {
      const now = present.traces.get(record.validator);
      if (now === undefined || now === null) unknown.push("the supplemental trace cannot be recomputed now");
      else if (now.error !== null) unknown.push(`the supplemental trace cannot be recomputed now (${now.error})`);
      else if (now.fingerprint !== id.traced_fingerprint) stale.push(`a traced input changed: ${now.inputs.length} traced input(s) now fingerprint differently`);
    }
    if (record.validator) {
      const d = present.validatorDigests.get(record.validator);
      if (d === undefined) unknown.push(`validator ${record.validator} is not defined now`);
      else if (d === null) unknown.push(`validator ${record.validator} definition is invalid now`);
      else if (d !== id.validator_digest) stale.push(`validator ${record.validator} definition changed`);
      // The environment is compared only for the definition the record
      // was made under; a changed definition is stale by itself.
      const env = d !== undefined && d !== null && d === id.validator_digest ? present.environments.get(record.validator) : undefined;
      if (env) {
        for (const recorded of id.environment) {
          if (recorded.error !== null) {
            unknown.push(`environment input ${recorded.input} was not computed at run time (${recorded.error})`);
            continue;
          }
          const nowInput = env.find((e) => e.input === recorded.input);
          if (!nowInput) continue; // the declaration changed: the validator digest already says so
          if (nowInput.error !== null) unknown.push(`environment input ${nowInput.input} cannot be computed now (${nowInput.error})`);
          else if (nowInput.value !== recorded.value) stale.push(`environment input ${recorded.input} changed: ${short(recorded.value)} -> ${short(nowInput.value)}`);
        }
      }
    }
    let expired = false;
    if (record.manual && record.manual.expires) {
      const exp = new Date(record.manual.expires);
      if (!Number.isNaN(exp.getTime()) && exp.getTime() <= now.getTime()) {
        expired = true;
      }
    }
    const freshness: Freshness = unknown.length ? "unknown" : stale.length ? "stale" : "current";
    const why = [...unknown, ...stale, ...(expired ? [`manual evidence expired ${record.manual!.expires}`] : [])].join("; ");
    // ENG-174: a validator that passed a challenge realizing the
    // falsifier keeps no challenged claim. The record stays; the claim
    // does not.
    const missed = record.sensitivity === "challenged" && record.validator ? (misses.get(record.validator) ?? [])[0] : undefined;
    if (missed) {
      const where = missed.requirement === o.requirement ? "" : `, recorded against ${missed.requirement}`;
      const demoted = `${record.validator} passed the ${missed.mechanism} challenge ${missed.artifact}${where}, which realizes a confirmed falsifier; no challenged claim of this validator stands`;
      return { record: { ...record, sensitivity: "unchallenged" as const }, freshness, expired, why, demoted };
    }
    return { record, freshness, expired, why, demoted: null };
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

function rerun(rs: StoredRecord[]): string {
  const validators = [...new Set(rs.map((r) => r.validator).filter((v): v is string => v !== null))].sort();
  const parts: string[] = [];
  if (validators.length) parts.push(`run \`same-page run ${validators.join(" ")}\``);
  if (rs.some((r) => r.validator === null)) parts.push("attest again");
  return parts.join(" or ") + " at this snapshot";
}

export function isAuthoritative(r: StoredRecord, configured: { authority: Authority; name: string | null }): boolean {
  return sameAuthority({ authority: r.authority, name: r.authority_name }, configured);
}

export function evaluate(o: Obligation, assessed: Assessed[], invalidReason: string | null, standing: Disproof | null, history: Disproof | null, configured: { authority: Authority; name: string | null }): Evaluation {
  const required = o.required;
  const assumptions = [...new Set(assessed.flatMap((a) => a.record.assumptions))];
  const residual_risk = [...new Set(assessed.flatMap((a) => a.record.residual_risk))];
  const base = { id: o.requirement, authority: configured, required, records: assessed, assumptions, residual_risk, standing, history };
  const live = assessed.filter((a) => !a.expired);
  const current = live.filter((a) => a.freshness === "current").map((a) => a.record);
  // FAILING first (ENG-081, ENG-082): a current failing result, from
  // any authority.
  const failing = current.find((r) => r.result === "fail");
  if (failing) return { ...base, verdict: "FAILING", reason: `${failing.validator ?? "manual"} demonstrated the falsifier at ${failing.identity.snapshot} (${failing.path}${isAuthoritative(failing, configured) ? "" : `; authority ${authorityLabel(failing.authority, failing.authority_name)}`})` };
  // BLOCKED (ENG-084): a precondition the engine cannot establish.
  if (invalidReason) return { ...base, verdict: "BLOCKED", reason: invalidReason };
  const authoritative = (rs: StoredRecord[]) => rs.filter((r) => isAuthoritative(r, configured));
  const authCurrent = authoritative(current);
  const errored = authCurrent.find((r) => r.result === "error");
  if (errored) return { ...base, verdict: "BLOCKED", reason: `validator ${errored.validator ?? "?"} did not complete (${errored.path})` };
  if (satisfies(required, authCurrent)) return { ...base, verdict: "SUFFICIENT", reason: null };
  // Authoritative evidence whose freshness cannot be computed would
  // decide the verdict if it could be: a missing precondition, BLOCKED
  // (ENG-084).
  const unknown = live.filter((a) => a.freshness === "unknown" && isAuthoritative(a.record, configured));
  if (satisfies(required, [...authCurrent, ...unknown.map((a) => a.record)])) {
    return { ...base, verdict: "BLOCKED", reason: `freshness cannot be established: ${unknown[0]!.why}; ${rerun(unknown.map((a) => a.record))}` };
  }
  // Current evidence of another authority never passes as authoritative
  // (ENG-160): shown, and INSUFFICIENT.
  const other = current.filter((r) => !isAuthoritative(r, configured));
  if (satisfies(required, [...authCurrent, ...other])) {
    const where = [...new Set(other.map((r) => authorityLabel(r.authority, r.authority_name)))].join(", ");
    return { ...base, verdict: "INSUFFICIENT", reason: `current under ${where}; not yet established by authoritative ${authorityLabel(configured.authority, configured.name)}` };
  }
  // Stale evidence is known to be for other inputs: evaluation is
  // possible, the profile is unsatisfied, INSUFFICIENT with the re-run
  // named (ENG-085, ENG-088).
  const stale = live.filter((a) => a.freshness === "stale" && isAuthoritative(a.record, configured));
  if (satisfies(required, [...authCurrent, ...stale.map((a) => a.record)])) {
    return { ...base, verdict: "INSUFFICIENT", reason: `evidence is stale: ${stale[0]!.why}; ${rerun(stale.map((a) => a.record))}` };
  }
  return { ...base, verdict: "INSUFFICIENT", reason: null };
}
