// The two commands that write the obligation store: `elaborate`, which
// projects every Agreed MUST and MUST NOT requirement with its
// confirmed falsifier into a committed obligation file, and `policy
// confirm`, which accepts a policy downgrade the developer has decided
// to take (ENG-101 through ENG-105).

import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { digest } from "./digest.ts";
import {readRecords} from "./evidence.ts";
import { readAcknowledgment, standingDisproof } from "./history.ts";
import { obligationPath, obligationsDir, obligationText, projectObligation, readObligation, writeObligation, type Obligation } from "./obligations.ts";
import { compareStrength, defaultPolicy, policyText, requiredText, type Finding } from "./policy.ts";
import { downgradeFinding, ensureLayout, loadObligations, printFindings, requirePolicy, specSetDirs } from "./project.ts";
import { currentSnapshot } from "./snapshot.ts";
import { readCorpus, type Requirement } from "./specs.ts";
import { ciConfiguration } from "./authority.ts";
import { gitActor } from "./trust.ts";

// ---------------------------------------------------------------- elaborate

export function elaborate(root: string): number {
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



// ---------------------------------------------------------------- policy confirm

export function policyConfirm(root: string): number {
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
