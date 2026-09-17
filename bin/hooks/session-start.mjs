#!/usr/bin/env node
// A Muse hook entry: one file per hook, as the Muse validator requires.
// It runs the shared hook with the session-start mode on standard input.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const hook = join(dirname(fileURLToPath(import.meta.url)), "..", "hook.mjs");
// A hook that cannot start is one line on stderr and exit 0, never silence (PKG-022, PKG-041).
if (!existsSync(hook)) { process.stderr.write(`cairn hook: ${hook} is missing\n`); process.exit(0); }
const r = spawnSync(process.execPath, [hook, "session-start"], { stdio: "inherit" });
if (r.error) process.stderr.write(`cairn hook: cannot start ${hook}: ${r.error.message}\n`);
process.exit(r.error ? 0 : r.status ?? 0);
