// The project the engine acts on: where its root is, which spec
// directories it reads, the .same-page layout it keeps, the policy file,
// the obligation store, and how a finding is printed. Every command
// starts here.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { obligationsDir, readObligation, type Obligation } from "./obligations.ts";
import { loadPolicy, requiredText, type Finding, type Policy } from "./policy.ts";
import type { Requirement } from "./specs.ts";

export function gitRoot(from: string): string | null {
  const r = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd: from, encoding: "utf8" });
  if (r.error || r.status !== 0) return null;
  const out = r.stdout.trim();
  return out === "" ? null : out;
}

export function projectRoot(opt: string | undefined): string {
  if (opt) return resolve(opt);
  return gitRoot(process.cwd()) ?? process.cwd();
}

export function specSetDirs(root: string): string[] {
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

export function printFindings(findings: Finding[]): void {
  for (const f of findings) process.stdout.write(`${f.where}\n  ${f.message} (${f.rule})\n\n`);
}

export function readPolicyFile(root: string): { policy: Policy | null; findings: Finding[] } {
  const path = join(root, ".same-page", "policy.yaml");
  return loadPolicy(readFileSync(path, "utf8"));
}

export function ensureLayout(root: string): void {
  const base = join(root, ".same-page");
  for (const d of ["obligations", "validators", "evidence", "cache", "artifacts"]) mkdirSync(join(base, d), { recursive: true });
  const ignore = join(base, ".gitignore");
  if (!existsSync(ignore)) writeFileSync(ignore, "# Derived execution state stays uncommitted (ENG-190, ENG-193, ENG-194).\nevidence/\ncache/\nartifacts/\n");
  else if (!readFileSync(ignore, "utf8").split("\n").includes("artifacts/")) writeFileSync(ignore, readFileSync(ignore, "utf8").replace(/\n?$/, "\n") + "artifacts/\n");
}

export function isObligationCandidate(r: Requirement): boolean {
  return r.authority === "agreed" && !r.withdrawn && (r.keyword === "MUST" || r.keyword === "MUST NOT");
}

export function requirePolicy(root: string, command: string): { policy: Policy; findings: Finding[] } | number {
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

export function loadObligations(root: string): { obligations: Map<string, Obligation>; findings: Finding[] } {
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

export function downgradeFinding(id: string, old: Obligation["required"], next: Obligation["required"], effect: string): Finding {
  return {
    where: `.same-page/obligations/${id}.yaml`,
    message: `policy downgrade for ${id}: required was [${requiredText(old)}], the policy now requires [${requiredText(next)}]; ${effect}. Evaluated under the old requirement until \`same-page policy confirm\``,
    rule: "ENG-102",
  };
}
