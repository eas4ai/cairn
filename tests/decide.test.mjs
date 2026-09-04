// cairn decide: a structured decision record, queued when Consequential.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const CLI = new URL("../bin/cairn.mjs", import.meta.url).pathname;
function repo() {
  const root = mkdtempSync(join(tmpdir(), "cairn-"));
  mkdirSync(join(root, "docs/decisions"), { recursive: true });
  mkdirSync(join(root, ".cairn/queue"), { recursive: true });
  return root;
}
const base = ["--title", "Sessions live in SQLite", "--decided-by", "agent", "--rests-on", "PKG-001",
              "--wrong-if", "we need cross-process access", "--body", "Because it is there."];
const decide = (root, ...extra) => spawnSync("node", [CLI, "decide", ...base, ...extra], { cwd: root, encoding: "utf8" });

test("writes a record with every required field and an empty realized-by", () => {
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

test("a Consequential decision is queued for review", () => {
  const root = repo();
  assert.equal(decide(root, "--level", "Consequential").status, 0);
  assert.ok(existsSync(join(root, ".cairn/queue/sessions-live-in-sqlite")));
});

test("a Consequential decision is queued even when .cairn/queue does not exist yet", () => {
  const root = mkdtempSync(join(tmpdir(), "cairn-"));
  mkdirSync(join(root, "docs/decisions"), { recursive: true });
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
  decide(root, "--level", "Judged");
  const r = decide(root, "--level", "Judged");
  assert.equal(r.status, 3);
  assert.match(r.stderr, /exists/);
});

test("a queued decision stays queued; nothing but the developer removes it (DEC-014)", () => {
  const root = repo();
  decide(root, "--level", "Consequential");
  spawnSync("node", [CLI, "wake"], { cwd: root, encoding: "utf8" });
  assert.ok(existsSync(join(root, ".cairn/queue/sessions-live-in-sqlite")));
});
