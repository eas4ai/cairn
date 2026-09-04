#!/usr/bin/env node
// The package lint: a mechanism, not kernel. One run over the repository
// for the PKG requirements a program can observe. Findings name the
// requirement. Exit 1 on any finding.
//
//   node scripts/pkg-lint.mjs [root]

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2] ?? ".";
const f = [];
const read = (p) => readFileSync(join(root, p), "utf8");
const tracked = spawnSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).stdout.split("\0").filter(Boolean);
const text = (p) => /\.(md|mjs|js|json|sh|yaml|yml|txt)$/.test(p) || /(^|\/)[^./]+$/.test(p) && !/^reference\//.test(p);
const kernel = tracked.filter((p) => p.startsWith("bin/") && p.endsWith(".mjs")).map((p) => read(p)).join("\n");
const decisions = tracked.filter((p) => p.startsWith("docs/decisions/")).map((p) => read(p)).join("\n");

// PKG-001: no infrastructure to provision
const pkg = existsSync(join(root, "package.json")) ? JSON.parse(read("package.json")) : {};
if (Object.keys(pkg.dependencies ?? {}).length) f.push(`PKG-001: package.json declares dependencies: ${Object.keys(pkg.dependencies).join(", ")}`);
for (const p of tracked) if (/(^|\/)(Dockerfile|docker-compose\.ya?ml|compose\.ya?ml|Procfile)$/.test(p)) f.push(`PKG-001: ${p} is a service manifest`);

// PKG-002: nothing under .cairn/ ignored except evidence/
if (existsSync(join(root, ".gitignore"))) for (const line of read(".gitignore").split("\n")) {
  const l = line.trim();
  if (l.startsWith(".cairn/") && l !== ".cairn/evidence/" && l !== ".cairn/evidence") f.push(`PKG-002: .gitignore excludes ${l}; only evidence is rebuildable`);
}

// PKG-003: every command, record kind, and .cairn/ directory is named by a decision
for (const m of kernel.matchAll(/^\/\/\s+cairn (\w[\w-]*)/gm)) if (!decisions.includes(`cairn ${m[1]}`) && !decisions.includes(`\`${m[1]}\``)) f.push(`PKG-003: command ${m[1]} is named by no decision record`);
if (existsSync(join(root, ".cairn"))) for (const d of readdirSync(join(root, ".cairn"), { withFileTypes: true })) if (d.isDirectory() && !decisions.includes(`.cairn/${d.name}`) && !decisions.includes(d.name)) f.push(`PKG-003: .cairn/${d.name} is named by no decision record`);
for (const p of tracked.filter((p) => p.startsWith("docs/commitments/"))) {
  const t = read(p), i = t.indexOf("## Formats");
  if (i < 0) continue;
  for (const m of t.slice(i).matchAll(/^(?:An?|The) ([a-z][a-z -]*?)(?: record| declaration| file| item),/gm)) {
    const kind = m[1].trim();
    if (!decisions.toLowerCase().includes(kind)) f.push(`PKG-003: record kind "${kind}" (${p}) is named by no decision record`);
  }
}

// PKG-004: the kernel under 1500 lines
const lines = kernel.split("\n").length;
if (lines > 1500) f.push(`PKG-004: kernel is ${lines} lines`);

// PKG-006: no skill step names one vendor's product as the way to do it
for (const p of tracked.filter((p) => p.startsWith("skills/"))) for (const [i, line] of read(p).split("\n").entries())
  if (/\b(run|use|invoke|open|type)\b[^.]*\b(claude code|codex cli|cursor|windsurf|copilot)\b/i.test(line)) f.push(`PKG-006: ${p}:${i + 1} instructs a step by naming a vendor's product`);

// PKG-008: ASCII in every tracked text file
for (const p of tracked.filter(text)) { const t = read(p); const m = /[^\x00-\x7F]/.exec(t); if (m) f.push(`PKG-008: ${p} contains a non-ASCII character at offset ${m.index}`); }

// PKG-009: the kernel imports nothing from tests
if (/from\s+["'][^"']*\btests\//.test(kernel)) f.push("PKG-009: the kernel imports from tests/");

// PKG-012: no network, no model vendor
if (/\bfetch\s*\(|https?:\/\/|node:https?\b|\banthropic\b|\bopenai\b/i.test(kernel)) f.push("PKG-012: the kernel makes a network call or names a model vendor");

// PKG-013: no deferral language, outside quotes and code
const DEFER = /\b(v1|version one|version 1|mvp|phase (two|2)|later (version|release|phase)|future release|postpone[ds]?|for now)\b/i;
for (const p of tracked.filter((p) => /^(docs\/(spec|commitments|decisions)|skills)\//.test(p) && p.endsWith(".md"))) {
  const t = read(p).replace(/`[^`]*`/g, " ").replace(/"[^"]*"/g, " ");
  // An indented block is code. A requirement block, from [ID] to the next
  // blank line, is a rule; a rule that forbids a phrase necessarily names it.
  let rule = false;
  for (const [i, line] of t.split("\n").entries()) {
    if (/^\[[A-Z]+-\d+\]/.test(line)) rule = true; else if (line.trim() === "") rule = false;
    if (DEFER.test(line) && !/^ {4}/.test(line) && !rule) f.push(`PKG-013: ${p}:${i + 1} names a deferral: "${line.trim().slice(0, 60)}"`);
  }
}

if (f.length) { process.stdout.write(f.join("\n") + "\n"); process.exit(1); }
process.stdout.write(`pkg lint: ${tracked.length} tracked files, kernel ${lines} lines, clean\n`);
