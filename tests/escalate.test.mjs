// cairn escalate and cairn answer: one Blocking decision at a time, in
// the six-line format, durable on disk, resumable by a stranger.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repo, cairn } from "./helpers.mjs";

const base = ["--concerns", "R-001", "--question", "Store sessions where?", "--recommend", "SQLite",
              "--because", "No infrastructure.", "--if-wrong", "One migration, an hour.", "--instead", "Postgres, if ops prefer it."];
const esc = (root, ...extra) => cairn(root, "escalate", ...base, ...extra);
const file = (root) => join(root, ".cairn/escalations/r-001.md");

test("escalate writes the six-line format followed by its facts, and wake presents it", () => {
  const root = repo();
  const r = esc(root);
  assert.equal(r.status, 0, r.stderr);
  const t = readFileSync(file(root), "utf8");
  const lines = t.split("\n");
  assert.equal(lines[0], "DECISION");
  for (const k of ["Question:   Store sessions where?", "Recommend:  SQLite", "Because:    No infrastructure.",
                   "If wrong:   One migration, an hour.", "Instead:    Postgres, if ops prefer it.", "Reply: ok | instead | ask",
                   "Concerns: R-001", "Status: open", "Raised: "]) assert.ok(t.includes(k), k);
  const w = cairn(root, "wake");
  assert.equal(w.status, 2); assert.match(w.stdout, /^Escalate: present r-001/);
});

test("a missing or multi-line field is refused with the field named, and nothing is written", () => {
  const root = repo();
  let r = cairn(root, "escalate", ...base.filter((x, i) => !(base[i - 1] === "--instead" || x === "--instead")));
  assert.equal(r.status, 3); assert.match(r.stderr, /instead/); assert.ok(!existsSync(file(root)));
  r = esc(root, "--because", "two\nlines");
  assert.equal(r.status, 3); assert.match(r.stderr, /because/); assert.ok(!existsSync(file(root)));
});

test("a Blocking escalation that fails the format is written anyway, naming the malformed field (LOOP-014)", () => {
  const root = repo();
  const r = esc(root, "--because", "two\nlines", "--level", "Blocking");
  assert.equal(r.status, 0, r.stderr);
  assert.ok(readFileSync(file(root), "utf8").includes("Malformed: because"));
  assert.match(cairn(root, "wake").stdout, /^Escalate: present r-001/);
});

test("a --level other than Blocking is refused rather than silently losing the bypass", () => {
  const root = repo();
  const r = esc(root, "--level", "Blokcing");
  assert.equal(r.status, 3); assert.match(r.stderr, /Blokcing/); assert.ok(!existsSync(file(root)));
});

test("a second escalation while one is open is refused (LOOP-011)", () => {
  const root = repo();
  esc(root);
  const r = cairn(root, "escalate", ...base, "--concerns", "R-002");
  assert.equal(r.status, 3); assert.match(r.stderr, /r-001 is open/);
  assert.ok(!existsSync(join(root, ".cairn/escalations/r-002.md")));
});

test("answer records the reply; wake no longer presents it; a second answer is refused", () => {
  const root = repo();
  esc(root);
  let r = cairn(root, "answer", "r-001", "instead");
  assert.equal(r.status, 0, r.stderr);
  const t = readFileSync(file(root), "utf8");
  assert.ok(t.includes("Answer: instead") && t.includes("Answered: "));
  assert.doesNotMatch(cairn(root, "wake").stdout, /^Escalate/);
  r = cairn(root, "answer", "r-001", "ok");
  assert.equal(r.status, 3); assert.match(r.stderr, /already answered/);
});

test("answer to an unknown escalation is refused", () => {
  const r = cairn(repo(), "answer", "nope", "ok");
  assert.equal(r.status, 3);
});

test("a stranger resumes from the file alone: question and answer are both in it (LOOP-013)", () => {
  const root = repo();
  esc(root); cairn(root, "answer", "r-001", "ask: why not both?");
  const t = readFileSync(file(root), "utf8");
  assert.ok(t.includes("Question:   Store sessions where?") && t.includes("Answer: ask: why not both?"));
});

test("after an answer, the same concern can be escalated again under a new name", () => {
  const root = repo();
  esc(root); cairn(root, "answer", "r-001", "ok");
  const r = esc(root);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(join(root, ".cairn/escalations/r-001-2.md")));
});

test("an escalation exists when its file does, committed or not (LOOP-009)", () => {
  const root = repo();
  writeFileSync(file(root), "DECISION\n\nQuestion:   q\n\nConcerns: R-001\nStatus: open\n");
  assert.match(cairn(root, "wake").stdout, /^Escalate: present r-001/);
});
