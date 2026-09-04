#!/usr/bin/env node
// Cairn -- the referee. Reads the repository, names the next action.
//
//   cairn wake                      given only the repository, one next action
//   cairn decide --title T --level L --decided-by A --rests-on R
//                --wrong-if W --body B [--supersedes S --cause C]
//
// Exit: 0 Done, 1 Resolve (the agent acts), 2 Escalate (the developer
// acts), 3 usage or not a Cairn repository. Node only, no dependencies.

import { parseArgs } from "node:util";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
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
// An escalation is open when its file carries no Answer.
const openEscalations = (root) => list(join(root, ".cairn", "escalations")).filter((n) => !("Answer" in fields(read(join(root, ".cairn", "escalations", n)))));

function mechanismsByRequirement(root) {
  const by = new Map();
  const dir = join(root, ".cairn", "mechanisms");
  for (const n of list(dir)) for (const r of [].concat(fields(read(join(dir, n)))["requirements"] ?? [])) by.set(r, n);
  return by;
}
// Latest evidence for a requirement: the last file by name in its
// directory. Freshness against declared inputs is cairn check's job.
function latestEvidence(root, req) {
  const dir = join(root, ".cairn", "evidence", req);
  const names = list(dir);
  return names.length ? fields(read(join(dir, names[names.length - 1]))) : null;
}

// ------------------------------------------------------------ wake

const VERDICT = { Done: 0, Resolve: 1, Escalate: 2 };

function wake(root) {
  const ip = join(root, ".cairn", "in-progress");
  if (existsSync(ip)) {
    const f = fields(read(ip));
    return { verdict: "Resolve", action: `reconcile ${f.action ?? "?"} ${f.target ?? "?"} at ${f.base ?? "?"}`, why: ".cairn/in-progress names an unfinished action; finish or abandon it, then remove the record" };
  }
  const [esc] = openEscalations(root);
  if (esc) return { verdict: "Escalate", action: `present ${esc.replace(/\.md$/, "")}`, why: `.cairn/escalations/${esc} has no Answer` };
  const [dec] = unrealizedDecisions(root);
  if (dec) return { verdict: "Resolve", action: `build ${dec}`, why: "the record names no commit that realized it" };
  const c = currentCommitment(root);
  if (c.repair) return { verdict: "Resolve", action: `repair ${c.repair}`, why: c.why };
  const mechs = mechanismsByRequirement(root);
  for (const r of c.requirements) {
    if (!mechs.has(r)) continue;
    const e = latestEvidence(root, r);
    if (!e) return { verdict: "Resolve", action: `run ${r}`, why: `mechanism ${mechs.get(r)} has produced no evidence for it` };
    if (e.result !== "pass") return { verdict: "Resolve", action: `implement ${r}`, why: `latest evidence is ${e.result ?? "unreadable"} (${mechs.get(r)})` };
  }
  for (const r of c.requirements) if (!mechs.has(r)) return { verdict: "Resolve", action: `declare ${r}`, why: "no mechanism under .cairn/mechanisms names it" };
  return { verdict: "Done", action: c.slug, why: `every requirement in ${c.slug} has passing evidence` };
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

function usage(msg) {
  process.stderr.write(`cairn: ${msg}\n`);
  return 3;
}

function main() {
  let a;
  try {
    a = parseArgs({ args: process.argv.slice(2), allowPositionals: true, strict: true, options: {
      root: { type: "string" }, title: { type: "string" }, level: { type: "string" }, "decided-by": { type: "string" },
      "rests-on": { type: "string" }, "wrong-if": { type: "string" }, body: { type: "string" }, supersedes: { type: "string" }, cause: { type: "string" } } });
  } catch (e) { return usage(e.message); }
  const root = a.values.root ?? process.cwd();
  const [cmd] = a.positionals;
  if (cmd === "decide") return decide(root, a.values);
  if (cmd !== "wake") return usage("usage: cairn <wake|decide> [--root DIR]");
  if (!existsSync(join(root, "docs", "spec", "roadmap.md"))) return usage(`${root} is not a Cairn repository (no docs/spec/roadmap.md)`);
  const w = wake(root);
  process.stdout.write(`${w.verdict}: ${w.action}\n  ${w.why}\n`);
  return VERDICT[w.verdict];
}

process.exit(main());
