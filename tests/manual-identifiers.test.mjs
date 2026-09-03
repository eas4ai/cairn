import { test, expect } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Every test here spawns the scripts or the engine as child
// processes, so a loaded machine makes them slow rather than wrong.
// The timeout is generous on purpose: a red suite must mean a defect.
const TEST_TIMEOUT = 120_000;

// The manual explains; the specs legislate. Every LANG or CONF identifier
// the manual or the README cites must be defined, and not withdrawn, in
// a spec under docs/superpowers/specs/. A renumbered or withdrawn rule
// therefore cannot leave the explanatory text pointing at nothing.

const ROOT = new URL("..", import.meta.url).pathname;
const SPECS = join(ROOT, "docs", "superpowers", "specs");
const EXPLANATORY = [join(ROOT, "docs", "MANUAL.md"), join(ROOT, "README.md")];

function definedIdentifiers() {
  const defined = new Set();
  for (const name of readdirSync(SPECS)) {
    if (!name.endsWith(".md")) continue;
    const text = readFileSync(join(SPECS, name), "utf8");
    for (const m of text.matchAll(/^\[((?:LANG|CONF|ENG)-\d{3})\](?!\s*Withdrawn:)/gm)) {
      defined.add(m[1]);
    }
  }
  return defined;
}

test("every identifier the manual and README cite is defined in the specs", () => {
  const defined = definedIdentifiers();
  expect(defined.size).toBeGreaterThan(40);
  const cited = new Set();
  for (const path of EXPLANATORY) {
    for (const id of readFileSync(path, "utf8").match(/\b(?:LANG|CONF|ENG)-\d{3}\b/g) ?? []) cited.add(id);
  }
  expect(cited.size).toBeGreaterThan(20);
  const missing = [...cited].filter((id) => !defined.has(id)).sort();
  expect(missing).toEqual([]);
}, TEST_TIMEOUT);
