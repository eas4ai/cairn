// No commitment is Done on the builder's review alone: an independent
// report, committed, for this commitment, naming the review's commit,
// with every finding carried by its number (LOOP-020).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repo as base, cairn, commit, git, review, fromFile, head } from "./helpers.mjs";

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
  assert.match(carried(["resolved: the gate, fixed (independent #1) (independent #2)"], ["the gate", "the gate, the parser and the message are wrong"]), /findings 1 and 2 are not carried: 1, its review line cites another finding of this report too/);
  assert.match(carried(["resolved: the gate, fixed (independent #1)", "resolved: the gate, again (independent #1)", "resolved: the gate, the parser and the message are wrong. fixed (independent #2)"], ["the gate", "the gate, the parser and the message are wrong"]), /finding 1 is not carried: 2 review lines cite \(independent [0-9a-f]{7} 1\)/);
  assert.match(carried(["resolved: the gate, fixed (independent #1)", "resolved: the gate, the parser and the message are wrong. fixed (independent #2)"], ["the gate", "the gate, the parser and the message are wrong"]), /^Done: /);
  const repairs = /^Resolvable: repair \.cairn\/reviews\/first\.independent\.md\n/;
  for (const tail of ["", "\n## Findings\n\nfindings:\n  - a defect\n", "findings: none\n", "findings:\n  a defect\n"])   // absent, only after a heading, a scalar value, or a line that is not an entry
    assert.match(handReport(root, `examined:\n  - x at ${head(root)}\n${tail}`), repairs, tail);   // built at each call, so the report names the commit it is written at
  for (const tail of ["findings:\n\n  - a defect\n", "findings:\n  - a\n    defect\n", "findings:\n- a defect\n", "findings:\n  1. a defect\n"])   // a blank line, a wrapped entry, an unindented bullet, a number: each is read
    assert.match(handReport(root, `examined:\n  - x at ${head(root)}\n${tail}`), /^Resolvable: review first\n.*finding 1 is not carried/, tail);
  assert.match(handReport(root, `examined:\n  - x at ${head(root).toUpperCase()}\nfindings: []\n`, { at: head(root).toUpperCase() }), /^Done: /, "the commit in capitals");
  assert.match(handReport(root, `examined:\n  - x at ${head(root)}\nfindings: []\n\n- tried x\n  and y\n`), repairs, "prose inside the findings list is named; prose goes after a heading");
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
  assert.match(wake(root), /^Done: /, "a wrapped review line keeps its citation, which the reader joins to its entry");
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

test("the findings list is read from the record's text: blank lines between entries, a wrapped entry, any bullet, and a blank line inside examined: lose nothing; a list after a heading stays unread (LOOP-020, LOOP-086, LOOP-071)", () => {
  const root = repo();
  review(root); commit(root, "reviewed");
  const s = head(root).slice(0, 7), at = head(root);
  const write = (review, report) => { writeFileSync(join(root, ".cairn/reviews/first.md"), review); writeFileSync(reportFile(root), report); commit(root, "records"); return wake(root); };
  const reportWith = (findings, examined = `examined:\n  - x at ${at}\n`) => `commitment: first\ncommit: ${at}\nreviewer: r\n${examined}findings:\n${findings}`;
  const reviewWith = (findings, examined = "examined:\n  - x\n") => `commitment: first\ncommit: ${at}\n${examined}findings:\n${findings}`;
  const carry = (n, words) => `  - resolved: ${words}, fixed (independent ${s} ${n})\n`;
  assert.match(write(reviewWith(carry(1, "one")), reportWith("\n  - one\n")), /^Done: /, "a report list that begins after a blank line is read");
  assert.match(write(reviewWith(carry(1, "one")), reportWith("  - one\n\n  - two\n")), /finding 2 is not carried/, "entries after a blank line are read");
  assert.match(write(reviewWith("\n" + carry(1, "one")), reportWith("  - one\n")), /^Done: /, "a review list that begins after a blank line is read");
  assert.match(write(reviewWith("\n  - open: the blank line above hides nothing\n"), reportWith("findings: []\n".replace("findings: ", ""))), /^Resolvable: resolve first/, "an open finding after a blank line still gates");
  assert.match(write(reviewWith(carry(1, "one and two together")), reportWith("  - one and two\n    together\n")), /^Done: /, "a wrapped report entry is one finding");
  assert.match(write(reviewWith(`  * resolved: one, fixed (independent ${s} 1)\n`), reportWith("  * one\n")), /^Done: /, "any bullet is an entry");
  assert.match(write(reviewWith(carry(1, "one"), "examined:\n  - x\n\n  - y\n"), reportWith("  - one\n", `examined:\n  - x at ${at}\n\n  - y\n`)), /^Done: /, "a blank line inside examined: loses no findings");
  assert.match(write(`${reviewWith(carry(1, "one"))}\n## Notes\n\nfindings:\n  - resolved: a decoy after the heading\n`, reportWith("  - one\n")), /^Resolvable: repair \.cairn\/reviews\/first\.md\n.*under a heading/, "a finding-shaped decoy under a heading is named; LOOP-071 keeps it from replacing a real open finding");
  assert.match(write(`${reviewWith(carry(1, "one"))}\n## Open\n\n- open: a defect still unfixed\n`, reportWith("  - one\n")), /^Resolvable: repair \.cairn\/reviews\/first\.md\n.*under a heading/, "an open finding under a heading is named");
  assert.match(write(reviewWith(carry(1, "one")), reportWith("  - one\n\n- I also read the tests.\n")), /finding 2 is not carried/, "a bullet under findings: is a finding, prose belongs in examined:");
});

