// The suite names every requirement the declaration speaks for, and the
// declaration lists every repository path the tests read (PKG-025, PKG-026).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const declaration = readFileSync(here("../.cairn/mechanisms/node-test"), "utf8");
const section = (name) => { const m = new RegExp(`^${name}:\\n((?:  - .*\\n)*)`, "m").exec(declaration); return m ? [...m[1].matchAll(/^  - (.*)$/gm)].map((x) => x[1]) : []; };
const tests = readdirSync(here("..")).length && readdirSync(here(".")).filter((n) => n.endsWith(".mjs")).map((n) => [n, readFileSync(here(n), "utf8")]);

test("every requirement the node-test declaration speaks for is named in a test title (PKG-025)", () => {
  const named = new Set();
  for (const [, text] of tests) for (const m of text.matchAll(/test\(\s*(?:`([^`]*)`|"([^"]*)")/g)) for (const id of (m[1] ?? m[2]).matchAll(/[A-Z]+-\d+/g)) named.add(id[0]);
  const unnamed = section("requirements").filter((id) => !named.has(id));
  assert.deepEqual(unnamed, [], `declared but named by no test title: ${unnamed.join(", ")}`);
});

test("every repository path the tests read is a declared input of node-test (PKG-026)", () => {
  const inputs = section("inputs");
  const covered = (p) => inputs.some((i) => i.endsWith("/") ? p.startsWith(i) : p === i);
  const read = new Set();
  // Repository reads: a URL built from import.meta.url, or the skills tests' flat/raw/here helpers.
  for (const [, text] of tests) for (const m of text.matchAll(/(?:new URL\(|\b(?:flat|raw|here)\()\s*["'`]\.\.\/([^"'`$]+)["'`]/g)) read.add(m[1]);
  const undeclared = [...read].filter((p) => !covered(p)).sort();
  assert.deepEqual(undeclared, [], `read by a test and declared by no input: ${undeclared.join(", ")}`);
});
