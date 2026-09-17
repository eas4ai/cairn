// No commitment is Done on the builder's review alone: an independent
// report, committed, for this commitment, naming the review's commit,
// with every finding carried by its number (LOOP-020).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repo as base, cairn, commit, review, fromFile, head } from "./helpers.mjs";

const repo = () => { const root = base({ ".cairn/mechanisms/m": fromFile("R-001", "R-002") }); cairn(root, "check"); return root; };
const wake = (root) => cairn(root, "wake").stdout;
const reportFile = (root) => join(root, ".cairn/reviews/first.independent.md");
// A hand-written report beside a committed review; body follows the reviewer: line.
const handReport = (root, body, { commitment = "first", at = head(root) } = {}) => { review(root, [], null); writeFileSync(reportFile(root), `commitment: ${commitment}\ncommit: ${at}\nreviewer: r\n${body}`); commit(root, "a report"); return wake(root); };

test("no report, one for another commitment, at another commit, or at a value that is not a commit names a new reviewer; an uncommitted review is committed first (LOOP-020)", () => {
  const root = repo();
  review(root, [], null); commit(root, "the builder's review alone");
  assert.match(wake(root), /^Resolvable: review first\n.*the review is current, and no independent report is committed/);
  assert.match(handReport(root, `examined:\n  - x at ${head(root)}\nfindings: []\n`, { commitment: "someone-else" }), /^Resolvable: review first\n.*names commitment someone-else, not first/);
  assert.match(handReport(root, "examined:\n  - x\nfindings: []\n", { at: "0000000" }), /^Resolvable: review first\n.*names 0000000, which is not a commit/);
  assert.match(handReport(root, "examined:\n  - x\nfindings: []\n", { at: `${head(root)}zzzz` }), /which is not a commit/);
  review(root); commit(root, "reviewed");
  writeFileSync(join(root, ".cairn/reviews/first.md"), `commitment: first\ncommit: ${head(root)}\nexamined:\n  - again\nfindings: []\n`); commit(root, "the review redone later");
  assert.match(wake(root), /^Resolvable: review first\n.*names commit [0-9a-f]{7,} and the review names [0-9a-f]{7,}; they must name the same commit/);
  review(root); commit(root, "reviewed again");
  writeFileSync(join(root, ".cairn/reviews/first.md"), readFileSync(join(root, ".cairn/reviews/first.md"), "utf8").replace("  - everything\n", "  - everything, and more\n"));
  assert.match(wake(root), /^Resolvable: commit \.cairn\/reviews\/first\.md\n/);
});

test("an old report re-dated, however it is edited, does not name the new commit and names a new reviewer; a new report with the same words does not (LOOP-020)", () => {
  const root = repo();
  review(root); commit(root, "reviewed");
  const old = readFileSync(reportFile(root), "utf8");
  writeFileSync(join(root, ".cairn/reviews/first.md"), `commitment: first\ncommit: ${head(root)}\nexamined:\n  - again\nfindings: []\n`); commit(root, "the review redone");
  const now = readFileSync(join(root, ".cairn/reviews/first.md"), "utf8").match(/^commit: (.*)$/m)[1];
  for (const edit of [(s) => s, (s) => s + "\n", (s) => s.replace("reviewer: a fresh reviewer", "reviewer: a fresh reviewer!")]) {
    writeFileSync(reportFile(root), edit(old.replace(/^commit: .*$/m, `commit: ${now}`))); commit(root, "re-dated");
    assert.match(wake(root), /does not name commit [0-9a-f]{7} anywhere but its commit: line, so it was not written for this review; ask the reviewer to name the commit it examined/);
  }
  rmSync(reportFile(root)); commit(root, "deleted"); writeFileSync(reportFile(root), old.replace(/^commit: .*$/m, `commit: ${now}`)); commit(root, "re-added");
  assert.match(wake(root), /does not name commit/);
  writeFileSync(reportFile(root), old.replace(/^commit: .*$/m, `commit: ${now}`).replace(/everything at \S+/, `everything at ${now}`)); commit(root, "a new report, same words");
  assert.match(wake(root), /^Done: [\s\S]*its independent report are clean/);
});

