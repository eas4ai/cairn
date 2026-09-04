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
//   cairn answer <slug> <reply...>  record the developer's reply
//   cairn backlog --title T --body B [--from X]   capture out-of-scope work
//   cairn supersede <old> --cause C ...decide fields...
//   cairn reversals                 report reversals by decider, cause, domain
//
// Exit: 0 Done, 1 Resolvable (the agent acts), 2 Escalate (the developer
// acts), 3 usage or not a Cairn repository. Node only, no dependencies.

import { parseArgs } from "node:util";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, writeFileSync, unlinkSync } from "node:fs";
import { join, relative } from "node:path";

// ------------------------------------------------------------ reading

// Flat "Key: value" text. A "- item" line joins a list under the last
// key; an unindented non-key line before the first blank line continues
// the last value. Markdown headings end the header block.
function fields(text) {
  const out = {};
  let key = null;
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    if (line === "" || line.startsWith("#")) { key = null; continue; }
    let m;
    if ((m = /^([A-Za-z][A-Za-z0-9 _-]*):(?:\s+(.*))?$/.exec(line))) { key = m[1]; out[key] = m[2] ?? ""; }
    else if (key && (m = /^\s*-\s+(.*)$/.exec(line))) { out[key] = (Array.isArray(out[key]) ? out[key] : []).concat(m[1]); }
    else if (key && typeof out[key] === "string") out[key] += " " + line.trim();
  }
  return out;
}
const read = (p) => readFileSync(p, "utf8");
const list = (dir) => (existsSync(dir) ? readdirSync(dir).filter((n) => !n.startsWith(".")).sort() : []);
const rel = (root, p) => relative(root, p).split("\\").join("/");
const asList = (v) => (Array.isArray(v) ? v : v ? [v] : []);
const sha = (s) => "sha256:" + createHash("sha256").update(s).digest("hex");
const git = (root, ...args) => spawnSync("git", args, { cwd: root, encoding: "utf8" });
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

// The requirement ids the spec set declares as Agreed: a file whose
// Status: line begins Agreed, and every [ID] at a line start in it.
function agreedRequirements(root) {
  const dir = join(root, "docs", "spec"), out = new Set();
  for (const n of list(dir).filter((n) => n.endsWith(".md"))) {
    const t = read(join(dir, n));
    if (!/^Status: Agreed/m.test(t)) continue;
    for (const m of t.matchAll(/^\[([A-Z]+-\d+)\]/gm)) out.add(m[1]);
  }
  return out;
}
// Files changed by commits since the commitment began: since the commit
// that wrote its Current: line. The footprint is the union of its
// mechanisms' declared inputs plus Cairn's own records.
function breaches(root, slug, mechs, requirements) {
  const began = git(root, "log", "--reverse", "--format=%H", `-SCurrent: ${slug}`, "--", "docs/spec/roadmap.md").stdout.split("\n").filter(Boolean)[0];
  if (!began) return [];
  const changed = git(root, "diff", "--name-only", "-z", began, "HEAD").stdout.split("\0").filter(Boolean);
  const inputs = [...new Set(requirements.map((r) => mechs.byReq.get(r)).filter(Boolean).flatMap((n) => asList(mechs.byName.get(n).def.inputs)))];
  const covered = inputs.length ? inputFiles(root, inputs) : [];
  return changed.filter((f) => !f.startsWith(".cairn/") && !f.startsWith("docs/") && !covered.includes(f) && !inputs.some((i) => f === i || f.startsWith(i.replace(/\/?$/, "/"))));
}

// Every decision record with its header fields. A record's domain is the
// set of requirement prefixes in its Rests on: line; one that rests on
// prose alone is in the domain "unspecified".
function decisions(root) {
  const dir = join(root, "docs", "decisions");
  return list(dir).map((n) => {
    const f = fields(read(join(dir, n)));
    const ids = [...(f["Rests on"] ?? "").matchAll(/\b([A-Z]+)-\d+\b/g)].map((m) => m[1]);
    return { slug: n.replace(/\.md$/, ""), ...f, domain: ids.length ? [...new Set(ids)] : ["unspecified"] };
  });
}
const reversed = (root) => decisions(root).filter((d) => "Superseded by" in d);

