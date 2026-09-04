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

const dir = process.argv[2] ?? "docs/spec";
const findings = [];
const KEYWORD = /\bMUST NOT\b|\bMUST\b|\bMAY\b/g;
const strip = (s) => s.replace(/`[^`]*`/g, " ").replace(/"[^"]*"/g, " ");

for (const name of readdirSync(dir).filter((n) => n.endsWith(".md")).sort()) {
  const path = join(dir, name), text = readFileSync(path, "utf8"), lines = text.split("\n");
  const status = /^Status:\s*(\w+)/m.exec(text)?.[1] ?? null;
  const prefix = /^Prefix:\s*([A-Z]+)/m.exec(text)?.[1] ?? null;
  const ids = [...text.matchAll(/^\[([A-Z]+-\d+)\]/gm)].map((m) => m[1]);
  if (prefix && ids.length === 0) findings.push(`${name}: declares Prefix: ${prefix} and holds no requirement (SPEC-001)`);

  // Requirement blocks: from [ID] to the next [ID], heading, or blank line after the falsifier.
  for (let i = 0; i < lines.length; i++) {
    const m = /^\[([A-Z]+-\d+)\]\s*(.*)$/.exec(lines[i]);
    if (!m) continue;
    const id = m[1]; let body = m[2], j = i + 1, falsifier = false;
    while (j < lines.length && !/^\[[A-Z]+-\d+\]/.test(lines[j]) && !/^## /.test(lines[j])) {
      if (/^Falsifier:/.test(lines[j])) falsifier = true;
      else if (!falsifier && lines[j].trim() !== "") body += " " + lines[j].trim();
      if (falsifier && lines[j].trim() === "") break;
      j++;
    }
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

if (findings.length) { process.stdout.write(findings.join("\n") + "\n"); process.exit(1); }
process.stdout.write(`spec lint: ${dir} clean\n`);
