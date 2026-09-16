#!/usr/bin/env node
// A Muse hook entry: one file per hook, as the Muse validator requires.
// It runs the shared hook with the stop mode on standard input.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const r = spawnSync(process.execPath, [join(root, "hook.mjs"), "stop"], { stdio: "inherit" });
process.exit(r.status ?? 0);
