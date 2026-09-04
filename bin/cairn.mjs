#!/usr/bin/env node
// Cairn -- the referee. Reads the repository, names the next action.
//
//   cairn wake                      given only the repository, one next action
//   cairn check [REQ ...]           run the commitment's mechanisms against a
//                                   committed tree; record evidence with receipts
//   cairn decide --title T --level L --decided-by A --rests-on R
//                --wrong-if W --body B [--supersedes S --cause C]
//
// Exit: 0 Done, 1 Resolve (the agent acts), 2 Escalate (the developer
// acts), 3 usage or not a Cairn repository. Node only, no dependencies.

import { parseArgs } from "node:util";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
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
const sameCommit = (a, b) => !!a && !!b && (a.startsWith(b) || b.startsWith(a));

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
function inputsDigest(root, inputs) {
  const h = createHash("sha256");
  for (const f of inputFiles(root, inputs)) { h.update(f); h.update("\0"); h.update(readFileSync(join(root, f))); h.update("\0"); }
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

const VERDICT = { Done: 0, Resolve: 1, Escalate: 2 };

// One requirement's standing, from facts on disk.
function assess(root, req, mechs) {
  const name = mechs.byReq.get(req);
  const m = name ? mechs.byName.get(name) : null;
  const h = history(root, req);
  const latest = h[h.length - 1] ?? null;
  const everPassed = h.some((e) => e.result === "pass");
  const lastThree = h.slice(-3);
  const threeFails = lastThree.length === 3 && lastThree.every((e) => e.result === "fail");
  const escalatedSince = threeFails && escalations(root).some((e) => e.Concerns === req && (!e.Raised || e.Raised >= lastThree[0].recorded));
  let stale = null;
  if (m && latest) {
    const reasons = [];
    if (latest.mechanism_digest !== m.digest) reasons.push("the mechanism changed");
    if (latest.inputs_digest !== inputsDigest(root, asList(m.def.inputs))) reasons.push("a declared input changed");
    stale = reasons.length ? reasons.join(" and ") : null;
  }
  return { req, mech: name, latest, everPassed, threeFails, escalatedSince, stale };
}

function wake(root) {
  const ip = join(root, ".cairn", "in-progress");
  if (existsSync(ip)) {
    const f = fields(read(ip));
    return { verdict: "Resolve", action: `reconcile ${f.action ?? "?"} ${f.target ?? "?"} at ${f.base ?? "?"}`, why: ".cairn/in-progress names an unfinished action; finish or abandon it, then remove the record" };
  }
  const [esc] = openEscalations(root);
  if (esc) return { verdict: "Escalate", action: `present ${esc.name}`, why: `.cairn/escalations/${esc.name}.md has no Answer` };
  const [dec] = unrealizedDecisions(root);
  if (dec) return { verdict: "Resolve", action: `build ${dec}`, why: "the record names no commit that realized it" };
  const c = currentCommitment(root);
  if (c.repair) return { verdict: "Resolve", action: `repair ${c.repair}`, why: c.why };
  const mechs = mechanisms(root);
  const state = c.requirements.map((r) => assess(root, r, mechs));
  const first = (pred) => state.find(pred);
  let s;
  if ((s = first((x) => x.threeFails && !x.escalatedSince)))
    return { verdict: "Resolve", action: `escalate ${s.req}`, why: `three consecutive failing records and no escalation since; a fourth attempt is not the next action (DEC-016)` };
  if ((s = first((x) => x.latest?.result === "fail" && x.everPassed && !x.stale)))
    return { verdict: "Resolve", action: `implement ${s.req}`, why: `regression: latest evidence fails after an earlier pass (${s.mech})` };
  for (const x of state) {
    if (!x.mech) continue;
    if (!x.latest) return { verdict: "Resolve", action: `run ${x.req}`, why: `mechanism ${x.mech} has produced no evidence for it` };
    if (x.stale) return { verdict: "Resolve", action: `run ${x.req}`, why: `evidence is stale: ${x.stale} (${x.mech})` };
    if (x.latest.result !== "pass") return { verdict: "Resolve", action: `implement ${x.req}`, why: `latest evidence is ${x.latest.result} (${x.mech})` };
  }
  if ((s = first((x) => !x.mech))) return { verdict: "Resolve", action: `declare ${s.req}`, why: "no mechanism under .cairn/mechanisms names it" };
  const head = headSha(root), rv = reviewOf(root, c.slug);
  if (!rv) return { verdict: "Resolve", action: `review ${c.slug}`, why: `every requirement passes; no review record exists at .cairn/reviews/${c.slug}.md (LOOP-020)` };
  if (!sameCommit(rv.commit, head)) return { verdict: "Resolve", action: `review ${c.slug}`, why: `the review examined ${rv.commit ?? "?"}; the tree is at ${head} (LOOP-032)` };
  if (rv.open.length) return { verdict: "Resolve", action: `resolve ${c.slug}`, why: `the review names an open finding: ${rv.open[0].replace(/^open:\s*/, "")} (LOOP-033)` };
  return { verdict: "Done", action: c.slug, why: `every requirement in ${c.slug} has current passing evidence and the review at ${head} is clean` };
}

// ------------------------------------------------------------ check

function stamp() { return new Date().toISOString().replace(/[-:]/g, "").replace(/\.(\d{3})Z$/, "$1Z"); }

function check(root, only) {
  const c = currentCommitment(root);
  if (c.repair) { process.stdout.write(`Resolve: repair ${c.repair}\n  ${c.why}\n`); return 1; }
  const targets = only.length ? only : c.requirements;
  const mechs = mechanisms(root);
  const runs = new Map();
  for (const r of targets) { const n = mechs.byReq.get(r); if (n) runs.set(n, (runs.get(n) ?? []).concat(r)); }
  const head = headSha(root);
  const ip = join(root, ".cairn", "in-progress");
  for (const [name, reqs] of runs) {
    const m = mechs.byName.get(name), inputs = asList(m.def.inputs);
    const dirty = dirtyInputs(root, inputs);
    if (dirty.length) { process.stdout.write(`Resolve: commit ${dirty[0]}\n  ${name} declares it as an input and it has uncommitted changes: ${dirty.join(", ")} (LOOP-030)\n`); return 1; }
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
      spawnSync("mkdir", ["-p", dir]);
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
  const head = [`# ${o.title}`, "", `Level: ${o.level}`, `Decided by: ${o["decided-by"]}`];
  if (o.supersedes) head.push(`Supersedes: ${o.supersedes}`, `Cause: ${o.cause}`);
  head.push(`Rests on: ${o["rests-on"]}`, `Would be wrong if: ${o["wrong-if"]}`, "", "## Decision", "", o.body, "", "## Realized by", "", "(none yet: recorded, not built)", "");
  writeFileSync(path, head.join("\n"));
  if (o.level === "Consequential") writeFileSync(join(root, ".cairn", "queue", slug), `decision: ${slug}\nqueued: ${new Date().toISOString()}\n`);
  process.stdout.write(`recorded ${rel(root, path)}${o.level === "Consequential" ? " and queued it for review" : ""}\n`);
  return 0;
}

// ------------------------------------------------------------ main

function usage(msg) { process.stderr.write(`cairn: ${msg}\n`); return 3; }

function main() {
  let a;
  try {
    a = parseArgs({ args: process.argv.slice(2), allowPositionals: true, strict: true, options: {
      root: { type: "string" }, title: { type: "string" }, level: { type: "string" }, "decided-by": { type: "string" },
      "rests-on": { type: "string" }, "wrong-if": { type: "string" }, body: { type: "string" }, supersedes: { type: "string" }, cause: { type: "string" } } });
  } catch (e) { return usage(e.message); }
  const root = a.values.root ?? process.cwd();
  const [cmd, ...rest] = a.positionals;
  if (cmd === "decide") return decide(root, a.values);
  if (cmd !== "wake" && cmd !== "check") return usage("usage: cairn <wake|check|decide> [--root DIR]");
  if (!existsSync(join(root, "docs", "spec", "roadmap.md"))) return usage(`${root} is not a Cairn repository (no docs/spec/roadmap.md)`);
  if (cmd === "check") return check(root, rest);
  const w = wake(root);
  process.stdout.write(`${w.verdict}: ${w.action}\n  ${w.why}\n`);
  return VERDICT[w.verdict];
}

process.exit(main());
