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
//   cairn backlog --title T --body B [--from X] [--outside W]   capture an idea inside the specification
//   cairn backlog --next-iteration --changes X --title T --body B   capture an idea that changes it
//   cairn supersede <old> --cause C ...decide fields...
//   cairn reversals                 report reversals by decider, cause, domain
//   cairn lint [DIR]                run the shipped specification checker over DIR
//
// Exit: 0 Done, 1 Resolvable (the agent acts), 2 Escalate (the developer
// acts), 3 usage or not a Cairn repository. Node only, no dependencies.

import { parseArgs } from "node:util";
import { parseSpec, withoutFences } from "./spec.mjs";
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { openSync, closeSync, readSync, writeSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, statSync, writeFileSync, unlinkSync } from "node:fs";
import { join, posix, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

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
    else if (key && (m = /^\s*-\s+(.*)$/.exec(line))) { out[key] = (Array.isArray(out[key]) ? out[key] : out[key] === "" ? [] : [out[key]]).concat(m[1]); }   // a value on the key line is the first item (LOOP-133)
    else if (key && typeof out[key] === "string") out[key] += " " + line.trim();
  }
  return out;
}
// Markdown records have one header, followed by prose. Flat declarations
// and escalation conversations retain their existing field format.
function recordFields(text) {
  const lines = withoutFences(text), header = [];
  let titleAllowed = true, continuation = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^ {0,3}#{1,6}(?:[ \t]|$)/.test(line)) {
      if (!titleAllowed) break;
      titleAllowed = false;
      continue;
    }
    if (/^ {0,3}(?:=+|-{2,})[ \t]*$/.test(line)) { continuation = false; continue; }   // a rule is never a field's value, and never ends the fields below it (LOOP-108)
    if (line.trim()) {
      if (titleAllowed && !FIELD_LINE.test(line) && !ENTRY.test(line) && i + 1 < lines.length && /^ {0,3}(?:=+|-{2,})[ \t]*$/.test(lines[i + 1])) { titleAllowed = false; i++; continue; }   // one underlined title
      if (!continuation && !FIELD_LINE.test(line)) break;
      titleAllowed = false;
      continuation = true;
    } else continuation = false;
    header.push(line);
  }
  const seen = new Set(), kept = [];   // the first line of a field is its value; a copy quoted lower in the header is not (LOOP-108)
  let repeated = false;
  for (const line of header) {
    const m = FIELD_LINE.exec(line.trimEnd());
    if (m) { repeated = seen.has(m[1]); seen.add(m[1]); }
    if (!repeated) kept.push(line);
  }
  return fields(kept.join("\n"));
}
// A record the kernel cannot read is named as a repair, never an error exit (LOOP-107).
const read = (p) => { try { return readFileSync(p, "utf8"); } catch (e) { e.record = p; throw e; } };
const list = (dir) => { try { return existsSync(dir) ? readdirSync(dir).filter((n) => !n.startsWith(".")).sort() : []; } catch (e) { e.record = dir; throw e; } };
// The regular files of a record kind: slug-named `.md` records, or declarations, which carry no extension (LOOP-103).
const SLUG_MD = /^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
const files = (dir, name = SLUG_MD) => list(dir).filter((n) => name.test(n) && lstatSync(join(dir, n)).isFile());
const rel = (root, p) => relative(root, p).split("\\").join("/");
const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };
const asList = (v) => (Array.isArray(v) ? v : v ? [v] : []);
// An item named by slug, filename, repository path, or backticked slug (LOOP-125).
const item = (s) => String(s).trim().replace(/^`|`$/g, "").replace(/^\.cairn\/(?:backlog|next-iteration)\//, "").replace(/\.md$/, "");
const sha = (s) => "sha256:" + createHash("sha256").update(s).digest("hex");
// The kernel that writes a record: the two files that decide verdicts and write (LOOP-023, LOOP-095).
const version = () => JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;   // one version source, read only when asked (PKG-039)
const KERNEL_DIGEST = sha(["cairn.mjs", "spec.mjs"].map((f) => readFileSync(new URL(`./${f}`, import.meta.url), "utf8")).join("\n"));
// Every git call in the kernel: a git that cannot start is the kernel's own failure, one line and exit 3 through main's catch, never a verdict (LOOP-137).
const gitRun = (root, args, input) => { const r = spawnSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: Infinity, ...(input === undefined ? {} : { input }) }); if (r.error) throw new Error(`cannot run git: ${r.error.message}`); return r; };
const git = (root, ...args) => gitRun(root, args);
const headSha = (root) => { const r = git(root, "rev-parse", "--short", "HEAD"); return r.status === 0 ? r.stdout.trim() : null; };

// The roadmap's Current: lines outside fenced examples: the wake and the footprint's walk read them alike (LOOP-104, LOOP-134).
const currentLines = (text) => (withoutFences(text).join("\n").match(/^Current:.*$/gm) ?? []).map((l) => fields(l).Current);
function currentCommitment(root) {
  const p = join(root, "docs", "spec", "roadmap.md"), text = read(p);
  if (currentLines(text).length > 1) return { repair: rel(root, p), why: "more than one Current: line names a commitment; keep one (LOOP-019, LOOP-104)" };
  const slug = fields(withoutFences(text).join("\n"))["Current"];   // a fenced example never names the commitment (LOOP-104)
  if (!slug) return { repair: rel(root, p), why: "no Current: line names a commitment" };
  const cp = join(root, "docs", "commitments", `${slug}.md`);
  if (!existsSync(cp)) return { repair: rel(root, p), why: `Current: names ${slug}, and docs/commitments/${slug}.md does not exist` };
  const f = fields(read(cp)), reqs = asList(f["Requirements"]).join(",").split(",").map((s) => s.trim()).filter(Boolean);   // a list reads as the flat form (LOOP-102)
  if (reqs.length === 0) return { repair: rel(root, cp), why: "no Requirements: line names what the commitment includes" };
  return { slug, requirements: reqs, promoted: item(asList(f["Promoted from"]).join(" ")) || null, specified: asList(f["Specified from"]).map(item).join(" ") || null };
}