// Every Agreed PKG requirement is part of every commitment (PKG-011).
function fold(c, agreed) {
  for (const r of [...agreed].sort()) if (r.startsWith("PKG-") && !c.requirements.includes(r)) c.requirements.push(r);
}

// A decision is unrealized when its Realized by section lists no commit.
// A superseded decision is history, not work.
function unrealizedDecisions(root) {
  const dir = join(root, "docs", "decisions");
  return list(dir).filter((n) => {
    const t = read(join(dir, n));
    if ("Superseded by" in fields(t)) return false;
    const i = t.indexOf("## Realized by");
    return i < 0 || !/^- [0-9a-f]{7,}\b/m.test(t.slice(i));
  }).map((n) => rel(root, join(dir, n)));
}
function escalations(root) {
  const dir = join(root, ".cairn", "escalations");
  return list(dir).map((n) => ({ name: n.replace(/\.md$/, ""), ...fields(read(join(dir, n))) }));
}
const openEscalations = (root) => escalations(root).filter((e) => !("Answer" in e));

// Mechanisms: name -> { name, def, digest }, and requirement -> name.
function mechanisms(root) {
  const dir = join(root, ".cairn", "mechanisms");
  const byName = new Map(), byReq = new Map();
  for (const n of list(dir)) {
    const text = read(join(dir, n));
    const m = { name: n, def: fields(text), digest: sha(text) };
    byName.set(n, m);
    for (const r of asList(m.def.requirements)) byReq.set(r, n);
  }
  return { byName, byReq };
}
// The tracked files a mechanism declares, and a digest over their content.
const inputFiles = (root, inputs) => git(root, "ls-files", "-z", "--", ...inputs).stdout.split("\0").filter(Boolean).sort();
// A link is its target path, as git stores it, so the tree and a commit
// digest it the same way. A mechanism that reads through a link declares
// the target too.
const blob = (p) => (lstatSync(p).isSymbolicLink() ? readlinkSync(p) : readFileSync(p));
function inputsDigest(root, inputs) {
  const h = createHash("sha256");
  for (const f of inputFiles(root, inputs)) { h.update(f); h.update("\0"); h.update(blob(join(root, f))); h.update("\0"); }
  return "sha256:" + h.digest("hex");
}
// The same digest over the tree as it was at a commit, for records that
// name the commit they examined rather than carrying a digest.
function inputsDigestAt(root, inputs, commit) {
  const ls = git(root, "ls-tree", "-r", "--name-only", "-z", commit, "--", ...inputs);
  if (ls.status !== 0) return null;
  const h = createHash("sha256");
  for (const f of ls.stdout.split("\0").filter(Boolean).sort()) {
    const show = spawnSync("git", ["show", `${commit}:${f}`], { cwd: root });
    h.update(f); h.update("\0"); h.update(show.stdout); h.update("\0");
  }
  return "sha256:" + h.digest("hex");
}
const dirtyInputs = (root, inputs) => git(root, "status", "--porcelain", "-z", "--", ...inputs).stdout.split("\0").filter(Boolean).map((l) => l.slice(3));

// Evidence history for a requirement, oldest first.
function history(root, req) {
  const dir = join(root, ".cairn", "evidence", req);
  return list(dir).map((n) => fields(read(join(dir, n))));
}
function reviewOf(root, slug) {
  const p = join(root, ".cairn", "reviews", `${slug}.md`);
  if (!existsSync(p)) return null;
  const f = fields(read(p));
  return { commit: f.commit ?? null, open: asList(f.findings).filter((x) => /^open:/.test(x)) };
}

// ------------------------------------------------------------ wake

const VERDICT = { Done: 0, Resolvable: 1, Escalate: 2 };

