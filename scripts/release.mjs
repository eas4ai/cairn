#!/usr/bin/env node
// scripts/release.mjs: one commit that sets one version in package.json and the manifests,
// tagged v<version>, at Done, with no AI attribution since the last release. Refuses before writing.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { loadSettings } from "../lib/settings.mjs";

const FILES = ["package.json", ".claude-plugin/plugin.json", ".claude-plugin/marketplace.json", ".codex-plugin/plugin.json", ".muse-plugin/plugin.json"];
// Review of 3.8.2: the old PATTERNS anchored only "Co-Authored-By:" and "Signed-off-by:" and kept
// a fixed model list, so a differently named trailer ("Assisted-By: Claude ...") or a vendor name
// outside that list ("Co-Authored-By: Fable ...") passed unnoticed. VENDOR is now checked against
// any "<Word(s)>-By:" or "<Word(s)>-With:" trailer, not just the two named ones, and the vendor
// list grew to match the tools this project's own no-attribution rule names. The trailer pattern
// requires the "-By:"/"-With:" shape itself before it even looks for a vendor word, so ordinary
// prose that merely mentions one ("Fix the opus-style parser") is never flagged, and a human
// co-author ("Co-Authored-By: Jane Doe <jane@example.com>") is left alone since no vendor word
// appears on that line. An @anthropic.com or @openai.com address is flagged wherever it appears.
const VENDOR = "(?:claude|fable|opus|sonnet|haiku|codex|chatgpt|gpt|copilot|gemini|muse|openai|anthropic)";
const PATTERNS = [
  new RegExp(`^[A-Za-z][\\w -]*-(?:By|With):.*\\b${VENDOR}\\b`, "i"),
  new RegExp(`\\bGenerated with\\b.*\\b${VENDOR}\\b`, "i"),
  /^Claude-Session:/i, /claude\.ai\/code\//i, /@anthropic\.com\b/i, /@openai\.com\b/i,
];
const git = (cwd, ...a) => { const r = spawnSync("git", a, { cwd, encoding: "utf8" }); if (r.status !== 0) throw new Error(`git ${a[0]} failed: ${r.stderr.trim().split("\n")[0]}`); return r.stdout; };

export function scanAttribution(cwd, range) {
  const found = [];
  for (const entry of git(cwd, "log", "--format=%H%x00%B%x01", range).split("\x01")) {
    const [sha, body] = entry.split("\x00");
    if (!sha?.trim()) continue;
    for (const line of (body ?? "").split("\n")) if (PATTERNS.some((p) => p.test(line.trim()))) found.push({ sha: sha.trim(), line: line.trim() });
  }
  return found;
}

export async function release(cwd, next, { wake } = {}) {
  const refuse = (why) => { throw new Error(`release: ${why}`); };
  if (!/^\d+\.\d+\.\d+$/.test(next ?? "")) refuse("usage: node scripts/release.mjs <major.minor.patch>");
  const read = (f) => readFileSync(join(cwd, f), "utf8");
  const current = JSON.parse(read("package.json")).version;
  const field = () => new RegExp(`"version"\\s*:\\s*"${current.replace(/[.+-]/g, "\\$&")}"`, "g");
  const texts = FILES.map((f) => [f, read(f)]);
  for (const [f, t] of texts) if ((t.match(field()) ?? []).length !== 1) refuse(`${f} does not carry "version": "${current}" exactly once`);
  const log = read("CHANGELOG.md"), at = log.search(new RegExp(`^## ${next.replace(/\./g, "\\.")} - \\d{4}-\\d{2}-\\d{2}$`, "m"));
  if (at < 0) refuse(`CHANGELOG.md has no entry "## ${next} - <date>"`);
  const end = log.indexOf("\n## ", at + 1), entry = log.slice(at, end < 0 ? undefined : end).trim();
  if (git(cwd, "tag", "-l", `v${next}`).trim()) refuse(`tag v${next} exists`);
  if (git(cwd, "status", "--porcelain", "--untracked-files=no").trim()) refuse("the tree is dirty");
  // Deviation from the plan text: lib/settings.mjs's loadSettings(cwd) is async (it reads
  // .sudus/settings.json and shells out to `git remote`); the plan's literal script destructured
  // its return value without awaiting it, which always yields settings === undefined and throws on
  // settings.attribution before the attribution check could ever run.
  const { settings } = await loadSettings(cwd);
  if (settings.attribution === "forbidden") {
    const last = git(cwd, "tag", "-l", "v*", "--sort=-v:refname").split("\n").find(Boolean);
    const found = scanAttribution(cwd, last ? `${last}..HEAD` : "HEAD");
    if (found.length) refuse(`attribution forbidden; found in ${found.map((f) => f.sha.slice(0, 7) + ": " + f.line).join("; ")}`);
  }
  const w = await (wake ?? (await import("../lib/wake.mjs")).wake)(cwd);
  if (w.verdict !== "Done") refuse(`the loop is not at Done: ${[w.verdict ?? w.line, w.action, w.target].filter(Boolean).join(" ")}`);
  for (const [f, t] of texts) writeFileSync(join(cwd, f), t.replace(field(), (m) => m.replace(`"${current}"`, `"${next}"`)));
  git(cwd, "add", "--", ...FILES);
  git(cwd, "commit", "-q", "-m", `Release ${next}`);
  git(cwd, "tag", "-a", `v${next}`, "-m", entry.replace(/^## /, ""));
  return { sha: git(cwd, "rev-parse", "HEAD").trim(), tag: `v${next}` };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  release(process.cwd(), process.argv[2]).then(
    ({ sha, tag }) => process.stdout.write(`release: ${tag} at ${sha.slice(0, 7)}; next: sudus check <REQ>, the review, sudus push, then git push origin ${tag}\n`),
    (e) => { process.stderr.write(`${e.message}\n`); process.exit(3); },
  );
}
