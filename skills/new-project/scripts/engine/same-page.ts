// Same Page Conformance -- the engine's command line.
//
//   node --disable-warning=ExperimentalWarning same-page.ts elaborate [--root DIR]
//   node --disable-warning=ExperimentalWarning same-page.ts verify    [--root DIR]
//
// Runs under node (type stripping) and bun unchanged; no dependencies.
// Layer L1 (iteration 001): the obligation store and its lifecycle.
// `elaborate` projects every Agreed MUST and MUST NOT requirement with a
// confirmed falsifier into .same-page/obligations/<ID>.yaml and writes
// the policy file on first use. `verify` reports obligations whose
// digests no longer match the spec, Agreed requirements with no
// obligation, and evaluates the rest; with no evidence records yet,
// every valid obligation is INSUFFICIENT and says what it requires.
// Exit codes: 0 no findings and every verdict SUFFICIENT; 1 findings or
// a verdict below SUFFICIENT; 2 usage or configuration error.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { digest } from "./digest.ts";
import { obligationPath, obligationsDir, projectObligation, readObligation, writeObligation, type Obligation } from "./obligations.ts";
import { defaultPolicy, loadPolicy, policyText, requiredText, type Finding, type Policy } from "./policy.ts";
import { readCorpus, type Requirement } from "./specs.ts";

const USAGE = "usage: same-page <elaborate|verify> [--root DIR]";

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

function readPolicyFile(root: string): { policy: Policy | null; findings: Finding[]; path: string } {
  const path = join(root, ".same-page", "policy.yaml");
  const r = loadPolicy(readFileSync(path, "utf8"));
  return { ...r, path };
}

function ensureLayout(root: string): void {
  const base = join(root, ".same-page");
  for (const d of ["obligations", "validators", "evidence", "cache"]) mkdirSync(join(base, d), { recursive: true });
  const ignore = join(base, ".gitignore");
  if (!existsSync(ignore)) writeFileSync(ignore, "# Derived execution state stays uncommitted (ENG-190, ENG-193).\nevidence/\ncache/\n");
}

function isObligationCandidate(r: Requirement): boolean {
  return r.authority === "agreed" && !r.withdrawn && (r.keyword === "MUST" || r.keyword === "MUST NOT");
}