// What is the same for every requirement a mechanism speaks for: computed once.
function context(root, mechs) {
  const digests = new Map();
  for (const [n, m] of mechs.byName) digests.set(n, inputsDigest(root, asList(m.def.inputs)));
  return { digests, escalations: escalations(root) };
}
// One requirement's standing, from facts on disk.
function assess(root, req, mechs, ctx) {
  const name = mechs.byReq.get(req);
  const m = name ? mechs.byName.get(name) : null;
  const h = history(root, req);
  const latest = h[h.length - 1] ?? null;
  const everPassed = h.some((e) => e.result === "pass");
  const lastThree = h.slice(-3);
  const threeFails = lastThree.length === 3 && lastThree.every((e) => e.result === "fail");
  const escalatedSince = threeFails && ctx.escalations.some((e) => e.Concerns === req && (!e.Raised || e.Raised >= lastThree[0].recorded));
  let stale = null;
  if (m && latest) {
    const reasons = [];
    if (latest.mechanism_digest !== m.digest) reasons.push("the mechanism changed");
    if (latest.inputs_digest !== ctx.digests.get(name)) reasons.push("a declared input changed");
    stale = reasons.length ? reasons.join(" and ") : null;
  }
  return { req, mech: name, latest, everPassed, threeFails, escalatedSince, stale };
}

function wake(root) {
  const ip = join(root, ".cairn", "in-progress");
  if (existsSync(ip)) {
    const f = fields(read(ip));
    return { verdict: "Resolvable", action: `reconcile ${f.action ?? "?"} ${f.target ?? "?"} at ${f.base ?? "?"}`, why: ".cairn/in-progress names an unfinished action; finish or abandon it, then remove the record" };
  }
  const [esc] = openEscalations(root);
  if (esc) return { verdict: "Escalate", action: `present ${esc.name}`, why: `.cairn/escalations/${esc.name}.md has no Answer` };
  const [dec] = unrealizedDecisions(root);
  if (dec) return { verdict: "Resolvable", action: `build ${dec}`, why: "the record names no commit that realized it" };
  const c = currentCommitment(root);
  if (c.repair) return { verdict: "Resolvable", action: `repair ${c.repair}`, why: c.why };
  const mechs = mechanisms(root);
  const agreed = agreedRequirements(root);
  const unknown = c.requirements.find((r) => !agreed.has(r));
  if (unknown) return { verdict: "Resolvable", action: `repair docs/commitments/${c.slug}.md`, why: `${unknown} is not an Agreed requirement in docs/spec/ (LOOP-029)` };
  fold(c, agreed);
  const [breach] = breaches(root, c.slug, mechs, c.requirements);
  if (breach) return { verdict: "Resolvable", action: `scope ${breach}`, why: `changed since the commitment began and no mechanism of it declares that path; declare it as an input, or write it to the backlog and revert it (LOOP-035)` };
  const ctx = context(root, mechs);
  const state = c.requirements.map((r) => assess(root, r, mechs, ctx));
  const first = (pred) => state.find(pred);
  let s;
  if ((s = first((x) => x.threeFails && !x.escalatedSince)))
    return { verdict: "Resolvable", action: `escalate ${s.req}`, why: `three consecutive failing records and no escalation since; a fourth attempt is not the next action (DEC-016)` };
  if ((s = first((x) => x.latest?.result === "fail" && x.everPassed && !x.stale)))
    return { verdict: "Resolvable", action: `implement ${s.req}`, why: `regression: latest evidence fails after an earlier pass (${s.mech})` };
  for (const x of state) {
    if (!x.mech) continue;
    if (!x.latest) return { verdict: "Resolvable", action: `run ${x.req}`, why: `mechanism ${x.mech} has produced no evidence for it` };
    if (x.stale) return { verdict: "Resolvable", action: `run ${x.req}`, why: `evidence is stale: ${x.stale} (${x.mech})` };
    if (x.latest.result !== "pass") return { verdict: "Resolvable", action: `implement ${x.req}`, why: `latest evidence is ${x.latest.result} (${x.mech})` };
  }
  if ((s = first((x) => !x.mech))) return { verdict: "Resolvable", action: `declare ${s.req}`, why: "no mechanism under .cairn/mechanisms names it" };
  const head = headSha(root), rv = reviewOf(root, c.slug);
  if (!rv) return { verdict: "Resolvable", action: `review ${c.slug}`, why: `every requirement passes; no review record exists at .cairn/reviews/${c.slug}.md (LOOP-020)` };
  // A review is stale the way evidence is: when a declared input of the
  // commitment's mechanisms changed since the commit it examined. HEAD
  // moving on its own, as it does when the review is committed, is not.
  const inputs = [...new Set(state.filter((x) => x.mech).flatMap((x) => asList(mechs.byName.get(x.mech).def.inputs)))];
  const then = rv.commit ? inputsDigestAt(root, inputs, rv.commit) : null;
  if (then === null || then !== inputsDigest(root, inputs)) return { verdict: "Resolvable", action: `review ${c.slug}`, why: `the review examined ${rv.commit ?? "?"} and a declared input has changed since; the tree is at ${head} (LOOP-032)` };
  if (rv.open.length) return { verdict: "Resolvable", action: `resolve ${c.slug}`, why: `the review names an open finding: ${rv.open[0].replace(/^open:\s*/, "")} (LOOP-033)` };
  return { verdict: "Done", action: c.slug, why: `every requirement in ${c.slug} has current passing evidence and the review at ${rv.commit} is clean` };
}

