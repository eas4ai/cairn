#!/usr/bin/env node
// A negative-fixture challenge for CONF-016, the rule that an Agreed
// requirement carrying MUST or MUST NOT has a Falsifier line.
//
// The fixture beside this script (tests/challenges/conf-016/) realizes
// that rule's confirmed falsifier: an Agreed MUST with no Falsifier
// line. This script runs the same language check the `language-check`
// validator runs, against the fixture, and exits the way the validator
// would under the violating state: non-zero when the check reports
// CONF-016 (the mechanism noticed), zero when it stays silent (the
// mechanism is blind to its own falsifier, which is weak sensitivity).
//
// Run: node scripts/challenges/conf-016.mjs

import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const check = join(root, "skills", "new-project", "scripts", "language-check.mjs");
const fixture = join(root, "tests", "challenges", "conf-016");

const r = spawnSync("node", [check, fixture], { cwd: root, encoding: "utf8" });
const output = `${r.stdout ?? ""}${r.stderr ?? ""}`;
process.stdout.write(output);

if (r.error) {
  process.stderr.write(`challenge could not run the language check: ${r.error.message}\n`);
  process.exit(2);
}
const noticed = /CONF-016/.test(output) && r.status !== 0;
if (noticed) {
  process.stderr.write("the language check reported CONF-016 on the fixture: the mechanism notices the falsifier\n");
  process.exit(1);
}
process.stderr.write("the language check did not report CONF-016 on the fixture: weak sensitivity\n");
process.exit(0);
