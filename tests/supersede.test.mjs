// cairn supersede and cairn reversals: a reversal stays in history with
// its cause, and a new decision in a reversed domain accounts for it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repo, cairn } from "./helpers.mjs";

const fields = ["--decided-by", "agent", "--wrong-if", "w", "--body", "b"];
const old = (root, slug = "old-one", rests = "R-001") => writeFileSync(join(root, "docs/decisions", `${slug}.md`),
  `# Old one\n\nLevel: Judged\nDecided by: developer\nRests on: ${rests}\nWould be wrong if: x\n\n## Decision\n\nOriginal text.\n\n## Realized by\n\n- abc1234  did it\n`);

test("supersede writes both lines, and the old record keeps every word it had (DEC-008, DEC-010)", () => {
  const root = repo(); old(root);
  const r = cairn(root, "supersede", "old-one", "--title", "New one", "--level", "Judged", "--rests-on", "R-001", "--cause", "the premise was false", ...fields);
  assert.equal(r.status, 0, r.stderr);
  const n = readFileSync(join(root, "docs/decisions/new-one.md"), "utf8");
  assert.ok(n.includes("Supersedes: old-one") && n.includes("Cause: the premise was false"));
  const o = readFileSync(join(root, "docs/decisions/old-one.md"), "utf8");
  assert.ok(o.includes("Superseded by: new-one") && o.includes("Original text.") && o.includes("- abc1234  did it"));
});

test("supersede without a cause, or with one outside the four, is refused (DEC-009)", () => {
  const root = repo(); old(root);
  assert.equal(cairn(root, "supersede", "old-one", "--title", "N", "--level", "Judged", "--rests-on", "R-001", ...fields).status, 3);
  assert.equal(cairn(root, "supersede", "old-one", "--title", "N", "--level", "Judged", "--rests-on", "R-001", "--cause", "vibes", ...fields).status, 3);
});

test("supersede of a record that does not exist is refused", () => {
  const r = cairn(repo(), "supersede", "ghost", "--title", "N", "--level", "Judged", "--rests-on", "R-001", "--cause", "the premise was false", ...fields);
  assert.equal(r.status, 3); assert.match(r.stderr, /ghost/);
});

test("a predecessor with no title line cannot be stamped, so nothing is written", () => {
  const root = repo();
  writeFileSync(join(root, "docs/decisions/bare.md"), "Level: Judged\nRests on: R-001\n");
  const r = cairn(root, "supersede", "bare", "--title", "N", "--level", "Judged", "--rests-on", "R-001", "--cause", "the premise was false", ...fields);
  assert.equal(r.status, 3); assert.match(r.stderr, /no title line/);
  assert.equal(readFileSync(join(root, "docs/decisions/bare.md"), "utf8"), "Level: Judged\nRests on: R-001\n");
});

test("reversals reports counts by decider, cause, and domain (DEC-011)", () => {
  const root = repo(); old(root, "a", "R-001"); old(root, "b", "Q-007");
  cairn(root, "supersede", "a", "--title", "A2", "--level", "Judged", "--rests-on", "R-001", "--cause", "the premise was false", ...fields, "--history", "h");
  cairn(root, "supersede", "b", "--title", "B2", "--level", "Judged", "--rests-on", "Q-007", "--cause", "it was wrong when it was made", ...fields, "--history", "h");
  const r = cairn(root, "reversals");
  assert.equal(r.status, 0);
  assert.match(r.stdout, /reversals: 2 of 4/);
  assert.match(r.stdout, /by decider: developer 2/);
  assert.match(r.stdout, /by cause: it was wrong when it was made 1, the premise was false 1/);
  assert.match(r.stdout, /by domain: Q 1, R 1/);
});

test("decide in a domain with a reversal is refused without --history, naming the reversal; with it, the record carries History (DEC-012)", () => {
  const root = repo(); old(root);
  cairn(root, "supersede", "old-one", "--title", "New one", "--level", "Judged", "--rests-on", "R-001", "--cause", "the premise was false", ...fields);
  let r = cairn(root, "decide", "--title", "Third", "--level", "Judged", "--rests-on", "R-002", ...fields);
  assert.equal(r.status, 3); assert.match(r.stderr, /old-one/); assert.match(r.stderr, /DEC-012/);
  r = cairn(root, "decide", "--title", "Third", "--level", "Judged", "--rests-on", "R-002", ...fields, "--history", "the earlier reversal was a false premise, so this stays Judged");
  assert.equal(r.status, 0, r.stderr);
  assert.ok(readFileSync(join(root, "docs/decisions/third.md"), "utf8").includes("History: the earlier reversal"));
});

test("decide in a domain with no reversals needs no --history", () => {
  const root = repo(); old(root, "a", "R-001");
  cairn(root, "supersede", "a", "--title", "A2", "--level", "Judged", "--rests-on", "R-001", "--cause", "the premise was false", ...fields);
  const r = cairn(root, "decide", "--title", "Elsewhere", "--level", "Judged", "--rests-on", "Q-001", ...fields);
  assert.equal(r.status, 0, r.stderr);
});

test("a record resting on prose alone is in the domain unspecified, and so is the next one", () => {
  const root = repo(); old(root, "a", "the developer's ruling");
  cairn(root, "supersede", "a", "--title", "A2", "--level", "Judged", "--rests-on", "a later ruling", "--cause", "the premise was false", ...fields);
  const r = cairn(root, "decide", "--title", "Prose", "--level", "Judged", "--rests-on", "common practice", ...fields);
  assert.equal(r.status, 3); assert.match(r.stderr, /unspecified/);
});