function elaborate(root: string): number {
  const policyPath = join(root, ".same-page", "policy.yaml");
  if (!existsSync(policyPath)) {
    const dirs = specSetDirs(root);
    if (dirs.length === 0) {
      process.stderr.write("same-page: no spec set found (docs/specs/<project>/00-overview.md) and no SAME_PAGE_SPECS_DIR; nothing to elaborate\n");
      return 2;
    }
    ensureLayout(root);
    writeFileSync(policyPath, policyText(defaultPolicy(dirs)));
    process.stdout.write(`wrote .same-page/policy.yaml (specs: ${dirs.join(", ")})\n`);
  }
  ensureLayout(root);
  const { policy, findings } = readPolicyFile(root);
  if (!policy) {
    printFindings(findings);
    process.stdout.write(`same-page elaborate: ${findings.length} finding(s) in the policy file\n`);
    return 1;
  }
  const corpus = readCorpus(root, policy.specs);
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
  for (const [id, r] of [...wanted.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const path = obligationPath(root, id);
    let existing: Obligation | null = null;
    if (existsSync(path)) {
      const read = readObligation(path, relative(root, path));
      if (read.obligation) existing = read.obligation;
      else {
        // A malformed file is regenerated from the spec, and said so.
        out.push(...read.findings.map((f) => ({ ...f, message: `${f.message}; regenerated from the spec` })));
      }
    }
    const projected = projectObligation(r, policy, existing);
    if (writeObligation(path, projected)) written++;
    else unchanged++;
  }
  // Obligation files whose requirement is no longer Agreed are reported,
  // never deleted: a stale obligation is the developer's to remove.
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
  process.stdout.write(`same-page elaborate: ${wanted.size} obligation(s) (${written} written, ${unchanged} unchanged), ${out.length} finding(s)\n`);
  return out.length === 0 ? 0 : 1;
}

type Verdict = "FAILING" | "BLOCKED" | "INSUFFICIENT" | "SUFFICIENT";

function verify(root: string): number {
  const policyPath = join(root, ".same-page", "policy.yaml");
  if (!existsSync(policyPath)) {
    process.stderr.write("same-page: no .same-page/policy.yaml; run `same-page elaborate` first\n");
    return 2;
  }
  const { policy, findings } = readPolicyFile(root);
  if (!policy) {
    printFindings(findings);
    process.stdout.write(`same-page verify: ${findings.length} finding(s) in the policy file\n`);
    return 1;
  }
  const corpus = readCorpus(root, policy.specs);
  const byId = new Map(corpus.requirements.map((r) => [r.id, r] as const));
  const out: Finding[] = corpus.duplicates.map((d) => ({ where: "spec set", message: d, rule: "ENG-012" }));
  const verdicts: Array<{ id: string; verdict: Verdict; o: Obligation; profileText: string }> = [];
  const dir = obligationsDir(root);
  const files = existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith(".yaml")).sort() : [];
  const seen = new Set<string>();
  for (const name of files) {
    const where = `.same-page/obligations/${name}`;
    const id = name.slice(0, -5);
    seen.add(id);
    const read = readObligation(join(dir, name), where);
    if (!read.obligation) {
      out.push(...read.findings);
      continue;
    }
    const o = read.obligation;
    if (o.requirement !== id) {
      out.push({ where, message: `file is named ${id} but keys on ${o.requirement}`, rule: "ENG-013" });
      continue;
    }
    const req = byId.get(id);
    if (!req || req.withdrawn || req.authority !== "agreed" || !isObligationCandidate(req)) {
      out.push({ where, message: `${id} has no Agreed MUST or MUST NOT requirement behind it; the obligation is invalid`, rule: "ENG-010" });
      continue;
    }
    const reasons: string[] = [];
    if (digest(req.text) !== o.requirement_digest) reasons.push("the requirement text changed");
    if (req.falsifier === null) reasons.push("the requirement has no Falsifier line now");
    else if (digest(req.falsifier) !== o.falsifier_digest) reasons.push("the confirmed falsifier changed");
    if (reasons.length) {
      out.push({ where, message: `invalid obligation ${id}: ${reasons.join("; ")}; run \`same-page elaborate\` to regenerate it from the confirmed requirement`, rule: "ENG-019" });
      continue;
    }
    const profile = policy.profiles[o.profile];
    if (!profile) {
      out.push({ where, message: `${id} names profile ${o.profile}, which the policy does not define`, rule: "ENG-016" });
      continue;
    }
    // Layer L1: no evidence records exist yet, so nothing satisfies the
    // profile. INSUFFICIENT names what would.
    verdicts.push({ id, verdict: "INSUFFICIENT", o, profileText: requiredText(profile) });
  }
  for (const r of corpus.requirements) {
    if (isObligationCandidate(r) && !seen.has(r.id))
      out.push({ where: `${r.file}:${r.line}`, message: `${r.id} is Agreed and has no obligation; run \`same-page elaborate\``, rule: "ENG-206" });
  }
  for (const v of verdicts) {
    process.stdout.write(`${v.id}  ${v.verdict}\n  Requirement: ${v.o.sentence}\n  Required:    ${v.profileText}\n  Evidence:    none\n\n`);
  }
  printFindings(out);
  const counts: Record<Verdict, number> = { FAILING: 0, BLOCKED: 0, INSUFFICIENT: 0, SUFFICIENT: 0 };
  for (const v of verdicts) counts[v.verdict]++;
  process.stdout.write(
    `same-page verify: ${verdicts.length} obligation(s): ${counts.SUFFICIENT} SUFFICIENT, ${counts.INSUFFICIENT} INSUFFICIENT, ${counts.BLOCKED} BLOCKED, ${counts.FAILING} FAILING; ${out.length} finding(s)\n`
  );
  const allSufficient = verdicts.every((v) => v.verdict === "SUFFICIENT");
  return out.length === 0 && allSufficient ? 0 : 1;
}

function main(): number {
  let parsed;
  try {
    parsed = parseArgs({ args: process.argv.slice(2), options: { root: { type: "string" } }, allowPositionals: true, strict: true });
  } catch (e) {
    process.stderr.write(`same-page: ${(e as Error).message}\n${USAGE}\n`);
    return 2;
  }
  const command = parsed.positionals[0];
  const rootOpt = typeof parsed.values["root"] === "string" ? parsed.values["root"] : undefined;
  if (parsed.positionals.length !== 1) {
    process.stderr.write(`${USAGE}\n`);
    return 2;
  }
  const root = projectRoot(rootOpt);
  if (command === "elaborate") return elaborate(root);
  if (command === "verify") return verify(root);
  process.stderr.write(`same-page: unknown command ${command}\n${USAGE}\n`);
  return 2;
}

process.exit(main());
