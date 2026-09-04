#!/usr/bin/env node
// The ASCII gate of docs/specs/same-page/conventions.md, as a program
// that exits the way a validator must: 0 when every tracked file
// outside reference/ is ASCII, 1 when one is not, naming it.
//
// PKG-003's falsifier is "the ASCII gate in conventions.md returns a
// line", so this is that gate: the same file set, the same rule.
//
// Run: node scripts/checks/ascii-gate.mjs [root]

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(process.argv[2] ?? ".");
const EXCLUDED = ["reference/", ".remember/"];
// The file set conventions.md names: text the package authors and
// ships. A tracked image is bytes, not prose, and no gate can ask it to
// be ASCII.
const EXTENSIONS = [".md", ".mjs", ".ts", ".json", ".sh", ".yaml", ".yml", ".txt"];

const listed = spawnSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" });
if (listed.error || listed.status !== 0) {
  process.stderr.write(`ascii gate: git ls-files failed: ${listed.stderr ?? listed.error?.message ?? "unknown"}\n`);
  process.exit(2);
}

const files = listed.stdout
  .split("\0")
  .filter((p) => p !== "" && !EXCLUDED.some((e) => p.startsWith(e)) && EXTENSIONS.some((e) => p.endsWith(e)));
let found = 0;
for (const rel of files) {
  let text;
  try {
    text = readFileSync(join(root, rel), "utf8");
  } catch {
    continue; // a deleted or unreadable tracked path is not this gate's business
  }
  text.split("\n").forEach((line, i) => {
    const m = /[^\x00-\x7F]/.exec(line);
    if (!m) return;
    found++;
    if (found <= 20) process.stdout.write(`${rel}:${i + 1}: non-ASCII ${JSON.stringify(m[0])} in ${JSON.stringify(line.slice(Math.max(0, m.index - 20), m.index + 20))}\n`);
  });
}

if (found === 0) {
  process.stdout.write(`ascii gate: ${files.length} tracked text file(s) outside ${EXCLUDED.join(", ")}, all ASCII\n`);
  process.exit(0);
}
process.stdout.write(`ascii gate: ${found} non-ASCII character(s)\n`);
process.exit(1);