// ------------------------------------------------------------ check

function stamp() { return new Date().toISOString().replace(/[-:]/g, "").replace(/\.(\d{3})Z$/, "$1Z"); }

function check(root, only) {
  const c = currentCommitment(root);
  if (c.repair) { process.stdout.write(`Resolvable: repair ${c.repair}\n  ${c.why}\n`); return 1; }
  fold(c, agreedRequirements(root));
  const targets = only.length ? only : c.requirements;
  const mechs = mechanisms(root);
  const [breach] = breaches(root, c.slug, mechs, c.requirements);
  if (breach) { process.stdout.write(`Resolvable: scope ${breach}\n  changed since the commitment began and no mechanism of it declares that path (LOOP-035)\n`); return 1; }
  const runs = new Map();
  for (const r of targets) { const n = mechs.byReq.get(r); if (n) runs.set(n, (runs.get(n) ?? []).concat(r)); else if (only.length) process.stdout.write(`skipped ${r}: no mechanism claims it\n`); }
  const head = headSha(root);
  const ip = join(root, ".cairn", "in-progress");
  for (const [name, reqs] of runs) {
    const m = mechs.byName.get(name), inputs = asList(m.def.inputs);
    const dirty = dirtyInputs(root, inputs);
    if (dirty.length) { process.stdout.write(`Resolvable: commit ${dirty[0]}\n  ${name} declares it as an input and it has uncommitted changes: ${dirty.join(", ")} (LOOP-030)\n`); return 1; }
    // The write-ahead record, unless the agent's own already covers this run.
    const mine = !existsSync(ip);
    if (mine) writeFileSync(ip, `action: run-mechanism\ntarget: ${name}\nbase: ${head}\nstarted: ${new Date().toISOString()}\n`);
    const cwd = m.def.cwd && m.def.cwd !== "." ? join(root, m.def.cwd) : root;
    const r = spawnSync(m.def.command, { shell: true, cwd, encoding: "utf8" });
    const exit = r.status ?? -1;
    const rec = [
      `mechanism: ${name}`, `commit: ${head}`, `inputs_digest: ${inputsDigest(root, inputs)}`, `mechanism_digest: ${m.digest}`,
      `command: ${m.def.command}`, `cwd: ${m.def.cwd ?? "."}`, `exit: ${exit}`, `output_digest: ${sha((r.stdout ?? "") + (r.stderr ?? ""))}`,
      `result: ${exit === 0 ? "pass" : "fail"}`, `recorded: ${new Date().toISOString()}`,
    ];
    for (const req of reqs) {
      const dir = join(root, ".cairn", "evidence", req);
      mkdirSync(dir, { recursive: true });
      let p = join(dir, stamp()), i = 0;
      while (existsSync(p)) p = join(dir, `${stamp()}-${++i}`);       // never overwrite (LOOP-025)
      writeFileSync(p, `requirement: ${req}\n${rec.join("\n")}\n`);
      process.stdout.write(`recorded ${rel(root, p)}: ${exit === 0 ? "pass" : "fail"} (exit ${exit})\n`);
    }
    if (mine) unlinkSync(ip);
  }
  const w = wake(root);
  process.stdout.write(`${w.verdict}: ${w.action}\n  ${w.why}\n`);
  return VERDICT[w.verdict];
}