test("each finding is carried by the one line citing its number and beginning with its words; malformed reports are repairs (LOOP-020)", () => {
  const root = repo();
  // Entries cite "#n"; the helper writes the report at HEAD, so #n becomes (independent <HEAD> n).
  const carried = (entries, findings) => { const s = head(root).slice(0, 7); review(root, entries.map((e) => e.replace(/#(\d+)/g, `${s} $1`)), findings); commit(root, "carried"); return wake(root); };
  assert.match(carried([], ["empty input breaks the thing"]), /finding 1 is not carried: no review line cites \(independent [0-9a-f]{7} 1\): empty input breaks the thing/);
  assert.match(carried(["open: empty input breaks the thing (independent #1)"], ["empty input breaks the thing"]), /^Resolvable: resolve first/);
  for (const entry of ["resolved: Empty input breaks the thing, fixed (independent #1)", "resolved: empty input breaks the thing. Fixed in abc1234 (independent #1)", "resolved: empty input breaks the thing (reproduced). Resolved: guarded (independent #1)"])
    assert.match(carried([entry], ["empty input breaks the thing"]), /^Done: /, entry);
  assert.match(carried(["resolved: The parser drops wrapped lines, fixed in abc1234 (independent #1)"], ["The parser drops wrapped lines."]), /^Done: /, "a finding ending with a period");
  assert.match(carried(["resolved: a defect, unrelated walkthrough typo fixed"], ["a defect"]), /no review line cites/, "words alone never carry");
  assert.match(carried(["resolved: an unrelated typo, fixed (independent #1)"], ["a defect"]), /does not begin with its words/);
  assert.match(carried(["resolved: the gate, fixed (independent #1) (independent #2)"], ["the gate", "the gate, the parser and the message are wrong"]), /finding 1 is not carried: its review line cites another finding too/);
  assert.match(carried(["resolved: the gate, fixed (independent #1)", "resolved: the gate, again (independent #1)", "resolved: the gate, the parser and the message are wrong. fixed (independent #2)"], ["the gate", "the gate, the parser and the message are wrong"]), /finding 1 is not carried: 2 review lines cite \(independent [0-9a-f]{7} 1\)/);
  assert.match(carried(["resolved: the gate, fixed (independent #1)", "resolved: the gate, the parser and the message are wrong. fixed (independent #2)"], ["the gate", "the gate, the parser and the message are wrong"]), /^Done: /);
  const repairs = /^Resolvable: repair \.cairn\/reviews\/first\.independent\.md\n/;
  for (const tail of ["", "\n## Findings\n\nfindings:\n  - a defect\n", "findings:\n\n  - a defect\n", "findings: none\n", "findings:\n  - the\n    kernel lets an empty report reach Done\n", "findings:\n- the\n  kernel lets an empty report reach Done\n"])
    assert.match(handReport(root, `examined:\n  - x at ${head(root)}\n${tail}`), repairs, tail);   // built at each call, so the report names the commit it is written at
  assert.match(handReport(root, `examined:\n  - x at ${head(root).toUpperCase()}\nfindings: []\n\n- tried x\n  and y\n`, { at: head(root).toUpperCase() }), /^Done: /, "capitals, and prose after the findings list");
  assert.match(handReport(root, `examined:\r\n  - x at ${head(root)}\r\nfindings: []\r\n`), /^Done: /, "CRLF");
});

test("citations name their report's commit, so rounds never collide and an old line never carries a new finding; a wrapped review line is its own repair (LOOP-020)", () => {
  const root = repo();
  const round = (entries, findings) => { const s = head(root).slice(0, 7); review(root, entries.map((e) => e.replace(/#(\d+)/g, `${s} $1`)), findings); commit(root, "a round"); return wake(root); };
  assert.match(round(["resolved: the parser drops wrapped lines, fixed in abc (independent aaaaaaa 1)", "resolved: empty input crashes wake, fixed (independent #1)"], ["empty input crashes wake"]), /^Done: /, "an earlier round's (independent 1) does not collide");
  assert.match(round(["resolved: the parser drops wrapped lines, fixed in abc (independent aaaaaaa 1)"], ["the parser drops wrapped lines"]), /finding 1 is not carried: no review line cites/, "an earlier round's line does not carry the new finding");
  assert.match(round(["resolved: a defect, see (independent #1) (independent #1)"], ["a defect"]), /^Done: /, "the same citation twice is one citation");
  review(root, [], null);
  writeFileSync(reportFile(root), `commitment: first\ncommit: ${head(root)}\nreviewer: a reviewer given ${head(root)}\nexamined:\n  - the kernel\nfindings: []\n`); commit(root, "the commit on the reviewer line");
  assert.match(wake(root), /^Done: /, "the commit named outside examined: is named");
  const s = head(root).slice(0, 7);
  writeFileSync(join(root, ".cairn/reviews/first.md"), `commitment: first\ncommit: ${head(root)}\nexamined:\n  - x\nfindings:\n  - resolved: a defect, fixed by a long explanation\n    that wraps (independent ${s} 1)\n`);
  writeFileSync(reportFile(root), `commitment: first\ncommit: ${head(root)}\nreviewer: r\nexamined:\n  - x at ${head(root)}\nfindings:\n  - a defect\n`); commit(root, "a wrapped review line");
  assert.match(wake(root), /^Resolvable: repair \.cairn\/reviews\/first\.md\n.*wraps onto a second line/);
});

test("a finding that quotes a citation in its own words is carried by copying it, and an uncited wrapped line is no repair when there is nothing to carry (LOOP-020)", () => {
  const root = repo();
  const round = (entries, findings) => { const s = head(root).slice(0, 7); review(root, entries.map((e) => e.replace(/#(\d+)/g, `${s} $1`)), findings); commit(root, "a round"); return wake(root); };
  const quoting = "the claimed fix for (independent bbbbbbb 3) does not hold";
  assert.match(round([`open: ${quoting} (independent #1)`], [quoting]), /^Resolvable: resolve first/, "an earlier report's citation inside the words");
  review(root, [], null);
  const s = head(root).slice(0, 7), same = `the claimed fix for (independent ${s} 1) does not hold`;
  writeFileSync(join(root, ".cairn/reviews/first.md"), `commitment: first\ncommit: ${head(root)}\nexamined:\n  - x\nfindings:\n  - resolved: ${same}, fixed (independent ${s} 1)\n`);
  writeFileSync(reportFile(root), `commitment: first\ncommit: ${head(root)}\nreviewer: r\nexamined:\n  - x at ${head(root)}\nfindings:\n  - ${same}\n`); commit(root, "the current citation inside the words");
  assert.match(wake(root), /^Done: /);
  review(root, [], null);
  writeFileSync(join(root, ".cairn/reviews/first.md"), `commitment: first\ncommit: ${head(root)}\nexamined:\n  - x\nfindings:\n  - resolved: an old defect fixed by a long explanation\n    that wraps, no citation\n`);
  writeFileSync(reportFile(root), `commitment: first\ncommit: ${head(root)}\nreviewer: r\nexamined:\n  - x at ${head(root)}\nfindings: []\n`); commit(root, "a wrapped uncited line, nothing to carry");
  assert.match(wake(root), /^Done: /);
});

test("a citation that is not last on its line is refused as such, and a finding ending with a citation is carried in the short form (LOOP-020)", () => {
  const root = repo();
  const round = (entries, findings) => { const s = head(root).slice(0, 7); review(root, entries.map((e) => e.replace(/#(\d+)/g, `${s} $1`)), findings); commit(root, "a round"); return wake(root); };
  for (const entry of ["resolved: a defect, fixed (independent #1).", "resolved: a defect (independent #1), fixed in abc1234", "resolved: a defect, fixed (independent #1) (see 0350326)"])
    assert.match(round([entry], ["a defect"]), /a review line cites \(independent [0-9a-f]{7} 1\) but does not end with it; put the citation last on its line/, entry);
  const quoting = "the wrap refusal does not hold (independent e69a3c8 2)";
  assert.match(round([`resolved: ${quoting} (independent #1)`], [quoting]), /^Done: /, "the short form, after a finding that ends with a citation");
  assert.match(round([`resolved: ${quoting}, fixed (independent #1)`], [quoting]), /^Done: /, "the documented form, as before");
});

test("a report written or changed on disk but not committed is named commit, never judged as the committed one (LOOP-020)", () => {
  const root = repo();
  review(root); commit(root, "reviewed");
  writeFileSync(reportFile(root), readFileSync(reportFile(root), "utf8").replace("findings: []", "findings:\n  - a real defect"));
  assert.match(wake(root), /^Resolvable: commit \.cairn\/reviews\/first\.independent\.md\n/, "an uncommitted edit with a finding");
  commit(root, "the edit, committed");
  assert.match(wake(root), /finding 1 is not carried/, "once committed, the finding is judged");
  review(root); commit(root, "clean again");
  writeFileSync(join(root, ".cairn/reviews/first.md"), `commitment: first\ncommit: ${head(root)}\nexamined:\n  - again\nfindings: []\n`); commit(root, "the review redone");
  writeFileSync(reportFile(root), `commitment: first\ncommit: ${head(root)}\nreviewer: r\nexamined:\n  - x at ${head(root)}\nfindings: []\n`);
  assert.match(wake(root), /^Resolvable: commit \.cairn\/reviews\/first\.independent\.md\n/, "a new report not yet committed is named commit, not a new reviewer");
});
