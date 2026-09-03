// The two commands that record a person's act: `attest`, which writes
// manual evidence by a named actor with an expiry the engine enforces
// (ENG-180 through ENG-183), and `acknowledge`, which records that the
// developer accepted a revision clearing a standing disproof
// (ENG-112 through ENG-116).

import { existsSync } from "node:fs";
import { join } from "node:path";
import { adapterVersion } from "./adapters.ts";
import { digest } from "./digest.ts";
import {MANUAL_ASSUMPTIONS, dependencyChain, readRecords, residualRisk, writeRecord, type EvidenceRecord} from "./evidence.ts";
import { standingDisproof, writeAcknowledgment } from "./history.ts";
import { obligationDigest } from "./obligations.ts";
import type { Finding } from "./policy.ts";
import { loadObligations, printFindings, requirePolicy } from "./project.ts";
import { currentSnapshot } from "./snapshot.ts";
import { readCorpus } from "./specs.ts";
import { gitActor } from "./trust.ts";

// ---------------------------------------------------------------- attest

export function attest(root: string, id: string | undefined, opts: { by?: string; expires?: string; description?: string; bindings?: string; addressesFalsifier: boolean; inspectionOnly: boolean }): number {
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

export function acknowledge(root: string, id: string | undefined): number {
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
