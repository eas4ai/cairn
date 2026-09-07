#!/usr/bin/env node
// Cairn -- the referee. Reads the repository, names the next action.
//
//   cairn wake                      given only the repository, one next action
//   cairn check [REQ ...]           run the commitment's mechanisms against a
//                                   committed tree; record evidence with receipts
//   cairn decide --title T --level L --decided-by A --rests-on R
//                --wrong-if W --body B [--supersedes S --cause C]
//   cairn escalate --concerns X --question Q --recommend R --because B
//                  --if-wrong W --instead I [--level Blocking]
//   cairn answer <slug> <reply...>  record the next escalation turn
//   cairn backlog --title T --body B [--from X]   capture out-of-scope work
//   cairn supersede <old> --cause C ...decide fields...
//   cairn reversals                 report reversals by decider, cause, domain
//
// Exit: 0 Done, 1 Resolvable (the agent acts), 2 Escalate (the developer
// acts), 3 usage or not a Cairn repository. Node only, no dependencies.

import { parseArgs } from "node:util";
import { parseSpec, withoutFences } from "./spec.mjs";
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { openSync, closeSync, readSync, writeSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, writeFileSync, unlinkSync } from "node:fs";
import { join, relative, resolve } from "node:path";

// ------------------------------------------------------------ reading

// Flat "Key: value" text. A "- item" line joins a list under the last
// key; an unindented non-key line before the first blank line continues
// the last value. Headings and blank lines end value continuation.
const FIELD_LINE = /^([A-Za-z][A-Za-z0-9 _-]*):(?:\s+(.*))?$/;
const LINE_BREAK = /[\r\n\u2028\u2029]/;
function fields(text) {
  const out = {};
  let key = null;
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    if (line === "" || line.startsWith("#")) { key = null; continue; }
    let m;
    if ((m = FIELD_LINE.exec(line))) { key = m[1]; out[key] = m[2] ?? ""; }
    else if (key && (m = /^\s*-\s+(.*)$/.exec(line))) { out[key] = (Array.isArray(out[key]) ? out[key] : []).concat(m[1]); }
    else if (key && typeof out[key] === "string") out[key] += " " + line.trim();
  }
  return out;
}
// Markdown records have one header, followed by prose. Flat declarations
// and escalation conversations retain their existing field format.
function recordFields(text) {
  const lines = withoutFences(text), header = [];
  let titleAllowed = true, continuation = false;
  for (const line of lines) {
    if (/^ {0,3}#{1,6}(?:[ \t]|$)/.test(line)) {
      if (!titleAllowed || !/^ {0,3}# /.test(line)) break;
      titleAllowed = false;
      continue;
    }
    if (line.trim()) {
      if (!continuation && !FIELD_LINE.test(line)) break;
      titleAllowed = false;
      continuation = true;
    } else continuation = false;
    header.push(line);
  }
  return fields(header.join("\n"));
}
const read = (p) => readFileSync(p, "utf8");
const list = (dir) => (existsSync(dir) ? readdirSync(dir).filter((n) => !n.startsWith(".")).sort() : []);
const rel = (root, p) => relative(root, p).split("\\").join("/");
const asList = (v) => (Array.isArray(v) ? v : v ? [v] : []);
const sha = (s) => "sha256:" + createHash("sha256").update(s).digest("hex");
const git = (root, ...args) => spawnSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: Infinity });
const headSha = (root) => { const r = git(root, "rev-parse", "--short", "HEAD"); return r.status === 0 ? r.stdout.trim() : null; };

