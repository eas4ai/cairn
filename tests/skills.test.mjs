import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./helpers/hookenv.mjs";

// Deviation from the plan text: the plan's literal nodeIds() has no way to tell a real flow node
// ("start [shape=oval, ...]") from one of Graphviz's own default-attribute statements ("graph
// [fontname=...]", "node [shape=box, ...]", "edge [fontname=...]"), which use the identical
// "word [" syntax and open every digraph in docs/diagrams/. Verified directly: running the plan's
// regex over each of the six .dot files returns "graph", "node" and "edge" as the first three ids
// every time, before any real node. graph/node/edge are reserved DOT keywords there, never a flow
// step, so they are excluded here; every other extracted id is unaffected.
const DOT_KEYWORDS = new Set(["graph", "node", "edge"]);
export const nodeIds = (dot) => [...readFileSync(join(ROOT, "docs/diagrams", dot), "utf8").matchAll(/^\s*([a-z][a-z_]*)\s*\[/gm)].map((m) => m[1]).filter((id) => !DOT_KEYWORDS.has(id));
export const skill = (name) => readFileSync(join(ROOT, "skills", name, "SKILL.md"), "utf8");
const AGENTS_TEMPLATE = () => readFileSync(join(ROOT, "skills/new-project/templates/AGENTS.md"), "utf8");
const help = spawnSync(process.execPath, [join(ROOT, "bin/cairn.mjs"), "--help"], { encoding: "utf8" }).stdout;

// Round 1 fix, items 1-3: the plan's own cairnCommands() only ever checked that the bare command
// word appeared somewhere in --help, never the flags after it -- so `cairn decide --consequential
// --quote "..."` (--quote belongs only to supersede, not decide), `cairn outside <item> "<why...>"`
// (a bare positional where the real command needs --reason <text>) and `cairn review SLUG` (missing
// the --file <path> the real command requires) all read as plausible without ever being run. Fixed
// review-1 finding 1-3 lines in skills/*/SKILL.md and templates/AGENTS.md, and, while sweeping
// every other `cairn ` invocation in those same files, found and fixed one more: `cairn item
// --next-feature --changes <REQ>` -- itemCommand (lib/cli.mjs) never reads a --changes flag at all.
//
// parseCommandFlags(helpText) reads --help's own usage lines (the same text `cairn --help` prints,
// not a hand-copied list) into { command name -> Set of every --flag token that command's usage
// line names }, so a skill or template invocation can be checked against the flags the CLI itself
// actually documents, not a snapshot that drifts from lib/cli.mjs. "review <slug> --file <path> |
// review mechanism <REQ> <fail-receipt>" is the one usage line with two forms with two different
// first words; each side is parsed under its own name ("review" and "review mechanism") so a
// "review mechanism ..." invocation is never checked against --file, which only the plain form
// takes.
//
// Plan 16, Task 4 fix (own finding, not in the brief's named files): `decide`'s usage line gained
// a second " | "-separated form with plan 16 (`decide --consequential --title ...` for the
// spec-phase deference decision, `decide --consequential --commitment ...` for the measured
// work-loop draft) -- but unlike review/review mechanism, both forms start with the same word
// "decide", so they map to the same `name` here. The old code did `map.set(name, new Set(...))`
// per part, so the second part's flag set silently replaced the first's instead of adding to it,
// and any skill invocation using --title/--rests-on/--wrong-if/--body (the first form's own
// flags) then read as using flags "not real" of decide. Accumulated into the existing set instead
// of overwriting it -- a flag is valid for a command if any of its usage variants lists it, which
// is exactly what "two legitimate flag sets for the same command word" means. review/review
// mechanism are unaffected: they already used, and still use, two distinct map keys.
function parseCommandFlags(helpText) {
  const map = new Map();
  for (const raw of helpText.split("\n")) {
    const m = raw.match(/^\s*cairn (.+)$/);
    if (!m) continue;
    for (const part of m[1].split(" | ")) {
      const words = part.trim().split(/\s+/);
      if (!/^[a-z][a-z-]*$/.test(words[0])) continue; // skips the bare "--help" line
      const mech = words[0] === "review" && words[1] === "mechanism";
      const name = mech ? "review mechanism" : words[0];
      const rest = (mech ? words.slice(2) : words.slice(1)).join(" ");
      const flags = map.get(name) ?? new Set();
      for (const f of rest.matchAll(/--[a-z][a-z-]*/g)) flags.add(f[0]);
      map.set(name, flags);
    }
  }
  return map;
}
const COMMAND_FLAGS = parseCommandFlags(help);

// declare (lib/mechanisms.mjs) and check (lib/check.mjs) are real library functions that plan 05's
// own goal names as CLI commands, but lib/cli.mjs's COMMANDS table has never wired either one in
// (confirmed by reading the whole table and by COMMAND_FLAGS not having a "declare" or "check" key
// below). lib/cli.mjs is outside this plan's file ownership. This exception is computed from
// COMMAND_FLAGS itself, not hand-maintained: the moment either word is wired into --help,
// COMMAND_FLAGS gains that key and the exception for it drops on its own, with no edit needed here.
const NOT_YET_WIRED = new Set(["declare", "check"].filter((w) => !COMMAND_FLAGS.has(w)));

// Checks every `cairn ...` backtick invocation in text: the subcommand (or "review mechanism")
// must be a real command --help lists (skip declare/check while NOT_YET_WIRED), and every --flag
// token used in the invocation must be one that command's own --help usage line names. This is a
// flag-validity check (a flag either belongs to the command or it doesn't), not a
// required-flag-presence check: a short reference like `cairn decide --consequential` or `cairn
// item --backlog` (a real flag, just not the whole invocation) is legitimate prose naming which
// command/mode handles something, and is not flagged merely for being short. An invented flag
// (--quote on decide) or a command absent from --help (typo'd or never wired) always fails.
export function checkInvocations(text, label) {
  for (const inv of [...text.matchAll(/`cairn ([^`]*)`/g)].map((m) => m[1])) {
    const words = inv.trim().split(/\s+/);
    if (!/^[a-z][a-z-]*$/.test(words[0])) continue; // e.g. "cairn --help"
    const mech = words[0] === "review" && words[1] === "mechanism";
    const name = mech ? "review mechanism" : words[0];
    if (NOT_YET_WIRED.has(name)) continue;
    assert.ok(COMMAND_FLAGS.has(name), `${label} names cairn ${name}, absent from --help`);
    const validFlags = COMMAND_FLAGS.get(name);
    for (const w of mech ? words.slice(2) : words.slice(1)) {
      if (!w.startsWith("--")) continue;
      const flag = w.replace(/[^a-z-]+$/, "");
      assert.ok(validFlags.has(flag), `${label} uses cairn ${name} ${flag}, not a real flag of it (real flags: ${[...validFlags].join(", ") || "none"})`);
    }
  }
}

export function checkSkill(name, dots) {
  const text = skill(name);
  for (const dot of dots) for (const id of nodeIds(dot)) assert.ok(new RegExp("^#+ .*`" + id + "`", "m").test(text), `${name} lacks node ${id} of ${dot}`);
  checkInvocations(text, name);
  assert.ok(/^---\nname: [a-z-]+\ndescription: .+\n(disable-model-invocation: true\n)?---\n/.test(text), `${name} front matter`);
  assert.ok(!/[^\x00-\x7f]/.test(text), `${name} is not ASCII`);
  assert.ok(!text.includes("next-iteration"), name);
}

test("--help prints", () => assert.ok(help.length > 0));
test("install-cairn follows install.dot and names only real commands", () => checkSkill("install-cairn", ["install.dot"]));
test("install-cairn never asks for a project remote", () => {
  const t = skill("install-cairn");
  assert.ok(!/authority_remote|project remote|git remote add/.test(t)); assert.ok(t.includes("~/.local/bin/cairn"));
});

export const tail = (name) => { const t = skill(name), i = t.indexOf("## Spec-phase tail"); assert.ok(i >= 0, name); return t.slice(i); };

test("new-project follows new-project.dot and spec-phase.dot", () => checkSkill("new-project", ["new-project.dot", "spec-phase.dot"]));
test("new-project names the four gates in order", () => {
  const t = skill("new-project"), at = ["Gate 1", "Gate 2", "Gate 3", "Gate 4"].map((g) => t.indexOf(g));
  assert.ok(at.every((i, k) => i >= 0 && (k === 0 || i > at[k - 1])), at);
});
test("the AGENTS.md template states a move for every verdict and action", () => {
  const t = AGENTS_TEMPLATE();
  for (const v of ["Resolvable", "Waiting", "Done"]) assert.ok(new RegExp("^- " + v + ":", "m").test(t), v);
  for (const a of ["repair PATH", "recover TRANSACTION", "reconcile ACTION", "scope PATH", "fix ITEM", "record PATH", "commit PATH", "declare REQ", "run REQ", "implement REQ", "escalate REQ", "review mechanism REQ", "capture ITEM", "review SLUG", "report SLUG", "resolve SLUG N", "accept SLUG", "build DECISION", "done SLUG", "promote", "reply SLUG"]) assert.ok(t.includes("`" + a + "`"), a);
  assert.ok(t.includes("`cairn push`"));
  for (const gone of ["explain", "present", "reword", "next-iteration", "refus"]) assert.ok(!t.includes(gone), gone);
  assert.ok(!/[^\x00-\x7f]/.test(t));
});
test("the AGENTS.md template covers the measure step for a Consequential decision", () => {
  const t = AGENTS_TEMPLATE();
  assert.ok(t.includes("`cairn measure`"), "names the command");
  assert.ok(/suggested/.test(t), "mentions reading the suggestion");
  assert.ok(t.includes("`cairn decide --consequential"), "still names the decide command");
  assert.ok(t.includes("`cairn escalate --consequential"), "names the new escalate flag");
  assert.ok(/advi[cs]/.test(t) || /information, not consent/.test(t), "says the suggestion is advice, not a route");
  for (const gone of ["shadow", "route mode", "capture the recommended option"]) assert.ok(!t.includes(gone), gone);
  assert.ok(!/[^\x00-\x7f]/.test(t));
});
test("every cairn invocation in the AGENTS.md template is a real command with real flags", () => checkInvocations(AGENTS_TEMPLATE(), "templates/AGENTS.md"));

test("existing-project follows existing-project.dot and spec-phase.dot", () => checkSkill("existing-project", ["existing-project.dot", "spec-phase.dot"]));
test("existing-project carries the same spec-phase tail as new-project", () => assert.equal(tail("existing-project"), tail("new-project")));
test("existing-project names supersession as two phases", () => {
  const t = skill("existing-project");
  assert.ok(t.includes("`cairn supersede ")); assert.ok(/does not move `Current:`/.test(t)); assert.ok(/points back to the superseded record/.test(t));
});

test("next-feature follows next-feature.dot and spec-phase.dot", () => checkSkill("next-feature", ["next-feature.dot", "spec-phase.dot"]));
test("next-feature carries the same spec-phase tail", () => assert.equal(tail("next-feature"), tail("new-project")));
test("next-feature runs from Done only", () => assert.ok(/says Done\?[\s\S]*Stop/.test(skill("next-feature"))));
