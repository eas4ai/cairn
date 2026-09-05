#!/usr/bin/env node
// The spec lint: a mechanism, not kernel. Reads a spec directory and
// fails on what PKG-007, PKG-010, SPEC-001, and SPEC-002 forbid.
//
//   node scripts/spec-lint.mjs docs/spec
//
// Backticks and double quotes are mentions, not uses, so a rule may name
// MUST without stating an obligation.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseSpec } from "../bin/spec.mjs";

const dir = process.argv[2] ?? "docs/spec";
const findings = [];
const KEYWORD = /\bMUST NOT\b|\bMUST\b|\bMAY\b/g;
const strip = (s) => s.replace(/`[^`]*`/g, " ").replace(/"[^"]*"/g, " ");
const definitions = new Map(), prefixes = new Set(), references = [];

for (const name of readdirSync(dir).filter((n) => n.endsWith(".md")).sort()) {
  const path = join(dir, name), raw = readFileSync(path, "utf8"), spec = parseSpec(raw), { lines, prefix } = spec, text = lines.join("\n");
  const ids = [...text.matchAll(/^\[([A-Z]+-\d+)\]/gm)].map((m) => m[1]);
  if (prefix && ids.length === 0) findings.push(`${name}: declares Prefix: ${prefix} and holds no requirement (SPEC-001)`);
  if (prefix) prefixes.add(prefix);
  for (const [i, line] of lines.entries()) {
    const clean = strip(line), def = /^\[([A-Z]+-\d+)\]/.exec(clean);
    if (def) {
      if (definitions.has(def[1])) findings.push(`${name}:${i + 1}: ${def[1]} duplicate identifier; first defined at ${definitions.get(def[1])} (SPEC-020)`);
      else definitions.set(def[1], `${name}:${i + 1}`);
    }
    for (const m of clean.slice(def ? def[0].length : 0).matchAll(/\b([A-Z]+)-\d+\b/g)) references.push({ id: m[0], prefix: m[1], location: `${name}:${i + 1}` });
  }

  for (const [i, line] of raw.split(/\r?\n/).entries()) {
    const local = line.replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s<>"'`]+/gi, " ");
    for (const m of local.matchAll(/(?:^|[\s`"'(=<>\[])((?:~(?:[a-zA-Z_][a-zA-Z0-9_-]*|\/)|\/)[^\s`"'<>),;]*)/g)) {
      const path = m[1].replace(/[.!?:]+$/, "");
      if (path === "/" || ["/new-project", "/existing-project"].includes(path)) continue;
      findings.push(`${name}:${i + 1}: absolute path ${path}; cite a path relative to the repository root (SPEC-019)`);
    }
  }

  // Status and block boundaries match the kernel exactly.
  for (const block of spec.blocks) {
    const { id, status, falsifier } = block;
    const end = block.body.findIndex((line) => /^Falsifier:/.test(line));
    const body = block.body.slice(0, end < 0 ? undefined : end).filter((line) => !/^Status:/.test(line)).join(" ");
    if (status === "Agreed" && !falsifier) findings.push(`${name}: ${id} is Agreed and carries no Falsifier: line (SPEC-002)`);
    for (const sentence of strip(body).split(/(?<=[.!?])\s+/)) {
      const hits = [...sentence.matchAll(KEYWORD)];
      if (hits.length === 0) continue;
      if (hits.length > 1) findings.push(`${name}: ${id} states ${hits.length} obligations in one sentence: "${sentence.trim().slice(0, 70)}..." (PKG-007)`);
      const before = sentence.slice(0, hits[0].index);
      const subject = before.replace(/^\s*(When|Before|After|On|If|While|Where|Unless|Until)\b[^,]*,\s*/i, "");
      if (!/\w/.test(subject)) findings.push(`${name}: ${id} states an obligation with no actor: "${sentence.trim().slice(0, 70)}..." (PKG-010)`);
    }
  }
}

for (const r of references) if (prefixes.has(r.prefix) && !definitions.has(r.id)) findings.push(`${r.location}: ${r.id} unresolved requirement reference (SPEC-021)`);
if (findings.length) { process.stdout.write(findings.join("\n") + "\n"); process.exit(1); }
process.stdout.write(`spec lint: ${dir} clean\n`);