function currentCommitment(root) {
  const p = join(root, "docs", "spec", "roadmap.md");
  const slug = fields(read(p))["Current"];
  if (!slug) return { repair: rel(root, p), why: "no Current: line names a commitment" };
  const cp = join(root, "docs", "commitments", `${slug}.md`);
  if (!existsSync(cp)) return { repair: rel(root, p), why: `Current: names ${slug}, and docs/commitments/${slug}.md does not exist` };
  const reqs = (fields(read(cp))["Requirements"] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (reqs.length === 0) return { repair: rel(root, cp), why: "no Requirements: line names what the commitment includes" };
  return { slug, requirements: reqs };
}

// The kernel and lint read the same blocks and status defaults.
function requirementSet(root, commit = null) {
  const dir = "docs/spec", texts = new Map(), agreed = new Set(), inherited = new Set();
  const out = { texts, agreed, inherited };
  const ls = commit ? git(root, "ls-tree", "--name-only", "-z", `${commit}:${dir}`) : null;
  if (ls && (ls.error || ls.status !== 0)) return out;
  const names = ls ? ls.stdout.split("\0").filter(Boolean) : list(join(root, dir));
  for (const n of names.filter((n) => n.endsWith(".md"))) {
    const path = `${dir}/${n}`, show = commit ? git(root, "show", `${commit}:${path}`) : null;
    if (show && (show.error || show.status !== 0)) continue;
    const spec = parseSpec(show ? show.stdout : read(join(root, path)));
    for (const block of spec.blocks) {
      const body = block.body.filter((line) => !/^Status:/.test(line)).join("\n");
      texts.set(block.id, { path, digest: texts.has(block.id) ? null : sha(body) });
      if (block.status === "Agreed") {
        agreed.add(block.id);
        if (spec.scope === "every commitment") inherited.add(block.id);
      }
    }
  }
  return out;
}
const requirementTexts = (root, commit = null) => requirementSet(root, commit).texts;
const pastRequirements = (root, commit, ctx) => {
  if (!ctx.past.has(commit)) ctx.past.set(commit, commit ? requirementTexts(root, commit) : new Map());
  return ctx.past.get(commit);
};
function requirementChange(root, req, m, latest, ctx) {
  const now = ctx.requirements.get(req)?.digest;
  const before = latest?.requirement_digest ?? (latest ? pastRequirements(root, latest.commit, ctx).get(req)?.digest : null);
  const changed = !!latest && (!now || before !== now);
  const needsReview = changed && !asList(m?.def.reviewed).includes(`${req} ${now}`);
  const reason = !before ? "old requirement or falsifier text is unavailable" : !now ? "current requirement or falsifier text is unavailable" : "the requirement or falsifier changed";
  return { changed, needsReview, digest: now, reason };
}
const revisionVerdict = (req, m, digest, reason) => ({ verdict: "Resolvable", action: `review mechanism ${req}`, why: `${reason}; inspect ${m} and record findings without changing code; fix any mismatch as a separate action, then add reviewed: list entry "${req} ${digest}" to .cairn/mechanisms/${m} and commit before check (LOOP-059)` });

// Files changed by commits since the commitment began: since the commit
// that wrote its Current: line. The footprint is the union of its
// mechanisms' declared inputs plus Cairn's own records.
function scopeHistory(root, slug) {
  const roadmap = "docs/spec/roadmap.md";
  const commits = git(root, "log", "--first-parent", "--format=%H", "--", roadmap).stdout.trim().split("\n").filter(Boolean);
  let began = null;
  for (const commit of commits) {
    const show = git(root, "show", `${commit}:${roadmap}`);
    if (show.status !== 0 || fields(show.stdout).Current !== slug) break;
    began = commit;
  }
  if (!began) return { began, commits: "", line: [] };
  const ownCommits = git(root, "log", "--first-parent", "--no-merges", "--format=%H", `${began}..HEAD`);
  const line = git(root, "rev-list", "--first-parent", `${began}..HEAD`);
  if (ownCommits.error || ownCommits.status !== 0 || line.error || line.status !== 0) throw new Error("cannot read the commitment's Git history");
  return { began, commits: ownCommits.stdout, line: line.stdout.trim().split("\n").filter(Boolean) };
}
function breaches(root, slug, mechs, requirements) {
  const history = scopeHistory(root, slug);
  const changed = changedPaths(root, history.commits);
  const inputs = [...new Set(requirements.map((r) => mechs.byReq.get(r)).filter(Boolean).flatMap((n) => asList(mechs.byName.get(n).def.inputs)))];
  const covered = new Set(inputs.length ? changedPaths(root, history.commits, inputs) : []);
  const paths = changed.filter((f) => !f.startsWith(".cairn/") && !f.startsWith("docs/") && !["AGENTS.md", "CLAUDE.md", ".gitignore"].includes(f) && !covered.has(f));
  const acknowledged = paths.length ? acknowledgedScope(root, slug, history) : new Set();
  return paths.filter((f) => !acknowledged.has(f)).sort();
}
function scopeSnapshot(raw) {
  if (typeof raw !== "string") return null;
  let s;
  try { s = JSON.parse(raw); } catch { return null; }
  if (!s || Array.isArray(s) || typeof s.commitment !== "string" || !s.commitment
      || typeof s.began !== "string" || typeof s.through !== "string"
      || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(s.began) || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(s.through)
      || !Array.isArray(s.paths) || !s.paths.length) return null;
  if (s.mode !== undefined && s.mode !== "keep") return null;
  if (s.paths.some((p, i) => typeof p !== "string" || !p || p.includes("\0") || p.startsWith("/")
      || p.split("/").some((part) => !part || part === "." || part === "..") || (i > 0 && s.paths[i - 1] >= p))) return null;
  return s;
}
function changedScope(root, s) {
  const r = git(root, "diff", "--name-only", "--no-renames", "-z", s.mode === "keep" ? s.through : s.began, "HEAD", "--");
  if (r.error || r.status !== 0) return new Set(s.paths);
  const changed = new Set(r.stdout.split("\0").filter(Boolean));
  return new Set(s.paths.filter((p) => changed.has(p)));
}
function scopeApprovals(root, slug, history) {
  const approvals = [];
  // Only committed answers affect the guard. HEAD is also part of each check's
  // candidate, so editing an answer during execution cannot change its scope.
  const names = git(root, "ls-tree", "--name-only", "-z", "HEAD:.cairn/escalations");
  if (names.error || names.status !== 0) return approvals;
  for (const name of names.stdout.split("\0").filter((n) => /^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(n))) {
    const r = git(root, "show", `HEAD:.cairn/escalations/${name}`);
    if (r.error || r.status !== 0) continue;
    const e = fields(r.stdout), s = scopeSnapshot(e.Scope);
    if (!s || s.commitment !== slug || s.began !== history.began || !history.line.includes(s.through)
        || escalationTurn(r.stdout).turn !== "closed" || e.Answer !== "ok" || "Malformed" in e
        || typeof e.Concerns !== "string" || !e.Concerns.split(/[\s,]+/).includes("LOOP-035")
        || typeof e.Answered !== "string" || !Number.isFinite(Date.parse(e.Answered)) || e["Scope approved"] !== sha(e.Scope)) continue;
    const newer = new Set(history.line.slice(0, history.line.indexOf(s.through)));
    const later = new Set(changedPaths(root, history.commits.split("\n").filter((c) => newer.has(c)).join("\n") + "\n"));
    const changed = changedScope(root, s);
    const paths = s.paths.filter((p) => !later.has(p) && !changed.has(p));
    if (paths.length) approvals.push({ path: `.cairn/escalations/${name}`, text: r.stdout, snapshot: s, paths });
  }
  return approvals;
}
function acknowledgedScope(root, slug, history) {
  return new Set(scopeApprovals(root, slug, history).flatMap((a) => a.paths));
}
function retentionApprovals(root) {
  const slug = currentCommitment(root).slug;
  return scopeApprovals(root, slug, scopeHistory(root, slug)).filter((a) => a.snapshot.mode === "keep");
}
function retentionChanged(root, commit, ctx) {
  if (!ctx.retention.length) return false;
  if (!ctx.retentionPast.has(commit)) ctx.retentionPast.set(commit, ctx.retention.some((a) => {
    const r = git(root, "show", `${commit}:${a.path}`);
    return r.error || r.status !== 0 || r.stdout !== a.text;
  }));
  return ctx.retentionPast.get(commit);
}
function retentionReasons(root, commit, ctx) {
  return [retentionChanged(root, commit, ctx) ? "the check predates the committed retention approval (LOOP-085)" : null,
    ctx.retentionDirty ? "a retained path has uncommitted changes (LOOP-085)" : null].filter(Boolean);
}
function scopeVerdict(root, c, mechs) {
  // There is no footprint until a mechanism belongs to this commitment.
  // Wake will name declaration; a targeted check of another mechanism can run.
  if (!c.requirements.some((r) => mechs.byReq.has(r))) return null;
  const paths = breaches(root, c.slug, mechs, c.requirements);
  if (!paths.length) return null;
  const first = /[\s\x00-\x1f\x7f-\x9f]/.test(paths[0]) ? displayPath(paths[0]) : paths[0];
  return { verdict: "Resolvable", action: `scope ${first}`, why: `${paths.length} unresolved scope paths changed since the commitment began and no mechanism declares them (LOOP-035):\n${paths.map((p) => `  - ${displayPath(p)}`).join("\n")}\n  Declare missing inputs that belong to the agreement. To keep correct committed work outside it, use cairn escalate --scope --keep --concerns LOOP-035 with the decision fields for explicit approval of that exact history. For accidental work, capture it in the backlog, restore the paths to the commitment's activation tree, commit, and use cairn escalate --scope --concerns LOOP-035. Commit the developer's ok before checking. Retention needs fresh checks and review; neither approval grants future changes. An instead answer supplies direction, not an automatic exception.` };
}
function changedPaths(root, commits, inputs = []) {
  const r = spawnSync("git", ["diff-tree", "--stdin", "--no-commit-id", "--name-only", "--no-renames", "-r", "-z", "--", ...inputs],
    { cwd: root, input: commits, encoding: "utf8", maxBuffer: Infinity });
  if (r.error || r.status !== 0) throw new Error("cannot read the commitment's changed paths");
  return [...new Set(r.stdout.split("\0").filter(Boolean))];
}

// Every decision record with its header fields. A record's domain is the
// set of requirement prefixes in its Rests on: line; one that rests on
// prose alone is in the domain "unspecified".
function decisions(root) {
  const dir = join(root, "docs", "decisions");
  return list(dir).map((n) => {
    const f = recordFields(read(join(dir, n)));
    const ids = [...(f["Rests on"] ?? "").matchAll(/\b([A-Z]+)-\d+\b/g)].map((m) => m[1]);
    return { slug: n.replace(/\.md$/, ""), ...f, domain: ids.length ? [...new Set(ids)] : ["unspecified"] };
  });
}
const reversed = (root) => decisions(root).filter((d) => "Superseded by" in d);

// Inheritance is declared by Scope in the specification, never by prefix.
function fold(c, inherited) {
  for (const r of [...inherited].sort()) if (!c.requirements.includes(r)) c.requirements.push(r);
}

// A decision is unrealized when its Realized by section lists no commit.
// A superseded decision is history, not work.
function unrealizedDecisions(root) {
  const dir = join(root, "docs", "decisions");
  return list(dir).filter((n) => {
    const t = withoutFences(read(join(dir, n))).join("\n");
    if ("Superseded by" in recordFields(t)) return false;
    const headings = [...t.matchAll(/^ {0,3}## Realized by[ \t]*$/gm)];
    const section = headings.length !== 1 ? "" : t.slice(headings[0].index + headings[0][0].length).split(/^ {0,3}#{1,6}[ \t]/m)[0];
    return ![...section.matchAll(/^- ([0-9a-f]{7,64})[ \t]+(\S[^\n]*)$/gm)].some((m) => git(root, "rev-parse", "--verify", `${m[1]}^{commit}`).status === 0);
  }).map((n) => rel(root, join(dir, n)));
}
function escalations(root) {
  const dir = join(root, ".cairn", "escalations");
  return list(dir).map((n) => { const text = read(join(dir, n)); return { name: n.replace(/\.md$/, ""), ...fields(text), ...escalationTurn(text) }; });
}
// The initial Reply line lists options; only replies after an Answer are turns.
function escalationTurn(text) {
  let last = null;
  for (const line of text.split(/\r?\n/)) {
    const m = /^(Answer|Reply):[ \t]*([^\r\n]*)$/.exec(line);
    if (!m) continue;
    if (m[1] === "Answer" || last) last = { kind: m[1], text: m[2] };
  }
  const turn = !last || last.kind === "Reply" ? "developer" : /^ask\s+\S/.test(last.text) ? "agent" : "closed";
  return { turn, last };
}
const openEscalations = (root) => escalations(root).filter((e) => e.turn !== "closed");

// Mechanisms: name -> { name, def, digest }, and requirement -> name.
function mechanisms(root) {
  const dir = join(root, ".cairn", "mechanisms");
  const byName = new Map(), byReq = new Map();
  let invalid = null;
  for (const n of list(dir)) {
    const text = read(join(dir, n));
    const m = { name: n, def: fields(text), digest: sha(text) };
    byName.set(n, m);
    for (const r of asList(m.def.requirements)) {
      if (byReq.has(r) && byReq.get(r) !== n) invalid ??= { verdict: "Resolvable", action: `repair .cairn/mechanisms/${n}`, why: `${r} is declared by both ${byReq.get(r)} and ${n}; put the commands in one mechanism (LOOP-056)` };
      byReq.set(r, n);
    }
  }
  return { byName, byReq, invalid, inputs: inputCache() };
}
const modeError = (m) => "results" in m.def && m.def.results !== "per-requirement" ? `results: ${m.def.results}; expected per-requirement, or omit results for legacy reporting (LOOP-061)` : null;
// The tracked entries a mechanism declares, including their kind and mode.
// A cache belongs to one read of the tree, never across a command execution.
const inputCache = () => ({ selections: new Map(), files: new Map(), digests: new Map(), objects: new Map() });
function inputEntries(root, inputs, cache = inputCache()) {
  const key = JSON.stringify(inputs);
  if (!cache.selections.has(key)) {
    if (!inputs.length) return [];
    const r = git(root, "ls-files", "--stage", "-z", "--", ...inputs);
    if (r.error || r.status !== 0) throw new Error(`cannot list declared inputs: ${r.stderr || r.error?.message}`);
    const entries = r.stdout.split("\0").filter(Boolean).map((line) => {
      const m = /^(\d+) ([0-9a-f]+) ([0-3])\t([\s\S]+)$/.exec(line);
      if (!m) throw new Error("cannot parse a declared Git input");
      return { mode: m[1], oid: m[2], stage: m[3], path: m[4] };
    });
    entries.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    cache.selections.set(key, entries);
  }
  return cache.selections.get(key);
}
// A link is its target path, as git stores it, so the tree and a commit
// digest it the same way. A mechanism that reads through a link declares
// the target too.
const inputHash = () => createHash("sha256").update("cairn-inputs-v2\0");
const hashEntry = (h, path, mode, digest) => h.update(path).update("\0").update(mode).update("\0").update(digest).update("\0");
function fileIdentity(root, path, cache) {
  if (cache.files.has(path)) return cache.files.get(path);
  const p = join(root, path), stat = lstatSync(p);
  if (!stat.isFile() && !stat.isSymbolicLink()) throw new Error(`unsupported declared input ${path}`);
  const link = stat.isSymbolicLink(), mode = link ? "120000" : stat.mode & 0o100 ? "100755" : "100644";
  const target = link ? readlinkSync(p) : null;
  const identity = { mode, digest: link ? sha(target) : fileDigest(p), target };
  cache.files.set(path, identity);
  return identity;
}
function inputsDigest(root, inputs, cache = inputCache()) {
  const key = JSON.stringify(inputs);
  if (cache.digests.has(key)) return cache.digests.get(key);
  const h = inputHash();
  for (const { path } of inputEntries(root, inputs, cache)) {
    const file = fileIdentity(root, path, cache);
    hashEntry(h, path, file.mode, file.digest);
  }
  const digest = "sha256:" + h.digest("hex");
  cache.digests.set(key, digest);
  return digest;
}
function inputDetails(root, inputs, cache) {
  return inputEntries(root, inputs, cache).map(({ path }) => {
    const { mode, digest } = fileIdentity(root, path, cache);
    return { path, mode, digest };
  });
}

// Optional detail is explanatory only. Its entries must reproduce the existing
// raw input digest before they can establish any changed path (LOOP-078).
function validInputDetail(e) {
  return e && typeof e.path === "string" && e.path.length > 0 && !e.path.startsWith("/") && !e.path.includes("\0")
    && e.path.split("/").every((p) => p && p !== ".." && p !== ".")
    && ["100644", "100755", "120000"].includes(e.mode) && validDigest(e.digest);
}
function validateInputDetails(detail, expectedDigest) {
  if (detail?.version !== 1 || !Array.isArray(detail.entries)) throw new Error("the attachment format is invalid");
  const h = inputHash();
  let previous = null;
  for (const e of detail.entries) {
    if (!validInputDetail(e) || (previous !== null && e.path <= previous)) throw new Error("the attachment entries are invalid or unordered");
    hashEntry(h, e.path, e.mode, e.digest);
    previous = e.path;
  }
  if ("sha256:" + h.digest("hex") !== expectedDigest) throw new Error("the attachment does not match the receipt input digest");
  return detail.entries;
}
function readInputDetails(root, receipt, cache) {
  const path = receipt.inputs_detail;
  if (path === undefined) return { error: "this receipt did not record input details" };
  if (typeof path !== "string" || !path.startsWith(".cairn/evidence/") || path.split(/[\\/]/).some((p) => p === ".." || !p)) return { error: "the attachment path is invalid" };
  const key = JSON.stringify([path, receipt.inputs_digest]);
  if (cache.has(key)) return cache.get(key);
  let result;
  try {
    const p = join(root, path);
    if (!lstatSync(p).isFile()) throw new Error("the attachment is not a regular file");
    result = { entries: validateInputDetails(JSON.parse(read(p)), receipt.inputs_digest) };
  } catch (e) { result = { error: e instanceof SyntaxError ? "the attachment is not valid JSON" : e.code ?? e.message }; }
  cache.set(key, result);
  return result;
}
const displayPath = (path) => JSON.stringify(path).replace(/[\u007f-\u009f\u2028\u2029]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
function inputChangeReasons(before, after) {
  if (!before) return ["added"];
  if (!after) return ["removed"];
  const reasons = [];
  if (before.mode.slice(0, 3) !== after.mode.slice(0, 3)) reasons.push("kind-changed");
  else if (before.mode !== after.mode) reasons.push("mode-changed");
  if (before.digest !== after.digest) reasons.push("content-changed");
  return reasons;
}
function changedInputDetails(before, after) {
  const old = new Map(before.map((e) => [e.path, e])), now = new Map(after.map((e) => [e.path, e]));
  const lines = [], paths = [...new Set([...old.keys(), ...now.keys()])].sort();
  let count = 0;
  for (const path of paths) {
    const reasons = inputChangeReasons(old.get(path), now.get(path));
    if (!reasons.length) continue;
    if (++count <= 20) lines.push(`\n    ${reasons.join(", ")}: ${displayPath(path)}`);
  }
  if (count > 20) lines.push(`\n    ${count - 20} additional changed paths omitted`);
  return lines.join("");
}
function explainEvidence(root, state, mechs, ctx) {
  let text = `\n  Evidence: ${state.req}; mechanism ${state.mech}; receipt ${displayPath(state.latest.path)}`;
  if (!state.inputsChanged) return text;
  const old = readInputDetails(root, state.latest, ctx.details);
  if (old.error) return text + `\n  input details unavailable: ${old.error}`;
  const inputs = asList(mechs.byName.get(state.mech).def.inputs);
  return text + changedInputDetails(old.entries, inputDetails(root, inputs, mechs.inputs));
}
// Git owns clean conversion; execution evidence still hashes raw bytes.
// Quote paths using Git's byte-oriented C syntax, including newlines.
const gitPath = (path) => '"' + [...Buffer.from(path)].map((b) => b < 32 || b >= 127 || b === 34 || b === 92 ? "\\" + b.toString(8).padStart(3, "0") : String.fromCharCode(b)).join("") + '"';
const committedHash = () => createHash("sha256").update("cairn-git-inputs-v1\0");
function workingObjects(root, entries, cache) {
  const missing = entries.filter((e) => !cache.objects.has(e.path));
  const files = missing.filter((e) => fileIdentity(root, e.path, cache).mode !== "120000");
  if (files.length) {
    const r = spawnSync("git", ["hash-object", "--stdin-paths"], { cwd: root, encoding: "utf8", maxBuffer: Infinity,
      input: files.map((e) => gitPath(e.path) + "\n").join("") });
    if (r.error || r.status !== 0) throw new Error(`cannot apply Git input conversion: ${r.stderr || r.error?.message}`);
    const oids = r.stdout.trim().split("\n");
    if (oids.length !== files.length || oids.some((oid) => !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(oid))) throw new Error("invalid Git input conversion result");
    files.forEach((e, i) => cache.objects.set(e.path, oids[i]));
  }
  for (const e of missing) {
    const file = fileIdentity(root, e.path, cache);
    if (file.mode !== "120000") continue;
    const oid = createHash(e.oid.length === 40 ? "sha1" : "sha256").update(`blob ${Buffer.byteLength(file.target)}\0`).update(file.target).digest("hex");
    cache.objects.set(e.path, oid);
  }
}
function committedInputsDigest(root, inputs, cache = inputCache()) {
  const entries = inputEntries(root, inputs, cache), h = committedHash();
  workingObjects(root, entries, cache);
  for (const e of entries) hashEntry(h, e.path, fileIdentity(root, e.path, cache).mode, cache.objects.get(e.path));
  return "sha256:" + h.digest("hex");
}
function gitObjectsAvailable(root, entries) {
  if (!entries.length) return true;
  const r = spawnSync("git", ["cat-file", "--batch-check"], { cwd: root, encoding: "utf8", maxBuffer: Infinity,
    input: entries.map((e) => e.oid + "\n").join("") });
  if (r.error || r.status !== 0) return false;
  const lines = r.stdout.trimEnd().split("\n");
  return lines.length === entries.length && lines.every((line, i) => {
    const m = /^([0-9a-f]+) blob (\d+)$/.exec(line);
    return m && m[1] === entries[i].oid && Number.isSafeInteger(Number(m[2]));
  });
}
// A review names committed code. Git blobs already carry its clean identity,
// so historical comparison needs object IDs rather than materializing blobs.
function inputsDigestAt(root, inputs, commit) {
  const ls = git(root, "ls-tree", "-r", "-z", commit);
  const matches = git(root, "ls-files", `--with-tree=${commit}`, "-z", "--", ...inputs);
  if (ls.error || ls.status !== 0 || matches.error || matches.status !== 0) return null;
  const selected = new Set(matches.stdout.split("\0").filter(Boolean));
  const entries = ls.stdout.split("\0").filter((line) => line && selected.has(line.slice(line.indexOf("\t") + 1))).map((line) => {
    const m = /^(100644|100755|120000) blob ([0-9a-f]+)\t([\s\S]+)$/.exec(line);
    return m && { mode: m[1], oid: m[2], path: m[3] };
  });
  if (entries.some((e) => !e)) return null;
  if (!gitObjectsAvailable(root, entries)) return null;
  entries.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const h = committedHash();
  for (const e of entries) hashEntry(h, e.path, e.mode, e.oid);
  return "sha256:" + h.digest("hex");
}
// Validate before hashing or running, including a missing file still in the index.
const mechanismRepair = (name, why) => ({ verdict: "Resolvable", action: `repair .cairn/mechanisms/${name}`, why });
function declarationFieldsError(m) {
  if (typeof m.def.command !== "string" || !m.def.command.trim()) return "command needs nonempty text (LOOP-067)";
  if (!asList(m.def.inputs).length) return "inputs needs a nonempty list of declared paths (LOOP-067)";
  const reqs = asList(m.def.requirements);
  if (!reqs.length || reqs.some((r) => !/^[A-Z]+-\d+$/.test(r))) return "requirements needs valid requirement identifiers (LOOP-067)";
  return modeError(m);
}
function declaredEntryError(root, name, { path, mode, stage }) {
  if (mode === "160000") return mechanismRepair(name, `submodule input ${path} is unsupported; declare only dependencies Cairn can represent (LOOP-068)`);
  if (stage !== "0") return mechanismRepair(name, `declared input ${path} has an unresolved Git conflict`);
  try {
    const stat = lstatSync(join(root, path));
    return !stat.isFile() && !stat.isSymbolicLink() ? mechanismRepair(name, `declared input ${path} is not a regular file or symbolic link`) : null;
  } catch (e) {
    if (e.code !== "ENOENT" && e.code !== "ENOTDIR") throw e;
    return { verdict: "Resolvable", action: `commit ${path}`, why: `declared input of ${name} is missing from the working tree but remains indexed (LOOP-045)` };
  }
}
function declarationError(root, mechs) {
  if (mechs.invalid) return mechs.invalid;
  for (const [name, m] of mechs.byName) {
    const invalid = declarationFieldsError(m);
    if (invalid) return mechanismRepair(name, invalid);
    for (const input of asList(m.def.inputs)) {
      const files = inputEntries(root, [input], mechs.inputs);
      if (!files.length) return mechanismRepair(name, `input ${input} matches no tracked file (LOOP-044)`);
      for (const entry of files) {
        const error = declaredEntryError(root, name, entry);
        if (error) return error;
      }
    }
  }
  return null;
}
function reconcile(root, ip) {
  if (!existsSync(ip)) return null;
  const f = fields(read(ip)), pid = Number(f.pid);
  let alive = false;
  if (Number.isSafeInteger(pid) && pid > 0) {
    try { process.kill(pid, 0); alive = true; }
    catch (e) { if (e.code !== "ESRCH") alive = true; }
    if (f.owner === "kernel" && f.action === "run-mechanism" && !alive) { unlinkSync(ip); return null; }
  }
  const head = headSha(root);
  const committed = f.base && head && git(root, "rev-parse", f.base).stdout.trim() !== git(root, "rev-parse", "HEAD").stdout.trim()
    && git(root, "merge-base", "--is-ancestor", f.base, "HEAD").status === 0 && !git(root, "status", "--porcelain").stdout.trim();
  return { verdict: "Resolvable", action: `reconcile ${f.action ?? "?"} ${f.target ?? "?"} at ${f.base ?? "?"}`,
    why: alive ? `.cairn/in-progress names live process ${pid}; wait for it to finish before reconciling`
      : committed ? "the action appears committed and the tree is clean; verify it, then remove .cairn/in-progress"
      : ".cairn/in-progress names an unfinished action; finish or abandon it, then remove the record" };
}

// Exclusive check ownership is local to a Git worktree, like in-progress.
// A dead or incomplete lock needs deliberate reconciliation, not racy deletion.
function checkLockPath(root) {
  const r = git(root, "rev-parse", "--git-path", "cairn-check.lock");
  if (r.error || r.status !== 0) throw new Error("cannot locate the check execution lock");
  return resolve(root, r.stdout.trim());
}
function checkOwner(root, path = checkLockPath(root)) {
  let text;
  try { text = read(path); }
  catch (e) {
    if (e.code === "ENOENT") return null;
    return { verdict: "Resolvable", action: `reconcile ${rel(root, path)}`, why: `cannot read the check owner (${e.code}); inspect the lock before removing it` };
  }
  const pid = Number(fields(text).pid);
  let alive = false;
  if (Number.isSafeInteger(pid) && pid > 0) {
    try { process.kill(pid, 0); alive = true; }
    catch (e) { if (e.code !== "ESRCH") alive = true; }
  }
  return { verdict: "Resolvable", action: `reconcile ${rel(root, path)}`,
    why: alive ? `check belongs to live process ${pid}; wait for it to finish`
      : "the check owner is dead or incomplete; inspect its command and .cairn/in-progress, then remove this lock when execution has stopped" };
}

function dirtyInputs(root, inputs) {
  const r = git(root, "status", "--porcelain", "-z", "--", ...inputs);
  if (r.error || r.status !== 0) throw new Error(`cannot inspect committed inputs: ${r.stderr || r.error?.message}`);
  return r.stdout.split("\0").filter(Boolean).map((l) => l.slice(3));
}

const RECEIPT_NAME = /^\d{8}T\d{9}Z(?:-\d+)?$/;
const validDigest = (s) => typeof s === "string" && /^sha256:[0-9a-f]{64}$/.test(s);
function receiptError(f, req) {
  if (f.requirement !== req) return `requirement must be ${req}`;
  if (!["pass", "fail", "unverified"].includes(f.result)) return "result must be pass, fail, or unverified";
  if (f.sequence === undefined && f.history_digest === undefined) return null; // legacy receipt
  if (typeof f.sequence !== "string" || !/^[1-9]\d*$/.test(f.sequence) || !Number.isSafeInteger(Number(f.sequence))) return "sequence must be a positive safe integer";
  if (!validDigest(f.history_digest)) return "history_digest is missing or invalid";
  return null;
}
// Timestamp filenames identify receipts, but do not order new executions.
// Legacy history is retained before sequenced records and needs one fresh run.
function history(root, req) {
  const dir = join(root, ".cairn", "evidence", req);
  return list(dir).filter((n) => RECEIPT_NAME.test(n)).map((n) => {
    const p = join(dir, n), path = rel(root, p);
    try {
      if (!lstatSync(p).isFile()) return { path, error: "receipt is not a regular file" };
      const text = read(p), f = fields(text);
      return { ...f, path, receipt_digest: sha(text), error: receiptError(f, req) };
    } catch (e) { return { path, error: `cannot read receipt: ${e.code ?? e.message}` }; }
  }).sort((a, b) => (Number(a.sequence) || 0) - (Number(b.sequence) || 0) || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}
const historyDigest = (h) => sha(h.map((e) => `${e.path}\0${e.receipt_digest}\0`).sort().join(""));
function historyRepair(h) {
  const broken = h.find((e) => e.error);
  return broken ? { verdict: "Resolvable", action: `repair ${broken.path}`, why: `${broken.error}; preserve the receipt and restore its recorded facts before checking (LOOP-075)` } : null;
}
function historyOrderError(h) {
  const latest = h.at(-1);
  if (!latest) return null;
  if (latest.sequence === undefined) return "receipt has no execution sequence; rerun once to establish execution order (LOOP-070)";
  const prior = h.slice(0, -1);
  if (prior.some((e) => Number(e.sequence) >= Number(latest.sequence)) || latest.history_digest !== historyDigest(prior))
    return "receipt history changed or its execution order is ambiguous; rerun to incorporate the visible history (LOOP-070)";
  return null;
}
// Escalation milestones describe which evidence was already present. Dates
// remain a fallback for old receipts whose execution sequence is unknown.
function evidenceMilestones(root, concerns) {
  const reqs = (concerns ?? "").split(/[\s,]+/).filter((r) => /^[A-Z]+-\d+$/.test(r));
  return [...new Set(reqs)].map((req) => {
    const h = history(root, req);
    return `${req}=${historyRepair(h) || historyOrderError(h) ? "unknown" : h.at(-1)?.sequence ?? 0}`;
  }).join(" ");
}
function followsEvidence(e, kind, req, receipt) {
  if (!receipt) return true;
  if (receipt.sequence === undefined) return !e[kind] || e[kind] >= receipt.recorded;
  const value = e[`${kind} after`];
  const m = typeof value === "string" && new RegExp(`(?:^| )${req}=(\\d+)(?: |$)`).exec(value);
  return !!m && Number.isSafeInteger(Number(m[1])) && Number(m[1]) >= Number(receipt.sequence);
}
const answerOrder = (e) => typeof e["Answered order"] === "string" && /^[1-9]\d*$/.test(e["Answered order"]) && Number.isSafeInteger(Number(e["Answered order"])) ? Number(e["Answered order"]) : 0;

function evidenceError(root, receipt, outputs) {
  for (const [key, digestKey] of [["output", "output_digest"], ["stderr_output", "stderr_digest"]]) {
    const path = receipt[key], digest = receipt[digestKey];
    if (typeof path !== "string" || !path.startsWith(".cairn/evidence/") || path.split(/[\\/]/).includes("..")) return `${key} is missing or outside the evidence directory`;
    if (!validDigest(digest)) return `${digestKey} is missing or invalid`;
    if (!outputs.has(path)) {
      try {
        const p = join(root, path);
        outputs.set(path, lstatSync(p).isFile() ? { digest: fileDigest(p) } : { error: `${path} is not a regular output file` });
      } catch (e) { outputs.set(path, { error: `cannot read output ${path}: ${e.code ?? e.message}` }); }
    }
    const actual = outputs.get(path);
    if (actual.error) return actual.error;
    if (actual.digest !== digest) return `output digest mismatch: ${path}`;
  }
  return null;
}
function reviewOf(root, slug) {
  const p = join(root, ".cairn", "reviews", `${slug}.md`);
  if (!existsSync(p)) return null;
  const f = recordFields(read(p));
  const findings = f.findings === "[]" ? [] : asList(f.findings);
  const invalid = findings.findIndex((x) => !/^(?:open|resolved):\s*\S/.test(x));
  const malformed = f.findings && f.findings !== "[]" && !Array.isArray(f.findings)
    ? "findings must be a list"
    : invalid >= 0 ? `finding ${invalid + 1} is unrecognized: ${displayPath(findings[invalid])}` : null;
  const repair = malformed ? { verdict: "Resolvable", action: `repair ${rel(root, p)}`,
    why: `${malformed}; use list entries 'open: <description>' or 'resolved: <description>' with a nonempty description, or leave findings empty when there are no findings (LOOP-086). Preserve unresolved issues as open findings.` } : null;
  return { commit: f.commit ?? null, open: findings.filter((x) => /^open:/.test(x)), repair };
}

// ------------------------------------------------------------ wake

const VERDICT = { Done: 0, Resolvable: 1, Escalate: 2 };

// What is the same for every requirement a mechanism speaks for: computed once.
function context(root, mechs) {
  const digests = new Map();
  for (const [n, m] of mechs.byName) digests.set(n, inputsDigest(root, asList(m.def.inputs), mechs.inputs));
  const retention = retentionApprovals(root), retainedPaths = retention.flatMap((a) => a.paths.map((p) => `:(literal)${p}`));
  const retentionDirty = retainedPaths.length && (dirtyInputs(root, retainedPaths).length || committedInputsDigest(root, retainedPaths) !== inputsDigestAt(root, retainedPaths, "HEAD"));
  return { digests, escalations: escalations(root), requirements: requirementTexts(root), past: new Map(), outputs: new Map(), details: new Map(), retention, retentionDirty, retentionPast: new Map() };
}
// One requirement's standing, from facts on disk.
function assess(root, req, mechs, ctx) {
  const name = mechs.byReq.get(req);
  const m = name ? mechs.byName.get(name) : null;
  const h = history(root, req);
  const repair = historyRepair(h);
  if (repair) return { req, mech: name, repair };
  const orderError = historyOrderError(h);
  const latest = h[h.length - 1] ?? null;
  const everPassed = h.some((e) => e.result === "pass");
  // Attempts: the failing streak back from the latest, one attempt per
  // distinct inputs digest (DEC-017); the first record ever is the
  // baseline, and its digest is never an attempt (DEC-018).
  let s = h.length; while (s > 0 && h[s - 1].result !== "pass") s--;         // a pass ends the streak; unverified is transparent
  const baseline = s === 0 ? h[0]?.inputs_digest : undefined, seen = new Set(), attempts = [];
  for (const e of h.slice(s)) if (e.result === "fail" && e.inputs_digest !== baseline && !seen.has(e.inputs_digest)) { seen.add(e.inputs_digest); attempts.push(e); }
  const threeFails = !orderError && attempts.length >= 3;
  const concerns = (e) => (e.Concerns ?? "").split(/[\s,]+/).includes(req);
  const escalatedSince = threeFails && ctx.escalations.some((e) => concerns(e) && followsEvidence(e, "Raised", req, attempts[attempts.length - 3]));
  // Three runs at one digest with no attempt since: the counter cannot
  // see a cause outside the repository; the agent can (DEC-019).
  const tail = h.slice(s).filter((e) => e.result === "fail").slice(-3);
  const stuck = !orderError && tail.length === 3 && tail.every((e) => e.inputs_digest === tail[0].inputs_digest) && !ctx.escalations.some((e) => concerns(e) && followsEvidence(e, "Raised", req, tail[0]));
  const revision = requirementChange(root, req, m, latest, ctx);
  const inputsChanged = !!m && !!latest && latest.inputs_digest !== ctx.digests.get(name);
  let stale = null;
  if (m && latest) {
    const reasons = [];
    if (orderError) reasons.push(orderError);
    if (revision.changed) reasons.push(revision.reason);
    if (latest.mechanism_digest !== m.digest) reasons.push("the mechanism changed");
    if (inputsChanged) reasons.push("a declared input changed");
    reasons.push(...retentionReasons(root, latest.commit, ctx));
    const damaged = evidenceError(root, latest, ctx.outputs);
    if (damaged) reasons.push(`receipt ${latest.path}: ${damaged}; rerun the check to replace this evidence (LOOP-065)`);
    stale = reasons.length ? reasons.join(" and ") : null;
  }
  return { req, mech: name, latest, everPassed, threeFails, escalatedSince, stuck, stale, revision, inputsChanged };
}

function wake(root) {
  return withAnswer(root, wakeVerdict(root));
}
function withAnswer(root, w) {
  const req = w.action.startsWith("scope ") ? "LOOP-035" : /^(?:run|implement|declare|escalate|review mechanism) ([A-Z]+-\d+)$/.exec(w.action)?.[1];
  if (!req) return w;
  const latest = history(root, req).at(-1);
  const answered = escalations(root).filter((e) => e.turn === "closed" && (e.Concerns ?? "").split(/[\s,]+/).includes(req)
    && Number.isFinite(Date.parse(e.Answered)) && followsEvidence(e, "Answered", req, latest))
    .sort((a, b) => answerOrder(b) - answerOrder(a) || Date.parse(b.Answered) - Date.parse(a.Answered))[0];
  if (answered) w.why += `; answered ${answered.name}: ${answered.Answer}`;
  return w;
}
function wakeVerdict(root) {
  const owner = checkOwner(root);
  if (owner) return owner;
  const ip = join(root, ".cairn", "in-progress");
  const pending = reconcile(root, ip);
  if (pending) return pending;
  const [esc] = openEscalations(root);
  if (esc?.turn === "agent") return { verdict: "Resolvable", action: `reply ${esc.name}`, why: `the developer asks: ${esc.last.text.slice(4)}; explain with cairn answer ${esc.name} "<explanation>"; this question authorizes no implementation` };
  if (esc) return { verdict: "Escalate", action: `present ${esc.name}`, why: `.cairn/escalations/${esc.name}.md awaits the developer${esc.last?.kind === "Reply" ? `; agent replied: ${esc.last.text}` : ""}` };
  const [dec] = unrealizedDecisions(root);
  if (dec) return { verdict: "Resolvable", action: `build ${dec}`, why: "the record needs a resolving commit identifier followed by its subject in Realized by; the commit or subject is missing" };
  const c = currentCommitment(root);
  if (c.repair) return { verdict: "Resolvable", action: `repair ${c.repair}`, why: c.why };
  const mechs = mechanisms(root);
  const problem = declarationError(root, mechs);
  if (problem) return problem;
  const { agreed, inherited } = requirementSet(root);
  const unknown = c.requirements.find((r) => !agreed.has(r));
  if (unknown) return { verdict: "Resolvable", action: `repair docs/commitments/${c.slug}.md`, why: `${unknown} is not an Agreed requirement in docs/spec/ (LOOP-029)` };
  fold(c, inherited);
  const invalid = c.requirements.map((r) => mechs.byName.get(mechs.byReq.get(r))).find((m) => m && modeError(m));
  if (invalid) return { verdict: "Resolvable", action: `repair .cairn/mechanisms/${invalid.name}`, why: modeError(invalid) };
  const scope = scopeVerdict(root, c, mechs);
  if (scope) return scope;
  const ctx = context(root, mechs);
  const ambiguous = c.requirements.find((r) => !ctx.requirements.get(r)?.digest);
  if (ambiguous) return { verdict: "Resolvable", action: "repair docs/spec/", why: `${ambiguous} needs exactly one requirement definition` };
  const state = c.requirements.map((r) => assess(root, r, mechs, ctx));
  const first = (pred) => state.find(pred);
  let s;
  if ((s = first((x) => x.repair))) return s.repair;
  if ((s = first((x) => x.mech && x.revision.needsReview))) {
    const verdict = revisionVerdict(s.req, s.mech, s.revision.digest, s.stale);
    verdict.why += explainEvidence(root, s, mechs, ctx);
    return verdict;
  }
  if ((s = first((x) => x.threeFails && !x.escalatedSince)))
    return { verdict: "Resolvable", action: `escalate ${s.req}`, why: `three consecutive failing records and no escalation since; a fourth attempt is not the next action (DEC-016)` };
  if ((s = first((x) => x.latest?.result === "fail" && x.everPassed && !x.stale)))
    return { verdict: "Resolvable", action: `implement ${s.req}`, why: `regression: latest evidence fails after an earlier pass (${s.mech})` };
  for (const x of state) {
    if (!x.mech) continue;
    if (!x.latest) return { verdict: "Resolvable", action: `run ${x.req}`, why: `mechanism ${x.mech} has produced no evidence for it` };
    if (x.stale) return { verdict: "Resolvable", action: `run ${x.req}`, why: `evidence is stale: ${x.stale} (${x.mech})${explainEvidence(root, x, mechs, ctx)}\n  Next: cairn check ${x.req}` };
    if (x.latest.result !== "pass") return { verdict: "Resolvable", action: `implement ${x.req}`, why: `latest evidence is ${x.latest.result} (${x.mech}, exit ${x.latest.exit})${x.stuck ? "; three runs at one inputs digest and no attempt since: a failure no change inside the footprint can address is an escalation (DEC-019)" : ""}` };
  }
  if ((s = first((x) => !x.mech))) return { verdict: "Resolvable", action: `declare ${s.req}`, why: "no mechanism under .cairn/mechanisms names it" };
  const head = headSha(root), rv = reviewOf(root, c.slug);
  if (!rv) return { verdict: "Resolvable", action: `review ${c.slug}`, why: `every requirement passes; no review record exists at .cairn/reviews/${c.slug}.md (LOOP-020)` };
  if (rv.repair) return rv.repair;
  if (retentionChanged(root, rv.commit, ctx)) return { verdict: "Resolvable", action: `review ${c.slug}`, why: "the review predates the committed retention approval; examine the retained work and fresh evidence (LOOP-085)" };
  const reviewed = pastRequirements(root, rv.commit, ctx);
  if (state.some((x) => !reviewed.get(x.req)?.digest || reviewed.get(x.req).digest !== ctx.requirements.get(x.req)?.digest))
    return { verdict: "Resolvable", action: `review ${c.slug}`, why: "a requirement or falsifier changed since the review, or its reviewed text is unavailable (LOOP-058)" };
  // A review is stale the way evidence is: when a declared input of the
  // commitment's mechanisms changed since the commit it examined. HEAD
  // moving on its own, as it does when the review is committed, is not.
  const inputs = [...new Set(state.filter((x) => x.mech).flatMap((x) => asList(mechs.byName.get(x.mech).def.inputs)))];
  const then = rv.commit ? inputsDigestAt(root, inputs, rv.commit) : null;
  if (then === null || then !== committedInputsDigest(root, inputs, mechs.inputs)) return { verdict: "Resolvable", action: `review ${c.slug}`, why: `the review examined ${rv.commit ?? "?"} and a declared input has changed since; the tree is at ${head} (LOOP-032)` };
  if (rv.open.length) return { verdict: "Resolvable", action: `resolve ${c.slug}`, why: `the review names an open finding: ${rv.open[0].replace(/^open:\s*/, "")} (LOOP-033)` };
  return { verdict: "Done", action: c.slug, why: `every requirement in ${c.slug} has current passing evidence and the review at ${rv.commit} is clean` };
}

// ------------------------------------------------------------ check

function stamp() { return new Date().toISOString().replace(/[-:]/g, "").replace(/\.(\d{3})Z$/, "$1Z"); }

// Stream all bytes to disk. Only a possible result line is held in memory.
async function capture(command, cwd, output, stderrOutput, reqs, name) {
  const out = openSync(output, "wx");
  let err;
  try {
    err = openSync(stderrOutput, "wx");
    return await new Promise((resolve, reject) => {
      const child = spawn(command, { shell: true, cwd }), lines = new Map();
      let pending = "", error = null, storageError = null;
      const maxLine = Math.max(...reqs.map((r) => r.length)) + 20;
      const accept = (line) => {
        const m = /^cairn: ([A-Z]+-\d+): (pass|fail)$/.exec(line ?? "");
        if (!m) return;
        if (!reqs.includes(m[1])) process.stdout.write(`ignored ${m[1]}: ${m[2]}; ${name} does not speak for it\n`);
        else if (lines.get(m[1]) !== "fail") lines.set(m[1], m[2]);
      };
      const write = (fd, bytes) => { for (let i = 0; i < bytes.length;) i += writeSync(fd, bytes, i, bytes.length - i); };
      const receive = (bytes, stderr) => {
        if (storageError) return;
        try {
          write(out, bytes);
          if (stderr) { write(err, bytes); return; }
          const parts = bytes.toString("utf8").split("\n");
          for (let i = 0; i < parts.length; i++) {
            if (pending !== null) pending = pending.length + parts[i].length > maxLine ? null : pending + parts[i];
            if (i < parts.length - 1) { accept(pending); pending = ""; }
          }
        } catch (e) { storageError = e; child.kill(); }
      };
      child.stdout.on("data", (b) => receive(b, false));
      child.stderr.on("data", (b) => receive(b, true));
      child.on("error", (e) => { error = e; });
      child.on("close", (status, signal) => {
        accept(pending);
        if (storageError) reject(storageError); else resolve({ status, signal, error, lines });
      });
    });
  } finally { closeSync(out); if (err !== undefined) closeSync(err); }
}
function fileDigest(path) {
  const h = createHash("sha256"), fd = openSync(path, "r"), bytes = Buffer.alloc(65536);
  try {
    let n;
    while ((n = readSync(fd, bytes, 0, bytes.length, null))) h.update(bytes.subarray(0, n));
    return "sha256:" + h.digest("hex");
  } finally { closeSync(fd); }
}

function candidate(root, m, requirements, expectedHead) {
  const inputs = asList(m.def.inputs);
  const retainedPaths = retentionApprovals(root).flatMap((a) => a.paths.map((p) => `:(literal)${p}`));
  const paths = [...inputs, ...retainedPaths, `.cairn/mechanisms/${m.name}`, ...asList(m.def.requirements).map((r) => requirements.get(r)?.path).filter(Boolean)];
  const head = headSha(root), dirty = dirtyInputs(root, paths);
  if (dirty.length || head !== expectedHead) return { head, dirty };
  const cache = inputCache();
  const snapshot = { head, dirty, paths, digest: inputsDigest(root, paths, cache), inputs: inputsDigest(root, inputs, cache), committed: committedInputsDigest(root, paths, cache), details: inputDetails(root, inputs, cache) };
  // Git status and clean filters can themselves run local commands. Finish
  // those operations before validating the final HEAD and raw file state.
  const finalDirty = dirtyInputs(root, paths), finalHead = headSha(root);
  if (finalDirty.length || finalHead !== expectedHead) return { head: finalHead, dirty: finalDirty };
  if (inputsDigest(root, paths) !== snapshot.digest) return { head: finalHead, dirty: [] };
  return snapshot;
}

async function check(root, only) {
  const path = checkLockPath(root);
  let fd;
  try { fd = openSync(path, "wx"); }
  catch (e) {
    if (e.code !== "EEXIST") throw e;
    const w = checkOwner(root, path) ?? { verdict: "Resolvable", action: `reconcile ${rel(root, path)}`, why: "the check lock changed while acquiring it; inspect it and retry" };
    process.stdout.write(`${w.verdict}: ${w.action}\n  ${w.why}\n`);
    return 1;
  }
  const token = `pid: ${process.pid}\nstarted: ${new Date().toISOString()}\n`;
  let status;
  try {
    writeFileSync(fd, token);
    closeSync(fd); fd = undefined;
    status = await runChecks(root, only);
  } finally {
    if (fd !== undefined) closeSync(fd);
    if (read(path) === token) unlinkSync(path);
  }
  if (status !== null) return status;
  const w = wake(root);
  process.stdout.write(`${w.verdict}: ${w.action}\n  ${w.why}\n`);
  return VERDICT[w.verdict];
}

async function runChecks(root, only) {
  const head = headSha(root);
  const ip = join(root, ".cairn", "in-progress");
  if (existsSync(ip) && fields(read(ip)).owner === "kernel") {
    const pending = reconcile(root, ip);
    if (pending) { process.stdout.write(`${pending.verdict}: ${pending.action}\n  ${pending.why}\n`); return 1; }
  }
  const c = currentCommitment(root);
  if (c.repair) { process.stdout.write(`Resolvable: repair ${c.repair}\n  ${c.why}\n`); return 1; }
  const { agreed, inherited } = requirementSet(root);
  const unknown = c.requirements.find((r) => !agreed.has(r));
  if (unknown) { process.stdout.write(`Resolvable: repair docs/commitments/${c.slug}.md\n  ${unknown} is not an Agreed requirement in docs/spec/ (LOOP-029)\n`); return 1; }
  fold(c, inherited);
  const targets = only.length ? only : c.requirements;
  const mechs = mechanisms(root);
  const problem = declarationError(root, mechs);
  if (problem) { process.stdout.write(`${problem.verdict}: ${problem.action}\n  ${problem.why}\n`); return 1; }
  const scope = scopeVerdict(root, c, mechs);
  if (scope) { const w = withAnswer(root, scope); process.stdout.write(`${w.verdict}: ${w.action}\n  ${w.why}\n`); return 1; }
  // Named requirements select which mechanisms run; a run is evidence for
  // every requirement its mechanism speaks for (LOOP-040).
  const runs = new Set();
  for (const r of targets) { const n = mechs.byReq.get(r); if (n) runs.add(n); else if (only.length) process.stdout.write(`skipped ${r}: no mechanism claims it\n`); }
  const ctx = { requirements: requirementTexts(root), past: new Map() };
  for (const name of runs) {
    const status = await runMechanism(root, mechs.byName.get(name), ctx, head);
    if (status !== null) return status;
  }
  return null;
}

async function runMechanism(root, m, ctx, head) {
  const name = m.name, reqs = asList(m.def.requirements);
  const before = candidate(root, m, ctx.requirements, head), dirty = before.dirty;
  if (dirty.length) { process.stdout.write(`Resolvable: commit ${dirty[0]}\n  ${name} needs committed inputs, specification, and declaration; uncommitted changes: ${dirty.join(", ")} (LOOP-030)\n`); return 1; }
  if (!before.digest) { process.stdout.write(`Resolvable: run ${reqs[0]}\n  candidate changed before ${name}; no evidence recorded\n`); return 1; }
  if (before.committed !== inputsDigestAt(root, before.paths, head)) {
    process.stdout.write(`Resolvable: commit candidate for ${name}\n  inputs do not match the committed candidate at ${head}; inspect Git flags, file modes, and declared paths before rerunning (LOOP-030)\n`);
    return 1;
  }
  for (const req of reqs) {
    if (!ctx.requirements.get(req)?.digest) { process.stdout.write(`Resolvable: repair docs/spec/\n  ${req} needs exactly one requirement definition\n`); return 1; }
    const h = history(root, req), repair = historyRepair(h);
    if (repair) { process.stdout.write(`${repair.verdict}: ${repair.action}\n  ${repair.why}\n`); return 1; }
    const revision = requirementChange(root, req, m, h.at(-1), ctx);
    if (revision.needsReview) { const w = revisionVerdict(req, name, revision.digest, revision.reason); process.stdout.write(`${w.verdict}: ${w.action}\n  ${w.why}\n`); return 1; }
  }
  // The write-ahead record, unless the agent's own already covers this run.
  const ip = join(root, ".cairn", "in-progress"), mine = !existsSync(ip);
  if (mine) writeFileSync(ip, `owner: kernel\npid: ${process.pid}\naction: run-mechanism\ntarget: ${name}\nbase: ${head}\nstarted: ${new Date().toISOString()}\n`);
  try {
    const cwd = m.def.cwd && m.def.cwd !== "." ? join(root, m.def.cwd) : root;
    const logDir = join(root, ".cairn", "evidence", reqs[0]);
    mkdirSync(logDir, { recursive: true });
    const stem = join(logDir, `${stamp()}-${process.pid}`), output = stem + ".out", stderrOutput = stem + ".err";
    const r = await capture(m.def.command, cwd, output, stderrOutput, reqs, name);
    const after = candidate(root, m, ctx.requirements, head);
    if (after.digest !== before.digest || after.committed !== before.committed) {
      process.stdout.write(`Resolvable: ${after.dirty.length ? `commit ${after.dirty[0]}` : `run ${reqs[0]}`}\n  candidate changed during ${name}; no evidence recorded; retained output: ${rel(root, output)} and ${rel(root, stderrOutput)} (LOOP-063)\n`);
      return 1;
    }
    const repair = recordEvidence(root, m, ctx.requirements, { before, output, stderrOutput, r });
    if (repair) { process.stdout.write(`${repair.verdict}: ${repair.action}\n  ${repair.why}\n`); return 1; }
  } finally { if (mine) unlinkSync(ip); }
  return null;
}

function recordEvidence(root, m, requirements, { before, output, stderrOutput, r }) {
  const histories = asList(m.def.requirements).map((req) => ({ req, records: history(root, req) }));
  for (const { records } of histories) {
    const repair = historyRepair(records);
    if (repair) return repair;
    if (Number(records.at(-1)?.sequence) === Number.MAX_SAFE_INTEGER)
      return { verdict: "Resolvable", action: `repair ${records.at(-1).path}`, why: "sequence has no safe successor; reconcile execution order before checking" };
  }
  const details = output.replace(/\.out$/, ".inputs.json");
  writeFileSync(details, JSON.stringify({ version: 1, entries: before.details }) + "\n", { flag: "wx" });
  const exit = r.signal ? `signal ${r.signal}` : r.status ?? -1, lines = r.lines;
  const rec = [
    `mechanism: ${m.name}`, `commit: ${before.head}`, `inputs_digest: ${before.inputs}`, `mechanism_digest: ${m.digest}`,
    `inputs_detail: ${rel(root, details)}`,
    `command: ${m.def.command}`, `cwd: ${m.def.cwd ?? "."}`, `exit: ${exit}`, `output_digest: ${fileDigest(output)}`, `output: ${rel(root, output)}`, `stderr_output: ${rel(root, stderrOutput)}`, `stderr_digest: ${fileDigest(stderrOutput)}`,
    `signal: ${r.signal ?? "none"}`, `execution_error: ${JSON.stringify(r.error ? { code: r.error.code ?? null, message: r.error.message } : null)}`,
  ];
  const recorded = new Date().toISOString();
  const perRequirement = m.def.results === "per-requirement" || lines.size > 0;
  for (const { req, records } of histories) {
    const result = lines.get(req) ?? (perRequirement ? "unverified" : exit === 0 ? "pass" : "fail"), source = lines.has(req) ? "line" : perRequirement ? "none" : "exit";
    const dir = join(root, ".cairn", "evidence", req);
    mkdirSync(dir, { recursive: true });
    let p = join(dir, stamp()), i = 0;
    while (existsSync(p)) p = join(dir, `${stamp()}-${++i}`);       // never overwrite (LOOP-025)
    const sequence = Number(records.at(-1)?.sequence ?? 0) + 1;
    writeFileSync(p, `requirement: ${req}\nrequirement_digest: ${requirements.get(req).digest}\nsequence: ${sequence}\nhistory_digest: ${historyDigest(records)}\n${rec.join("\n")}\nresult: ${result}\nsource: ${source}\nrecorded: ${recorded}\n`, { flag: "wx" });
    process.stdout.write(`recorded ${rel(root, p)}: ${result} (${source === "line" ? "by line" : source === "none" ? "not reported" : `exit ${exit}`})\n`);
  }
  return null;
}

// ------------------------------------------------------------ decide

const LEVELS = ["Judged", "Consequential", "Blocking"];
const CAUSES = ["the stated condition occurred", "an unforeseen condition occurred", "it was wrong when it was made", "the premise was false"];
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function decide(root, o) {
  const need = ["title", "level", "decided-by", "rests-on", "wrong-if", "body"].filter((k) => !o[k]);
  if (need.length) return usage(`decide: missing --${need.join(", --")}`);
  const multiline = Object.keys(o).find((k) => k !== "body" && typeof o[k] === "string" && LINE_BREAK.test(o[k]));
  if (multiline) return usage(`decide: --${multiline} must be one line; put multiline text in --body`);
  if (o.level === "Routine") return usage("decide: a Routine decision produces no record (DEC-001, DEC-003)");
  if (!LEVELS.includes(o.level)) return usage(`decide: --level must be one of ${LEVELS.join(", ")}`);
  if (o.supersedes && !CAUSES.includes(o.cause ?? "")) return usage(`decide: --supersedes needs --cause, one of: ${CAUSES.join("; ")}`);
  const slug = slugify(o.title);
  const path = join(root, "docs", "decisions", `${slug}.md`);
  if (existsSync(path)) return usage(`decide: ${rel(root, path)} exists; supersede it rather than overwrite it`);
  const oldPath = o.supersedes ? join(root, "docs", "decisions", `${o.supersedes}.md`) : null;
  if (oldPath && !existsSync(oldPath)) return usage(`decide: --supersedes names ${o.supersedes}, and no such record exists`);
  // DEC-012: in a domain that has seen reversals, the record says what the history changed.
  const ids = [...o["rests-on"].matchAll(/\b([A-Z]+)-\d+\b/g)].map((m) => m[1]);
  const domain = ids.length ? [...new Set(ids)] : ["unspecified"];
  const prior = reversed(root).filter((d) => d.domain.some((x) => domain.includes(x)));
  if (prior.length && !o.history) return usage(`decide: ${domain.join("/")} carries ${prior.length} reversal(s): ${prior.map((d) => d.slug).join(", ")}; pass --history stating what that history changed about the level (DEC-012)`);
  const head = [`# ${o.title}`, "", `Level: ${o.level}`, `Decided by: ${o["decided-by"]}`];
  if (o.supersedes) head.push(`Supersedes: ${o.supersedes}`, `Cause: ${o.cause}`);
  head.push(`Rests on: ${o["rests-on"]}`, `Would be wrong if: ${o["wrong-if"]}`);
  if (o.history) head.push(`History: ${o.history}`);
  head.push("", "## Decision", "", o.body, "", "## Realized by", "", "(none yet: recorded, not built)", "");
  writeFileSync(path, head.join("\n"));
  // The old record learns it was superseded; nothing in it is removed (DEC-008, DEC-010).
  if (oldPath) {
    const t = read(oldPath);
    if (!/^# /.test(t)) { unlinkSync(path); return usage(`decide: ${o.supersedes} has no title line to stamp; nothing was written`); }
    writeFileSync(oldPath, t.replace(/^(# .*\n)/, `$1\nSuperseded by: ${slug}\n`));
  }
  if (o.level === "Consequential") { mkdirSync(join(root, ".cairn", "queue"), { recursive: true }); writeFileSync(join(root, ".cairn", "queue", slug), `decision: ${slug}\nqueued: ${new Date().toISOString()}\n`); }
  process.stdout.write(`recorded ${rel(root, path)}${o.level === "Consequential" ? " and queued it for review" : ""}\n`);
  return 0;
}

// ------------------------------------------------------------ escalate, answer

const ESC_FIELDS = [["question", "Question:  "], ["recommend", "Recommend: "], ["because", "Because:   "], ["if-wrong", "If wrong:  "], ["instead", "Instead:   "]];

function scopeEscalation(root, o) {
  if (!(o.concerns ?? "").split(/[\s,]+/).includes("LOOP-035")) return { error: "--scope requires --concerns LOOP-035" };
  const c = currentCommitment(root);
  if (c.repair) return { error: `repair ${c.repair} before raising a scope incident` };
  fold(c, requirementSet(root).inherited);
  const mechs = mechanisms(root), problem = declarationError(root, mechs);
  if (problem) return { error: `${problem.action}: ${problem.why}` };
  if (!c.requirements.some((r) => mechs.byReq.has(r))) return { error: "declare a mechanism before raising a scope incident" };
  const paths = breaches(root, c.slug, mechs, c.requirements);
  if (!paths.length) return { error: "no unresolved scope paths to acknowledge" };
  const history = scopeHistory(root, c.slug);
  const s = { commitment: c.slug, began: history.began, through: history.line[0], paths };
  if (o.keep) {
    s.mode = "keep";
    const inputs = paths.map((p) => `:(literal)${p}`);
    if (dirtyInputs(root, inputs).length || committedInputsDigest(root, inputs) !== inputsDigestAt(root, inputs, s.through)
        || git(root, "rev-parse", "HEAD").stdout.trim() !== s.through) return { error: "commit the retained paths and keep HEAD stable before --scope --keep" };
  }
  const unrestored = changedScope(root, s);
  if (unrestored.size) return { error: `restore these paths to activation commit ${s.began} and commit before --scope: ${[...unrestored].map(displayPath).join(", ")}` };
  return { snapshot: s };
}
function scopeEscalationLines(scope) {
  if (scope.error) return [`Scope error: ${scope.error}`];
  if (!scope.snapshot) return [];
  const meaning = scope.snapshot.mode === "keep"
    ? "ok approves keeping these exact committed changes as a correction of this incident's scope, never future changes. Commit the answer, rerun checks, and review the retained work. Declare any missing dependencies within the agreement."
    : "ok acknowledges only the recorded restored history, never future changes. Commit the answer before checking.";
  return ["", `Scope acknowledgment: ${meaning} An instead answer supplies direction without granting this acknowledgment.`,
    `Scope: ${JSON.stringify(scope.snapshot).replaceAll("\u2028", "\\u2028").replaceAll("\u2029", "\\u2029")}`,
    "Recorded scope paths:", ...scope.snapshot.paths.map((p) => `  - ${displayPath(p)}`)];
}
function escalationRequest(root, o) {
  const validConcerns = /^[A-Z]+-\d+(?:[ \t,]+[A-Z]+-\d+)*$/.test(o.concerns ?? "");
  const bad = !validConcerns ? "concerns" : ESC_FIELDS.map(([k]) => k).find((k) => !o[k]?.trim() || LINE_BREAK.test(o[k]));
  if (bad && o.level !== "Blocking") return { error: `--${bad} must be present and one line; a Blocking decision may pass --level Blocking to be written anyway` };
  const scope = o.scope && !bad ? scopeEscalation(root, o) : {};
  if (scope.error && o.level !== "Blocking") return scope;
  return { malformed: bad || (scope.error ? "scope" : null), lines: scopeEscalationLines(scope) };
}
function escalate(root, o) {
  if (o.keep && !o.scope) return usage("escalate: --keep requires --scope");
  if (!o.concerns && o.level !== "Blocking") return usage("escalate: missing --concerns");
  if (o.level !== undefined && o.level !== "Blocking") return usage(`escalate: --level must be Blocking or absent, not ${o.level}`);
  const [open] = openEscalations(root);
  if (open) return usage(`escalate: ${open.name} is open; one escalation at a time (LOOP-011)`);
  // Every field present, each on one line (LOOP-026). A Blocking decision
  // is written even when malformed, with the field named (LOOP-014).
  const request = escalationRequest(root, o);
  if (request.error) return usage(`escalate: ${request.error}`);
  const dir = join(root, ".cairn", "escalations");
  mkdirSync(dir, { recursive: true });
  let slug = slugify(o.concerns || "blocking"), path = join(dir, `${slug}.md`), i = 1;
  while (existsSync(path)) path = join(dir, `${slug}-${++i}.md`);
  const oneLine = (value) => (value ?? "").replace(/[\r\n\u2028\u2029]+/g, " ");
  const body = ["DECISION", "", ...ESC_FIELDS.map(([k, label]) => `${label} ${oneLine(o[k])}`), "", "Reply: ok | instead | ask. If this isn't clear, ask me to explain it another way before you decide.", "",
                  `Concerns: ${oneLine(o.concerns)}`, "Status: open", `Raised: ${new Date().toISOString()}`, `Raised after: ${evidenceMilestones(root, o.concerns)}`, ...request.lines];
  if (request.malformed) body.push(`Malformed: ${request.malformed}`);
  writeFileSync(path, body.join("\n") + "\n");
  process.stdout.write(`raised ${rel(root, path)}${request.malformed ? ` (malformed: ${request.malformed}; written because Blocking)` : ""}\n`);
  return 0;
}

function scopeApprovalLine(text, reply) {
  const scope = fields(text).Scope;
  return reply === "ok" && scopeSnapshot(scope) ? `Scope approved: ${sha(scope)}\n` : "";
}
function answer(root, slug, reply) {
  if (!slug || !reply.trim() || LINE_BREAK.test(reply)) return usage("answer: provide one line: ok | instead <what> | ask <question>, or the explanation when replying to an ask");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return usage("answer: invalid escalation slug");
  const path = join(root, ".cairn", "escalations", `${slug}.md`);
  if (!existsSync(path)) return usage(`answer: no escalation named ${slug}`);
  const text = read(path), { turn } = escalationTurn(text);
  if (turn === "closed") return usage(`answer: ${slug} is already answered`);
  reply = reply.trim();
  if (turn === "developer" && !/^(?:ok|(?:instead|ask) +\S.*)$/.test(reply)) return usage("answer: use ok | instead <what> | ask <question>");
  const field = turn === "agent" ? "Reply" : "Answer", date = turn === "agent" ? "Replied" : "Answered";
  let milestone = "";
  if (turn === "developer") {
    const order = escalations(root).reduce((max, e) => Math.max(max, answerOrder(e)), 0) + 1;
    if (!Number.isSafeInteger(order)) return usage("answer: Answered order has no safe successor; repair the escalation order");
    milestone = `Answered after: ${evidenceMilestones(root, fields(text).Concerns)}\nAnswered order: ${order}\n` + scopeApprovalLine(text, reply);
  }
  writeFileSync(path, text.replace(/\n?$/, "\n") + `${field}: ${reply}\n${date}: ${new Date().toISOString()}\n${milestone}`);
  process.stdout.write(`${turn === "agent" ? "replied to" : "answered"} ${rel(root, path)}\n`);
  return 0;
}

// ------------------------------------------------------------ backlog

function backlog(root, o) {
  if (!o.title || !o.body) return usage("backlog: missing --title or --body");
  const dir = join(root, ".cairn", "backlog");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${slugify(o.title)}.md`);
  if (existsSync(path)) return usage(`backlog: ${rel(root, path)} exists; the backlog never overwrites (LOOP-016)`);
  writeFileSync(path, `# ${o.title}\n\nSurfaced from: ${o.from ?? "unstated"}\nCaptured: ${new Date().toISOString()}\n\n${o.body}\n`);
  process.stdout.write(`captured ${rel(root, path)}\n`);
  return 0;
}

// ------------------------------------------------------------ reversals

function reversals(root) {
  const all = decisions(root), rev = all.filter((d) => "Superseded by" in d);
  const tally = (f) => { const m = new Map(); for (const d of rev) for (const k of [].concat(f(d))) m.set(k, (m.get(k) ?? 0) + 1); return [...m].sort().map(([k, v]) => `${k} ${v}`).join(", ") || "none"; };
  const causeOf = (d) => all.find((x) => x.slug === d["Superseded by"])?.Cause ?? "unrecorded";
  process.stdout.write([`reversals: ${rev.length} of ${all.length} decisions`, `by decider: ${tally((d) => d["Decided by"] ?? "unrecorded")}`,
    `by cause: ${tally(causeOf)}`, `by domain: ${tally((d) => d.domain)}`, ...rev.map((d) => `  ${d.slug} -> ${d["Superseded by"]} (${causeOf(d)})`)].join("\n") + "\n");
  return 0;
}

// ------------------------------------------------------------ main

function help() {
  process.stdout.write(`Cairn - Keep agent work tied to the agreed requirements.

Usage: cairn <command> [options]
       cairn --help | -h

Global options:
  --help, -h   Print this help without running a command. No repository needed.
  --root DIR   Use DIR as the project root (default: current directory).
  --           Treat the remaining arguments as literal text, not options.

Commands:
  wake
    Read the project records and name the next action.
  check [REQ ...]
    Run checks and record evidence against committed inputs. With requirement
    IDs, run their mechanisms; otherwise run the current commitment's checks.
  decide --title TEXT --level LEVEL --decided-by NAME --rests-on REFS
         --wrong-if TEXT --body TEXT [--history TEXT]
    Record a decision. Levels: ${LEVELS.join(", ")}.
    --history is required when the decision's domain has recorded reversals.
    To replace an earlier decision, add --supersedes SLUG --cause CAUSE.
  escalate --concerns REFS --question TEXT --recommend TEXT --because TEXT
           --if-wrong TEXT --instead TEXT [--level Blocking] [--scope [--keep]]
    Ask the developer for a decision. Fields must each fit on one line.
    --level Blocking preserves the escalation even if a field is incomplete.
    --scope records restored scope history for a specific acknowledgment;
    include LOOP-035 in --concerns and commit restoration before raising it.
    Add --keep to request retaining exact committed work instead; approval
    requires fresh checks and review and never permits future changes.
  answer SLUG ok | instead TEXT | ask TEXT
    Answer an escalation. An ask keeps it open for an explanation.
    After an ask, the agent uses answer SLUG "EXPLANATION" to reply.
  backlog --title TEXT --body TEXT [--from REQ]
    Capture work outside the current commitment.
  supersede OLD-SLUG --cause CAUSE <decide options>
    Replace an earlier decision and record why it was reversed.
    CAUSE must be one of these exact phrases (quote it in the shell):
${CAUSES.map((cause) => "      " + cause).join("\n")}
  reversals
    Report decision reversals by decider, cause, and domain.

Examples:
  cairn wake
  cairn check R-001
  cairn --root ./my-project wake
  cairn answer storage-choice ask "What would this change for users?"

Quote values containing spaces. Help also works after a command:
  cairn check --help

Exit codes:
  wake/check: 0 Done, 1 Resolvable, 2 Escalate, 3 usage or execution error.
  Other commands and help: 0 on success, 3 on error.
  A check can return 1 after tests pass because a review is still needed.

Human manual: docs/manual.md in the Cairn installation.
`);
  return 0;
}

function usage(msg) { process.stderr.write(`cairn: ${msg}\n`); return 3; }

async function main() {
  let a;
  try {
    a = parseArgs({ args: process.argv.slice(2), allowPositionals: true, strict: true, options: {
      help: { type: "boolean", short: "h" }, scope: { type: "boolean" }, keep: { type: "boolean" },
      root: { type: "string" }, title: { type: "string" }, level: { type: "string" }, "decided-by": { type: "string" },
      "rests-on": { type: "string" }, "wrong-if": { type: "string" }, body: { type: "string" }, supersedes: { type: "string" }, cause: { type: "string" },
      from: { type: "string" }, history: { type: "string" }, concerns: { type: "string" }, question: { type: "string" }, recommend: { type: "string" }, because: { type: "string" }, "if-wrong": { type: "string" }, instead: { type: "string" } } });
  } catch (e) { return usage(e.message); }
  if (a.values.help) return help();
  const root = a.values.root ?? process.cwd();
  const [cmd, ...rest] = a.positionals;
  if (cmd === "decide") return decide(root, a.values);
  if (cmd === "escalate") return escalate(root, a.values);
  if (cmd === "answer") return answer(root, rest[0], rest.slice(1).join(" "));
  if (cmd === "backlog") return backlog(root, a.values);
  if (cmd === "supersede") return rest[0] ? decide(root, { ...a.values, supersedes: rest[0] }) : usage("usage: cairn supersede <old-slug> --cause C ...decide fields");
  if (cmd === "reversals") return reversals(root);
  if (cmd !== "wake" && cmd !== "check") return usage("usage: cairn <wake|check|decide|escalate|answer|backlog|supersede|reversals> [--root DIR]");
  if (!existsSync(join(root, "docs", "spec", "roadmap.md"))) return usage(`${root} is not a Cairn repository (no docs/spec/roadmap.md)`);
  if (git(root, "rev-parse", "--show-toplevel").status !== 0) return usage(`${root} is not a Git working tree; wake and check require Git (LOOP-046)`);
  if (cmd === "check") return check(root, rest);
  const w = wake(root);
  process.stdout.write(`${w.verdict}: ${w.action}\n  ${w.why}\n`);
  return VERDICT[w.verdict];
}

process.exit(await main().catch((e) => usage(e.message)));
