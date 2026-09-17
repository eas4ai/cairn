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
  assert.match(carried(["resolved: the gate, fixed (independent #1) (independent #2)"], ["the gate", "the gate, the parser and the message are wrong"]), /finding 1 is not carried: its review line cites another finding of this report too/);
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
  assert.match(write(`commitment: first\ncommit: ${at}\nexamined:\n  - x\nfindings: []\n`, `commitment: first\ncommit: ${at}\nreviewer: r\nexamined:\n  - x at ${at}\nfindings: []\n\n## Findings\n\n1. one is broken\n2. two is broken\n`), /^Resolvable: repair \.cairn\/reviews\/first\.independent\.md\n.*holds findings under a heading/, "a report that declares findings: [] and lists findings under a findings-titled heading is named, since that shape lost them in silence");
  assert.match(write(own(carry(1, "one")), `commitment: first\ncommit: ${at}\nreviewer: r\nexamined:\n  - x at ${at}\nfindings:\n\n## Findings\n\n1. one is broken\n`), repairsReport, "a report that names findings: and lists none above a heading list is named");
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
  assert.match(write(own(carry(1, "one")), report("  - one\n") + "\n## Findings\n\n- two is broken\n"), /^Resolvable: repair \.cairn\/reviews\/first\.independent\.md\n.*holds findings under a heading/, "a findings-titled heading may not hold a list beside a read list either");
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
  assert.match(write(own(carry(1, "one")), report("  - one\n", "\n## Findings in full\n\n- wake exits 3 on an empty report\n- the message names the wrong file\n")), /^Resolvable: repair \.cairn\/reviews\/first\.independent\.md\n.*holds findings under a heading/, "a report's further findings under a findings-titled heading are named, not read past");
  assert.match(write(own(carry(1, "one"), "\n## More findings\n\n- the reader drops a wrapped entry\n"), report("  - one\n")), /^Resolvable: repair \.cairn\/reviews\/first\.md\n.*under a heading/, "and the same in the review, whatever the bullets look like");
});

test("a record that declares findings: [] keeps a bulleted body as prose, as this repository's own reviews are written (LOOP-086, LOOP-020)", () => {
  const root = repo();
  review(root); commit(root, "reviewed");
  const at = head(root);
  const write = (own, report) => { writeFileSync(join(root, ".cairn/reviews/first.md"), own); writeFileSync(reportFile(root), report); commit(root, "records"); return wake(root); };
  const body = "\n## Attacked\n\n- the empty-name case before the fix and after it\n- 1500 declared inputs, timed\n";
  assert.match(write(`commitment: first\ncommit: ${at}\nexamined:\n  - the work\nfindings: []\n${body}`, `commitment: first\ncommit: ${at}\nreviewer: r\nexamined:\n  - x at ${at}\nfindings: []\n${body}`), /^Done: /, "both records declare no findings and carry a bulleted body");
  assert.match(write(`commitment: first\ncommit: ${at}\nexamined:\n  - the work\nfindings:\n${body}`, `commitment: first\ncommit: ${at}\nreviewer: r\nexamined:\n  - x at ${at}\nfindings: []\n`), /^Resolvable: repair \.cairn\/reviews\/first\.md\n.*under a heading/, "a findings: line with no entries and a list below it is still named");
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
  assert.match(write(`Review\n======\n\ncommitment: first\ncommit: ${at}\nexamined:\n  - x\nfindings: []\n`, rep("findings: []\n").replace("findings:\nfindings: []", "findings: []")), /the fields sit under a heading and the header ends at the first heading, hashed or underlined/, "an underlined title above the fields");
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
  const below = write(ownClean(), `# Independent report\n\ncommitment: first\ncommit: ${at}\nreviewer: r\nexamined:\n  - x at ${at}\nfindings: []\n`);
  assert.match(below, /^Resolvable: repair \.cairn\/reviews\/first\.independent\.md\n.*below a heading, where the header ends.*move the record's fields to the top/, "a report whose fields sit below a title");
  assert.doesNotMatch(below, /start a new reviewer/, "and it is not discarded");
  const prose = write(ownClean(), `I was given the commitment and the commit range.\n\ncommitment: first\ncommit: ${at}\nreviewer: r\nexamined:\n  - x at ${at}\nfindings: []\n`);
  assert.match(prose, /^Resolvable: repair \.cairn\/reviews\/first\.independent\.md\n.*does not read its commitment:, because the line above it is neither a field nor a heading/, "a report whose fields sit below prose");
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
  assert.match(write(ownClean, `# Independent report\n\ncommitment: first\ncommit: ${at}\nreviewer: r\nexamined:\n  - x at ${at}\nfindings: []\n`), /^Resolvable: repair \.cairn\/reviews\/first\.independent\.md\n.*move the record's fields to the top/, "this commitment's report is repaired instead");
  // A field line quoted lower in the header does not replace the real one.
  assert.match(write(ownClean, clean(`\n---\ncommitment: someone-else\n`)), /^Resolvable: repair \.cairn\/reviews\/first\.independent\.md\n.*cannot read as an entry: "commitment: someone-else"/, "a quoted commitment: line inside the list is named, not read as the record's commitment");
  assert.match(write(ownClean, clean(`\n## Notes\n\ncommitment: someone-else\n`)), /^Done: /, "and one below a heading is prose, not the record's commitment");
  // A rule under any field is a rule, whatever the field is named.
  assert.match(write(ownClean, `commitment: first\ncommit: ${at}\nrange: aaaaaaa..${s}\nreviewer: r\n---\nexamined:\n  - x at ${at}\nfindings: []\n`), /^Done: /, "a rule under a field the kernel does not read");
  // The review is told what the report is told.
  assert.match(write(`I reviewed the work.\n\ncommitment: first\ncommit: ${at}\nexamined:\n  - the work\nfindings: []\n`, clean()), /^Resolvable: repair \.cairn\/reviews\/first\.md\n.*does not read its commitment:, because the line above it is neither a field nor a heading/, "the review's fields below prose");
  assert.match(write(`# Review\n\ncommitment: first\ncommit: ${at}\nexamined:\n  - the work\nfindings: []\n`, clean()), /^Resolvable: repair \.cairn\/reviews\/first\.md\n.*names commitment and commit and examined and findings below a heading/, "the review's fields below a title");
  assert.match(write(`commitment: first\ncommit: ${at}\nI read the tests too.\nexamined:\n  - the work\nfindings: []\n`, clean()), /^Resolvable: repair \.cairn\/reviews\/first\.md\n.*reads its commit: as .*because the line below it joined the field/, "a line that joins the review's commit value");
});