test("the reader reads a numbered or nested list and a blank line in examined:, and names a line it cannot read rather than reading nothing (LOOP-086, LOOP-020)", () => {
  const root = repo();
  review(root); commit(root, "reviewed");
  const s = head(root).slice(0, 7), at = head(root);
  const write = (review, report) => { writeFileSync(join(root, ".cairn/reviews/first.md"), review); writeFileSync(reportFile(root), report); commit(root, "records"); return wake(root); };
  const report = (findings, examined = `examined:\n  - x at ${at}\n`) => `commitment: first\ncommit: ${at}\nreviewer: r\n${examined}findings:\n${findings}`;
  const own = (findings, examined = "examined:\n  - x\n") => `commitment: first\ncommit: ${at}\n${examined}findings:\n${findings}`;
  const carry = (n, words) => `  - resolved: ${words}, fixed (independent ${s} ${n})\n`;
  assert.match(write(own(carry(1, "one") + carry(2, "two")), report("  1. one\n  2. two\n")), /^Done: /, "a numbered report list is read");
  assert.match(write(own(carry(1, "one")), report("  1. one\n  2. two\n")), /finding 2 is not carried/, "and every entry of it");
  assert.match(write(own(carry(1, "one reproduced in a scratch clone")), report("  - one\n    - reproduced in a scratch clone\n")), /^Done: /, "a nested detail belongs to its entry");
  assert.match(write(own(carry(1, "one")), report("  - one\n", `examined:\n\n  - x at ${at}\n`)), /^Done: /, "a report examined: list after a blank line is read");
  assert.match(write(own(carry(1, "one"), "examined:\n\n  - x\n"), report("  - one\n")), /^Done: /, "a review examined: list after a blank line is read");
  assert.match(write(own("  REM-002: an unbulleted finding\nStatus: in progress\n"), report("  - one\n")), /^Resolvable: repair \.cairn\/reviews\/first\.md\n.*cannot read as an entry: "REM-002/, "an unbulleted review finding is named, not read as nothing");
  assert.match(write(own("  - resolved: one, fixed (independent " + s + " 1)\n"), report("  REM-002: an unbulleted finding\n")), /^Resolvable: repair \.cairn\/reviews\/first\.independent\.md\n.*cannot read as an entry: "REM-002/, "and the same in the report");
  assert.match(write(`commitment: first\ncommit: ${at}\nexamined:\n  - x\nfindings:\n\n## Findings\n\n- open: a real defect I found\n`, report("  - one\n")), /^Resolvable: repair \.cairn\/reviews\/first\.md\n.*under a heading/, "a finding under a heading with nothing above it");
});

test("a line the reader cannot read is named whenever an entry follows it, in the review and in the report, and a finding under a heading is named (LOOP-086, LOOP-020)", () => {
  const root = repo();
  review(root); commit(root, "reviewed");
  const s = head(root).slice(0, 7), at = head(root);
  const write = (own, report) => { writeFileSync(join(root, ".cairn/reviews/first.md"), own); writeFileSync(reportFile(root), report); commit(root, "records"); return wake(root); };
  const report = (findings) => `commitment: first\ncommit: ${at}\nreviewer: r\nexamined:\n  - x at ${at}\nfindings:\n${findings}`;
  const own = (findings) => `commitment: first\ncommit: ${at}\nexamined:\n  - x\nfindings:\n${findings}`;
  const carry = (n, words) => `  - resolved: ${words}, fixed (independent ${s} ${n})\n`;
  const repairsOwn = /^Resolvable: repair \.cairn\/reviews\/first\.md\n/, repairsReport = /^Resolvable: repair \.cairn\/reviews\/first\.independent\.md\n/;
  assert.match(write(own(carry(1, "one") + "  open: the cache is never invalidated\n"), report("  - one\n")), repairsOwn, "an entry that lost its dash, indented under the one above");
  assert.match(write(own(carry(1, "one") + "    - open: the cache is never invalidated\n"), report("  - one\n")), repairsOwn, "a finding as a nested bullet");
  assert.match(write(own(carry(1, "one") + "A plain sentence between entries.\n  - open: a defect\n"), report("  - one\n")), repairsOwn, "a sentence between entries drops what follows");
  assert.match(write(own(carry(1, "one")), report("  - one\nI also read the tests.\n  - two is broken too\n")), repairsReport, "the same in a report, whose findings carry no prefix");
  assert.match(write(own(carry(1, "one")), report("  - one\n\nI also read the tests.\n")), repairsReport, "a note inside the list is named, wherever it sits");
  assert.match(write(own(carry(1, "one")), report("  - one\n") + "\n## Notes\n\nI also read the tests.\n"), /^Done: /, "a note after a heading is prose");
  assert.match(write(own(carry(1, "one")), report("  - one\n  two lost its dash\n")), /finding 1 is not carried: its review line does not begin with its words/, "an indented line joins its entry, and the joined words are what must be carried");
  assert.match(write(own(carry(1, "one")), report("  - one\ntwo lost its dash\n")), repairsReport, "an unindented line that lost its dash is named");
  assert.match(write(own(carry(1, "one") + "  - open: a defect\nStatus: in progress\n"), report("  - one\n")), /^Resolvable: resolve first/, "a real open finding is still read");
  assert.match(write(own(carry(1, "one reproduced in a clone")), report("  - one\n    - reproduced in a clone\n")), /^Done: /, "a nested detail still joins its entry");
  assert.match(write(`commitment: first\ncommit: ${at}\nexamined:\n  - x\nfindings: []\n`, `commitment: first\ncommit: ${at}\nreviewer: r\nexamined:\n  - x at ${at}\nfindings: []\n\n## Findings\n\n1. one is broken\n2. two is broken\n`), /^Resolvable: review first\n.*the heading/, "a report that declares findings: [] and lists findings under a findings-titled heading is named, since that shape lost them in silence");
  assert.match(write(own(carry(1, "one")), `commitment: first\ncommit: ${at}\nreviewer: r\nexamined:\n  - x at ${at}\nfindings:\n\n## What I read\n\n1. one is broken\n`), repairsReport, "a report that names findings: and lists none above a heading list is named");
});

test("a margin line that only looks like a field never ends a list in silence (LOOP-086, LOOP-020)", () => {
  const root = repo();
  review(root); commit(root, "reviewed");
  const s = head(root).slice(0, 7), at = head(root);
  const write = (own, report) => { writeFileSync(join(root, ".cairn/reviews/first.md"), own); writeFileSync(reportFile(root), report); commit(root, "records"); return wake(root); };
  const report = (findings, examined = `examined:\n  - x at ${at}\n`) => `commitment: first\ncommit: ${at}\nreviewer: r\n${examined}findings:\n${findings}`;
  const own = (findings, examined = "examined:\n  - x\n") => `commitment: first\ncommit: ${at}\n${examined}findings:\n${findings}`;
  const carry = (n, words) => `  - resolved: ${words}, fixed (independent ${s} ${n})\n`;
  assert.match(write(own(carry(1, "one") + "Status: in progress\n  - open: a real defect I found\n"), report("  - one\n")), /^Resolvable: repair \.cairn\/reviews\/first\.md\n.*cannot read as an entry: "Status: in progress", and the entries after it are unread/, "a Status line between entries is named, with what it hid");
  assert.match(write(own(carry(1, "one") + "open: the cache is never invalidated\n"), report("  - one\n")), /^Resolvable: repair \.cairn\/reviews\/first\.md\n.*cannot read as an entry: "open: the cache/, "a finding at the margin without its bullet");
  for (const middle of ["Note: I also read the tests.", "Status: done", "Reproduced: in a clone", "Also examined: the walkthrough"])
    assert.match(write(own(carry(1, "one")), report(`  - one\n${middle}\n  - two is broken too\n`)), /^Resolvable: repair \.cairn\/reviews\/first\.independent\.md\n.*cannot read as an entry/, middle);
  assert.match(write(own(carry(1, "one"), `examined:\n  - x\nNote: and the tests\n  - y\n`), report("  - one\n")), /^Resolvable: repair \.cairn\/reviews\/first\.md\n.*examined: holds a line/, "the same in examined:");
  assert.match(write(own(carry(1, "one")), report("  - one\n") + "\n## Notes\n\nNote: I also read the tests.\n"), /^Done: /, "after a heading it is prose");
});

test("a field name repeated inside a list is named, the report's findings under a heading are named beside a list, and the repair offers the fix that keeps the finding (LOOP-020, LOOP-086)", () => {
  const root = repo();
  review(root); commit(root, "reviewed");
  const s = head(root).slice(0, 7), at = head(root);
  const write = (own, report) => { writeFileSync(join(root, ".cairn/reviews/first.md"), own); writeFileSync(reportFile(root), report); commit(root, "records"); return wake(root); };
  const report = (findings) => `commitment: first\ncommit: ${at}\nreviewer: r\nexamined:\n  - x at ${at}\nfindings:\n${findings}`;
  const own = (findings) => `commitment: first\ncommit: ${at}\nexamined:\n  - x\nfindings:\n${findings}`;
  const carry = (n, words) => `  - resolved: ${words}, fixed (independent ${s} ${n})\n`;
  for (const repeated of ["Examined: also the tests", "Commitment: first", "Commit: 1234567 is what I read"])
    assert.match(write(own(carry(1, "one") + `${repeated}\n  - open: a real defect\n`), report("  - one\n")), /^Resolvable: repair \.cairn\/reviews\/first\.md\n.*cannot read as an entry/, repeated);
  assert.match(write(own(carry(1, "one")), report(`  - one\nFindings: two\n  - two is broken\n`)), /^Resolvable: repair \.cairn\/reviews\/first\.independent\.md\n.*cannot read as an entry/, "the same in a report");
  assert.match(write(own(carry(1, "one")), report("  - one\n") + "\n## Findings\n\n- two is broken\n"), /^Resolvable: review first\n.*the heading/, "a findings-titled heading may not hold a list beside a read list either");
  assert.match(write(own(carry(1, "one")), report("  - one\n") + "\n## Notes\n\nI also read the walkthrough.\n"), /^Done: /, "prose under another heading is prose");
  assert.match(write(own(carry(1, "one")), report("  - one\ntwo lost its dash\n")), /give a finding its own - entry, put a heading above prose/, "the repair offers both fixes");
});

test("a Reviewer: line inside a list is named, and an honest record with a findings-titled heading is read (LOOP-020, LOOP-086)", () => {
  const root = repo();
  review(root); commit(root, "reviewed");
  const s = head(root).slice(0, 7), at = head(root);
  const write = (own, report) => { writeFileSync(join(root, ".cairn/reviews/first.md"), own); writeFileSync(reportFile(root), report); commit(root, "records"); return wake(root); };
  const report = (findings, tail = "") => `commitment: first\ncommit: ${at}\nreviewer: r\nexamined:\n  - x at ${at}\nfindings:\n${findings}${tail}`;
  const own = (findings, tail = "") => `commitment: first\ncommit: ${at}\nexamined:\n  - x\nfindings:\n${findings}${tail}`;
  const carry = (n, words) => `  - resolved: ${words}, fixed (independent ${s} ${n})\n`;
  assert.match(write(own(carry(1, "one") + "Reviewer: also the tests\n  - open: a real defect\n"), report("  - one\n")), /^Resolvable: repair \.cairn\/reviews\/first\.md\n.*cannot read as an entry: "Reviewer: also the tests", and the entries after it are unread/, "a Reviewer: line between findings");
  assert.match(write(own(carry(1, "one"), "\n## Notes from earlier rounds\n\n- the parser dropped wrapped lines, fixed long ago\n"), report("  - one\n")), /^Done: /, "a heading that does not name findings keeps its bullets as prose");
  assert.match(write(own(carry(1, "one")), report("  - one\n", "\n## How I reproduced this\n\n- a scratch clone\n- a stub API\n")), /^Done: /, "and the same in a report");
  assert.match(write(own(carry(1, "one"), "\n## Open\n\n- open: a defect still unfixed\n"), report("  - one\n")), /^Resolvable: repair \.cairn\/reviews\/first\.md\n.*under a heading/, "a finding-shaped bullet under a heading is still named");
  // A report's findings carry no prefix, so a heading that names findings may not hold a list: that shape lost real findings in silence.
  assert.match(write(own(carry(1, "one")), report("  - one\n", "\n## Findings in full\n\n- wake exits 3 on an empty report\n- the message names the wrong file\n")), /^Resolvable: review first\n.*the heading/, "a report's further findings under a findings-titled heading are named, not read past");
  assert.match(write(own(carry(1, "one"), "\n## More findings\n\n- the reader drops a wrapped entry\n"), report("  - one\n")), /^Resolvable: repair \.cairn\/reviews\/first\.md\n.*names findings in its title/, "and the same in the review, whatever the bullets look like");
});

test("a record that declares findings: [] keeps a bulleted body as prose, as this repository's own reviews are written (LOOP-086, LOOP-020)", () => {
  const root = repo();
  review(root); commit(root, "reviewed");
  const at = head(root);
  const write = (own, report) => { writeFileSync(join(root, ".cairn/reviews/first.md"), own); writeFileSync(reportFile(root), report); commit(root, "records"); return wake(root); };
  const body = "\n## Attacked\n\n- the empty-name case before the fix and after it\n- 1500 declared inputs, timed\n";
  assert.match(write(`commitment: first\ncommit: ${at}\nexamined:\n  - the work\nfindings: []\n${body}`, `commitment: first\ncommit: ${at}\nreviewer: r\nexamined:\n  - x at ${at}\nfindings: []\n${body}`), /^Done: /, "both records declare no findings and carry a bulleted body");
  assert.match(write(`commitment: first\ncommit: ${at}\nexamined:\n  - the work\nfindings:\n${body}`, `commitment: first\ncommit: ${at}\nreviewer: r\nexamined:\n  - x at ${at}\nfindings: []\n`), /^Resolvable: repair \.cairn\/reviews\/first\.md\n.*names no entries above a list the loop does not read/, "a findings: line with no entries and a list below it is still named");
});

test("a field name in another case never ends a list in silence, a record with its fields out of order is told to reorder them, and a citation names only a finding the report made (LOOP-086, LOOP-020, LOOP-108)", () => {
  const root = repo();
  review(root); commit(root, "reviewed");
  const at = head(root), s = at.slice(0, 7);
  const write = (own, report) => { writeFileSync(join(root, ".cairn/reviews/first.md"), own); writeFileSync(reportFile(root), report); commit(root, "records"); return wake(root); };
  const rep = (findings) => `commitment: first\ncommit: ${at}\nreviewer: r\nexamined:\n  - x at ${at}\nfindings:\n${findings}`;
  const carry = (n, words) => `  - resolved: ${words}, fixed (independent ${s} ${n})\n`;
  // A capital field name inside a list is a line the loop cannot read, never a boundary: an open finding under it must not vanish.
  for (const cap of ["Findings:", "FINDINGS:"])
    assert.match(write(`commitment: first\ncommit: ${at}\nexamined:\n  - x at ${at}\n${cap}\n  - open: a real defect that nobody resolved\nfindings: []\n`, rep("findings: []\n").replace("findings:\nfindings: []", "findings: []")), /^Resolvable: repair \.cairn\/reviews\/first\.md\n.*examined: holds a line the loop cannot read as an entry/, cap);
  assert.match(write(`commitment: first\ncommit: ${at}\nexamined:\n  - the reader at ${at}\nFindings: none yet\n  - the gate, which I also examined\nfindings: []\n`, rep("findings: []\n").replace("findings:\nfindings: []", "findings: []")), /^Resolvable: repair \.cairn\/reviews\/first\.md\n.*and the entries after it are unread/, "a capital field name no longer truncates examined: in silence");
  // Fields out of order: the repair names the order, which is the only thing that fixes the record.
  assert.match(write(`commitment: first\ncommit: ${at}\nfindings:\n${carry(1, "one")}examined:\n  - x\n`, rep("  - one\n")), /^Resolvable: repair \.cairn\/reviews\/first\.md\n.*write examined: above findings:, both above the first heading/, "the review's fields out of order");
  assert.match(write(`commitment: first\ncommit: ${at}\nexamined:\n  - x\nfindings:\n${carry(1, "one")}`, `commitment: first\ncommit: ${at}\nreviewer: r\nfindings:\n  - one\nexamined:\n  - x at ${at}\n`), /^Resolvable: repair \.cairn\/reviews\/first\.independent\.md\n.*write examined: above findings:, both above the first heading/, "the report's fields out of order");
  // A citation is a claim the reviewer made that finding: a number the report does not have is named.
  assert.match(write(`commitment: first\ncommit: ${at}\nexamined:\n  - x\nfindings:\n${carry(1, "one")}  - resolved: a defect I found myself, fixed (independent ${s} 7)\n`, rep("  - one\n")), /^Resolvable: review first\n.*the review cites \(independent [0-9a-f]{7} 7\), and the report holds 1 finding/, "a citation beyond the report's findings");
  assert.match(write(`commitment: first\ncommit: ${at}\nexamined:\n  - x\nfindings:\n${carry(1, "one")}  - open: a defect I found myself\n`, rep("  - one\n")), /^Resolvable: resolve first/, "and my own finding with no citation is read as mine");
});

test("a citation of zero is a citation, a field ends a list however it is spaced, a heading may be underlined, a blank line before a continuation is nothing, and a doubled commit: line does not name the commit (LOOP-020, LOOP-086, LOOP-108)", () => {
  const root = repo();
  review(root); commit(root, "reviewed");
  const at = head(root), s = at.slice(0, 7);
  const write = (own, report) => { writeFileSync(join(root, ".cairn/reviews/first.md"), own); writeFileSync(reportFile(root), report); commit(root, "records"); return wake(root); };
  const rep = (findings, extra = "") => `commitment: first\ncommit: ${at}\nreviewer: r\nexamined:\n  - x at ${at}\nfindings:\n${findings}${extra}`;
  const own = (findings, extra = "") => `commitment: first\ncommit: ${at}\nexamined:\n  - x\nfindings:\n${findings}${extra}`;
  const carry = (n, words) => `  - resolved: ${words}, fixed (independent ${s} ${n})\n`;
  // A citation of 0 claims a finding the report cannot have made.
  for (const n of ["0", "000"])
    assert.match(write(own(carry(1, "one") + `  - resolved: my own, fixed (independent ${s} ${n})\n`), rep("  - one\n")), /^Resolvable: review first\n.*the review cites \(independent [0-9a-f]{7} 0\), and the report holds 1 finding/, `a citation of ${n}`);
  // The field ends the list however it is spaced.
  assert.match(write(`commitment: first\ncommit: ${at}\nexamined:\n  - x\nfindings:[]\n`, `commitment: first\ncommit: ${at}\nreviewer: r\nexamined:\n  - x at ${at}\nfindings:[]\n`), /^Done: /, "findings:[] with no space ends examined: and declares no findings");
  // A stray field name inside a list is told what fixes it, and only a real misorder is told to reorder.
  assert.match(write(`commitment: first\ncommit: ${at}\nexamined:\n  - x at ${at}\nFindings:\n  - open: a real defect that nobody resolved\nfindings: []\n`, rep("findings: []\n").replace("findings:\nfindings: []", "findings: []")), /take it out of the list; the fields are examined: then findings:, each named once/, "a repeated field name is not a misorder");
  assert.match(write(`commitment: first\ncommit: ${at}\nfindings:\n${carry(1, "one")}examined:\n  - x\n`, rep("  - one\n")), /write examined: above findings:, both above the first heading/, "a real misorder is told to reorder");
  // A heading may be underlined instead of hashed.
  assert.match(write(own(carry(1, "one"), "\nAttacked\n--------\n\n- the reader, line by line\n"), rep("  - one\n", "\nAttacked\n========\n\n- the gate\n")), /^Done: /, "prose under a setext heading is prose");
  // A blank line between an entry and its indented continuation is nothing.
  assert.match(write(own(`  - resolved: one reproduced in a scratch clone, fixed (independent ${s} 1)\n`), rep("  - one\n\n    reproduced in a scratch clone\n")), /^Done: /, "the continuation joins across the blank line, and the joined words are carried");
  // A doubled commit: line cannot stand in for naming the commit the reviewer examined.
  assert.match(write(own(carry(1, "one")), `commitment: first\ncommit: ${at}\ncommit: ${at}\nreviewer: r\nexamined:\n  - the kernel\nfindings:\n  - one\n`), /^Resolvable: review first\n.*does not name commit [0-9a-f]{7} anywhere but its commit: line/, "a doubled commit: line is still only its commit: line");
});

test("a rule under a field line is not a heading, the hint names a heading of either form, and an earlier report's citation on a carrying line is history (LOOP-020, LOOP-108)", () => {
  const root = repo();
  review(root); commit(root, "reviewed");
  const at = head(root), s = at.slice(0, 7);
  const write = (own, report) => { writeFileSync(join(root, ".cairn/reviews/first.md"), own); writeFileSync(reportFile(root), report); commit(root, "records"); return wake(root); };
  const rep = (findings, extra = "") => `commitment: first\ncommit: ${at}\nreviewer: r\nexamined:\n  - x at ${at}\nfindings:\n${findings}${extra}`;
  // A horizontal rule below a field is a rule, not that field's underline: the field is read, and the rule is named as the stray line it is.
  for (const rule of ["---", "===", "--"]) {
    const said = write(`commitment: first\ncommit: ${at}\nexamined:\n  - everything\nfindings: []\n${rule}\n\n## Notes\n\nI read the tests.\n`, rep("findings: []\n").replace("findings:\nfindings: []", "findings: []"));
    assert.match(said, /^Done: /, `a ${rule} rule below findings: separates, as it does in the header`);
  }
  assert.match(write(`commitment: first\ncommit: ${at}\n---\nexamined:\n  - everything\nfindings: []\n`, rep("findings: []\n").replace("findings:\nfindings: []", "findings: []")), /^Done: /, "a rule between two fields ends no header");
  assert.match(write(`commitment: first\ncommit: ${at}\nexamined:\n  - everything\n    and its boundary\n  ---\nfindings: []\n`, rep("findings: []\n").replace("findings:\nfindings: []", "findings: []")), /^Done: /, "an indented rule joins the entry above it, as any indented line does, instead of being read as a heading that drops the entry");
  // The hint that the fields sit under a heading names an underlined heading too.
  assert.match(write(`Review\n======\n\n## Notes\n\ncommitment: first\ncommit: ${at}\nexamined:\n  - x\nfindings: []\n`, rep("findings: []\n").replace("findings:\nfindings: []", "findings: []")), /the fields sit under a heading and the header ends at the first heading, hashed or underlined/, "an underlined title above the fields");
  // An earlier round's citation, at another commit, is not a second carry.
  for (const line of [`  - resolved: the gate is wrong, fixed (independent aaaaaaa 3) (independent ${s} 1)\n`, `  - resolved: the gate is wrong, fixed (independent ${s} 1) (independent aaaaaaa 3)\n`])
    assert.match(write(`commitment: first\ncommit: ${at}\nexamined:\n  - x\nfindings:\n${line}`, rep("  - the gate is wrong\n")), /^Done: /, "a citation of another report beside this one's");
  assert.match(write(`commitment: first\ncommit: ${at}\nexamined:\n  - x\nfindings:\n  - resolved: the gate is wrong, fixed (independent ${s} 1) (independent ${s} 2)\n  - resolved: and the reader, fixed (independent ${s} 2)\n`, rep("  - the gate is wrong\n  - and the reader\n")), /cites another finding of this report too/, "two citations of this report on one line is still a double carry");
});

test("a title that ends with a colon is still a heading, a report whose fields sit below a heading or prose is repaired rather than discarded, and the repair names the form the kernel reads (LOOP-020, LOOP-086, LOOP-108)", () => {
  const root = repo();
  review(root); commit(root, "reviewed");
  const at = head(root), s = at.slice(0, 7);
  const write = (own, report) => { writeFileSync(join(root, ".cairn/reviews/first.md"), own); writeFileSync(reportFile(root), report); commit(root, "records"); return wake(root); };
  const clean = (extra = "") => `commitment: first\ncommit: ${at}\nreviewer: r\nexamined:\n  - x at ${at}\nfindings: []\n${extra}`;
  const ownClean = (extra = "") => `commitment: first\ncommit: ${at}\nexamined:\n  - the work\nfindings: []\n${extra}`;
  // A heading is heading text whatever it ends with; only the record's own fields are not.
  for (const title of ["Attacked:", "Attacked", "What I read:"])
    assert.match(write(ownClean(`\n${title}\n${"-".repeat(title.length)}\n\n- the reader, line by line\n`), clean(`\n${title}\n${"=".repeat(title.length)}\n\n- the gate\n`)), /^Done: /, `an underlined title "${title}"`);
  // A report the loop cannot read is repaired in place, with its words kept, and never sent back for a new reviewer.
  assert.match(write(ownClean(), `# Independent report\n\ncommitment: first\ncommit: ${at}\nreviewer: r\nexamined:\n  - x at ${at}\nfindings: []\n`), /^Done: /, "one leading title is the record's own, not the end of its header");
  const below = write(ownClean(), `# Independent report\n\n## Fields\n\ncommitment: first\ncommit: ${at}\nreviewer: r\nexamined:\n  - x at ${at}\nfindings: []\n`);
  assert.match(below, /^Resolvable: repair \.cairn\/reviews\/first\.independent\.md\n.*below a heading, where the header ends.*keep the record's fields at the top/, "a report whose fields sit below a deeper heading");
  assert.doesNotMatch(below, /start a new reviewer/, "and it is not discarded");
  const prose = write(ownClean(), `I was given the commitment and the commit range.\n\ncommitment: first\ncommit: ${at}\nreviewer: r\nexamined:\n  - x at ${at}\nfindings: []\n`);
  assert.match(prose, /^Resolvable: repair \.cairn\/reviews\/first\.independent\.md\n.*does not read commitment: and commit:, although the lines are there, because a line above them is neither a field nor a heading/, "a report whose fields sit below prose");
  assert.doesNotMatch(prose, /start a new reviewer/, "and it is not discarded either");
  assert.match(write(ownClean(), `commitment: first\nI was given the commitment and the commit range.\ncommit: ${at}\nreviewer: r\nexamined:\n  - x at ${at}\nfindings: []\n`), /^Resolvable: repair \.cairn\/reviews\/first\.independent\.md\n.*joined the field.*keep each field on its own line/, "a line that joins the commitment's value");
  // The repair for an unrecognized entry names the form the kernel reads.
  const said = write(`commitment: first\ncommit: ${at}\nexamined:\n  - the work\nfindings:\n  - none\n`, clean());
  assert.match(said, /write findings: \[\] when there are none/, "the repair names findings: []");
  assert.doesNotMatch(said, /leave findings empty/, "and no longer names a form it refuses");
});

test("a report for another commitment or commit is replaced even when its fields sit below a heading, a quoted field line does not replace the real one, a rule under any field is a rule, and the review is told what the report is told (LOOP-020, LOOP-108)", () => {
  const root = repo();
  review(root); commit(root, "reviewed");
  const at = head(root), s = at.slice(0, 7);
  const write = (own, report) => { writeFileSync(join(root, ".cairn/reviews/first.md"), own); writeFileSync(reportFile(root), report); commit(root, "records"); return wake(root); };
  const ownClean = `commitment: first\ncommit: ${at}\nexamined:\n  - the work\nfindings: []\n`;
  const clean = (extra = "") => `commitment: first\ncommit: ${at}\nreviewer: r\nexamined:\n  - x at ${at}\nfindings: []\n${extra}`;
  // Identity comes before the repair: a report for another commitment is replaced, not edited first.
  assert.match(write(ownClean, `# Independent report\n\ncommitment: someone-else\ncommit: ${at}\nreviewer: r\nexamined:\n  - x at ${at}\nfindings: []\n`), /^Resolvable: review first\n.*names commitment someone-else, not first.*start a new reviewer/, "another commitment's report, fields below a title");
  assert.match(write(ownClean, `# Independent report\n\n## Fields\n\ncommitment: first\ncommit: ${at}\nreviewer: r\nexamined:\n  - x at ${at}\nfindings: []\n`), /^Resolvable: repair \.cairn\/reviews\/first\.independent\.md\n.*keep the record's fields at the top/, "this commitment's report is repaired instead");
  // A field line quoted lower in the header does not replace the real one.
  assert.match(write(ownClean, clean(`\n---\ncommitment: someone-else\n`)), /^Resolvable: repair \.cairn\/reviews\/first\.independent\.md\n.*cannot read as an entry: "commitment: someone-else"/, "a quoted commitment: line inside the list is named, not read as the record's commitment");
  assert.match(write(ownClean, clean(`\n## Notes\n\ncommitment: someone-else\n`)), /^Done: /, "and one below a heading is prose, not the record's commitment");
  // A rule under any field is a rule, whatever the field is named.
  assert.match(write(ownClean, `commitment: first\ncommit: ${at}\nrange: aaaaaaa..${s}\nreviewer: r\n---\nexamined:\n  - x at ${at}\nfindings: []\n`), /^Done: /, "a rule under a field the kernel does not read");
  // The review is told what the report is told.
  assert.match(write(`I reviewed the work.\n\ncommitment: first\ncommit: ${at}\nexamined:\n  - the work\nfindings: []\n`, clean()), /^Resolvable: repair \.cairn\/reviews\/first\.md\n.*does not read commit:, although the line is there, because a line above it is neither a field nor a heading/, "the review's fields below prose");
  assert.match(write(`# Review\n\ncommitment: first\ncommit: ${at}\nexamined:\n  - the work\nfindings: []\n`, clean()), /^Done: /, "one leading title above the review's fields is the record's own");
  assert.match(write(`# Review\n\n## Fields\n\ncommitment: first\ncommit: ${at}\nexamined:\n  - the work\nfindings: []\n`, clean()), /^Resolvable: repair \.cairn\/reviews\/first\.md\n.*names commit and examined and findings below a heading/, "the review's fields below a second heading");
  assert.match(write(`commitment: first\ncommit: ${at}\nI read the tests too.\nexamined:\n  - the work\nfindings: []\n`, clean()), /^Resolvable: repair \.cairn\/reviews\/first\.md\n.*reads its commit: as .*because that line carries more than the commit, or the line below it joined the field/, "a line that joins the review's commit value");
});

test("an underline makes a heading of the line above it unless that line is an entry or the record's own field, an unread field is named where it sits, a field spelled another way is named, and the findings-titled repair names retitling (LOOP-020, LOOP-086, LOOP-108)", () => {
  const root = repo();
  review(root); commit(root, "reviewed");
  const at = head(root), s = at.slice(0, 7);
  const write = (own, report) => { writeFileSync(join(root, ".cairn/reviews/first.md"), own); writeFileSync(reportFile(root), report); commit(root, "records"); return wake(root); };
  const clean = (extra = "") => `commitment: first\ncommit: ${at}\nreviewer: r\nexamined:\n  - x at ${at}\nfindings: []\n${extra}`;
  const ownClean = (extra = "") => `commitment: first\ncommit: ${at}\nexamined:\n  - the work\nfindings: []\n${extra}`;
  // An entry at the margin with a rule below it is an entry, not a heading's text.
  assert.match(write(`commitment: first\ncommit: ${at}\nexamined:\n- bin/cairn.mjs at ${at}\n---\nfindings: []\n`, clean()), /^Done: /, "a margin entry above a rule");
  assert.match(write(ownClean(), `commitment: first\ncommit: ${at}\nreviewer: r\nexamined:\n- the reader at ${at}\n===\nfindings: []\n`), /^Done: /, "and the same in a report");
  // A field-shaped title with an underline is a heading, so the prose under it is prose; the record's own fields never are.
  assert.match(write(ownClean(`\nNote: what else I read\n---------------------\n\n- the tests, line by line\n`), clean(`\nNote: what else I read\n---------------------\n\n- the gate\n`)), /^Done: /, "a title that carries a colon and a value");
  assert.match(write(`commitment: first\ncommit: ${at}\nexamined:\n  - the work\nfindings: []\n-----\n\n## Notes\n\nprose\n`, clean()), /^Done: /, "a rule under the record's own field is a rule");
  // A field the parser never reached is named where it sits, in both records.
  assert.match(write(`I reviewed the work.\n\ncommitment: first\ncommit: ${at}\nexamined:\n  - the work\nfindings: []\n`, clean()), /^Resolvable: repair \.cairn\/reviews\/first\.md\n.*does not read commit:, although the line is there, because a line above it is neither a field nor a heading/, "the review's fields below prose");
  assert.match(write(ownClean(), `I was given the commitment and the range.\n\ncommitment: first\ncommit: ${at}\nreviewer: r\nexamined:\n  - x at ${at}\nfindings: []\n`), /^Resolvable: repair \.cairn\/reviews\/first\.independent\.md\n.*does not read commitment: and commit:, although the lines are there/, "the report's fields below prose");
  // A body line that begins with a field name, below a heading, decides nothing.
  assert.match(write(ownClean(`\n## What the record format says\n\ncommitment: names the commitment this review belongs to\n`), clean()), /^Done: /, "a field name quoted in prose below a heading");
  // A field spelled in another case, or with a space before the colon, is named as such.
  for (const line of [`Commit: ${at}`, `commit : ${at}`])
    assert.match(write(`commitment: first\n${line}\nexamined:\n  - the work\nfindings: []\n`, clean()), /^Resolvable: repair \.cairn\/reviews\/first\.md\n.*spells commit: another way; write each field name in lower case, with no space before the colon/, line);
  assert.match(write(ownClean(), `commitment: first\nCommit: ${at}\nreviewer: r\nexamined:\n  - x at ${at}\nfindings: []\n`), /^Resolvable: repair \.cairn\/reviews\/first\.independent\.md\n.*spells commit: another way/, "and the report is repaired, not discarded");
  // The findings-titled repair names retitling, so notes are not turned into findings.
  assert.match(write(ownClean(`\n## Findings\n\n- what I tried first\n`), clean()), /title a section of notes something else/, "the review's repair names another title");
  assert.match(write(ownClean(), clean(`\n## Findings in full\n\n- what I tried first\n`)), /^Resolvable: review first\n.*retitling it would change the reviewer's words/, "and the report is written again rather than retitled");
});

test("an underlined heading that names findings holds no list either, an unterminated fence hides nothing, a spelling is judged at the margin, and a report short of one header line is repaired (LOOP-020, LOOP-086, LOOP-108)", () => {
  const root = repo();
  review(root); commit(root, "reviewed");
  const at = head(root), s = at.slice(0, 7);
  const write = (own, report) => { writeFileSync(join(root, ".cairn/reviews/first.md"), own); writeFileSync(reportFile(root), report); commit(root, "records"); return wake(root); };
  const clean = (extra = "") => `commitment: first\ncommit: ${at}\nreviewer: r\nexamined:\n  - x at ${at}\nfindings: []\n${extra}`;
  const ownClean = (extra = "") => `commitment: first\ncommit: ${at}\nexamined:\n  - the work\nfindings: []\n${extra}`;
  const fence = "```";
  // A heading that names findings holds no list, written either way.
  assert.match(write(ownClean(), clean("\nFindings\n--------\n\n- the wake accepts a review whose commit line is empty\n")), /^Resolvable: review first\n.*the heading/, "an underlined findings heading in the report");
  assert.match(write(ownClean("\nFindings\n--------\n\n- one I never listed\n"), clean()), /^Resolvable: repair \.cairn\/reviews\/first\.md\n.*names findings in its title/, "and in the review");
  // An unterminated fence hides nothing below it.
  assert.match(write(`commitment: first\ncommit: ${at}\nexamined:\n  - the work\nfindings:\n  - resolved: one, fixed (independent ${s} 1)\n${fence}\n  - open: a real defect nobody has resolved\n`, clean("").replace("findings: []", "findings:\n  - one")), /^Resolvable: (?:resolve first|repair)/, "an open finding below an unterminated fence is not lost");
  assert.match(write(ownClean(), `commitment: first\ncommit: ${at}\nreviewer: r\nexamined:\n  - x at ${at}\nfindings:\n  - the wake does something wrong\n${fence}\n  - the wake accepts a review whose commit line is empty\n`), /^Resolvable: /, "and a report's second finding below one is not lost");
  assert.match(write(ownClean(`\n## Notes\n\n${fence}\nfindings:\n  - a quoted example of a malformed list\n${fence}\n`), clean()), /^Done: /, "while a closed fence still hides a quoted field");
  // A field name inside an indented note is not a spelling of the field.
  assert.match(write(`commitment: first\ncommit: ${at}\nexamined:\n  - the work\n    commitment: the slug the record names\nfindings: []\n`, clean()), /^Done: /, "an indented note that mentions a field name");
  // A report short of its commitment: line is repaired, not discarded.
  const short = write(ownClean(), `commit: ${at}\nreviewer: r\nexamined:\n  - x at ${at}\nfindings: []\n`);
  assert.match(short, /^Resolvable: repair \.cairn\/reviews\/first\.independent\.md\n.*carries no commitment: line.*add "commitment: first" above its fields/, "a report missing only its commitment: line");
  assert.doesNotMatch(short, /start a new reviewer/, "and it is not discarded");
});

test("a heading that names findings holds no content of any shape, its own section decides, and a report the wrong commit wrote is replaced before any repair (LOOP-020, LOOP-086)", () => {
  const root = repo();
  review(root); commit(root, "reviewed");
  const at = head(root), s = at.slice(0, 7);
  const write = (own, report) => { writeFileSync(join(root, ".cairn/reviews/first.md"), own); writeFileSync(reportFile(root), report); commit(root, "records"); return wake(root); };
  const clean = (extra = "") => `commitment: first\ncommit: ${at}\nreviewer: r\nexamined:\n  - x at ${at}\nfindings: []\n${extra}`;
  const ownClean = (extra = "") => `commitment: first\ncommit: ${at}\nexamined:\n  - the work\nfindings: []\n${extra}`;
  // A table row and a paragraph can each carry a finding, so a findings-naming heading holds nothing.
  assert.match(write(ownClean(), clean("\n## Findings\n\n| what | where |\n|---|---|\n| the gate accepts an empty commit line | the wake |\n")), /^Resolvable: review first\n.*the heading "Findings"/, "a table under a findings-titled heading");
  assert.match(write(ownClean(), clean("\n## Findings\n\nThe gate accepts a review whose commit line is empty.\n")), /^Resolvable: review first\n.*the heading "Findings"/, "a paragraph under a findings-titled heading");
  // Each heading is read against its own section, not against every bullet in the record.
  assert.match(write(ownClean(), clean("\n## What else I read\n\n- the tests\n- the walkthrough\n")), /^Done: /, "bullets under a heading that does not name findings");
  assert.match(write(ownClean(), clean("\n## What else I read\n\n- the tests\n\n## Findings I could not place\n\nNothing I could not place.\n")), /the heading "Findings I could not place"/, "and a findings-naming heading is judged on its own section");
  // A findings: line that declares nothing is told the form that declares none.
  assert.match(write(`commitment: first\ncommit: ${at}\nexamined:\n  - the work\nfindings:\n\n## Attacked\n\n- the reader\n`, clean()), /^Resolvable: repair \.cairn\/reviews\/first\.md\n.*names no entries above a list the loop does not read; write findings: \[\] when there are none/, "a bare findings: line above a list");
  // A report at another commit is replaced, even when it is also short of its commitment: line.
  const older = git(root, "rev-parse", "HEAD~1").stdout.trim();
  const said = write(ownClean(), `commit: ${older}\nreviewer: r\nexamined:\n  - x at ${at}\nfindings: []\n`);
  assert.match(said, /^Resolvable: review first\n.*they must name the same commit/, "a report at an older commit, also short of its commitment: line");
  assert.doesNotMatch(said, /carries no commitment: line/, "and it is replaced rather than edited first");
});

test("a findings-naming heading holds nothing at all, however deep, and a report with no record is replaced rather than repaired (LOOP-020, LOOP-086)", () => {
  const root = repo();
  review(root); commit(root, "reviewed");
  const at = head(root);
  const write = (own, report) => { writeFileSync(join(root, ".cairn/reviews/first.md"), own); writeFileSync(reportFile(root), report); commit(root, "records"); return wake(root); };
  const clean = (extra = "") => `commitment: first\ncommit: ${at}\nreviewer: r\nexamined:\n  - x at ${at}\nfindings: []\n${extra}`;
  const ownClean = (extra = "") => `commitment: first\ncommit: ${at}\nexamined:\n  - the work\nfindings: []\n${extra}`;
  // Nothing hides beneath such a heading: a subsection, a rule that makes a heading of the line above it, and an empty section are the heading itself.
  for (const [body, what] of [["\n## Findings\n\n### 1. The gate drops an entry\n\nIt drops it in silence.\n", "a finding in a subsection"], ["\n## Findings\n\nThe gate drops an entry\n---\n", "a rule that makes a heading of the line under it"], ["\n## Findings\n", "a findings-titled heading with nothing under it"]]) {
    assert.match(write(ownClean(), clean(body)), /^Resolvable: review first\n.*the heading "Findings"/, `${what}, in the report`);
    assert.match(write(ownClean(body), clean()), /^Resolvable: repair \.cairn\/reviews\/first\.md\n.*the heading "Findings"/, `${what}, in the review`);
  }
  // Every title that names findings is refused, in the open: no rule over a title tells "More findings" from a section that only mentions them, and a silent loss is worse than a refusal.
  for (const title of ["Findings", "FINDINGS", "More findings", "Findings I could not place", "Finding 1", "How I reached the findings above"])
    assert.match(write(ownClean(), clean(`\n## ${title}\n\nThe gate drops an entry.\n`)), new RegExp(`^Resolvable: review first\\n.*the heading "${title}"`), title);
  // The report is never retitled to fit: the answer is a report written again, in one step.
  const said = write(ownClean(), clean("\n## Findings\n\nThe gate drops an entry.\n"));
  assert.match(said, /retitling it would change the reviewer's words; start a new reviewer/, "the report's action is a new report");
  assert.doesNotMatch(said, /^Resolvable: repair/, "and never a repair the gate then refuses");
  // An empty report carries no record: the answer names a new reviewer once, and never a repair that leaves it unacceptable.
  for (const body of ["", "\n", "   \n\n\t\n"]) {
    const empty = write(ownClean(), body);
    assert.match(empty, /^Resolvable: review first\n.*\.cairn\/reviews\/first\.independent\.md is empty; start a new reviewer/, `an empty report: ${JSON.stringify(body)}`);
    assert.doesNotMatch(empty, /carries no commitment: line/, "and it is not repaired first");
  }
  assert.match(write(ownClean(), "The reviewer wrote a paragraph and no fields at all.\n"), /^Resolvable: review first\n.*carries no commitment: or commit: or examined: or findings: line/, "a report with no fields");
});

test("a recognisable finding under a heading is named wherever it sits, a findings-titled section is prose beside a list that holds entries, and a record may open with a title (LOOP-020, LOOP-086, LOOP-108)", () => {
  const root = repo();
  review(root); commit(root, "reviewed");
  const at = head(root), s = at.slice(0, 7);
  const write = (own, report) => { writeFileSync(join(root, ".cairn/reviews/first.md"), own); writeFileSync(reportFile(root), report); commit(root, "records"); return wake(root); };
  const clean = (extra = "") => `commitment: first\ncommit: ${at}\nreviewer: r\nexamined:\n  - x at ${at}\nfindings: []\n${extra}`;
  const ownClean = (extra = "") => `commitment: first\ncommit: ${at}\nexamined:\n  - the work\nfindings: []\n${extra}`;
  const carried = (extra = "") => `commitment: first\ncommit: ${at}\nreviewer: r\nexamined:\n  - x at ${at}\nfindings:\n  - the gate drops an entry\n${extra}`;
  const ownCarries = (extra = "") => `commitment: first\ncommit: ${at}\nexamined:\n  - the work\nfindings:\n  - resolved: the gate drops an entry, fixed (independent ${s} 1)\n${extra}`;
  // A bullet the loop can recognise is named wherever it sits in the body, not only when it is the body's first bullet.
  const buried = "\n## Method\n\n- I read the kernel\n\n## What I saw\n\n- open: a second defect the loop never names\n";
  assert.match(write(ownClean(), clean(buried)), /^Resolvable: review first\n.*outside its findings: list/, "a report's prefixed bullet behind an earlier bullet names a new report");
  assert.match(write(ownClean(buried), clean()), /^Resolvable: repair \.cairn\/reviews\/first\.md\n.*under a heading/, "and the review's own");
  // A findings-titled section is elaboration when the record's own list holds entries, and the silent-loss shape only when it declares none.
  for (const title of ["Findings in detail", "No findings", "Summary of findings review process"])
    assert.match(write(ownCarries(), carried(`\n## ${title}\n\nWhat I mean by the finding above.\n`)), /^Resolvable: review first\n.*the heading/, `${title} is refused beside any list`);
  assert.match(write(ownClean(), clean("\n## Findings\n\nThe gate drops an entry.\n")), /^Resolvable: review first\n.*the heading "Findings"/, "and the same title above a list that declares none is refused");
  // The repair completes: moving the findings into the list leaves the heading acceptable.
  const said = write(ownClean(), clean("\n## Findings\n\n- open: the gate mis-reads a heading title\n"));
  assert.match(said, /^Resolvable: review first\n.*outside its findings: list/, "findings written under a heading name a new report, since the agent may not move them");
  assert.match(write(ownCarries("\n## What I read\n"), carried("\n## What I read\n")), /^Done: /, "and the record is acceptable once they are in the list and the section is titled otherwise");
  // A report short of the one field the kernel cannot supply is replaced once, never repaired first.
  const two = write(ownClean(), `reviewer: r\nexamined:\n  - x at ${at}\nfindings: []\n`);
  assert.match(two, /^Resolvable: review first\n.*carries no commitment: or commit: line/, "a report short of both scalar fields");
  assert.doesNotMatch(two, /^Resolvable: repair/, "and it is not repaired first");
  // A record may open with a Markdown title: the fields are read past it, as recordFields reads them.
  assert.match(write(ownClean(), `# Independent report\n\n${clean()}`), /^Done: /, "a report that opens with a title");
  assert.match(write(`# Review\n\n${ownClean()}`, clean()), /^Done: /, "and a review that opens with one");
  // The messages say what is true: an empty field is empty, not absent, and a title is quoted as written.
  assert.match(write(ownClean(), "examined:\n"), /^Resolvable: review first\n.*examined: is there and holds no entry/, "a report holding one empty field");
  assert.match(write(ownClean(), clean("\n## Findings ##\n\nprose\n")), /the heading "Findings"/, "an ATX title is quoted without its closing hashes");
  assert.match(write(ownClean(), `commitment: first\ncommit: ${at}\nreviewer: r\nexamined:\nfindings: []\n`), /write each as a - entry under examined:/, "an examined: problem is answered about examined:");
  assert.match(write(ownClean(), clean("\n## Findings\n\nThe gate drops an entry.\n")), /tell it the record form/, "the new-reviewer brief names the record form");
});

test("a line that says open: is a finding however it is marked up, and one leading title of any form is the record's own (LOOP-020, LOOP-086, LOOP-108)", () => {
  const root = repo();
  review(root); commit(root, "reviewed");
  const at = head(root), s = at.slice(0, 7);
  const write = (own, report) => { writeFileSync(join(root, ".cairn/reviews/first.md"), own); writeFileSync(reportFile(root), report); commit(root, "records"); return wake(root); };
  const clean = (extra = "") => `commitment: first\ncommit: ${at}\nreviewer: r\nexamined:\n  - x at ${at}\nfindings: []\n${extra}`;
  const ownClean = (extra = "") => `commitment: first\ncommit: ${at}\nexamined:\n  - the work\nfindings: []\n${extra}`;
  const carried = (extra = "") => `commitment: first\ncommit: ${at}\nreviewer: r\nexamined:\n  - x at ${at}\nfindings:\n  - the gate drops an entry\n${extra}`;
  const ownCarries = (extra = "") => `commitment: first\ncommit: ${at}\nexamined:\n  - the work\nfindings:\n  - resolved: the gate drops an entry, fixed (independent ${s} 1)\n${extra}`;
  // The markup around the prefix is not the finding: every one of these says open:, and none may reach Done.
  for (const line of ["> - open: a defect the loop never names", ">- open: a defect the loop never names", "- [ ] open: a defect the loop never names", "- **open:** a defect the loop never names", "- open : a defect the loop never names", "<ul><li>open: a defect the loop never names</li></ul>", "| 2 | open: a defect the loop never names |"]) {
    assert.doesNotMatch(write(ownClean(), clean(`\n## Notes\n\n${line}\n`)), /^Done: /, `in the report: ${line}`);
    assert.doesNotMatch(write(ownClean(`\n## Notes\n\n${line}\n`), clean()), /^Done: /, `in the review: ${line}`);
  }
  // Beside a list that holds entries, a findings-naming heading may hold prose, but not a finding in any shape.
  assert.match(write(ownCarries(), carried("\n## Findings in detail\n\nWhat I mean by the finding above.\n")), /^Resolvable: review first\n.*the heading/, "a findings-naming heading holds nothing, whatever the list holds");
  for (const body of ["open: a second defect the loop never names", "| 2 | open: a second defect the loop never names |", "> open: a second defect the loop never names"]) {
    assert.doesNotMatch(write(ownCarries(), carried(`\n## Findings\n\n${body}\n`)), /^Done: /, `a finding under a findings heading beside entries: ${body}`);
    assert.doesNotMatch(write(ownCarries(`\n## Findings\n\n${body}\n`), carried()), /^Done: /, `and in the review: ${body}`);
  }
  // A finding that sits in the examined: list at the margin is named, as it is one indent deeper.
  assert.doesNotMatch(write(ownClean(), `commitment: first\ncommit: ${at}\nreviewer: r\nexamined:\n  - the gate at ${at}\n  - open: a defect the loop never names\nfindings: []\n`), /^Done: /, "a finding at the margin of examined:");
  assert.doesNotMatch(write(`commitment: first\ncommit: ${at}\nexamined:\n  - the work\n  - open: a defect the loop never names\nfindings: []\n`, clean()), /^Done: /, "and in the review's examined:");
  // One leading title of any level or form is the record's own; a second heading still ends the header.
  for (const title of ["# Independent report", "## Independent report", "###### Independent report", "Independent report\n=================="])
    assert.match(write(ownClean(), `${title}\n\n${clean()}`), /^Done: /, `one leading title: ${title.split("\n")[0]}`);
  assert.match(write(`## Review\n\n${ownClean()}`, clean()), /^Done: /, "and in the review");
  const two = write(ownClean(), `# Report\n\n# Again\n\n${clean()}`);
  assert.match(two, /^Resolvable: repair \.cairn\/reviews\/first\.independent\.md\n.*below a heading/, "a second title ends the header");
  assert.match(two, /a record may open with one title/, "and the message names the fix");
  // A commit: line that carries more than the commit is repaired, not discarded.
  const wordy = write(ownClean(), `commitment: first\ncommit: ${at} (the commit the review names)\nreviewer: r\nexamined:\n  - x at ${at}\nfindings: []\n`);
  assert.match(wordy, /^Resolvable: repair \.cairn\/reviews\/first\.independent\.md\n.*keep only the commit on its commit: line/, "a commit: value with a parenthetical");
  assert.doesNotMatch(wordy, /start a new reviewer/, "and it is not discarded");
  // Every uncarried finding is named at once, and every line the record lacks in one message.
  review(root, [], ["defect one", "defect two", "defect three"]); commit(root, "three uncarried");
  const all = wake(root);
  assert.match(all, /findings 1, 2 and 3 are not carried/, "three uncarried findings in one message");
  assert.match(write(ownClean(), `commit: ${at}\nreviewer: r\nexamined:\n  - x at ${at}\n`), /carries no commitment: or findings: line/, "two missing lines in one message");
});

test("every line outside the findings list is read for the prefix, and a findings-naming section is judged over its subsections (LOOP-020, LOOP-086)", () => {
  const root = repo();
  review(root); commit(root, "reviewed");
  const at = head(root), s = at.slice(0, 7);
  const write = (own, report) => { writeFileSync(join(root, ".cairn/reviews/first.md"), own); writeFileSync(reportFile(root), report); commit(root, "records"); return wake(root); };
  const clean = (extra = "") => `commitment: first\ncommit: ${at}\nreviewer: r\nexamined:\n  - x at ${at}\nfindings: []\n${extra}`;
  const ownClean = (extra = "") => `commitment: first\ncommit: ${at}\nexamined:\n  - the work\nfindings: []\n${extra}`;
  const carried = (extra = "") => `commitment: first\ncommit: ${at}\nreviewer: r\nexamined:\n  - x at ${at}\nfindings:\n  - the gate drops an entry\n${extra}`;
  const ownCarries = (extra = "") => `commitment: first\ncommit: ${at}\nexamined:\n  - the work\nfindings:\n  - resolved: the gate drops an entry, fixed (independent ${s} 1)\n${extra}`;
  // The header above the findings list is swept too: a finding there was read as an unknown field.
  assert.doesNotMatch(write(ownClean(), `commitment: first\ncommit: ${at}\nreviewer: r\nopen: the gate accepts a finding above examined:\nexamined:\n  - x at ${at}\nfindings: []\n`), /^Done: /, "a finding in the report's header");
  assert.doesNotMatch(write(ownClean(), `commitment: first\ncommit: ${at}\nreviewer: r\n  - open: the gate accepts a finding above examined:\nexamined:\n  - x at ${at}\nfindings: []\n`), /^Done: /, "written there as a bullet");
  assert.doesNotMatch(write(`commitment: first\ncommit: ${at}\nopen: my own unnamed defect\nexamined:\n  - the work\nfindings: []\n`, clean()), /^Done: /, "and in the review's own header");
  // The markup inside the prefix is markup too.
  for (const line of ["- **open**: the prefix is bolded as a word", "- <b>open</b>: the prefix is tagged as a word", '- "open: the prefix is quoted"', "- (open: the prefix is parenthesised)", "### open: the finding is its own heading", "#### 3. open: numbered as a heading"]) {
    assert.doesNotMatch(write(ownClean(), clean(`\n## Notes\n\n${line}\n`)), /^Done: /, `in the report: ${line}`);
    assert.doesNotMatch(write(ownClean(`\n## Notes\n\n${line}\n`), clean()), /^Done: /, `in the review: ${line}`);
  }
  // Honest text keeps its prose: the prefix needs its colon.
  for (const line of ["## Open questions", "- opened: the file and read it", "- unresolved issues remain"])
    assert.match(write(ownClean(), clean(`\n## Notes\n\n${line}\n`)), /^Done: /, `honest text: ${line}`);
  // An indented line joined into an examined entry is read for the prefix, as a bulleted one is.
  for (const line of ["    **open:** the gate absorbs this into the entry above", "    open : the gate absorbs this into the entry above"])
    assert.doesNotMatch(write(ownClean(), `commitment: first\ncommit: ${at}\nreviewer: r\nexamined:\n  - x at ${at}\n${line}\nfindings: []\n`), /^Done: /, `joined into examined: ${line.trim()}`);
  // A findings-naming section is judged over its subsections and its tables.
  assert.doesNotMatch(write(ownCarries(), carried("\n## Findings in detail\n\n### The second one\n\n- the gate accepts a second defect in a subsection\n")), /^Done: /, "a bullet in a subsection");
  assert.doesNotMatch(write(ownCarries(), carried("\n## Findings in detail\n\n| what | where |\n|---|---|\n| the gate never reads this row | listOf |\n")), /^Done: /, "a table under the heading");
  assert.doesNotMatch(write(ownCarries(`\n## Findings in detail\n\n### The second one\n\n- my own second defect\n`), carried()), /^Done: /, "and the same in the review");
  assert.match(write(ownCarries(), carried("\n## Method\n\n- I read the kernel\n")), /^Done: /, "while a sibling section keeps its bullets");
  // The messages name the move the writer must make, and blame no line that joined nothing.
  assert.match(write(`commitment: first\ncommit: ${at} (HEAD at the time)\nexamined:\n  - the work\nfindings: []\n`, clean()), /^Resolvable: repair \.cairn\/reviews\/first\.md\n.*carries more than the commit/, "the review's wordy commit: line");
  assert.match(write(`commitment: first\ncommit: ${at}\nexamined:\n  - the work\n  - open: a finding inside examined:\nfindings: []\n`, clean()), /move it into the findings: list/, "a finding inside the review's examined: names the move");
});

test("markup is whatever precedes the first letter, a row is a row wherever its pipes sit, and each message names the move (LOOP-020, LOOP-086)", () => {
  const root = repo();
  review(root); commit(root, "reviewed");
  const at = head(root), s = at.slice(0, 7);
  const write = (own, report) => { writeFileSync(join(root, ".cairn/reviews/first.md"), own); writeFileSync(reportFile(root), report); commit(root, "records"); return wake(root); };
  const clean = (extra = "") => `commitment: first\ncommit: ${at}\nreviewer: r\nexamined:\n  - x at ${at}\nfindings: []\n${extra}`;
  const ownClean = (extra = "") => `commitment: first\ncommit: ${at}\nexamined:\n  - the work\nfindings: []\n${extra}`;
  const carried = (extra = "") => `commitment: first\ncommit: ${at}\nreviewer: r\nexamined:\n  - x at ${at}\nfindings:\n  - see the table below\n${extra}`;
  const ownCarries = (extra = "") => `commitment: first\ncommit: ${at}\nexamined:\n  - the work\nfindings:\n  - resolved: see the table below, fixed (independent ${s} 1)\n${extra}`;
  // Everything before the first letter is markup, so none of these hides a finding.
  for (const line of ["- - open: a defect nobody names", "- 1. open: a defect nobody names", "(2) open: a defect nobody names", "- [^1]: open: a defect nobody names", "<!-- open: a defect nobody names -->", "* > 3) open: a defect nobody names"]) {
    assert.doesNotMatch(write(ownClean(), clean(`\n## Notes\n\n${line}\n`)), /^Done: /, `in the report: ${line}`);
    assert.doesNotMatch(write(ownClean(`\n## Notes\n\n${line}\n`), clean()), /^Done: /, `in the review: ${line}`);
  }
  // A row is a row wherever its pipes sit.
  const loose = "\n## Findings\n\nwhat | where\n--- | ---\nopen: the gate never reads this row | listOf\n";
  assert.doesNotMatch(write(ownCarries(), carried(loose)), /^Done: /, "a table without outer pipes under a findings-naming heading");
  assert.doesNotMatch(write(ownClean(), `commitment: first\ncommit: ${at}\nreviewer: r\nexamined:\n  - x at ${at}\n    open: the gate joins this row | to the entry above\nfindings: []\n`), /^Done: /, "and inside examined:");
  // Honest text keeps its prose: the keyword needs its colon next.
  for (const line of ["## Open questions", "- 1. opened: the file and read it", "| what | where |\n|---|---|\n| the reader | listOf |"])
    assert.match(write(ownClean(), clean(`\n## Notes\n\n${line}\n`)), /^Done: /, `honest text: ${line.split("\n")[0]}`);
  // A prefix line in the header is named where it is, with the move offered.
  const stray = write(ownClean(), `commitment: first\ncommit: ${at}\nreviewer: r\nopen: the gate accepts a finding above the list\nexamined:\n  - x at ${at}\nfindings: []\n`);
  assert.match(stray, /outside its findings: list/, "the header case is named where it is");
  assert.match(stray, /^Resolvable: review first\n/, "and a report the agent may not reword is written again");
  // A field written after the list is told where the field goes.
  assert.match(write(ownClean(), `commitment: first\ncommit: ${at}\nexamined:\n  - x at ${at}\nfindings: []\nreviewer: a fresh session\n`), /move that field above examined:/, "a field after the findings list");
  // A record committed but missing from the tree is restored, not discarded.
  rmSync(reportFile(root));
  assert.match(wake(root), /^Resolvable: commit \.cairn\/reviews\/first\.independent\.md\n.*restore it/, "a deleted report names restoration");
});

test("a marker that contains a letter is still a marker, and a fence opens only on its own line (LOOP-020, LOOP-086)", () => {
  const root = repo();
  review(root); commit(root, "reviewed");
  const at = head(root);
  const write = (own, report) => { writeFileSync(join(root, ".cairn/reviews/first.md"), own); writeFileSync(reportFile(root), report); commit(root, "records"); return wake(root); };
  const clean = (extra = "") => `commitment: first\ncommit: ${at}\nreviewer: r\nexamined:\n  - x at ${at}\nfindings: []\n${extra}`;
  const ownClean = (extra = "") => `commitment: first\ncommit: ${at}\nexamined:\n  - the work\nfindings: []\n${extra}`;
  const F = "```";
  // A checked box, a lettered or roman marker and a parenthesised letter are markup like any other.
  for (const line of ["- [x] open: a defect nobody names", "- [X] open: a defect nobody names", "a) open: a defect nobody names", "i. open: a defect nobody names", "- (x) open: a defect nobody names", "iv) open: a defect nobody names"]) {
    assert.doesNotMatch(write(ownClean(), clean(`\n## Notes\n\n${line}\n`)), /^Done: /, `in the report: ${line}`);
    assert.doesNotMatch(write(ownClean(`\n## Notes\n\n${line}\n`), clean()), /^Done: /, `in the review: ${line}`);
  }
  // A finding in the report's examined: list or header, written with a checked box, is named too.
  assert.doesNotMatch(write(ownClean(), `commitment: first\ncommit: ${at}\nreviewer: r\nexamined:\n  - x at ${at}\n  - [x] open: a defect nobody names\nfindings: []\n`), /^Done: /, "a checked box inside examined:");
  assert.doesNotMatch(write(ownClean(), `commitment: first\ncommit: ${at}\nreviewer: r\n- [x] open: a defect nobody names\nexamined:\n  - x at ${at}\nfindings: []\n`), /^Done: /, "and in the header");
  // A finding hidden in a field's own value is named.
  assert.doesNotMatch(write(ownClean(), `commitment: first\ncommit: ${at}\nreviewer: open: a defect nobody names\nexamined:\n  - x at ${at}\nfindings: []\n`), /^Done: /, "a finding as a field's value");
  // A fence opens on a line of its own, or with one word: prose that begins with the marker hides nothing.
  const prose = `\n## Notes\n\n${F} opens a fence, and the next such line closes it.\n\n## Findings\n\n- open: a defect nobody names\n\n${F}\ncairn: R-001: pass\n${F}\n`;
  assert.doesNotMatch(write(ownClean(), clean(prose)), /^Done: /, "a finding between a prose marker and a real fence");
  assert.doesNotMatch(write(ownClean(prose), clean()), /^Done: /, "and the same in the review");
  // A fence keeps a quoted field out of the metadata, and hides no finding from the sweep.
  assert.match(write(ownClean(), clean(`\n## Notes\n\n${F}\nfindings:\n  - a quoted example\n${F}\n`)), /^Done: /, "a quoted field inside a fence");
  for (const open of [F, `${F}text`, `${F}console session`, `  ${F}`])
    assert.doesNotMatch(write(ownClean(), clean(`\n## Notes\n\n${open}\n- open: a defect nobody names\n${F}\n`)), /^Done: /, `the prefix inside a fence opened with ${JSON.stringify(open)}`);
  // No repair names its requirement twice.
  const twice = write(ownClean(`\n## Notes\n\n- open: a defect of my own\n`), clean());
  assert.doesNotMatch(twice, /\(LOOP-\d+\)[^\n]*\(LOOP-\d+\)/, "one requirement tag per message");
});

test("a label before the prefix is markup too, and a divider hides no finding (LOOP-020, LOOP-071, LOOP-086)", () => {
  const root = repo();
  review(root); commit(root, "reviewed");
  const at = head(root);
  const write = (own, report) => { writeFileSync(join(root, ".cairn/reviews/first.md"), own); writeFileSync(reportFile(root), report); commit(root, "records"); return wake(root); };
  const clean = (extra = "") => `commitment: first\ncommit: ${at}\nreviewer: r\nexamined:\n  - x at ${at}\nfindings: []\n${extra}`;
  const ownClean = (extra = "") => `commitment: first\ncommit: ${at}\nexamined:\n  - the work\nfindings: []\n${extra}`;
  // A reviewer asked to rate its findings writes a label before the prefix.
  for (const line of ["- Blocked: open: a defect nobody names", "- silent: open: a defect nobody names", "> Note: open: a defect nobody names", "| Note: open: a defect nobody names |", "- **Blocked:** open: a defect nobody names", "- Note (1): open: a defect nobody names", "- Finding #1: open: a defect nobody names"]) {
    assert.doesNotMatch(write(ownClean(), clean(`\n## Notes\n\n${line}\n`)), /^Done: /, `in the report: ${line}`);
    assert.doesNotMatch(write(ownClean(`\n## Notes\n\n${line}\n`), clean()), /^Done: /, `in the review: ${line}`);
  }
  // A decorative divider is not a fence the sweep respects.
  const divider = "~~~~~~~~~~~~~~~~~~~~~~~~";
  assert.doesNotMatch(write(ownClean(), clean(`\n${divider}\n\n## What I found\n\n- open: a defect nobody names\n\n${divider}\n`)), /^Done: /, "a tilde divider used twice in the report");
  assert.doesNotMatch(write(ownClean(`\n${divider}\n\n## Later\n\n- open: my own unresolved defect\n\n${divider}\n`), clean()), /^Done: /, "and in the review");
  // A stray marker leaves no gap: an unpaired opener and a lone closer both hide nothing.
  const F = "```";
  assert.doesNotMatch(write(ownClean(), clean(`\n## Notes\n\n${F}console session\noutput\n${F}\n\n## Findings\n\n- open: a defect nobody names\n\n${F}console\nmore output\n${F}\n`)), /^Done: /, "a finding between two quoted blocks");
  assert.doesNotMatch(write(ownClean(), clean(`\n## Notes\n\noutput pasted with the opener forgotten\n${F}\n\n- open: a defect nobody names\n\n${F}\n`)), /^Done: /, "a finding between two stray closers");
  // An honest label that is not a finding keeps its prose.
  for (const line of ["- Blocked: the gate refuses an honest entry", "- Note: opened the file and read it"])
    assert.match(write(ownClean(), clean(`\n## Notes\n\n${line}\n`)), /^Done: /, `honest text: ${line}`);
});

test("only the findings list itself is exempt from the sweep, and a label of any shape is markup (LOOP-020, LOOP-071, LOOP-086)", () => {
  const root = repo();
  review(root); commit(root, "reviewed");
  const at = head(root), s = at.slice(0, 7);
  const write = (own, report) => { writeFileSync(join(root, ".cairn/reviews/first.md"), own); writeFileSync(reportFile(root), report); commit(root, "records"); return wake(root); };
  const carried = (extra = "") => `commitment: first\ncommit: ${at}\nreviewer: r\nexamined:\n  - x at ${at}\nfindings:\n  - the gate drops an entry\n${extra}`;
  const ownCarries = (extra = "") => `commitment: first\ncommit: ${at}\nexamined:\n  - the work\nfindings:\n  - resolved: the gate drops an entry, fixed (independent ${s} 1)\n${extra}`;
  const clean = (extra = "") => `commitment: first\ncommit: ${at}\nreviewer: r\nexamined:\n  - x at ${at}\nfindings: []\n${extra}`;
  const ownClean = (extra = "") => `commitment: first\ncommit: ${at}\nexamined:\n  - the work\nfindings: []\n${extra}`;
  const F = "```", D = "~~~~~~~~~~~~~~~~~~~~~~~~";
  // Nothing after the list is exempt, with or without a heading below it.
  assert.doesNotMatch(write(ownCarries(), carried(`\n${F}\n- open: the second real defect\n${F}\n`)), /^Done: /, "a fenced finding below the list, before any heading");
  assert.doesNotMatch(write(ownCarries(), carried(`\n${D}\n\n- open: the second real defect\n\n${D}\n`)), /^Done: /, "a divider round a finding, with no heading at all");
  assert.doesNotMatch(write(ownCarries(`\n${D}\n\n- open: my own unresolved defect\n\n${D}\n`), carried()), /^Done: /, "and the same in the review");
  assert.doesNotMatch(write(ownClean(), clean(`\n${F}\n- open: the only real defect\n${F}\n`)), /^Done: /, "a fenced finding below an empty list");
  // A fence that quotes the field does not move the exempt span above itself.
  assert.doesNotMatch(write(ownCarries(), `commitment: first\ncommit: ${at}\nreviewer: r\nexamined:\n  - x at ${at}\n${F}\nfindings:\n  - open: the second real defect\n${F}\nfindings:\n  - the gate drops an entry\n`), /^Done: /, "a quoted field above the real list");
  // The list's own entries stay exempt, so an honest record still reads.
  assert.match(write(ownCarries(), carried()), /^Done: /, "a clean pair still reaches Done");
  assert.match(write(ownCarries("\n## Notes\n\nWhat I read.\n"), carried()), /^Done: /, "and prose under a heading is still prose");
  // A label of any length, a second label and a bracketed tag are all markup.
  for (const line of ["- Note: Blocked: open: a defect nobody names", "- Blocked, and the message is also wording and long: open: a defect nobody names", "- [silent] open: a defect nobody names", "- LOOP-086: open: a defect nobody names"]) {
    assert.doesNotMatch(write(ownClean(), clean(`\n## Notes\n\n${line}\n`)), /^Done: /, `in the report: ${line}`);
    assert.doesNotMatch(write(ownClean(`\n## Notes\n\n${line}\n`), clean()), /^Done: /, `in the review: ${line}`);
  }
  assert.doesNotMatch(write(ownClean(), `commitment: first\ncommit: ${at}\nreviewer: r\nexamined:\n  - x at ${at}\n  - Note: Blocked: open: the second real defect\nfindings: []\n`), /^Done: /, "and inside examined:");
  // Honest text with a colon keeps its prose.
  for (const line of ["- What I read: the tests, the walkthrough and the manual", "- Note: nothing was broken", "I checked whether such a line is read wherever it sits."])
    assert.match(write(ownClean(), clean(`\n## Notes\n\n${line}\n`)), /^Done: /, `honest text: ${line}`);
  // The advice no longer names a fence as cover.
  assert.doesNotMatch(write(ownClean(), clean(`\n## Notes\n\n- open: a defect nobody names\n`)), /inside a fence/, "no message offers a fence as cover");
});

test("the prefix belongs to the findings list alone: anywhere else in a record it is a finding (LOOP-020, LOOP-086)", () => {
  const root = repo();
  review(root); commit(root, "reviewed");
  const at = head(root), s = at.slice(0, 7);
  const write = (own, report) => { writeFileSync(join(root, ".cairn/reviews/first.md"), own); writeFileSync(reportFile(root), report); commit(root, "records"); return wake(root); };
  const ownC = (x = "") => `commitment: first\ncommit: ${at}\nexamined:\n  - the work\nfindings:\n  - resolved: the gate drops an entry, fixed (independent ${s} 1)\n${x}`;
  const rep = (x = "") => `commitment: first\ncommit: ${at}\nreviewer: r\nexamined:\n  - x at ${at}\nfindings:\n  - the gate drops an entry\n${x}`;
  const F = "```", D = "~~~~~~~~~~~~~~~~~~~~~~~~";
  // A fence inside the list is not part of the list, so nothing hides there.
  assert.doesNotMatch(write(ownC(), rep(`${F}\n- open: the second real defect\n${F}\n  - the gate drops another entry\n`)), /^Done: /, "a fence between two entries");
  assert.doesNotMatch(write(ownC(), rep(`${F}\n## Findings\n- open: one\n- open: two\n| open: three |\n${F}\n`)), /^Done: /, "a fence holding several findings inside the list");
  assert.doesNotMatch(write(ownC(`${F}\n- open: my own unresolved defect\n${F}\n`), rep()), /^Done: /, "and the same in the review");
  // A label needs no colon of its own, and no number of labels hides the prefix.
  for (const line of ["- Finding 3 - open: a defect nobody names", "- Note open: a defect nobody names", "- a: b: c: d: open: a defect nobody names", "- a: b: c: d: e: f: open: a defect nobody names", "The sweep reads a line that says open: wherever it sits."]) {
    assert.doesNotMatch(write(ownC(), rep(`\n## Notes\n\n${line}\n`)), /^Done: /, `in the report: ${line}`);
    assert.doesNotMatch(write(ownC(`\n## Notes\n\n${line}\n`), rep()), /^Done: /, `in the review: ${line}`);
  }
  // A heading that names findings holds nothing, whatever the list holds.
  assert.doesNotMatch(write(ownC(), rep("\n## Further findings\n\nThe gate accepts a second defect written here as prose.\n")), /^Done: /, "prose under a findings-naming heading beside a nonempty list");
  // A word that merely contains the prefix is not the prefix.
  for (const line of ["- opened: the file and read it", "- unresolved issues remain in the walkthrough", "- What I read: the tests and the manual", "- the open questions are listed in the roadmap"])
    assert.match(write(ownC(), rep(`\n## Notes\n\n${line}\n`)), /^Done: /, `honest text: ${line}`);
  // Only the list's own lines are exempt, and a clean pair still reads.
  assert.match(write(ownC(), rep()), /^Done: /, "a clean pair");
  assert.doesNotMatch(write(ownC(), rep(`\n${D}\n- open: the second real defect\n${D}\n`)), /^Done: /, "a divider round a finding after the list");
});

test("the prefix is what a line says however it is punctuated, and no fence or second field hides an entry (LOOP-020, LOOP-071, LOOP-086)", () => {
  const root = repo();
  review(root); commit(root, "reviewed");
  const at = head(root), s = at.slice(0, 7);
  const write = (own, report) => { writeFileSync(join(root, ".cairn/reviews/first.md"), own); writeFileSync(reportFile(root), report); commit(root, "records"); return wake(root); };
  const ownC = (x = "") => `commitment: first\ncommit: ${at}\nexamined:\n  - the work\nfindings:\n  - resolved: the gate drops an entry, fixed (independent ${s} 1)\n${x}`;
  const rep = (x = "") => `commitment: first\ncommit: ${at}\nreviewer: r\nexamined:\n  - x at ${at}\nfindings:\n  - the gate drops an entry\n${x}`;
  const F = "```";
  // Punctuation round the word is punctuation, not cover.
  for (const line of ["- [open]: a defect nobody names", '- "open": a defect nobody names', "- (open): a defect nobody names", "- open&#58; a defect nobody names", "- open" + String.fromCharCode(160) + ": a defect nobody names", "- open" + String.fromCharCode(8203) + ": a defect nobody names", "- <open>: a defect nobody names", "- {resolved}: a defect nobody names"]) {
    assert.doesNotMatch(write(ownC(), rep(`\n## Notes\n\n${line}\n`)), /^Done: /, `in the report: ${JSON.stringify(line)}`);
    assert.doesNotMatch(write(ownC(`\n## Notes\n\n${line}\n`), rep()), /^Done: /, `in the review: ${JSON.stringify(line)}`);
  }
  // A word that merely contains it keeps its prose.
  for (const line of ["- opened: the file and read it", "- the open questions: two of them", "- reopen: it later", "- unresolved: nothing"])
    assert.match(write(ownC(), rep(`\n## Notes\n\n${line}\n`)), /^Done: /, `honest text: ${line}`);
  // A fence inside the list hides no entry: the record is refused rather than read in part.
  assert.doesNotMatch(write(ownC(), rep(`${F}\n  - the gate drops a second entry\n  - the gate drops a third entry\n${F}\n`)), /^Done: /, "a fence inside the report's list");
  assert.doesNotMatch(write(ownC(`${F}\n  - resolved: something else\n${F}\n`), rep()), /^Done: /, "and inside the review's list");
  // A second findings field in the body is named, whatever the header's list holds.
  for (const header of [ownC, () => `commitment: first\ncommit: ${at}\nexamined:\n  - the work\nfindings: []\n`])
    assert.doesNotMatch(write(header(), rep(`\n## Appendix\n\nfindings:\n  - a real defect the header never lists\n`)), /^Done: /, "a second findings field in the report's body");
  // A leading title with no space after its hash is read by both parsers.
  assert.match(write(ownC(), `#Independent report\n\n${rep()}`), /^Done: /, "a hashed title with no space");
  // A clean pair still reads.
  assert.match(write(ownC(), rep()), /^Done: /, "a clean pair");
});

test("a numbered prefix is still the prefix, and each message names the action it means (LOOP-020, LOOP-086)", () => {
  const root = repo();
  review(root); commit(root, "reviewed");
  const at = head(root), s = at.slice(0, 7);
  const write = (own, report) => { writeFileSync(join(root, ".cairn/reviews/first.md"), own); writeFileSync(reportFile(root), report); commit(root, "records"); return wake(root); };
  const ownC = (x = "") => `commitment: first\ncommit: ${at}\nexamined:\n  - the work\nfindings:\n  - resolved: the gate drops an entry, fixed (independent ${s} 1)\n${x}`;
  const rep = (x = "") => `commitment: first\ncommit: ${at}\nreviewer: r\nexamined:\n  - x at ${at}\nfindings:\n  - the gate drops an entry\n${x}`;
  const F = "```";
  // A reviewer that numbers its findings still writes the prefix.
  for (const line of ["- open 2: a defect nobody names", "- resolved 10: a defect nobody names", "- open #3: a defect nobody names"]) {
    assert.doesNotMatch(write(ownC(), rep(`\n## Notes\n\n${line}\n`)), /^Done: /, `in the report: ${line}`);
    assert.doesNotMatch(write(ownC(`\n## Notes\n\n${line}\n`), rep()), /^Done: /, `in the review: ${line}`);
  }
  assert.doesNotMatch(write(ownC(), `commitment: first\ncommit: ${at}\nreviewer: r\nexamined:\n  - x at ${at}\n  - open 2: a defect nobody names\nfindings:\n  - the gate drops an entry\n`), /^Done: /, "and inside examined:");
  // A year in brackets is still prose: the gap is four characters, not a sentence.
  for (const line of ["- open (2024): a year in the roadmap", "- the API is open. Next: the CLI", "- open/closed: a dichotomy"])
    assert.match(write(ownC(), rep(`\n## Notes\n\n${line}\n`)), /^Done: /, `honest text: ${line}`);
  // A fence inside the examined list hides no entry.
  assert.doesNotMatch(write(ownC(), `commitment: first\ncommit: ${at}\nreviewer: r\nexamined:\n  - x at ${at}\n${F}\n  - a quoted entry\n${F}\nfindings:\n  - the gate drops an entry\n`), /^Done: /, "a fence inside the report's examined list");
  // A report is written again, never repaired, wherever its prefixed line sits.
  const under = write(ownC(), rep(`\n## Notes\n\n- open: a defect nobody names\n`));
  assert.match(under, /^Resolvable: review first\n/, "a prefixed line under a heading names a new report");
  assert.doesNotMatch(under, /^Resolvable: repair/, "and never a repair the gate forbids");
  // The commit must be named where the reviewer wrote it, not inside a quoted block.
  assert.doesNotMatch(write(ownC(), `commitment: first\ncommit: ${at}\nreviewer: r\nexamined:\n  - the kernel\nfindings:\n  - the gate drops an entry\n\n## Notes\n\n${F}\ngit show ${at}\n${F}\n`), /^Done: /, "a commit named only inside a fence");
  // A carry needs the finding's words, not a prefix of a longer word.
  assert.doesNotMatch(write(`commitment: first\ncommit: ${at}\nexamined:\n  - the work\nfindings:\n  - resolved: the gate drops an entryway, not a finding (independent ${s} 1)\n`, rep()), /^Done: /, "a longer word is not the finding's words");
});

test("a comment or an entity is not a gap, a field belongs at the margin, and a bullet belongs to a list (LOOP-020, LOOP-086, LOOP-108)", () => {
  const root = repo();
  review(root); commit(root, "reviewed");
  const at = head(root), s = at.slice(0, 7);
  const write = (own, report) => { writeFileSync(join(root, ".cairn/reviews/first.md"), own); writeFileSync(reportFile(root), report); commit(root, "records"); return wake(root); };
  const ownC = (x = "") => `commitment: first\ncommit: ${at}\nexamined:\n  - the work\nfindings:\n  - resolved: the gate drops an entry, fixed (independent ${s} 1)\n${x}`;
  const rep = (x = "") => `commitment: first\ncommit: ${at}\nreviewer: r\nexamined:\n  - x at ${at}\nfindings:\n  - the gate drops an entry\n${x}`;
  // A comment or a character reference between the word and the colon is a gap, not cover.
  for (const line of ["- open <!-- two words -->: a defect nobody names", "- open&nbsp;: a defect nobody names", "- open&#32;: a defect nobody names", "- resolved <!-- x -->: a defect nobody names"]) {
    assert.doesNotMatch(write(ownC(), rep(`\n## Notes\n\n${line}\n`)), /^Done: /, `in the report: ${line}`);
    assert.doesNotMatch(write(ownC(`\n## Notes\n\n${line}\n`), rep()), /^Done: /, `in the review: ${line}`);
  }
  // An indented findings field is named, and never answered with the empty-list form.
  const bent = write(ownC(), `commitment: first\ncommit: ${at}\nreviewer: r\nexamined:\n  - x at ${at}\n  findings:\n  - the gate drops an entry\n`);
  assert.doesNotMatch(bent, /^Done: /, "an indented findings field");
  assert.doesNotMatch(bent, /findings: \[\]/, "and the empty-list form is not offered");
  // A bullet in the header belongs to a list, or it is named.
  assert.doesNotMatch(write(ownC(), `commitment: first\ncommit: ${at}\nreviewer: r\n  - a bullet belonging to no list\nexamined:\n  - x at ${at}\nfindings:\n  - the gate drops an entry\n`), /^Done: /, "a bullet above the examined list");
  // A fence is named for the list it is in.
  const F = "```";
  assert.match(write(ownC(), rep(`${F}\n  - quoted\n${F}\n`)), /fence inside its findings: list/, "a fence after the findings entries names the findings list");
  // A prefixed bullet inside examined names a new report, like every other prefixed line.
  assert.match(write(ownC(), `commitment: first\ncommit: ${at}\nreviewer: r\nexamined:\n  - x at ${at}\n  - open: a defect nobody names\nfindings:\n  - the gate drops an entry\n`), /^Resolvable: review first\n/, "a prefixed bullet inside examined names a new report");
  // A clean pair still reads.
  assert.match(write(ownC(), rep()), /^Done: /, "a clean pair");
});

test("an element round the word and markup in the gap is still the prefix, and no repair asks for what the record already does (LOOP-020, LOOP-086)", () => {
  const root = repo();
  review(root); commit(root, "reviewed");
  const at = head(root), s = at.slice(0, 7);
  const write = (own, report) => { writeFileSync(join(root, ".cairn/reviews/first.md"), own); writeFileSync(reportFile(root), report); commit(root, "records"); return wake(root); };
  const ownC = (x = "") => `commitment: first\ncommit: ${at}\nexamined:\n  - the work\nfindings:\n  - resolved: the gate drops an entry, fixed (independent ${s} 1)\n${x}`;
  const rep = (x = "") => `commitment: first\ncommit: ${at}\nreviewer: r\nexamined:\n  - x at ${at}\nfindings:\n  - the gate drops an entry\n${x}`;
  // An element round the word, with any other markup in the gap, is still the prefix.
  for (const line of ["- <em>open</em> <!-- two words -->: a defect nobody names", "- <b>resolved</b>&nbsp;: a defect nobody names", "- open <span>x</span>: a defect nobody names", "- <i>open</i><!--c-->: a defect nobody names"]) {
    assert.doesNotMatch(write(ownC(), rep(`\n## Notes\n\n${line}\n`)), /^Done: /, `in the report: ${line}`);
    assert.doesNotMatch(write(ownC(`\n## Notes\n\n${line}\n`), rep()), /^Done: /, `in the review: ${line}`);
  }
  // Honest prose that merely contains an element keeps its prose.
  for (const line of ["- the open <b>source</b> tooling list: three of them", "- opened <!-- a note -->: the file"])
    assert.match(write(ownC(), rep(`\n## Notes\n\n${line}\n`)), /^Done: /, `honest text: ${line}`);
  // A prefixed bullet inside the list is answered like every other, and never told to move where it is.
  const nested = write(ownC(), rep("    - open: a second defect nested under the first\n"));
  assert.doesNotMatch(nested, /move it into the findings: list/, "no repair asks for what the record already does");
  // A report that names defects is never told to declare itself empty.
  const none = write(ownC(), `commitment: first\ncommit: ${at}\nreviewer: r\nexamined:\n  - x at ${at}\n\n## Notes\n\n- open: a defect nobody names\n`);
  assert.doesNotMatch(none, /findings: \[\]/, "a report that names defects is not told to declare none");
  // A clean pair still reads.
  assert.match(write(ownC(), rep()), /^Done: /, "a clean pair");
});
