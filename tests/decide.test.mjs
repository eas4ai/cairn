// cairn decide: a structured decision record, queued when Consequential.
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, existsSync, readdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { repo as project } from "./helpers.mjs";

const CLI = fileURLToPath(new URL("../bin/cairn.mjs", import.meta.url));
// A Cairn repository: the commands refuse to run outside one (LOOP-118).
const repo = () => project();
const base = ["--title", "Sessions live in SQLite", "--decided-by", "agent", "--rests-on", "PKG-001",
              "--wrong-if", "we need cross-process access", "--body", "Because it is there."];
const decide = (root, ...extra) => spawnSync("node", [CLI, "decide", ...base, ...extra], { cwd: root, encoding: "utf8" });

test("writes a record with every required field and an empty realized-by (DEC-001, DEC-005)", () => {
  const root = repo();
  const r = decide(root, "--level", "Judged");
  assert.equal(r.status, 0, r.stderr);
  const p = join(root, "docs/decisions/sessions-live-in-sqlite.md");
  assert.ok(existsSync(p));
  const t = readFileSync(p, "utf8");
  for (const s of ["# Sessions live in SQLite", "Level: Judged", "Decided by: agent", "Rests on: PKG-001",
                   "Would be wrong if: we need cross-process access", "## Decision", "Because it is there.", "## Realized by"]) assert.ok(t.includes(s), s);
  assert.doesNotMatch(t, /^- [0-9a-f]{7}/m);
  assert.equal(readdirSync(join(root, ".cairn/queue")).length, 0);
});

test("a Consequential decision is queued for review (DEC-013)", () => {
  const root = repo();
  assert.equal(decide(root, "--level", "Consequential").status, 0);
  assert.ok(existsSync(join(root, ".cairn/queue/sessions-live-in-sqlite")));
});

test("a Consequential decision is queued even when .cairn/queue does not exist yet", () => {
  const root = project();
  rmSync(join(root, ".cairn/queue"), { recursive: true, force: true });
  const r = decide(root, "--level", "Consequential");
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(join(root, ".cairn/queue/sessions-live-in-sqlite")));
});

test("Routine is refused: routine decisions produce no record", () => {
  const root = repo();
  const r = decide(root, "--level", "Routine");
  assert.equal(r.status, 3);
  assert.match(r.stderr, /Routine/);
  assert.equal(readdirSync(join(root, "docs/decisions")).length, 0);
});

test("a missing field is a usage error and nothing is written", () => {
  const root = repo();
  const r = spawnSync("node", [CLI, "decide", "--title", "x", "--level", "Judged"], { cwd: root, encoding: "utf8" });
  assert.equal(r.status, 3);
  assert.equal(readdirSync(join(root, "docs/decisions")).length, 0);
});

test("supersedes requires a classified cause, and the old record must exist", () => {
  const root = repo();
  assert.equal(decide(root, "--level", "Judged", "--supersedes", "old", "--cause", "the premise was false").status, 3, "no such record");
  writeFileSync(join(root, "docs/decisions/old.md"), "# Old\n\nLevel: Judged\nRests on: Q-1\n\n## Realized by\n\n- abc1234  x\n");
  assert.equal(decide(root, "--level", "Judged", "--supersedes", "old").status, 3, "no cause");
  const r = decide(root, "--level", "Judged", "--supersedes", "old", "--cause", "the premise was false");
  assert.equal(r.status, 0, r.stderr);
  const t = readFileSync(join(root, "docs/decisions/sessions-live-in-sqlite.md"), "utf8");
  assert.ok(t.includes("Supersedes: old") && t.includes("Cause: the premise was false"));
});

test("an existing record is not overwritten", () => {
  const root = repo();
  const first = decide(root, "--level", "Judged");
  assert.equal(first.status, 0, first.stderr || first.error?.message || "initial decision was not written");
  const path = join(root, "docs/decisions/sessions-live-in-sqlite.md"), original = readFileSync(path, "utf8");
  const r = decide(root, "--level", "Judged");
  assert.equal(r.status, 3);
  assert.match(r.stderr, /exists/);
  assert.equal(readFileSync(path, "utf8"), original);
});

test("a queued decision stays queued; nothing but the developer removes it (DEC-014)", () => {
  const root = project();
  decide(root, "--level", "Consequential");
  assert.ok(existsSync(join(root, ".cairn/queue/sessions-live-in-sqlite")));
  for (const command of ["wake", "check"]) {
    const r = spawnSync("node", [CLI, command], { cwd: root, encoding: "utf8" });
    assert.notEqual(r.status, 3, r.stderr);
  }
  assert.ok(existsSync(join(root, ".cairn/queue/sessions-live-in-sqlite")));
});

// --- the decider vocabulary (DEC-020) ---

const decidedBy = (root, value) => spawnSync("node", [CLI, "decide", "--title", "Sessions live in SQLite", "--level", "Judged",
  "--decided-by", value, "--rests-on", "PKG-001", "--wrong-if", "we need cross-process access", "--body", "Because it is there."],
  { cwd: root, encoding: "utf8" });
const decidedByLine = (root) => /^Decided by: (.*)$/m.exec(readFileSync(join(root, "docs/decisions/sessions-live-in-sqlite.md"), "utf8"))[1];

test("each accepted decider is stored lowercase, whatever case it was typed in (DEC-020)", () => {
  for (const [typed, stored] of [["developer", "developer"], ["agent", "agent"], ["joint", "joint"],
                                 ["Developer", "developer"], ["AGENT", "agent"], ["Joint", "joint"], ["  agent  ", "agent"]]) {
    const root = repo();
    const r = decidedBy(root, typed);
    assert.equal(r.status, 0, `${JSON.stringify(typed)}: ${r.stderr}`);
    assert.equal(decidedByLine(root), stored, JSON.stringify(typed));
  }
});

test("a decider outside the vocabulary is a usage error naming all three, and nothing is written (DEC-020)", () => {
  for (const value of ["Codex", "Shawn", "Shawn and Codex", "agents", "dev", "   "]) {
    const root = repo();
    const r = decidedBy(root, value);
    assert.equal(r.status, 3, `${JSON.stringify(value)} was accepted: ${r.stdout}`);
    for (const word of ["developer", "agent", "joint", "DEC-020"]) assert.match(r.stderr, new RegExp(word), `${JSON.stringify(value)}: ${word}`);
    assert.equal(readdirSync(join(root, "docs/decisions")).length, 0, JSON.stringify(value));
  }
});

test("an empty --decided-by is the missing-field error, not the vocabulary one", () => {
  const root = repo();
  const r = decidedBy(root, "");
  assert.equal(r.status, 3, r.stdout);
  assert.match(r.stderr, /missing --decided-by/);
  assert.equal(readdirSync(join(root, "docs/decisions")).length, 0);
});