// The kernel and lint read the same blocks and status defaults.
function requirementSet(root, commit = null) {
  const dir = "docs/spec", texts = new Map(), agreed = new Set(), inherited = new Set(), promotions = new Map();
  const out = { texts, agreed, inherited, promotions };
  // Paths in rev:./path form and directory pathspecs are relative to the root, which may sit below the Git toplevel (LOOP-112).
  const ls = commit ? git(root, "ls-tree", "--name-only", "-z", commit, "--", `${dir}/`) : null;
  if (ls && (ls.error || ls.status !== 0)) return out;
  const names = ls ? ls.stdout.split("\0").filter(Boolean).map((p) => p.slice(dir.length + 1)) : files(join(root, dir), /\.md$/);
  for (const n of names.filter((n) => n.endsWith(".md"))) {
    const path = `${dir}/${n}`, show = commit ? git(root, "show", `${commit}:./${path}`) : null;
    if (show && (show.error || show.status !== 0)) continue;
    const spec = parseSpec(show ? show.stdout : read(join(root, path)));
    for (const block of spec.blocks) {
      const body = block.body.filter((line) => !/^Status:/.test(line)).join("\n");
      texts.set(block.id, { path, digest: texts.has(block.id) ? null : sha(body) });
      if (block.promotion) promotions.set(block.id, { kind: block.agreedBy, slug: block.promotion });
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
function requirementChange(root, req, m, latest, ctx, h = []) {
  const now = ctx.requirements.get(req)?.digest;
  const before = latest?.requirement_digest ?? (latest ? pastRequirements(root, latest.commit, ctx).get(req)?.digest : null);
  const changed = !!latest && (!now || before !== now);
  const revisedEarlier = !!now && h.some((e) => e.requirement_digest && e.requirement_digest !== now);   // unreviewed however many runs follow the revision (LOOP-059)
  const needsReview = (changed || revisedEarlier) && !asList(m?.def.reviewed).includes(`${req} ${now}`);
  const reason = !before ? "old requirement or falsifier text is unavailable" : !now ? "current requirement or falsifier text is unavailable" : "the requirement or falsifier changed";
  return { changed, needsReview, digest: now, reason };
}
const revisionVerdict = (req, m, digest, reason) => ({ verdict: "Resolvable", action: `review mechanism ${req}`, why: `${reason}; inspect ${m} and record findings without changing code; fix any mismatch as a separate action, then add reviewed: list entry "${req} ${digest}" to .cairn/mechanisms/${m} and commit before check (LOOP-059)` });

// Files changed by commits since the commitment began: since the commit
// that wrote its Current: line. The footprint is the union of its
// mechanisms' declared inputs plus Cairn's own records.
const histories = new Map();   // one reading per process: HEAD does not move while the kernel runs
function scopeHistory(root, slug) {
  if (histories.has(slug)) return histories.get(slug);
  const roadmap = "docs/spec/roadmap.md";
  const commits = git(root, "log", "--first-parent", "--format=%H %P", "--", roadmap).stdout.trim().split("\n").filter(Boolean).map((l) => l.split(" "));
  let began = null, base = null;
  for (const [commit, parent] of commits) {
    const show = git(root, "show", `${commit}:./${roadmap}`);
    if (show.status !== 0 || !currentLines(show.stdout).includes(slug)) break;   // any line outside fences that names it counts (LOOP-134)
    began = commit; base = parent ?? commit;   // the footprint and the contract comparison start at the activation commit's parent, so that commit is inside both (LOOP-116, LOOP-120); a root activation has none
  }
  if (!began) return histories.set(slug, { began, commits: "", line: [] }).get(slug);
  const ownCommits = git(root, "log", "--first-parent", "--no-merges", "--format=%H", `${base}..HEAD`);
  const line = git(root, "rev-list", "--first-parent", `${base}..HEAD`);
  if (ownCommits.error || ownCommits.status !== 0 || line.error || line.status !== 0) throw new Error("cannot read the commitment's Git history");
  return histories.set(slug, { began, base, commits: ownCommits.stdout, line: line.stdout.trim().split("\n").filter(Boolean) }).get(slug);
}
// The working agreement's include files: the root files whose whole content is @AGENTS.md, known by blob id, so one listing finds them (LOOP-122).
const INCLUDE = new Set(["@AGENTS.md", "@AGENTS.md\n", "@AGENTS.md\r\n"].flatMap((s) => ["sha1", "sha256"].map((h) => createHash(h).update(`blob ${Buffer.byteLength(s)}\0${s}`).digest("hex"))));
function includeFiles(root, rev, names = ["."]) {
  const r = git(root, "ls-tree", "-z", rev, "--", ...names);
  return r.status !== 0 ? [] : r.stdout.split("\0").filter(Boolean).map((e) => e.split("\t")).filter(([meta]) => INCLUDE.has(meta.split(" ")[2])).map(([, name]) => name);
}
function breaches(root, slug, mechs, requirements) {
  const history = scopeHistory(root, slug);
  const changed = changedPaths(root, history.commits);
  const inputs = [...new Set(requirements.flatMap((r) => mechs.byReq.get(r) ?? []).flatMap((n) => asList(mechs.byName.get(n).def.inputs)))];
  const covered = new Set(inputs.length ? changedPaths(root, history.commits, inputs) : []);
  // Cairn's own records, the agreement's include files, and nothing else under docs/, are outside the footprint (LOOP-035, LOOP-117, LOOP-122).
  const roots = changed.filter((f) => !f.includes("/")), includes = new Set(roots.length ? includeFiles(root, "HEAD", roots) : []);
  const record = (f) => f.startsWith(".cairn/") || /^docs\/(?:spec|commitments|decisions)\//.test(f) || ["docs/recon.md", "AGENTS.md", ".gitignore"].includes(f) || includes.has(f);
  const paths = changed.filter((f) => !record(f) && !covered.has(f));
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
  // Restoration is to the tree before activation, since the activation commit is inside the footprint (LOOP-120).
  const from = s.mode === "keep" ? s.through : git(root, "rev-parse", "--verify", "-q", `${s.began}^`).status === 0 ? `${s.began}^` : s.began;
  const r = git(root, "diff", "--name-only", "--no-renames", "--relative", "-z", from, "HEAD", "--");   // root-relative below the toplevel (LOOP-130)
  if (r.error || r.status !== 0) return new Set(s.paths);
  const changed = new Set(r.stdout.split("\0").filter(Boolean));
  return new Set(s.paths.filter((p) => changed.has(p)));
}
function scopeApprovals(root, slug, history) {
  const approvals = [];
  // Only committed answers affect the guard. HEAD is also part of each check's
  // candidate, so editing an answer during execution cannot change its scope.
  const names = git(root, "ls-tree", "--name-only", "-z", "HEAD", "--", ".cairn/escalations/");
  if (names.error || names.status !== 0) return approvals;
  for (const name of names.stdout.split("\0").map((p) => p.slice(".cairn/escalations/".length)).filter((n) => /^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(n))) {
    const r = git(root, "show", `HEAD:./.cairn/escalations/${name}`);
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
const acknowledgedScope = (root, slug, history) => new Set(scopeApprovals(root, slug, history).flatMap((a) => a.paths));
const retentionApprovals = (root) => { const slug = currentCommitment(root).slug; return scopeApprovals(root, slug, scopeHistory(root, slug)).filter((a) => a.snapshot.mode === "keep"); };
function retentionChanged(root, commit, ctx) {
  if (!ctx.retention.length) return false;
  if (!ctx.retentionPast.has(commit)) ctx.retentionPast.set(commit, ctx.retention.some((a) => {
    const r = git(root, "show", `${commit}:./${a.path}`);
    return r.error || r.status !== 0 || r.stdout !== a.text;
  }));
  return ctx.retentionPast.get(commit);
}
const retentionReasons = (root, commit, ctx) => [retentionChanged(root, commit, ctx) ? "the check predates the committed retention approval (LOOP-085)" : null,
  ctx.retentionDirty ? "a retained path has uncommitted changes (LOOP-085)" : null].filter(Boolean);
function scopeVerdict(root, c, mechs) {
  // There is no footprint until a mechanism belongs to this commitment.
  // Wake will name declaration; a targeted check of another mechanism can run.
  if (!c.requirements.some((r) => mechs.byReq.has(r))) return null;
  const paths = breaches(root, c.slug, mechs, c.requirements);
  if (!paths.length) return null;
  const first = /[\s\x00-\x1f\x7f-\x9f]/.test(paths[0]) ? displayPath(paths[0]) : paths[0];
  return { verdict: "Resolvable", action: `scope ${first}`, why: `${paths.length} unresolved scope paths changed since the commitment began and no mechanism declares them (LOOP-035):\n${paths.map((p) => `  - ${displayPath(p)}`).join("\n")}\n  Declare missing inputs that belong to the agreement. To keep correct committed work outside it, use cairn escalate --scope --keep --concerns LOOP-035 with the decision fields for explicit approval of that exact history. For accidental work, capture it in the backlog, restore the paths to the commitment's activation tree, commit, and use cairn escalate --scope --concerns LOOP-035. Commit the developer's ok before checking. Retention needs fresh checks and review; neither approval grants future changes. An instead answer supplies direction, not an automatic exception.` };
}
// Neither capture directory is deferral (LOOP-092): an item added inside
// the footprint from one of the commitment's own requirements carries the
// agent's reason it is outside, or an escalation names it. A
// next-iteration item names what it would change (LOOP-093).
// The paths a commitment's own commits added under the named directories.
const addedPaths = (root, commits, ...dirs) => changedPaths(root, commits, dirs, true);
// An escalation covers a capture or a contract change only when this commitment raised it; an older one, from any commitment, names the requirement by coincidence (LOOP-114, LOOP-119).
const ownEscalations = (root, history) => { const added = new Set(addedPaths(root, history.commits, ".cairn/escalations")); return escalations(root).filter((e) => added.has(`.cairn/escalations/${e.name}.md`)); };
// A Consequential record this commitment added was queued for the developer's review; the entry must be committed, or the review never happens (DEC-004, LOOP-131).
function queueVerdict(root, c) {
  const history = scopeHistory(root, c.slug);
  if (!history.began || !history.commits) return null;
  const queued = new Set(addedPaths(root, history.commits, ".cairn/queue"));
  for (const path of addedPaths(root, history.commits, "docs/decisions")) {
    const entry = `.cairn/queue/${path.replace(/^docs\/decisions\//, "").replace(/\.md$/, "")}`, present = existsSync(join(root, entry));
    if (existsSync(join(root, path)) && fields(read(join(root, path))).Level === "Consequential" && !queued.has(entry))
      return { verdict: "Resolvable", action: present ? `commit ${entry}` : `repair ${path}`, why: `the record is Consequential and no commit queued it for the developer's review; ${present ? "commit the queue entry" : `write ${entry} holding the record's path and commit it`} (DEC-004, LOOP-131)` };
  }
  return null;
}
function captureVerdict(root, c) {
  const next = join(root, ".cairn", "next-iteration");
  for (const n of files(next)) if (!("Changes" in fields(read(join(next, n))))) return { verdict: "Resolvable", action: `repair .cairn/next-iteration/${n}`, why: "a next-iteration item names no Changes: line; name the Agreed requirement or the working agreement it would change (LOOP-093)" };
  const history = scopeHistory(root, c.slug);
  if (!history.began || !history.commits) return null;
  const own = ownEscalations(root, history);
  for (const path of addedPaths(root, history.commits, ".cairn/backlog", ".cairn/next-iteration")) {
    if (!existsSync(join(root, path))) continue;
    const f = fields(read(join(root, path)));
    const hit = (`${f["Surfaced from"] ?? ""} ${f["Changes"] ?? ""}`.match(/\b[A-Z]+-\d+\b/g) ?? []).find((id) => c.requirements.includes(id));
    // A next-iteration item is also covered by the escalation whose Concerns line names the requirement it changes (LOOP-119).
    if (!hit || "Outside because" in f || own.some((e) => e.text.includes(path))
        || ("Changes" in f && own.some((e) => (e.Concerns ?? "").split(/[\s,]+/).includes(hit)))) continue;
    return { verdict: "Resolvable", action: `escalate ${path}`, why: `captured from ${hit}, which this commitment includes, with no Outside because: line; add the line when the idea is not this commitment's work, or escalate with the evidence when the work cannot be finished, and do not report Done around it (LOOP-092)` };
  }
  return null;
}
// A promoted commitment stays inside the specification (LOOP-089): a
// change to an Agreed requirement or the working agreement since it
// began is the developer's, so the agent escalates (LOOP-090).
function promotedContractVerdict(root, c, ctx, agreed) {
  if (!c.promoted) return null;
  const history = scopeHistory(root, c.slug);
  if (!history.began) return null;
  const before = history.base, past = pastRequirements(root, before, ctx);
  // A requirement Agreed at activation whose text changed, or that is Draft or gone at HEAD (LOOP-121).
  const changed = [...requirementSet(root, before).agreed].filter((id) => !agreed.has(id) || (past.get(id)?.digest && ctx.requirements.get(id)?.digest && past.get(id).digest !== ctx.requirements.get(id).digest)).sort();
  // The working agreement and each include file it had at activation (LOOP-122); an escalation covers the change when its Concerns line names every changed requirement, LOOP-036 for the agreement (LOOP-114).
  const blob = (rev, f) => { const r = git(root, "rev-parse", "--verify", "-q", `${rev}:./${f}`); return r.status === 0 ? r.stdout : null; };
  for (const f of ["AGENTS.md", ...includeFiles(root, before)]) if (blob(before, f) !== blob("HEAD", f)) changed.push(f);
  const ids = [...new Set(changed.map((id) => /^[A-Z]+-\d+$/.test(id) ? id : "LOOP-036"))];
  if (!changed.length || ownEscalations(root, history).some((e) => { const named = (e.Concerns ?? "").split(/[\s,]+/); return ids.every((id) => named.includes(id)); })) return null;
  return { verdict: "Resolvable", action: `escalate ${c.slug}`, why: `a promoted commitment changed ${changed.join(", ")} since it began at ${history.began.slice(0, 7)}; a change to an Agreed requirement, its falsifier, or the working agreement is the developer's: move the item to next-iteration with the reason and raise one escalation with --concerns ${ids.join(",")}, and do not build it under the promotion's record (LOOP-089, LOOP-090, LOOP-114)` };
}
function changedPaths(root, commits, inputs = [], added = false) {
  const r = gitRun(root, ["diff-tree", "--stdin", "--no-commit-id", "--name-only", "--no-renames", ...(added ? ["--diff-filter=A"] : []), "-r", "--relative", "-z", "--", ...inputs], commits);
  if (r.error || r.status !== 0) throw new Error("cannot read the commitment's changed paths");
  return [...new Set(r.stdout.split("\0").filter(Boolean))].sort();
}

// Every decision record with its header fields. A record's domain is the
// set of requirement prefixes in its Rests on: line; one that rests on
// prose alone is in the domain "unspecified".
function decisions(root) {
  const dir = join(root, "docs", "decisions");
  return files(dir).map((n) => {
    const f = recordFields(read(join(dir, n)));
    const ids = [...asList(f["Rests on"]).join(" ").matchAll(/\b([A-Z]+)-\d+\b/g)].map((m) => m[1]);
    return { slug: n.replace(/\.md$/, ""), ...f, domain: ids.length ? [...new Set(ids)] : ["unspecified"] };
  });
}
const reversed = (root) => decisions(root).filter((d) => "Superseded by" in d);

// Inheritance is declared by Scope in the specification, never by prefix.
const fold = (c, inherited) => { for (const r of [...inherited].sort()) if (!c.requirements.includes(r)) c.requirements.push(r); };

// What decide writes under Realized by, and what DEC-021 refuses to see
// above a commit that resolves.
const UNBUILT = "(none yet: recorded, not built)";
// Whitespace around the line, and a CR from a CRLF checkout, are not part of it.
const hasUnbuilt = (section) => section.split("\n").some((l) => l.trim() === UNBUILT);

// A decision record is read whole: its header (DEC-005, LOOP-109), its
// predecessor (DEC-010), and its Realized by section, where a resolving
// entry makes it built, a placeholder left above one is named as a
// repair, and an identifier a shallow clone or an ambiguous prefix
// cannot resolve is named as such (DEC-007, DEC-021, LOOP-113).
// One git call resolves every Realized by entry of every record (DEC-023): the batch echoes one line per input, in order.
function resolveCommits(root, ids) {
  const out = new Map();
  if (!ids.length) return out;
  const r = gitRun(root, ["cat-file", "--batch-check"], ids.map((id) => `${id}^{commit}\n`).join(""));
  const lines = r.error || r.status !== 0 ? [] : r.stdout.trimEnd().split("\n"), ambiguous = new Set([...(r.stderr ?? "").matchAll(/short object ID (\S+) is ambiguous/g)].map((m) => m[1]));   // git says so on stderr, and prints missing
  ids.forEach((id, i) => out.set(id, ambiguous.has(id) ? "ambiguous" : / commit \d+$/.test(lines[i] ?? "") ? "commit" : "missing"));
  return out;
}
function decisionVerdict(root) {
  const dir = join(root, "docs", "decisions");
  const records = files(dir).map((n) => {
    const t = withoutFences(read(join(dir, n))).join("\n"), f = recordFields(t), path = rel(root, join(dir, n));
    const headings = [...t.matchAll(/^ {0,3}## Realized by[ \t]*$/gm)];
    const section = headings.length !== 1 ? "" : t.slice(headings[0].index + headings[0][0].length).split(/^ {0,3}#{1,6}[ \t]/m)[0];
    // A superseded record is never deleted, so its placeholder is held to the same line (DEC-010,
    // DEC-021); with no placeholder there is nothing left to judge and its entries cost nothing.
    return { f, path, placeholder: hasUnbuilt(section), superseded: "Superseded by" in f, ids: [...section.matchAll(/^- ([0-9a-f]{7,64})[ \t]+(\S[^\n]*)$/gm)].map((m) => m[1]) };
  });
  const resolved = resolveCommits(root, [...new Set(records.filter((x) => !(x.superseded && !x.placeholder)).flatMap((x) => x.ids))]);
  for (const { f, path, placeholder, superseded, ids } of records) {
    const repair = (why) => ({ verdict: "Resolvable", action: `repair ${path}`, why });
    const missing = ["Level", "Decided by", "Rests on", "Would be wrong if"].find((k) => !f[k]);
    if (missing) return repair(`the record lacks its ${missing}: line (DEC-005, LOOP-109)`);
    if (f.Supersedes && !existsSync(join(dir, `${f.Supersedes}.md`))) return repair(`Supersedes: ${f.Supersedes} names no record under docs/decisions/; a reversal is never deleted (DEC-010, LOOP-109)`);
    if (superseded && !placeholder) continue;
    // A resolving entry settles the record, but not while it still says it was never built (DEC-021).
    // The test is a resolving entry, so a shallow clone reaches its own repair below instead (LOOP-113).
    const built = ids.some((id) => resolved.get(id) === "commit");
    if (built && placeholder) return repair(`Realized by holds "${UNBUILT}" above a commit that resolves; remove the placeholder line, which says the decision was never built (DEC-021)`);
    if (built || superseded) continue;
    if (ids.length && git(root, "rev-parse", "--is-shallow-repository").stdout.trim() === "true") return repair(`Realized by names ${ids[0]}, which this shallow clone cannot resolve; fetch the history before judging the record (LOOP-113)`);
    const ambiguous = ids.find((id) => resolved.get(id) === "ambiguous");
    if (ambiguous) return repair(`Realized by identifier ${ambiguous} is ambiguous; lengthen it (LOOP-113)`);
    return { verdict: "Resolvable", action: `build ${path}`, why: `the record needs a resolving commit identifier followed by its subject in Realized by, replacing "${UNBUILT}" rather than sitting under it; the commit or subject is missing (DEC-006, DEC-021)` };
  }
  return null;
}
function escalations(root) {
  const dir = join(root, ".cairn", "escalations");
  return files(dir).map((n) => { const text = read(join(dir, n)), f = fields(text); return { name: n.replace(/\.md$/, ""), ...f, Concerns: asList(f.Concerns).join(" "), ...escalationTurn(text), text }; });
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
  for (const n of files(dir, /^[^.]+$/)) {
    const text = read(join(dir, n));
    const m = { name: n, def: fields(text), digest: sha(text) };
    byName.set(n, m);
    // Several mechanisms may speak for one requirement; each must pass (LOOP-056).
    for (const r of asList(m.def.requirements)) if (!byReq.get(r)?.includes(n)) (byReq.get(r) ?? byReq.set(r, []).get(r)).push(n);
  }
  return { byName, byReq, inputs: inputCache() };
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
// With core.filemode false the index mode is the identity (LOOP-111).
const filemode = (root, cache) => cache.filemode ??= git(root, "config", "--bool", "core.filemode").stdout.trim() !== "false";
const inputHash = () => createHash("sha256").update("cairn-inputs-v2\0");
const hashEntry = (h, path, mode, digest) => h.update(path).update("\0").update(mode).update("\0").update(digest).update("\0");
function fileIdentity(root, path, cache, indexMode = null) {
  if (cache.files.has(path)) return cache.files.get(path);
  const p = join(root, path), stat = lstatSync(p);
  if (!stat.isFile() && !stat.isSymbolicLink()) throw new Error(`unsupported declared input ${path}`);
  const link = stat.isSymbolicLink(), mode = link ? "120000" : indexMode && !filemode(root, cache) ? indexMode : stat.mode & 0o100 ? "100755" : "100644";
  const target = link ? readlinkSync(p) : null;
  const identity = { mode, digest: link ? sha(target) : fileDigest(p), target };
  cache.files.set(path, identity);
  return identity;
}
function inputsDigest(root, inputs, cache = inputCache()) {
  const key = JSON.stringify(inputs);
  if (cache.digests.has(key)) return cache.digests.get(key);
  const h = inputHash();
  for (const { path, mode } of inputEntries(root, inputs, cache)) {
    const file = fileIdentity(root, path, cache, mode);
    hashEntry(h, path, file.mode, file.digest);
  }
  const digest = "sha256:" + h.digest("hex");
  cache.digests.set(key, digest);
  return digest;
}
function inputDetails(root, inputs, cache) {
  return inputEntries(root, inputs, cache).map(({ path, mode: indexMode }) => {
    const { mode, digest } = fileIdentity(root, path, cache, indexMode);
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
// hash-object reads paths from the Git toplevel; the root may sit below it (LOOP-112).
const prefix = (root, cache) => cache.prefix ??= git(root, "rev-parse", "--show-prefix").stdout.trim();
function workingObjects(root, entries, cache) {
  const missing = entries.filter((e) => !cache.objects.has(e.path));
  const files = missing.filter((e) => fileIdentity(root, e.path, cache, e.mode).mode !== "120000");
  if (files.length) {
    const r = gitRun(root, ["hash-object", "--stdin-paths"], files.map((e) => gitPath(prefix(root, cache) + e.path) + "\n").join(""));
    if (r.error || r.status !== 0) throw new Error(`cannot apply Git input conversion: ${r.stderr || r.error?.message}`);
    const oids = r.stdout.trim().split("\n");
    if (oids.length !== files.length || oids.some((oid) => !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(oid))) throw new Error("invalid Git input conversion result");
    files.forEach((e, i) => cache.objects.set(e.path, oids[i]));
  }
  for (const e of missing) {
    const file = fileIdentity(root, e.path, cache, e.mode);
    if (file.mode !== "120000") continue;
    const oid = createHash(e.oid.length === 40 ? "sha1" : "sha256").update(`blob ${Buffer.byteLength(file.target)}\0`).update(file.target).digest("hex");
    cache.objects.set(e.path, oid);
  }
}
function committedInputsDigest(root, inputs, cache = inputCache()) {
  const entries = inputEntries(root, inputs, cache), h = committedHash();
  workingObjects(root, entries, cache);
  for (const e of entries) hashEntry(h, e.path, fileIdentity(root, e.path, cache, e.mode).mode, cache.objects.get(e.path));
  return "sha256:" + h.digest("hex");
}
function gitObjectsAvailable(root, entries) {
  if (!entries.length) return true;
  const r = gitRun(root, ["cat-file", "--batch-check"], entries.map((e) => e.oid + "\n").join(""));
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
  const ls = git(root, "ls-tree", "-r", "-z", commit, "--", ".");
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
function declarationFieldsError(m, root) {
  if (typeof m.def.command !== "string" || !m.def.command.trim()) return "command needs nonempty text (LOOP-067)";
  if (!asList(m.def.inputs).length) return "inputs needs a nonempty list of declared paths (LOOP-067)";
  const reqs = asList(m.def.requirements);
  if (!reqs.length || reqs.some((r) => !/^[A-Z]+-\d+$/.test(r))) return "requirements needs valid requirement identifiers (LOOP-067)";
  const twice = reqs.find((r, i) => reqs.indexOf(r) !== i);
  if (twice) return `requirements names ${twice} twice; one line per requirement (LOOP-105)`;
  // An input is resolved against the root before the test, so `..` from a nested project covers the evidence directory (LOOP-126).
  const evidence = resolve(root, ".cairn", "evidence"), within = (a, b) => a === b || a.startsWith(b + sep);
  const covering = asList(m.def.inputs).map(String).find((i) => { const abs = resolve(root, i); return within(evidence, abs) || within(abs, evidence); });
  if (covering !== undefined) return `input ${covering.replace(/^\.\/|\/+$/g, "") || "."} covers .cairn/evidence/, Cairn's own output; declare the paths the command reads (LOOP-105, LOOP-126)`;
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
  for (const [name, m] of mechs.byName) {
    const invalid = declarationFieldsError(m, root);
    if (invalid) return mechanismRepair(name, invalid);
    if (m.def.cwd && m.def.cwd !== "." && !existsSync(join(root, m.def.cwd))) return mechanismRepair(name, `cwd ${m.def.cwd} does not exist (LOOP-105)`);
    for (const input of asList(m.def.inputs)) {
      const files = inputEntries(root, [input], mechs.inputs), own = files.find((e) => e.path.startsWith(".cairn/evidence/"));
      if (own) return mechanismRepair(name, `input ${input} matches ${own.path}, Cairn's own output; declare the paths the command reads (LOOP-105, LOOP-126)`);
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

function dirtyInputs(root, inputs, cache = inputCache(), trackedOnly = false) {
  const r = git(root, "status", "--porcelain", "-z", ...(trackedOnly ? ["--untracked-files=no"] : []), "--", ...inputs);   // a file Git does not track is no change under way (LOOP-110)
  if (r.error || r.status !== 0) throw new Error(`cannot inspect committed inputs: ${r.stderr || r.error?.message}`);
  const toks = r.stdout.split("\0"), out = [];
  for (let i = 0; i < toks.length; i++) if (toks[i]) { out.push(toks[i].slice(3)); if (/[RC]/.test(toks[i].slice(0, 2))) out.push(toks[++i]); }   // a rename or copy carries its origin as the next token
  if (!out.length) return out;
  const pre = prefix(root, cache);   // Git prints paths from the toplevel; the loop names them from the project root (LOOP-132)
  return pre ? out.map((p) => posix.relative(pre, p) || ".") : out;
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
// One receipt per run lives under runs/; a requirement's history is its legacy
// receipts plus its result line from every run receipt (LOOP-097, LOOP-098).
const RUNS = "runs";
let runCache = null;
function runReceipts(root) {
  if (runCache?.root === root) return runCache.entries;
  const dir = join(root, ".cairn", "evidence", RUNS);
  const entries = list(dir).filter((n) => RECEIPT_NAME.test(n)).map((n) => {
    const p = join(dir, n), path = rel(root, p);
    try {
      if (!lstatSync(p).isFile()) return { path, error: "receipt is not a regular file" };
      const text = read(p), f = fields(text);
      return { path, f, receipt_digest: sha(text), error: Array.isArray(f.results) ? null : "run receipt has no results list (LOOP-097)" };
    } catch (e) { return { path, error: `cannot read receipt: ${e.code ?? e.message}` }; }
  });
  runCache = { root, entries };
  return entries;
}
// Why a defect item does not yet count as fixed, or null (LOOP-140).
function unfixed(root, f) {
  const req = String(f["Surfaced from"] ?? "").trim(), sha = String(f["Fixed by"] ?? "").trim().split(/\s/)[0];
  if (!sha) return `the defect in ${req} carries no Fixed by: line`;
  const commit = git(root, "rev-parse", "--verify", "-q", `${sha}^{commit}`).stdout.trim();
  if (!commit) return `Fixed by: ${sha} does not resolve to a commit`;
  const parent = git(root, "rev-parse", "--verify", "-q", `${commit}^`).stdout.trim(), after = requirementSet(root, commit), before = parent ? requirementSet(root, parent).texts : new Map();
  const changed = [...after.agreed].find((r) => after.texts.get(r)?.digest !== before.get(r)?.digest);
  if (changed) return `Fixed by: ${sha} changes the Agreed requirement ${changed}, so it is a promotion or a next-iteration item, not a fix`;
  const latest = history(root, req).at(-1);
  if (!latest || latest.result !== "pass" || git(root, "merge-base", "--is-ancestor", commit, latest.commit).status !== 0) return `${req} has no passing evidence at or after ${sha}`;
  return null;
}
function history(root, req) {
  const dir = join(root, ".cairn", "evidence", req);
  const legacy = list(dir).filter((n) => RECEIPT_NAME.test(n)).map((n) => {
    const p = join(dir, n), path = rel(root, p);
    try {
      if (!lstatSync(p).isFile()) return { path, error: "receipt is not a regular file" };
      const text = read(p), f = fields(text);
      return { ...f, path, receipt_digest: sha(text), error: receiptError(f, req) };
    } catch (e) { return { path, error: `cannot read receipt: ${e.code ?? e.message}` }; }
  });
  const runs = [];
  for (const r of runReceipts(root)) {
    if (r.error) { runs.push({ path: r.path, error: r.error }); continue; }
    for (const line of r.f.results) {
      const t = String(line).trim().split(/\s+/);
      if (t[0] !== req) continue;
      const { results, ...shared } = r.f;
      const e = { ...shared, requirement: t[0], result: t[1], source: t[2], requirement_digest: t[3], sequence: t[4], history_digest: t[5], path: r.path, receipt_digest: r.receipt_digest };
      e.error = t.length !== 6 ? `result line for ${req} must have six tokens: requirement, result, source, requirement_digest, sequence, history_digest` : receiptError(e, req);
      runs.push(e);
    }
  }
  return [...legacy, ...runs].sort((a, b) => (Number(a.sequence) || 0) - (Number(b.sequence) || 0) || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
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
// The review is not the builder's alone: an independent report, committed, for this commitment, naming the review's commit, every finding carried by its commit and number (LOOP-020).
function independentGap(root, slug, rv) {
  const name = `.cairn/reviews/${slug}.independent.md`, own = `.cairn/reviews/${slug}.md`;
  const committed = (p) => { const r = git(root, "show", `HEAD:./${p}`); return r.status === 0 ? r.stdout.replace(/\r\n/g, "\n") : null; };
  const again = (why) => ({ verdict: "Resolvable", action: `review ${slug}`, why: `the review is current, and ${why}; start a new reviewer with none of the build's context, give it the commitment, its requirement texts and the commit range, and tell it the record form: commitment:, commit:, examined: and findings: at the top, one - entry per line, every finding in the findings: list and none under a heading. Commit its report at ${name}; never edit a reviewer's report to fit (LOOP-020)` });
  const repair = (why, fix) => ({ verdict: "Resolvable", action: `repair ${name}`, why: `${why}; keep the reviewer's own words: ${fix ?? "give a finding its own - entry, put a heading above prose that follows the findings, or ask the reviewer again"} (LOOP-020)` });
  const loose = dirtyInputs(root, [own, name]);   // the review or the report on disk differs from HEAD: commit it before either is judged
  if (loose.length) return { verdict: "Resolvable", action: `commit ${loose[0]}`, why: `${loose[0]} differs from its committed version; ${existsSync(join(root, loose[0])) ? "commit it" : "restore it from HEAD, or commit its deletion and start a new reviewer"}, so the review and its independent report are judged in one state (LOOP-020)` };
  const text = committed(name);
  if (text === null) return again(`no independent report is committed at ${name}`);
  const f = recordFields(text);
  const commitOf = (v) => { const s = String(v ?? "").trim().toLowerCase(); return /^[0-9a-f]{7,64}$/.test(s) ? git(root, "rev-parse", "--verify", "-q", `${s}^{commit}`).stdout.trim() : ""; };
  const at = commitOf(rv.commit);
  // Fields the header never reached: the report is honest and repairable (LOOP-020, LOOP-108).
  const whole = withoutFences(text).join("\n"), says = (k, s) => new RegExp(`^${k}:`, "m").test(s);   // the field exactly as the kernel reads it; another spelling is named as one
  const top = headerOf(whole);
  const early = { examined: listOf(text, "examined"), findings: listOf(text, "findings") };   // what the lists hold, to say which field the record is short of
  const wanted = ["commitment", "commit", "examined", "findings"].filter((k) => k === "examined" ? !early.examined.entries.length : k === "findings" ? early.findings.missing : f[k] === undefined);
  const hidden = wanted.filter((k) => says(k, whole) && !says(k, top));   // named in the record, but below its first heading
  const blocked = ["commitment", "commit"].filter((k) => f[k] === undefined && says(k, top));   // a scalar field in the header, yet unread; the lists have their own messages
  const spelled = wanted.filter((k) => !says(k, top) && new RegExp(`^${k}[ \t]*:`, "im").test(top));
  if (hidden.length || blocked.length || spelled.length) {
    const all = fields(whole), named = String(all.commitment ?? "").trim(), mine = commitOf(all.commit);   // its identity, wherever the fields sit: a report for another commitment or commit is replaced, not repaired
    if (named && named !== slug) return again(`${name} names commitment ${named}, not ${slug}`);
    if (mine && mine !== at) return again(`${name} names commit ${all.commit} and the review names ${rv.commit}; they must name the same commit, and a review redone at a later commit needs a new report there`);
    const why = hidden.length ? `names ${hidden.join(" and ")} below a heading, where the header ends: a record may open with one title, and the next heading ends its header`
      : blocked.length ? `does not read ${blocked.map((k) => `${k}:`).join(" and ")}, although the ${blocked.length > 1 ? "lines are" : "line is"} there, because a line above ${blocked.length > 1 ? "them" : "it"} is neither a field nor a heading`
      : `spells ${spelled.map((k) => `${k}:`).join(" and ")} another way`;
    return repair(`${name} ${why}`, spelled.length ? "write each field name in lower case, with no space before the colon, and change none of the reviewer's words" : "keep the record's fields at the top, each on its own line, put prose after a heading, and change none of the reviewer's words");
  }
  // A header short of its commitment: line is repaired, not discarded: the line is the
  // record's own. A report for another commit is replaced first, so no repair is asked
  // for a record that is then thrown away (LOOP-020).
  // What the record is short of, said once: a line the agent may add is a repair, and a
  // field only the reviewer can write is a new report. A repair that the next wake would
  // refuse is never named (LOOP-020).
  const lacking = ["commitment", "commit", "examined", "findings"].filter((k) => k === "examined" ? !early.examined.entries.length : k === "findings" ? early.findings.missing : f[k] === undefined);
  const empty = lacking.filter((k) => k === "examined" && !early.examined.missing);
  if (!text.trim()) return again(`${name} is empty`);
  if (lacking.length > 1 && lacking.includes("commit")) {
    const absent = lacking.filter((k) => !empty.includes(k));
    return again(`${name} carries no ${absent.map((k) => `${k}:`).join(" or ")} line${empty.length ? `, and ${empty.map((k) => `${k}:`).join(" and ")} is there and holds no entry` : ""}`);
  }
  if (f.commitment === undefined) {
    const mine = commitOf(f.commit);
    if (mine && mine !== at) return again(`${name} names commit ${f.commit} and the review names ${rv.commit}; they must name the same commit, and a review redone at a later commit needs a new report there`);
    const also = lacking.filter((k) => k !== "commitment");
    return repair(`${name} carries no ${["commitment", ...also].map((k) => `${k}:`).join(" or ")} line`, `add "commitment: ${slug}" above its fields${also.includes("findings") ? ', and "findings: []" when the reviewer found none' : ""}, and change none of the reviewer's words`);
  }
  if (String(f.commitment ?? "").trim() !== slug && String(f.commitment ?? "").trim().startsWith(slug)) return repair(`${name} reads its commitment as ${displayPath(String(f.commitment).trim())}, because the line below it joined the field`, "keep each field on its own line, with prose after a heading, and change none of the reviewer's words");
  if (String(f.commitment ?? "").trim() !== slug) return again(`${name} names commitment ${f.commitment || "none"}, not ${slug}`);
  const first = String(f.commit ?? "").trim().split(/\s+/)[0];
  if (!commitOf(f.commit) && commitOf(first) === at) return repair(`${name} reads its commit: as ${displayPath(String(f.commit).trim())}, because the line carries more than the commit`, "keep only the commit on its commit: line, and change none of the reviewer's words");
  if (!commitOf(f.commit)) return again(`${name} names ${f.commit || "no commit"}, which is not a commit`);
  if (commitOf(f.commit) !== at) return again(`${name} names commit ${f.commit} and the review names ${rv.commit}; they must name the same commit, and a review redone at a later commit needs a new report there`);
  const seen = listOf(text, "examined"), examined = seen.entries.map(String);
  const asEntry = "write each as a - entry under examined:, and change none of the reviewer's words";
  if (!examined.length) return repair(`${name} needs a nonempty examined: list${seen.unread ? `; this line is not an entry: ${displayPath(seen.unread)}` : ""}`, asEntry);
  if (seen.unread) return repair(`${name} examined: holds a line the loop cannot read as an entry: ${displayPath(seen.unread)}${seen.dropped ? ", and the entries after it are unread" : ""}`, entryFix(seen.unread, text) ?? asEntry);
  // A reviewer names the commit it examined; a report written for an earlier review cannot (LOOP-020).
  if (!text.replace(/^commit:[^\n]*\n/gm, "").toLowerCase().includes(at.slice(0, 7))) return again(`${name} does not name commit ${at.slice(0, 7)} anywhere but its commit: line, so it was not written for this review; ask the reviewer to name the commit it examined, in its examined: list`);
  const list = listOf(text, "findings");
  // A heading that names findings cannot be repaired without retitling the reviewer's
  // own section, which this gate forbids: the answer is a report written again (LOOP-020).
  if (list.heading === "named") return again(`${name} writes the heading ${displayPath(list.named)}, whose title names findings, where the loop reads no finding, and retitling it would change the reviewer's words`);
  const wrong = list.missing ? "needs findings: as a list of - entries, or findings: [] for none, above any heading"
    : list.unread ? `findings: holds a line the loop cannot read as an entry: ${displayPath(list.unread)}${list.dropped ? ", and the entries after it are unread" : ""}`
    : list.stray ? `says ${displayPath(list.stray.trim())} above the findings: list, where the loop does not read it`
    : list.heading === "named" ? `writes the heading ${displayPath(list.named)}, whose title names findings, where the loop reads no finding; every finding belongs in the findings: list above the first heading`
    : list.heading === "undeclared" ? "names findings: with no entries above a list the loop does not read; write findings: [] when there are none, or move the findings into the findings: list"
    : list.heading ? "says open: or resolved: under a heading, where the loop does not read it, and every finding belongs in the findings: list above the first heading. The loop hides an example only inside a fence"
    : !list.empty && list.value ? `findings: ${displayPath(list.value)} is not a list` : null;
  const advice = list.stray ? "move that line into the findings: list, keeping its words" : list.missing ? `add "findings: []" when the reviewer found none, and change none of the reviewer's words` : list.unread ? entryFix(list.unread, text)
    : list.heading ? "ask the reviewer for a report that lists every finding under findings:, and quotes an example of the shape inside a fence" : null;
  if (wrong) return repair(`${name} ${wrong}`, advice);
  const norm = (s) => String(s).replace(/^(?:open|resolved):\s*/i, "").replace(/\s+/g, " ").trim();
  const report = list.entries.map(norm);
  if (report.some((x) => !x)) return repair(`${name} has an empty finding`);
  // Each finding n is carried by the one review line that cites (independent <report commit> n) and nothing else, and begins with its words (LOOP-020).
  const reviewText = committed(own) ?? "", short = at.slice(0, 7), mark = (n) => `(independent ${short} ${n})`;
  // Only the citations that end a line carry; a citation inside a finding's own words is words (LOOP-020).
  const lines = listOf(reviewText, "findings").entries.map(String), cite = /\(independent ([0-9a-f]{7,40})\s+(\d+)\)/gi, tail = (l) => l.match(/(?:\s*\(independent [0-9a-f]{7,40}\s+\d+\))+\s*$/i)?.[0] ?? "";
  const pairs = (l) => new Set([...tail(l).matchAll(cite)].map((m) => `${m[1].toLowerCase().slice(0, 7)} ${Number(m[2])}`));
  const missed = [];
  for (const [i, words] of report.entries()) {
    const n = i + 1, key = `${short} ${n}`, hits = lines.filter((l) => pairs(l).has(key)), stem = words.toLowerCase().replace(/[.!?;:,]+$/, "");
    const anywhere = lines.some((l) => [...l.matchAll(cite)].some((m) => `${m[1].toLowerCase().slice(0, 7)} ${Number(m[2])}` === key));
    // Its words first, so a citation the finding itself quotes is words; the carrying citation ends what follows them.
    const text = hits.length === 1 ? norm(hits[0]) : "", rest = text.toLowerCase().startsWith(stem) ? text.slice(stem.length) : null;
    const why = !hits.length ? (anywhere ? `a review line cites ${mark(n)} but does not end with it; put the citation last on its line, and keep notes out of the findings list, since a line indented under a finding joins it` : `no review line cites ${mark(n)}`) : hits.length > 1 ? `${hits.length} review lines cite ${mark(n)}` : rest === null ? "its review line does not begin with its words" : [...pairs(rest)].filter((k) => k.startsWith(`${short} `)).length > 1 ? "its review line cites another finding of this report too" : null;
    if (why) missed.push({ n, why, words });
  }
  // Every uncarried finding at once: a reviewer's findings cost one message, not one wake each (LOOP-020).
  if (missed.length) {
    const ns = missed.map((m) => m.n), names = ns.length > 1 ? `${ns.slice(0, -1).join(", ")} and ${ns.at(-1)}` : String(ns[0]);
    const said = missed.length === 1 ? `finding ${names} is not carried: ${missed[0].why}: ${missed[0].words}` : `findings ${names} are not carried: ${missed.map((m) => `${m.n}, ${m.why}: ${m.words}`).join("; ")}`;
    return { verdict: "Resolvable", action: `review ${slug}`, why: `the review is current, but the independent report's ${said}; carry each finding n on its own line as open: <its words> ${mark("n")} or resolved: <its words>, and how ${mark("n")}, with the citation last (LOOP-020)` };
  }
  // A citation is a claim that the reviewer reported it: a number the report does not have claims support it never gave (LOOP-020).
  const cited = lines.flatMap((l) => [...pairs(l)]).filter((k) => k.startsWith(`${short} `)).map((k) => Number(k.slice(short.length + 1)));
  const beyond = cited.find((n) => n < 1 || n > report.length);
  if (beyond !== undefined) return { verdict: "Resolvable", action: `review ${slug}`, why: `the review cites ${mark(beyond)}, and the report holds ${report.length} finding${report.length === 1 ? "" : "s"}; cite only the findings the report made, and write your own findings on their own lines with no citation (LOOP-020)` };
  return null;
}
// A record's list, read from its text: the entries under key:, which end at the next
// field, the first heading, or the record's end. Any bullet or number is an entry; a line
// indented under one joins it, and so does a bullet nested beneath it unless it reads as a
// finding. Blank lines are nothing, and every other line inside the list is named.
const ENTRY = /^([ \t]*)(?:[-*+]|\d+[.)])[ \t]+(\S[\s\S]*)$/, FINDING = /^(?:open|resolved):/i;
const CLAIM = /^(?:open|resolved)[ \t]*:/i;
// What a line says, not how it is marked up: everything before the first letter is markup
// -- quote markers, hashes, list markers, brackets, a task box, a quotation mark, an emoji,
// a footnote marker -- as are emphasis and tags round the word. A row is read cell by cell,
// wherever its pipes sit, and a space may stand before the colon (LOOP-086).
const MARK = /^(?:[^A-Za-z([]+|\[[ xX]?\]|\[\^[^\]]*\][ \t]*:?|\(?(?:[a-zA-Z]|[ivxlcdmIVXLCDM]+)[.)]|[([])/;   // one unit of markup, letters and all
const bare = (c) => { let t = String(c).replace(/<!--|-->/g, " ").replace(/<[^>]*>/g, " ").replace(/[*_~`]/g, ""), was; do { was = t; t = t.replace(MARK, ""); } while (t !== was); return t; };
const saysFinding = (l) => (String(l).includes("|") ? String(l).split("|") : [String(l)]).some((c) => CLAIM.test(bare(c)) || CLAIM.test(bare(String(c).replace(/^[A-Za-z][\w -]*:/, ""))))
const ATX = /^ {0,3}#/, SETEXT = /^ {0,3}(?:=+|-{2,})[ \t]*$/, OWN = /^[ \t]*(?:commitment|commit|examined|findings|reviewer)[ \t]*:/i;   // the record's own fields, which a heading's underline never belongs to
function headerOf(whole) {   // the record above its first heading, of either form (LOOP-108)
  const lines = whole.split("\n");
  let title = true;   // one leading title, hashed at any level or underlined, is the record's own
  for (let i = 0; i < lines.length; i++) {
    if (ATX.test(lines[i])) { if (title) { title = false; continue; } return lines.slice(0, i).join("\n"); }
    // An underline makes a heading of the line above, unless that line is an entry or a field (LOOP-108).
    const under = i && SETEXT.test(lines[i]) && lines[i - 1].trim() && !/^[ \t]/.test(lines[i - 1]) && !ENTRY.test(lines[i - 1]) && !OWN.test(lines[i - 1]);
    if (under) { if (title) { title = false; continue; } return lines.slice(0, i - 1).join("\n"); }
    if (lines[i].trim() && !(i + 1 < lines.length && SETEXT.test(lines[i + 1]))) title = false;   // a line an underline follows may yet be that title
  }
  return whole;
}
// A line inside a list that names a field: the fields are out of order, or the line is a stray the writer must bullet or remove (LOOP-108).
const entryFix = (unread, text) => {
  const u = String(unread ?? "");
  if (saysFinding(u)) return "move it into the findings: list, and change none of the reviewer's words";
  if (/^(?:examined|findings):/i.test(u)) {
    const e = String(text).search(/^examined:/m), f = String(text).search(/^findings:/m);
    return e >= 0 && f >= 0 && f < e ? "write examined: above findings:, both above the first heading"
      : "write that line as a - entry or take it out of the list; the fields are examined: then findings:, each named once";
  }
  return /^[A-Za-z][\w -]*:/.test(u.trim()) ? "move that field above examined:, and change none of the reviewer's words" : null;
};
function listOf(text, key) {
  const whole = withoutFences(String(text ?? "")).join("\n"), head = headerOf(whole);
  const m = new RegExp(`^${key}:[ \\t]*(.*)$`, "m").exec(head);
  if (!m) return { missing: true, entries: [] };
  const value = m[1].trim(), empty = value === "[]", entries = value && !empty ? [value] : [];
  let indent = null, blank = false, unread = null, dropped = false;
  for (const line of head.slice(m.index + m[0].length).split("\n")) {
    if (!line.trim()) { blank = true; continue; }
    if (SETEXT.test(line) && !/^[ \t]/.test(line)) continue;   // a rule at the margin separates, as it does in the header (LOOP-108)
    if (key === "examined" && /^findings:/.test(line)) break;   // the field as the kernel reads it, however it is spaced: a Findings: line is named, never a silent end (LOOP-086)
    const item = ENTRY.exec(line), deep = item && indent !== null && item[1].length > indent;
    const claims = item && saysFinding(item[2]);   // examined: never holds a finding, at any indent (LOOP-086)
    if (item && !(claims && (deep || key === "examined")) && !empty) {
      if (unread) { dropped = true; continue; }
      if (deep && entries.length) entries[entries.length - 1] += ` ${item[2].trim()}`;
      else { if (indent === null) indent = item[1].length; entries.push(item[2].trim()); }
      blank = false; continue;
    }
    if (!item && !unread && /^[ \t]+\S/.test(line) && entries.length && !saysFinding(line)) { entries[entries.length - 1] += ` ${line.trim()}`; blank = false; continue; }   // a blank line before it is nothing (LOOP-086)
    if (unread) { dropped = dropped || !!item; continue; }
    unread = item ? item[2].trim() : line.trim();
  }
  // A list under a heading: a finding there, or the record's only list, is not prose (LOOP-071 keeps a resolved decoy beside a real list unread).
  const rest = key !== "findings" ? "" : whole.slice(head.length);
  const body = rest.split("\n"), below = body.map((l) => ENTRY.exec(l)?.[2].trim()).filter(Boolean);   // one bullet per line: ENTRY's tail matches across lines (LOOP-086)
  const above = head.slice(0, m.index).split("\n");   // the header above the list: a finding there was read as an unknown field
  const stray = above.find(saysFinding) ?? null, claimed = body.some(saysFinding) || !!stray;   // a line that says open: is a finding wherever it sits
  // The body's sections, each under its own heading, hashed or underlined: what a
  // heading holds is read against that heading's own title, never another's (LOOP-086).
  const lines = rest.split("\n"), sections = [];
  for (let i = 0; i < lines.length; i++) {
    const hashed = /^ {0,3}(#{1,6})[ \t]*(.+?)[ \t]*#*[ \t]*$/.exec(lines[i]);   // a closing run of hashes is not part of the title
    const under = i + 1 < lines.length && SETEXT.test(lines[i + 1]) && lines[i].trim() && !/^[ \t]/.test(lines[i]) && !ENTRY.test(lines[i]);
    if (hashed || under) { sections.push({ title: (hashed ? hashed[2] : lines[i]).trim(), level: hashed ? hashed[1].length : /^ {0,3}=/.test(lines[i + 1]) ? 1 : 2, at: i, body: [] }); if (under) i++; continue; }
    if (sections.length) sections[sections.length - 1].body.push(lines[i]);
  }
  // A section holds its subsections: what sits under a deeper heading sits under this one (LOOP-086).
  for (const [k, sec] of sections.entries()) {
    const next = sections.slice(k + 1).find((t) => t.level <= sec.level);
    sec.span = lines.slice(sec.at + 1, next ? next.at : lines.length);
  }
  // Such a heading holds nothing at all, and the title is not narrowed to its first word:
  // no rule tells "More findings" from a section about them, so the loop refuses in the open.
  const hits = sections.filter((s) => /\bfindings?\b/i.test(s.title));
  // Beside a list that holds entries such a section is elaboration and may hold prose.
  const content = (l) => ENTRY.test(l) || saysFinding(l) || l.includes("|");   // a list, a claim or a table row there could be a finding the list never declared
  const named = entries.length ? hits.find((s) => s.span.some(content)) : hits[0];
  const heading = claimed ? "shaped" : named ? "named" : (!entries.length && !empty && !!below.length) ? "undeclared" : "";
  return { entries, empty, value: empty ? null : value || null, dropped, heading, named: named?.title ?? null, unread, stray };
}
function reviewOf(root, slug) {
  const p = join(root, ".cairn", "reviews", `${slug}.md`);
  if (!existsSync(p)) return null;
  const text = read(p), f = recordFields(text);
  // The header the gate reads: commit, a nonempty examined list, a findings list (LOOP-108).
  const ex = listOf(text, "examined"), fin = listOf(text, "findings");
  // A field the header never reached, and a value the line below it joined, are named as such, as they are in a report (LOOP-108).
  const body = withoutFences(text).join("\n"), head = headerOf(body), says = (k, s) => new RegExp(`^${k}:`, "m").test(s);   // the field exactly as the kernel reads it; another spelling is named as one
  // Only a field the gate lacks is named, and only the record's own margin counts: a body line or an indented note decides nothing (LOOP-071).
  const lacks = { commit: f.commit === undefined, examined: ex.missing, findings: fin.missing };
  const below = Object.keys(lacks).filter((k) => lacks[k] && says(k, body) && !says(k, head));
  const stopped = ["commit"].filter((k) => lacks[k] && says(k, head));   // in the header, yet unread: a line above it is neither a field nor a heading
  const spelled = Object.keys(lacks).filter((k) => lacks[k] && !says(k, head) && new RegExp(`^${k}[ \t]*:`, "im").test(head));   // written in another case, or with a space before the colon
  const value = String(f.commit ?? "").trim();
  const hasOpen = fin.entries.some((x) => /^open:\s*\S/.test(x));   // an open finding the loop did read is named first, then the line it could not read
  const unrecognized = fin.entries.findIndex((x) => !/^(?:open|resolved):\s*\S/.test(x));   // an entry the gate cannot classify is named before anything the reader could not read
  const missing = stopped.length ? `it does not read ${stopped.map((k) => `${k}:`).join(" and ")}, although the ${stopped.length > 1 ? "lines are" : "line is"} there, because a line above ${stopped.length > 1 ? "them" : "it"} is neither a field nor a heading; keep the record's fields at the top, each on its own line, and put prose after a heading`
    : spelled.length ? `it spells ${spelled.map((k) => `${k}:`).join(" and ")} another way; write each field name in lower case, with no space before the colon`
    : below.length ? `it names ${below.join(" and ")} below a heading, where the header ends; move the record's fields to the top, each on its own line, above any heading or prose`
    : value && /\s/.test(value) ? `it reads its commit: as ${displayPath(value)}, because that line carries more than the commit, or the line below it joined the field; keep only the commit on it, with prose after a heading`
    : !f.commit ? "commit: names the commit the review examined"
    : ex.missing || !ex.entries.length ? `examined: needs a nonempty list of what the review examined${ex.unread ? `; this line is not an entry: ${displayPath(ex.unread)}` : ""} (LOOP-020)`
    : ex.unread ? `examined: holds a line the loop cannot read as an entry: ${displayPath(ex.unread)}${ex.dropped ? ", and the entries after it are unread" : ""}; ${entryFix(ex.unread, text) ?? "write each as a - entry"} (LOOP-020)`
    : fin.missing ? "findings: is missing; write findings: [] when there are none (LOOP-086)"
    : unrecognized >= 0 || hasOpen ? null
    : fin.unread ? `findings: holds a line the loop cannot read as an entry: ${displayPath(fin.unread)}${fin.dropped ? ", and the entries after it are unread" : ""}; ${entryFix(fin.unread, text) ?? "write each finding as a - entry, and put prose after a heading"} (LOOP-086)`
    : fin.stray ? `says ${displayPath(fin.stray.trim())} above the findings: list, where the loop does not read it; move that line into the findings: list (LOOP-086)`
    : fin.heading === "named" ? `the heading ${displayPath(fin.named)} names findings in its title, where the loop reads no finding; keep every finding in the header's list, and title a section of notes something else (LOOP-086)`
    : fin.heading === "undeclared" ? "findings: names no entries above a list the loop does not read; write findings: [] when there are none, or move the findings into the list (LOOP-086)"
    : fin.heading ? "a finding sits under a heading, where the loop does not read it; keep the findings in the header's list. If those lines are notes, reword a note that begins open: or resolved:, and put an example inside a fence (LOOP-086)"
    : !fin.empty && fin.value ? `findings: ${displayPath(fin.value)} is not a list; write each finding as a - entry, or findings: [] for none (LOOP-086)` : null;
  if (missing) return { commit: f.commit ?? null, open: [], repair: { verdict: "Resolvable", action: `repair ${rel(root, p)}`, why: `${missing}${headerOf(withoutFences(text).join("\n")).length < text.trimEnd().length && /^(?:examined|findings):/m.test(text.slice(headerOf(withoutFences(text).join("\n")).length)) ? "; the fields sit under a heading and the header ends at the first heading, hashed or underlined" : ""}${/\(LOOP-\d+\)\s*$/.test(missing) ? "" : " (LOOP-108)"}` } };
  const findings = fin.entries;
  const invalid = findings.findIndex((x) => !/^(?:open|resolved):\s*\S/.test(x));
  const malformed = invalid >= 0 ? `finding ${invalid + 1} is unrecognized: ${displayPath(findings[invalid])}` : null;
  const open = findings.filter((x) => /^open:/.test(x));
  const repair = malformed ? { verdict: "Resolvable", action: `repair ${rel(root, p)}`,
    why: `${malformed}; use list entries 'open: <description>' or 'resolved: <description>' with a nonempty description, or write findings: [] when there are none (LOOP-086). Preserve unresolved issues as open findings.` } : null;
  return { commit: f.commit ?? null, open, repair };
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
// A requirement's standings, one per mechanism that speaks for it, from
// facts on disk. With several mechanisms each is assessed over its own
// records; with one, over the whole history (LOOP-056, LOOP-100).
const ownRecords = (h, names, name) => names.length > 1 ? h.filter((e) => e.mechanism === name) : h;
function assess(root, req, mechs, ctx) {
  const names = mechs.byReq.get(req) ?? [], h = history(root, req);
  const repair = historyRepair(h);
  if (repair) return [{ req, mech: names[0] ?? null, repair }];
  const orderError = historyOrderError(h);
  return (names.length ? names : [null]).map((name) => standing(root, req, name ? mechs.byName.get(name) : null, ownRecords(h, names, name), orderError, ctx));
}
function standing(root, req, m, h, orderError, ctx) {
  const name = m?.name ?? null;
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
  const revision = requirementChange(root, req, m, latest, ctx, h);
  const inputsChanged = !!m && !!latest && latest.inputs_digest !== ctx.digests.get(name);
  let stale = null;
  if (m && latest) {
    const reasons = [];
    if (orderError) reasons.push(orderError);
    if (revision.changed) reasons.push(revision.reason);
    if (latest.mechanism_digest !== m.digest) reasons.push("the mechanism changed");
    if (latest.kernel_digest !== KERNEL_DIGEST) reasons.push("the kernel changed");
    if (inputsChanged) reasons.push("a declared input changed");
    reasons.push(...retentionReasons(root, latest.commit, ctx));
    const damaged = evidenceError(root, latest, ctx.outputs);
    if (damaged) reasons.push(`receipt ${latest.path}: ${damaged}; rerun the check to replace this evidence (LOOP-065)`);
    stale = reasons.length ? reasons.join(" and ") : null;
  }
  return { req, mech: name, latest, everPassed, threeFails, escalatedSince, stuck, stale, revision, inputsChanged };
}

const wake = (root) => withAnswer(root, wakeVerdict(root));
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
// A stop the hook let through without progress is the next session's first business (PKG-043, LOOP-139).
function stopVerdict(root) {
  const names = list(join(root, ".cairn", "stops")).filter((n) => n.endsWith(".md"));
  if (!names.length) return null;
  const loose = dirtyInputs(root, [".cairn/stops"]), path = (n) => `.cairn/stops/${n}`;
  const n = names.find((x) => !("Explanation" in fields(read(join(root, path(x))))) || loose.some((p) => p === path(x) || (p.endsWith("/") && path(x).startsWith(p))));
  return n ? { verdict: "Resolvable", action: `explain ${path(n)}`, why: "the stop hook let a stop through after three refusals with no progress; add an Explanation: line saying why the agent stopped, and commit the record (PKG-043, LOOP-139)" } : null;
}
// A project that forbids AI attribution rewords a commit before it leaves the machine (PKG-045).
const AI = "(?:claude|anthropic|codex|openai|copilot|gemini)";
const ATTRIBUTION = new RegExp(`^(?:co-authored-by:[^\\n]*\\b${AI}\\b|claude-session:|[^\\n]*generated with[^\\n]*\\b${AI}\\b)`, "im");
function attributionVerdict(root) {
  const p = join(root, ".cairn", "policy");
  if (!existsSync(p) || String(fields(read(p)).attribution ?? "").trim() !== "forbidden") return null;
  const r = git(root, "log", "--reverse", "--format=%H%x00%B%x01", "HEAD", "--not", "--remotes");
  const hit = r.status !== 0 ? null : r.stdout.split("\x01").map((s) => s.replace(/^\n/, "").split("\0")).find(([sha, body]) => sha && ATTRIBUTION.test(body ?? ""));
  return hit ? { verdict: "Resolvable", action: `reword ${hit[0]}`, why: ".cairn/policy forbids AI attribution, and this commit, on no remote-tracking branch, carries an attribution line; rewrite its message without it, then wake (PKG-045)" } : null;
}
function wakeVerdict(root) {
  const owner = checkOwner(root);
  if (owner) return owner;
  const stopped = stopVerdict(root);
  if (stopped) return stopped;
  const attributed = attributionVerdict(root);
  if (attributed) return attributed;
  const ip = join(root, ".cairn", "in-progress");
  const pending = reconcile(root, ip);
  if (pending) return pending;
  const [esc] = openEscalations(root);
  if (esc?.turn === "agent") return { verdict: "Resolvable", action: `reply ${esc.name}`, why: `the developer asks: ${esc.last.text.slice(4)}; explain with cairn answer ${esc.name} "<explanation>"; this question authorizes no implementation` };
  if (esc) return { verdict: "Escalate", action: `present ${esc.name}`, why: `.cairn/escalations/${esc.name}.md awaits the developer${esc.last?.kind === "Reply" ? `; agent replied: ${esc.last.text}` : ""}` };
  const dec = decisionVerdict(root);
  if (dec) return dec;
  const c = currentCommitment(root);
  if (c.repair) return { verdict: "Resolvable", action: `repair ${c.repair}`, why: c.why };
  const mechs = mechanisms(root);
  const problem = declarationError(root, mechs);
  if (problem) return problem;
  const { agreed, inherited, texts, promotions } = requirementSet(root);
  const unknown = c.requirements.find((r) => !agreed.has(r));
  if (unknown) return { verdict: "Resolvable", action: `repair docs/commitments/${c.slug}.md`, why: `${unknown} is not an Agreed requirement in docs/spec/ (LOOP-029)` };
  // A decision marker, by promotion or by deference, resolves to its record (LOOP-088, SPEC-002).
  const marked = c.requirements.find((r) => promotions.has(r) && !existsSync(join(root, "docs", "decisions", `${promotions.get(r).slug}.md`)));
  if (marked) { const { kind, slug } = promotions.get(marked); return { verdict: "Resolvable", action: `repair ${texts.get(marked).path}`, why: `${marked} is Agreed by ${kind} ${slug} and docs/decisions/${slug}.md does not exist; record the decision or restore the developer's confirmation (LOOP-088, SPEC-002)` }; }
  // A promotion is a Consequential record, so the developer reviews it in the queue (LOOP-088).
  const named = c.promoted ? decisions(root).filter((d) => d.Promotes && item(d.Promotes) === c.promoted) : [], promo = named.filter((d) => d.Level === "Consequential");
  if (c.promoted && !promo.length) return { verdict: "Resolvable", action: `repair docs/commitments/${c.slug}.md`, why: named.length ? `Promoted from: ${c.promoted}, and ${named[0].slug} records the promotion at ${named[0].Level}; a promotion is Consequential, so the developer reviews it: record it again with cairn decide --promotes ${c.promoted} --level Consequential (LOOP-088)` : `Promoted from: ${c.promoted} and no decision record under docs/decisions/ carries Promotes: ${c.promoted}; record the promotion with cairn decide --promotes ${c.promoted} (LOOP-088, LOOP-115)` };
  // A reversed promotion: every record that promoted the item is superseded (LOOP-123).
  if (promo.length && promo.every((d) => "Superseded by" in d)) return { verdict: "Resolvable", action: `repair docs/commitments/${c.slug}.md`, why: `Promoted from: ${c.promoted}, and ${promo[0].slug}, the decision that promoted it, is superseded by ${promo[0]["Superseded by"]}: the promotion was reversed; return the item to the backlog and move the roadmap's Current: line off this commitment, or record the promotion again with cairn decide --promotes ${c.promoted} (LOOP-088, LOOP-123)` };
  // A commitment specified from a next-iteration item stamps the item, so wake stops counting it as waiting (SPEC-027).
  const unstamped = (c.specified ?? "").split(/[\s,]+/).filter(Boolean).find((s) => { const p = join(root, ".cairn", "next-iteration", `${s}.md`); return existsSync(p) && !("Promoted to" in fields(read(p))); });
  if (unstamped) return { verdict: "Resolvable", action: `repair .cairn/next-iteration/${unstamped}.md`, why: `docs/commitments/${c.slug}.md is specified from it and it carries no Promoted to: line; add the line Promoted to: ${c.slug} (SPEC-027)` };
  fold(c, inherited);
  const invalid = c.requirements.flatMap((r) => mechs.byReq.get(r) ?? []).map((n) => mechs.byName.get(n)).find(modeError);
  if (invalid) return { verdict: "Resolvable", action: `repair .cairn/mechanisms/${invalid.name}`, why: modeError(invalid) };
  // An uncommitted change to a declared input with no write-ahead record: the record comes first (LOOP-022, LOOP-110).
  const footprint = [...new Set(c.requirements.flatMap((r) => mechs.byReq.get(r) ?? []).flatMap((n) => asList(mechs.byName.get(n).def.inputs)))];
  const dirty = footprint.length && !existsSync(ip) ? dirtyInputs(root, footprint, mechs.inputs, true) : [];
  if (dirty.length) return { verdict: "Resolvable", action: `record ${dirty[0]}`, why: `${dirty.length} declared input(s) have uncommitted changes and no .cairn/in-progress record names the action; write the record (action, target, base, started) for the change under way, or commit it (LOOP-022, LOOP-110)` };
  const scope = scopeVerdict(root, c, mechs);
  if (scope) return scope;
  const captured = captureVerdict(root, c) ?? queueVerdict(root, c);
  if (captured) return captured;
  const ctx = context(root, mechs);
  const contract = promotedContractVerdict(root, c, ctx, agreed);
  if (contract) return contract;
  const ambiguous = c.requirements.find((r) => !ctx.requirements.get(r)?.digest);
  if (ambiguous) return { verdict: "Resolvable", action: "repair docs/spec/", why: `${ambiguous} needs exactly one requirement definition` };
  const state = c.requirements.flatMap((r) => assess(root, r, mechs, ctx));
  const first = (pred) => state.find(pred);
  let s;
  if ((s = first((x) => x.repair))) return s.repair;
  if ((s = first((x) => x.mech && x.revision.needsReview))) {
    const verdict = revisionVerdict(s.req, s.mech, s.revision.digest, s.stale);
    verdict.why += explainEvidence(root, s, mechs, ctx);
    return verdict;
  }
  if ((s = first((x) => x.mech && x.threeFails && !x.escalatedSince)))
    return { verdict: "Resolvable", action: `escalate ${s.req}`, why: `three attempts without new passing evidence and no escalation since; a fourth attempt is not the next action (DEC-016)` };
  if ((s = first((x) => x.mech && x.latest?.result === "fail" && x.everPassed && !x.stale)))
    return { verdict: "Resolvable", action: `implement ${s.req}`, why: `regression: latest evidence fails after an earlier pass (${s.mech})` };
  for (const x of state) {
    if (!x.mech) continue;
    if (!x.latest) return { verdict: "Resolvable", action: `run ${x.req}`, why: `mechanism ${x.mech} has produced no evidence for it` };
    if (x.stale) return { verdict: "Resolvable", action: `run ${x.req}`, why: `evidence is stale: ${x.stale} (${x.mech})${explainEvidence(root, x, mechs, ctx)}\n  Next: cairn check ${x.req}` };
    if (x.latest.result !== "pass") return { verdict: "Resolvable", action: `implement ${x.req}`, why: `latest evidence is ${x.latest.result} (${x.mech}, exit ${x.latest.exit})${x.stuck ? "; three runs at one inputs digest and no attempt since: a failure no change inside the footprint can address is an escalation (DEC-019)" : ""}` };
  }
  if ((s = first((x) => !x.mech))) return { verdict: "Resolvable", action: `declare ${s.req}`, why: "no mechanism under .cairn/mechanisms names it (LOOP-106)" };
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
  // Each mechanism's inputs, less the documents its own declaration lists: a change only to those keeps the review fresh (LOOP-141).
  const moved = [...new Set(state.filter((x) => x.mech).map((x) => x.mech))].some((n) => {
    const d = mechs.byName.get(n).def, spec = [...asList(d.inputs), ...asList(d.documents).map((p) => `:(exclude)${p}`)];
    const then = rv.commit ? inputsDigestAt(root, spec, rv.commit) : null;
    return then === null || then !== committedInputsDigest(root, spec, mechs.inputs);
  });
  if (moved) return { verdict: "Resolvable", action: `review ${c.slug}`, why: `the review examined ${rv.commit ?? "?"} and a declared input has changed since; the tree is at ${head} (LOOP-032)` };
  if (rv.open.length) return { verdict: "Resolvable", action: `resolve ${c.slug}`, why: `the review names an open finding: ${rv.open[0].replace(/^open:\s*/, "")} (LOOP-033)` };
  const independent = independentGap(root, c.slug, rv);
  if (independent) return independent;
  // Done only when nothing remains the agent may decide (LOOP-087, LOOP-091).
  const complete = `every requirement in ${c.slug} has current passing evidence, and the review at ${rv.commit} and its independent report are clean`;
  const items = (dir, keep) => files(join(root, ".cairn", dir)).filter((n) => keep(fields(read(join(root, ".cairn", dir, n))))).map((n) => n.replace(/\.md$/, ""));
  // A defect is fixed, not promoted, and before any promotion (LOOP-087, LOOP-140).
  for (const n of items("backlog", (f) => String(f.Defect ?? "").trim() === "yes")) {
    const why = unfixed(root, fields(read(join(root, ".cairn", "backlog", `${n}.md`))));
    if (why) return { verdict: "Resolvable", action: `fix .cairn/backlog/${n}.md`, why: `${complete}; ${why}; write a test that fails, make it pass, commit, check, and add Fixed by: <sha> (LOOP-140)` };
  }
  const candidates = items("backlog", (f) => !("Promoted to" in f) && String(f.Defect ?? "").trim() !== "yes");
  if (candidates.length) return { verdict: "Resolvable", action: "promote", why: `${complete}; the backlog holds ${candidates.length} item(s) to promote: ${candidates.join(", ")}; choose one by judgment, record the promotion decision with --promotes, write its requirement and commitment, and move Current: (LOOP-087)` };
  // Next-iteration is the next feature specification, the developer's to open; Done says how many wait (LOOP-091).
  const waiting = items("next-iteration", (f) => !("Promoted to" in f));
  return { verdict: "Done", action: c.slug, why: `${complete}${waiting.length ? `; ${waiting.length} item(s) wait in next-iteration for the next specification phase: ${waiting.join(", ")}` : ""}` };
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
  const cache = inputCache(), head = headSha(root), dirty = dirtyInputs(root, paths, cache);
  if (dirty.length || head !== expectedHead) return { head, dirty };
  const snapshot = { head, full: git(root, "rev-parse", "HEAD").stdout.trim(), dirty, paths, digest: inputsDigest(root, paths, cache), inputs: inputsDigest(root, inputs, cache), committed: committedInputsDigest(root, paths, cache), details: inputDetails(root, inputs, cache) };   // full: what the receipt records, never ambiguous later (LOOP-136)
  // Git status and clean filters can themselves run local commands. Finish
  // those operations before validating the final HEAD and raw file state.
  const finalDirty = dirtyInputs(root, paths, cache), finalHead = headSha(root);
  if (finalDirty.length || finalHead !== expectedHead) return { head: finalHead, dirty: finalDirty };
  if (inputsDigest(root, paths) !== snapshot.digest) return { head: finalHead, dirty: [] };
  return snapshot;
}

async function check(root, only, stale = false) {
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
    status = await runChecks(root, only, stale);
  } finally {
    if (fd !== undefined) closeSync(fd);
    if (existsSync(path) && readFileSync(path, "utf8") === token) unlinkSync(path);
  }
  if (status !== null) return status;
  const w = wake(root);
  process.stdout.write(`${w.verdict}: ${w.action}\n  ${w.why}\n`);
  return VERDICT[w.verdict];
}

async function runChecks(root, only, stale = false) {
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
  const targets = only.length ? [...only] : [...c.requirements];
  const mechs = mechanisms(root);
  const problem = declarationError(root, mechs);
  if (problem) { process.stdout.write(`${problem.verdict}: ${problem.action}\n  ${problem.why}\n`); return 1; }
  const scope = scopeVerdict(root, c, mechs);
  if (scope) { const w = withAnswer(root, scope); process.stdout.write(`${w.verdict}: ${w.action}\n  ${w.why}\n`); return 1; }
  // Named requirements select which mechanisms run; a run is evidence for
  // every requirement its mechanism speaks for (LOOP-040).
  const runs = new Set();
  // --stale: the requirements wake would name run for, and no other; a
  // fresh failure or an unverified result is an implement action (LOOP-094).
  const waiting = [], held = new Map();
  let repairs = 0;
  if (stale) {
    targets.length = 0;
    const ctx = context(root, mechs);
    for (const x of c.requirements.flatMap((r) => assess(root, r, mechs, ctx))) {
      if (x.repair) { repairs++; continue; }
      if (!x.mech) continue;
      if (x.threeFails && !x.escalatedSince) held.set(x.mech, x.req);   // a fourth attempt is not the next action (DEC-016, LOOP-094)
      else if (!x.latest || x.stale) runs.add(x.mech);
      else if (x.latest.result !== "pass") waiting.push(x);
    }
    for (const [n, req] of held) { runs.delete(n); process.stdout.write(`skipped ${n}: ${req} has three attempts without new passing evidence and no escalation since; escalate ${req} (DEC-016, LOOP-094)\n`); }
  }
  // A named requirement runs every mechanism that speaks for it (LOOP-099).
  for (const r of targets) { const ns = mechs.byReq.get(r) ?? []; if (ns.length) ns.forEach((n) => runs.add(n)); else if (only.length) process.stdout.write(`skipped ${r}: no mechanism claims it\n`); }
  for (const x of waiting) if (!runs.has(x.mech)) process.stdout.write(`skipped ${x.req}: latest evidence is ${x.latest.result} and not stale; implement, then check ${x.req} (LOOP-094)\n`);
  if (stale && !runs.size && !held.size) process.stdout.write(repairs ? `nothing ran: ${repairs} receipt(s) need repair first; see wake (LOOP-094)\n` : "nothing stale: every requirement with a mechanism has current evidence or waits on implementation (LOOP-094)\n");
  const ctx = { requirements: requirementTexts(root), past: new Map(), scope: new Set(c.requirements) };   // the revision gate reads only the commitment's requirements (LOOP-059)
  for (const name of runs) {
    const status = await runMechanism(root, mechs.byName.get(name), ctx, head, mechs);
    if (status !== null) return status;
  }
  return null;
}

async function runMechanism(root, m, ctx, head, mechs) {
  const name = m.name, reqs = asList(m.def.requirements);
  const before = candidate(root, m, ctx.requirements, head), dirty = before.dirty;
  const loose = dirty.length ? dirty.filter((p) => !dirtyInputs(root, [p], undefined, true).length) : [];   // untracked: still no evidence beside them (LOOP-030)
  if (dirty.length) { process.stdout.write(`Resolvable: commit ${dirty[0]}\n  ${name} needs committed inputs, specification, and declaration; uncommitted changes: ${dirty.join(", ")} (LOOP-030); commit them, or write .cairn/in-progress while the work continues (LOOP-110)${loose.length ? `; a file Git does not track can go in .gitignore instead: ${loose.join(", ")}` : ""}\n`); return 1; }
  if (!before.digest) { process.stdout.write(`Resolvable: run ${reqs[0]}\n  candidate changed before ${name}; no evidence recorded\n`); return 1; }
  if (before.committed !== inputsDigestAt(root, before.paths, head)) {
    process.stdout.write(`Resolvable: commit candidate for ${name}\n  inputs do not match the committed candidate at ${head}; inspect Git flags, file modes, and declared paths before rerunning (LOOP-030)\n`);
    return 1;
  }
  for (const req of reqs) {
    if (!ctx.requirements.get(req)?.digest) { process.stdout.write(`Resolvable: repair docs/spec/\n  ${req} needs exactly one requirement definition\n`); return 1; }
    const h = history(root, req), repair = historyRepair(h);
    if (repair) { process.stdout.write(`${repair.verdict}: ${repair.action}\n  ${repair.why}\n`); return 1; }
    const own = ownRecords(h, mechs.byReq.get(req) ?? [], name), revision = requirementChange(root, req, m, own.at(-1), ctx, own);
    if (revision.needsReview && ctx.scope.has(req)) { const w = revisionVerdict(req, name, revision.digest, revision.reason); process.stdout.write(`${w.verdict}: ${w.action}\n  ${w.why}\n`); return 1; }
  }
  // The write-ahead record, unless the agent's own already covers this run.
  const ip = join(root, ".cairn", "in-progress"), mine = !existsSync(ip);
  if (mine) writeFileSync(ip, `owner: kernel\npid: ${process.pid}\naction: run-mechanism\ntarget: ${name}\nbase: ${head}\nstarted: ${new Date().toISOString()}\n`);
  try {
    const cwd = m.def.cwd && m.def.cwd !== "." ? join(root, m.def.cwd) : root;
    const logDir = join(root, ".cairn", "evidence", RUNS);
    mkdirSync(logDir, { recursive: true });
    const stem = join(logDir, `${stamp()}-${process.pid}`), output = stem + ".out", stderrOutput = stem + ".err";
    const r = await capture(m.def.command, cwd, output, stderrOutput, reqs, name);
    const after = candidate(root, m, ctx.requirements, head);
    if (after.digest !== before.digest || after.committed !== before.committed) {
      const retained = `retained output: ${rel(root, output)} and ${rel(root, stderrOutput)}`, own = after.dirty.length && after.dirty.every((p) => p.startsWith(".cairn/evidence/"));
      process.stdout.write(own ? `Resolvable: repair .cairn/mechanisms/${name}\n  an input covers .cairn/evidence/, Cairn's own output, so every run changes the candidate; declare the paths the command reads; ${retained} (LOOP-105, LOOP-126)\n`
        : `Resolvable: ${after.dirty.length ? `commit ${after.dirty[0]}` : `run ${reqs[0]}`}\n  candidate changed during ${name}; no evidence recorded; ${retained} (LOOP-063)\n`);
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
  const exit = r.error ? -1 : r.signal ? `signal ${r.signal}` : r.status ?? -1, lines = r.lines;   // could not start: -1 (LOOP-062)
  const rec = [
    `mechanism: ${m.name}`, `commit: ${before.full}`, `inputs_digest: ${before.inputs}`, `mechanism_digest: ${m.digest}`, `kernel_digest: ${KERNEL_DIGEST}`,
    `inputs_detail: ${rel(root, details)}`,
    `command: ${m.def.command}`, `cwd: ${m.def.cwd ?? "."}`, `exit: ${exit}`, `output_digest: ${fileDigest(output)}`, `output: ${rel(root, output)}`, `stderr_output: ${rel(root, stderrOutput)}`, `stderr_digest: ${fileDigest(stderrOutput)}`,
    `signal: ${r.signal ?? "none"}`, `execution_error: ${JSON.stringify(r.error ? { code: r.error.code ?? null, message: r.error.message } : null)}`,
  ];
  const recorded = new Date().toISOString();
  const perRequirement = m.def.results === "per-requirement" || lines.size > 0;
  // One receipt per run at the run's stem, one result line per requirement (LOOP-097).
  const p = output.replace(/\.out$/, ""), results = [], report = [];
  for (const { req, records } of histories) {
    const result = lines.get(req) ?? (perRequirement ? "unverified" : exit === 0 ? "pass" : "fail"), source = lines.has(req) ? "line" : perRequirement ? "none" : "exit";
    const sequence = Number(records.at(-1)?.sequence ?? 0) + 1;
    results.push(`  - ${req} ${result} ${source} ${requirements.get(req).digest} ${sequence} ${historyDigest(records)}`);
    report.push(`recorded ${rel(root, p)} ${req}: ${result} (${source === "line" ? "by line" : source === "none" ? "not reported" : `exit ${exit}`})\n`);
  }
  writeFileSync(p, `${rec.join("\n")}\nrecorded: ${recorded}\nresults:\n${results.join("\n")}\n`, { flag: "wx" });   // never overwrite (LOOP-025)
  runCache = null;
  for (const line of report) process.stdout.write(line);
  return null;
}

// ------------------------------------------------------------ decide

const LEVELS = ["Judged", "Consequential", "Blocking"];
// Who decided is counted, not read, so the field is a closed vocabulary
// (DEC-020). Writing stores it lowercase; reading normalizes case and
// surrounding whitespace, and names a value outside it rather than
// dropping or guessing it, so drift stays visible (DEC-011).
const DECIDERS = ["developer", "agent", "joint"];
const decider = (v) => {
  const s = asList(v).join(" ").trim().replace(/\s+/g, " ");   // the field reads as a string or as a list (LOOP-124)
  if (!s) return "unrecorded";
  return DECIDERS.includes(s.toLowerCase()) ? s.toLowerCase() : `unrecognized: ${s}`;
};
const CAUSES = ["the stated condition occurred", "an unforeseen condition occurred", "it was wrong when it was made", "the premise was false"];
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function decide(root, o) {
  const need = ["title", "level", "decided-by", "rests-on", "wrong-if", "body"].filter((k) => !o[k]);
  if (need.length) return usage(`decide: missing --${need.join(", --")}`);
  const multiline = Object.keys(o).find((k) => k !== "body" && typeof o[k] === "string" && LINE_BREAK.test(o[k]));
  if (multiline) return usage(`decide: --${multiline} must be one line; put multiline text in --body`);
  if (o.level === "Routine") return usage("decide: a Routine decision produces no record (DEC-001, DEC-003)");
  if (!LEVELS.includes(o.level)) return usage(`decide: --level must be one of ${LEVELS.join(", ")}`);
  const who = decider(o["decided-by"]);   // written through the same normalizer the tally reads with
  if (!DECIDERS.includes(who)) return usage(`decide: --decided-by must be one of ${DECIDERS.join(", ")}; name the person or tool in --body (DEC-020)`);
  if (o.supersedes && !CAUSES.includes(o.cause ?? "")) return usage(`decide: --supersedes needs --cause, one of: ${CAUSES.join("; ")}`);
  const slug = slugify(o.title);
  if (!slug) return usage("decide: the title has no letters or digits to name the record (LOOP-128)");
  if (o.promotes && o.level !== "Consequential") return usage(`decide: a promotion is recorded at Consequential, so the developer reviews it in the queue, not at ${o.level} (LOOP-088)`);
  const path = join(root, "docs", "decisions", `${slug}.md`);
  if (existsSync(path)) return usage(`decide: ${rel(root, path)} exists; supersede it rather than overwrite it`);
  if (o.supersedes && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(o.supersedes)) return usage("decide: --supersedes names a record by its slug: lowercase letters, digits and hyphens (DEC-022)");
  const oldPath = o.supersedes ? join(root, "docs", "decisions", `${o.supersedes}.md`) : null;
  if (oldPath && !existsSync(oldPath)) return usage(`decide: --supersedes names ${o.supersedes}, and no such record exists`);
  const already = oldPath && recordFields(withoutFences(read(oldPath)).join("\n"))["Superseded by"];   // read as the wake reads it: header fields, fences stripped
  if (already) return usage(`decide: ${o.supersedes} is already superseded by ${already}; supersede that record instead, so the chain keeps one link per record (DEC-010, DEC-022)`);
  // DEC-012: in a domain that has seen reversals, the record says what the history changed.
  const ids = [...o["rests-on"].matchAll(/\b([A-Z]+)-\d+\b/g)].map((m) => m[1]);
  const domain = ids.length ? [...new Set(ids)] : ["unspecified"];
  const prior = reversed(root).filter((d) => d.domain.some((x) => domain.includes(x)));
  if (prior.length && !o.history) return usage(`decide: ${domain.join("/")} carries ${prior.length} reversal(s): ${prior.map((d) => d.slug).join(", ")}; pass --history stating what that history changed about the level (DEC-012)`);
  const head = [`# ${o.title}`, "", `Level: ${o.level}`, `Decided by: ${who}`];
  if (o.promotes) head.push(`Promotes: ${item(o.promotes)}`);   // the item a promotion record names (LOOP-088, LOOP-115)
  if (o.supersedes) head.push(`Supersedes: ${o.supersedes}`, `Cause: ${o.cause}`);
  head.push(`Rests on: ${o["rests-on"]}`, `Would be wrong if: ${o["wrong-if"]}`);
  if (o.history) head.push(`History: ${o.history}`);
  head.push("", "## Decision", "", o.body, "", "## Realized by", "", UNBUILT, "");
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
  if (unrestored.size) return { error: `restore these paths to the tree before activation commit ${s.began} and commit before --scope: ${[...unrestored].map(displayPath).join(", ")}` };
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
                  `Concerns: ${oneLine(o.concerns)}`, `Raised: ${new Date().toISOString()}`, `Raised after: ${evidenceMilestones(root, o.concerns)}`, ...request.lines];
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
  if (turn === "agent" && /^(?:ok|(?:instead|ask) +\S.*)$/i.test(reply)) return usage(`answer: ${slug} waits for the agent's reply to the ask; the developer's answer follows it, and an explanation does not begin with ok, instead or ask (LOOP-135)`);
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
  const next = !!o["next-iteration"];
  if (o.defect && (next || !o.from || !requirementSet(root).agreed.has(o.from))) return usage("backlog: --defect needs --from naming the Agreed requirement whose text already forbids the defect, and no --next-iteration (LOOP-140)");
  if (next && !o.changes) return usage("backlog: --next-iteration needs --changes naming the Agreed requirement or the working agreement the idea would change (LOOP-093)");
  const dir = join(root, ".cairn", next ? "next-iteration" : "backlog");
  mkdirSync(dir, { recursive: true });
  const slug = slugify(o.title), path = join(dir, `${slug}.md`);
  if (!slug) return usage("backlog: the title has no letters or digits to name the item (LOOP-128)");
  if (existsSync(path)) return usage(`backlog: ${rel(root, path)} exists; the backlog never overwrites (LOOP-016)`);
  const source = next ? `Changes: ${o.changes}` : `Surfaced from: ${o.from ?? "unstated"}${o.defect ? "\nDefect: yes" : ""}`;
  const outside = o.outside ? `Outside because: ${o.outside}\n` : "";
  writeFileSync(path, `# ${o.title}\n\n${source}\n${outside}Captured: ${new Date().toISOString()}\n\n${o.body}\n`);
  process.stdout.write(`captured ${rel(root, path)}\n`);
  return 0;
}

// ------------------------------------------------------------ reversals

function reversals(root) {
  const all = decisions(root), rev = all.filter((d) => "Superseded by" in d);
  const tally = (f) => { const m = new Map(); for (const d of rev) for (const k of [].concat(f(d))) m.set(k, (m.get(k) ?? 0) + 1); return [...m].sort().map(([k, v]) => `${k} ${v}`).join(", ") || "none"; };
  const causeOf = (d) => all.find((x) => x.slug === d["Superseded by"])?.Cause ?? "unrecorded";
  process.stdout.write([`reversals: ${rev.length} of ${all.length} decisions`, `by decider: ${tally((d) => decider(d["Decided by"]))}`,
    `by cause: ${tally(causeOf)}`, `by domain: ${tally((d) => d.domain)}`, ...rev.map((d) => `  ${d.slug} -> ${d["Superseded by"]} (${causeOf(d)})`)].join("\n") + "\n");
  return 0;
}

// ------------------------------------------------------------ main

function help() {
  process.stdout.write(`Cairn - Keep agent work tied to the agreed requirements.

Usage: cairn <command> [options]
       cairn --help | -h
       cairn --version

Global options:
  --help, -h   Print this help without running a command. No repository needed.
  --version    Print the version and exit. No repository needed.
  --root DIR   Use DIR as the project root (default: current directory).
  --           Treat the remaining arguments as literal text, not options.

Commands:
  wake
    Read the project records and name the next action.
  check [REQ ...] | check --stale
    Run checks and record evidence against committed inputs. With requirement
    IDs, run their mechanisms; otherwise run the current commitment's checks.
    --stale runs once each mechanism whose requirement has missing or stale
    evidence and nothing else; a fresh failure or an unverified result is
    skipped with implement named (LOOP-094).
  decide --title TEXT --level LEVEL --decided-by WHO --rests-on REFS
         --wrong-if TEXT --body TEXT [--history TEXT] [--promotes ITEM]
    Record a decision. Levels: ${LEVELS.join(", ")}. Deciders: ${DECIDERS.join(", ")}.
    --history is required when the decision's domain has recorded reversals.
    --promotes names the backlog item a promotion record promotes (LOOP-088).
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
  backlog --title TEXT --body TEXT [--from REQ] [--outside TEXT] [--defect]
    Capture an idea that fits inside the specification. --outside states
    why an idea surfaced from one of the commitment's own requirements
    is not its work (LOOP-092). The loop promotes from here at Done.
  backlog --next-iteration --changes REQ --title TEXT --body TEXT [--outside TEXT]
    Capture an idea that would change an Agreed requirement, its
    falsifier, or the working agreement; --changes names it (LOOP-093).
    The developer brings it in through a specification phase.
  supersede OLD-SLUG --cause CAUSE <decide options>
    Replace an earlier decision and record why it was reversed.
    CAUSE must be one of these exact phrases (quote it in the shell):
${CAUSES.map((cause) => "      " + cause).join("\n")}
  reversals
    Report decision reversals by decider, cause, and domain.
  lint [DIR]
    Run the shipped specification checker over DIR (default docs/spec) and
    print its findings; exit 1 on a finding. Works wherever cairn is linked.

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
      help: { type: "boolean", short: "h" }, version: { type: "boolean" }, scope: { type: "boolean" }, keep: { type: "boolean" },
      root: { type: "string" }, title: { type: "string" }, level: { type: "string" }, "decided-by": { type: "string" },
      "rests-on": { type: "string" }, "wrong-if": { type: "string" }, body: { type: "string" }, supersedes: { type: "string" }, cause: { type: "string" },
      from: { type: "string" }, stale: { type: "boolean" }, promotes: { type: "string" }, "next-iteration": { type: "boolean" }, defect: { type: "boolean" }, changes: { type: "string" }, outside: { type: "string" }, history: { type: "string" }, concerns: { type: "string" }, question: { type: "string" }, recommend: { type: "string" }, because: { type: "string" }, "if-wrong": { type: "string" }, instead: { type: "string" } } });
  } catch (e) { return usage(e.message); }
  if (a.values.help) return help();
  if (a.values.version) { try { process.stdout.write(`cairn ${version()}\n`); return 0; } catch (e) { return usage(`cannot read the version beside the kernel: ${e.message}`); } }
  if (Number(process.versions.node.split(".")[0]) < 18) return usage(`Cairn needs Node 18 or newer; this is ${process.versions.node}`);
  const root = ROOT = a.values.root ?? process.cwd();
  const [cmd, ...rest] = a.positionals;
  // The checker is a script beside this kernel; the command reaches it from any project (PKG-028).
  if (cmd === "lint") { if (rest.length > 1) return usage("lint takes one directory"); if (!isDir(root)) return usage(`${root} is not a directory; pass --root DIR`); const r = spawnSync(process.execPath, [fileURLToPath(new URL("../scripts/spec-lint.mjs", import.meta.url)), rest[0] ?? "docs/spec"], { cwd: root, stdio: "inherit" }); return r.error ? usage(`cannot run the checker in ${root}: ${r.error.message}`) : r.status ?? 3; }
  if (!["wake", "check", "decide", "escalate", "answer", "backlog", "supersede", "reversals"].includes(cmd)) return usage("usage: cairn <wake|check|decide|escalate|answer|backlog|supersede|reversals|lint> [--root DIR]");
  // Every command that reads or writes a record needs the repository (LOOP-046, LOOP-118).
  if (!existsSync(join(root, "docs", "spec", "roadmap.md"))) return usage(`${root} is not a Cairn repository (no docs/spec/roadmap.md); run from the project root or pass --root DIR`);
  if (git(root, "rev-parse", "--show-toplevel").status !== 0) return usage(`${root} is not a Cairn repository (no Git working tree); every command but help and lint requires Git (LOOP-046)`);
  if (cmd === "decide") return decide(root, a.values);
  if (cmd === "escalate") return escalate(root, a.values);
  if (cmd === "answer") return answer(root, rest[0], rest.slice(1).join(" "));
  if (cmd === "backlog") return backlog(root, a.values);
  if (cmd === "supersede") return rest[0] ? decide(root, { ...a.values, supersedes: rest[0] }) : usage("usage: cairn supersede <old-slug> --cause C ...decide fields");
  if (cmd === "reversals") return reversals(root);
  if (cmd === "check") return a.values.stale && rest.length ? usage("check: --stale selects by evidence; do not name requirements with it (LOOP-094)") : check(root, rest, !!a.values.stale);
  const w = wake(root);
  process.stdout.write(`${w.verdict}: ${w.action}\n  ${w.why}\n`);
  return VERDICT[w.verdict];
}

let ROOT = process.cwd();
process.exit(await main().catch((e) => e.record ? (process.stdout.write(`Resolvable: repair ${rel(ROOT, e.record)}\n  cannot read the record (${e.code}); restore or remove it (LOOP-107)\n`), 1) : usage(e.message)));