// ------------------------------------------------------------ decide

const LEVELS = ["Judged", "Consequential", "Blocking"];
const CAUSES = ["the stated condition occurred", "an unforeseen condition occurred", "it was wrong when it was made", "the premise was false"];
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function decide(root, o) {
  const need = ["title", "level", "decided-by", "rests-on", "wrong-if", "body"].filter((k) => !o[k]);
  if (need.length) return usage(`decide: missing --${need.join(", --")}`);
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

function escalate(root, o) {
  if (!o.concerns) return usage("escalate: missing --concerns");
  if (o.level !== undefined && o.level !== "Blocking") return usage(`escalate: --level must be Blocking or absent, not ${o.level}`);
  const [open] = openEscalations(root);
  if (open) return usage(`escalate: ${open.name} is open; one escalation at a time (LOOP-011)`);
  // Every field present, each on one line (LOOP-026). A Blocking decision
  // is written even when malformed, with the field named (LOOP-014).
  const bad = ESC_FIELDS.map(([k]) => k).find((k) => !o[k] || /\n/.test(o[k]));
  if (bad && o.level !== "Blocking") return usage(`escalate: --${bad} must be present and one line; a Blocking decision may pass --level Blocking to be written anyway`);
  const dir = join(root, ".cairn", "escalations");
  mkdirSync(dir, { recursive: true });
  let slug = slugify(o.concerns), path = join(dir, `${slug}.md`), i = 1;
  while (existsSync(path)) path = join(dir, `${slug}-${++i}.md`);
  const body = ["DECISION", "", ...ESC_FIELDS.map(([k, label]) => `${label} ${(o[k] ?? "").replace(/\n/g, " ")}`), "", "Reply: ok | instead | ask", "",
                `Concerns: ${o.concerns}`, "Status: open", `Raised: ${new Date().toISOString()}`];
  if (bad) body.push(`Malformed: ${bad}`);
  writeFileSync(path, body.join("\n") + "\n");
  process.stdout.write(`raised ${rel(root, path)}${bad ? ` (malformed: ${bad}; written because Blocking)` : ""}\n`);
  return 0;
}

function answer(root, slug, reply) {
  if (!slug || !reply) return usage("usage: cairn answer <slug> <reply...>");
  const path = join(root, ".cairn", "escalations", `${slug}.md`);
  if (!existsSync(path)) return usage(`answer: no escalation named ${slug}`);
  if ("Answer" in fields(read(path))) return usage(`answer: ${slug} is already answered`);
  writeFileSync(path, read(path).replace(/\n?$/, "\n") + `Answer: ${reply}\nAnswered: ${new Date().toISOString()}\n`);
  process.stdout.write(`answered ${rel(root, path)}\n`);
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

function usage(msg) { process.stderr.write(`cairn: ${msg}\n`); return 3; }

function main() {
  let a;
  try {
    a = parseArgs({ args: process.argv.slice(2), allowPositionals: true, strict: true, options: {
      root: { type: "string" }, title: { type: "string" }, level: { type: "string" }, "decided-by": { type: "string" },
      "rests-on": { type: "string" }, "wrong-if": { type: "string" }, body: { type: "string" }, supersedes: { type: "string" }, cause: { type: "string" },
      from: { type: "string" }, history: { type: "string" }, concerns: { type: "string" }, question: { type: "string" }, recommend: { type: "string" }, because: { type: "string" }, "if-wrong": { type: "string" }, instead: { type: "string" } } });
  } catch (e) { return usage(e.message); }
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
  if (cmd === "check") return check(root, rest);
  const w = wake(root);
  process.stdout.write(`${w.verdict}: ${w.action}\n  ${w.why}\n`);
  return VERDICT[w.verdict];
}

process.exit(main());
