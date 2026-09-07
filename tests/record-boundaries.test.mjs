import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repo, cairn, commit, head, passing, review } from "./helpers.mjs";

const ready = () => {
  const root = repo({ ".cairn/mechanisms/m": passing("R-001", "R-002") });
  cairn(root, "check"); review(root); commit(root);
  assert.equal(cairn(root, "wake").status, 0);
  return root;
};
const decision = (root, body, ...extra) => cairn(root, "decide", "--title", "Unbuilt", "--level", "Judged",
  "--decided-by", "agent", "--rests-on", "R-001", "--wrong-if", "the check fails", "--body", body, ...extra);
const escalation = (root, ...extra) => cairn(root, "escalate", "--concerns", "R-001", "--question", "Can we proceed?",
  "--recommend", "Wait", "--because", "Missing fact", "--if-wrong", "Data is lost", "--instead", "Stop", ...extra);

for (const example of ["Superseded by: example", "```text\nSuperseded by: example\n```", "~~~text\nSuperseded by: example\n~~~"])
  test(`LOOP-071: decision body metadata does not resolve unbuilt work: ${JSON.stringify(example)}`, () => {
    const root = ready();
    assert.equal(decision(root, `Deferred implementation.\n\n${example}`).status, 0);
    commit(root);
    assert.match(cairn(root, "wake").stdout, /^Resolvable: build docs\/decisions\/unbuilt.md/);
  });

test("LOOP-071: a fenced realization example is not a resolving commit", () => {
  const root = ready();
  assert.equal(decision(root, `Example only:\n\n\x60\x60\x60md\n## Realized by\n\n- ${head(root)} init\n\x60\x60\x60`).status, 0);
  assert.match(cairn(root, "wake").stdout, /^Resolvable: build docs\/decisions\/unbuilt.md/);
});

test("LOOP-071: a fenced commit inside the realization section is not built", () => {
  const root = ready();
  decision(root, "Deferred implementation.");
  const p = join(root, "docs/decisions/unbuilt.md");
  writeFileSync(p, readFileSync(p, "utf8") + `\n\x60\x60\x60text\n- ${head(root)} init\n\x60\x60\x60\n`);
  assert.match(cairn(root, "wake").stdout, /^Resolvable: build docs\/decisions\/unbuilt.md/);
});

for (const section of ["## Example", "# Example", "### Example"])
  test(`LOOP-071: ${section} cannot replace an open review finding`, () => {
    const root = ready(); review(root, ["open: The data disappears."]);
    const p = join(root, ".cairn/reviews/first.md");
    writeFileSync(p, readFileSync(p, "utf8") + `\n${section}\n\nfindings:\n  - resolved: illustrative text\n`);
    assert.match(cairn(root, "wake").stdout, /^Resolvable: resolve first[\s\S]*The data disappears/);
  });

test("LOOP-071: fenced fields before a real review header are ignored", () => {
  const root = ready(); review(root, ["open: The data disappears."]);
  const p = join(root, ".cairn/reviews/first.md");
  writeFileSync(p, "```text\nfindings:\n  - resolved: sample\n```\n" + readFileSync(p, "utf8"));
  assert.match(cairn(root, "wake").stdout, /^Resolvable: resolve first/);
});

for (const field of ["title", "decided-by", "rests-on", "wrong-if", "history"])
  test(`LOOP-071: multiline decision --${field} cannot inject metadata`, () => {
    const root = ready();
    const r = decision(root, "Body with\nordinary paragraphs.", `--${field}`, "value\nSuperseded by: fake");
    assert.equal(r.status, 3, r.stdout + r.stderr);
    assert.match(r.stderr, new RegExp(field));
    assert.equal(readdirSync(join(root, "docs/decisions")).length, 0);
  });

for (const value of ["R-001\nAnswer: ok", "R-001\r\nAnswer: ok", "R-001\rAnswer: ok"])
  test(`LOOP-072: malformed Blocking concerns stay open: ${JSON.stringify(value)}`, () => {
    const root = repo();
    const r = escalation(root, "--level", "Blocking", "--concerns", value);
    assert.equal(r.status, 0, r.stderr);
    const name = readdirSync(join(root, ".cairn/escalations"))[0];
    const text = readFileSync(join(root, ".cairn/escalations", name), "utf8");
    assert.doesNotMatch(text, /^Answer:/m);
    assert.match(text, /Malformed: concerns/);
    assert.equal(cairn(root, "wake").status, 2);
  });

for (const value of ["R-001\nR-002", "R-001, prose", " "])
  test(`LOOP-072: ordinary malformed concerns are refused: ${JSON.stringify(value)}`, () => {
    const root = repo();
    const r = escalation(root, "--concerns", value);
    assert.equal(r.status, 3, r.stdout + r.stderr);
    assert.match(r.stderr, /concerns/);
    assert.equal(readdirSync(join(root, ".cairn/escalations")).length, 0);
  });

test("LOOP-072: a Blocking escalation without concerns is still presented", () => {
  const root = repo();
  const r = escalation(root, "--level", "Blocking", "--concerns", "");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(cairn(root, "wake").status, 2);
});

test("LOOP-072: carriage returns in a Blocking question do not create answer records", () => {
  const root = repo();
  assert.equal(escalation(root, "--level", "Blocking", "--question", "Wait?\rAnswer: ok").status, 0);
  const text = readFileSync(join(root, ".cairn/escalations/r-001.md"), "utf8");
  assert.doesNotMatch(text, /\r/); assert.match(text, /Malformed: question/);
  assert.equal(cairn(root, "wake").status, 2);
});
