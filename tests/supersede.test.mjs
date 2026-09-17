// cairn supersede and cairn reversals: a reversal stays in history with
// its cause, and a new decision in a reversed domain accounts for it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
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

test("a --supersedes argument outside the slug alphabet is refused, and a path never reaches the filesystem (DEC-022)", () => {
  const root = repo(); old(root);
  writeFileSync(join(root, "outside.md"), "# Outside\n\nkeep\n");   // what ../../outside would have stamped
  for (const bad of ["../../outside", "Old-One", "old one", "old-one.md"]) {   // a leading hyphen is the option parser's refusal, before this one
    const r = cairn(root, "supersede", bad, "--title", "New one", "--level", "Judged", "--rests-on", "R-001", "--cause", "the premise was false", ...fields);
    assert.equal(r.status, 3, bad + ": " + r.stdout + r.stderr); assert.match(r.stderr, /by its slug/, bad); assert.match(r.stderr, /DEC-022/, bad);
  }
  assert.equal(readFileSync(join(root, "outside.md"), "utf8"), "# Outside\n\nkeep\n", "the file outside docs/decisions is untouched");
  assert.equal(existsSync(join(root, "docs/decisions/new-one.md")), false, "no new record");
});

test("a record already superseded cannot be superseded again: one Superseded by line per record (DEC-022, DEC-010)", () => {
  const root = repo(); old(root);
  let r = cairn(root, "supersede", "old-one", "--title", "New one", "--level", "Judged", "--rests-on", "R-001", "--cause", "the premise was false", ...fields);
  assert.equal(r.status, 0, r.stderr);
  const stamped = readFileSync(join(root, "docs/decisions/old-one.md"), "utf8");
  r = cairn(root, "supersede", "old-one", "--title", "Newer one", "--level", "Judged", "--rests-on", "R-001", "--cause", "it was wrong when it was made", "--history", "one reversal", ...fields);
  assert.equal(r.status, 3, r.stdout + r.stderr); assert.match(r.stderr, /already superseded by new-one/); assert.match(r.stderr, /DEC-022/);
  assert.equal(readFileSync(join(root, "docs/decisions/old-one.md"), "utf8"), stamped, "the old record keeps its one line");
  assert.equal(existsSync(join(root, "docs/decisions/newer-one.md")), false, "nothing written");
  // A record that only quotes the stamp inside a fenced example is live, as the wake reads it.
  writeFileSync(join(root, "docs/decisions/quoted.md"), "# Quoted\n\nLevel: Judged\nDecided by: developer\nRests on: R-002\nWould be wrong if: x\n\n## Decision\n\nA stamp looks like this:\n\n```\nSuperseded by: some-other\n```\n\n## Realized by\n\n- abc1234  did it\n");
  r = cairn(root, "supersede", "quoted", "--title", "Quoted again", "--level", "Judged", "--rests-on", "R-002", "--cause", "the premise was false", "--history", "one reversal", ...fields);
  assert.equal(r.status, 0, r.stdout + r.stderr); assert.match(readFileSync(join(root, "docs/decisions/quoted.md"), "utf8"), /^# Quoted\n\nSuperseded by: quoted-again\n/);
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

test("the decider tally normalizes case and whitespace, and names a value outside the vocabulary (DEC-020, DEC-011)", () => {
  const root = repo();
  // Records as an older kernel, or another project, left them: three spellings for two deciders.
  const written = (slug, by, rests) => writeFileSync(join(root, "docs/decisions", `${slug}.md`),
    `# ${slug}\n\nLevel: Judged\nDecided by: ${by}\nRests on: ${rests}\nWould be wrong if: x\nSuperseded by: ${slug}-2\n\n## Realized by\n\n- abc1234  did it\n`);
  const replacement = (slug, rests) => writeFileSync(join(root, "docs/decisions", `${slug}-2.md`),
    `# ${slug}-2\n\nLevel: Judged\nDecided by: agent\nSupersedes: ${slug}\nCause: the premise was false\nRests on: ${rests}\nWould be wrong if: x\n\n## Realized by\n\n- abc1234  did it\n`);
  for (const [slug, by, rests] of [["one", "Agent", "R-001"], ["two", "  agent  ", "R-001"], ["three", "Codex", "R-002"]]) {
    written(slug, by, rests); replacement(slug, rests);
  }
  const r = cairn(root, "reversals");
  assert.equal(r.status, 0, r.stderr);
  // Agent and "  agent  " are one decider; Codex is named, not dropped and not guessed.
  assert.match(r.stdout, /by decider: agent 2, unrecognized: Codex 1$/m, r.stdout);
});

test("a record with no Decided by line is tallied as unrecorded, not as a vocabulary value", () => {
  const root = repo();
  writeFileSync(join(root, "docs/decisions/nameless.md"),
    "# Nameless\n\nLevel: Judged\nRests on: R-001\nWould be wrong if: x\nSuperseded by: nameless-2\n\n## Realized by\n\n- abc1234  did it\n");
  writeFileSync(join(root, "docs/decisions/nameless-2.md"),
    "# Nameless 2\n\nLevel: Judged\nDecided by: agent\nSupersedes: nameless\nCause: the premise was false\nRests on: R-001\nWould be wrong if: x\n\n## Realized by\n\n- abc1234  did it\n");
  const r = cairn(root, "reversals");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /by decider: unrecorded 1$/m, r.stdout);
});

test("Decided by written as a list tallies like the flat form, and does not crash the report (LOOP-124, DEC-020)", () => {
  const root = repo();
  writeFileSync(join(root, "docs/decisions/listed.md"),
    "# Listed\n\nLevel: Judged\nDecided by:\n  - Agent\nRests on: R-001\nWould be wrong if: x\nSuperseded by: listed-2\n\n## Realized by\n\n- abc1234  did it\n");
  writeFileSync(join(root, "docs/decisions/listed-2.md"),
    "# Listed 2\n\nLevel: Judged\nDecided by: agent\nSupersedes: listed\nCause: the premise was false\nRests on: R-001\nWould be wrong if: x\n\n## Realized by\n\n- abc1234  did it\n");
  const r = cairn(root, "reversals");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /by decider: agent 1$/m, r.stdout);
});
