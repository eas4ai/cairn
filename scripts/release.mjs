#!/usr/bin/env node
// The release script: one commit that sets one version in package.json and
// the plugin manifests and carries the changelog entry, tagged v<version>
// (PKG-040). Run from the checkout root, at Done:
//   node scripts/release.mjs <major.minor.patch>
// It refuses a version that is not an increase, a missing changelog entry,
// an existing tag, a version file that disagrees, a dirty tree, and a loop
// not at Done; the changelog entry is committed before the release. Exit 3 with one line on refusal; nothing is written before every
// check passes.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = process.cwd(), KERNEL = fileURLToPath(new URL("../bin/cairn.mjs", import.meta.url));
const FILES = ["package.json", ".claude-plugin/plugin.json", ".claude-plugin/marketplace.json", ".codex-plugin/plugin.json", ".muse-plugin/plugin.json"];
const refuse = (why) => { process.stderr.write(`release: ${why}\n`); process.exit(3); };
const git = (...a) => { const r = spawnSync("git", a, { cwd: root, encoding: "utf8" }); if (r.error || r.status !== 0) refuse(`git ${a[0]} failed: ${(r.stderr || r.error?.message || "").trim().split("\n")[0]}`); return r.stdout; };
const parse = (v) => { const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v ?? ""); return m && m.slice(1).map(Number); };
const read = (f) => { try { return readFileSync(join(root, f), "utf8"); } catch (e) { return refuse(`cannot read ${f} in ${root}: run from the checkout root (${e.code ?? e.message})`); } };

const next = process.argv[2], to = parse(next);
if (process.argv.length !== 3 || !to) refuse("usage: node scripts/release.mjs <major.minor.patch>");
const current = JSON.parse(read("package.json")).version, from = parse(current);
if (!from) refuse(`package.json version ${current} is not major.minor.patch`);
if ((to.map((n, i) => n - from[i]).find((d) => d !== 0) ?? 0) <= 0) refuse(`${next} is not an increase over ${current}`);
const log = read("CHANGELOG.md"), heading = new RegExp(`^## ${next.replace(/\./g, "\\.")} - \\d{4}-\\d{2}-\\d{2}$`, "m");
const at = log.search(heading);
if (at < 0) refuse(`CHANGELOG.md has no entry "## ${next} - <date>"; write what changed first`);
const entry = log.slice(at, log.indexOf("\n## ", at + 1) < 0 ? undefined : log.indexOf("\n## ", at + 1)).trim();
if (git("tag", "-l", `v${next}`).trim()) refuse(`tag v${next} exists`);
const texts = FILES.map((f) => [f, read(f)]);
for (const [f, t] of texts) if (t.split(`"version": "${current}"`).length !== 2) refuse(`${f} does not carry "version": "${current}" exactly once`);
const dirty = git("status", "--porcelain", "--untracked-files=no").split("\n").filter(Boolean);
if (dirty.length) refuse(`the tree is dirty: ${dirty.map((l) => l.slice(3)).join(", ")}; commit or stash before a release`);
const w = spawnSync(process.execPath, [KERNEL, "wake", "--root", root], { encoding: "utf8" });
if (!/^Done: /.test(w.stdout ?? "")) refuse(`the loop is not at Done: ${(w.stdout || w.stderr || "").trim().split("\n")[0]}`);
for (const [f, t] of texts) writeFileSync(join(root, f), t.replace(`"version": "${current}"`, `"version": "${next}"`));
git("add", "--", ...FILES);
git("commit", "-q", "-m", `Release ${next}`);
git("tag", "-a", `v${next}`, "-m", entry.replace(/^## /, ""));   // git drops lines that start with # from a tag message
process.stdout.write(`release: ${next} committed as ${git("rev-parse", "--short", "HEAD").trim()} and tagged v${next}\nrelease: next, the version files are declared inputs: cairn check --stale, the review, then git push origin main v${next}\n`);
