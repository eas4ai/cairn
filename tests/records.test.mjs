// Every record shape an agent is led to write is read, refused by name,
// or repaired by name; no state exits raw or traps the loop (commitment
// records-in-every-shape).
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, readFileSync, existsSync, mkdirSync, chmodSync, appendFileSync, unlinkSync, rmSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { repo as base, cairn, commit, review, fromFile, passing, head, git, records, CLI, realize, UNBUILT } from "./helpers.mjs";
import { parseSpec } from "../bin/spec.mjs";

const repo = (o = {}) => base({ ".cairn/mechanisms/m": fromFile("R-001", "R-002"), ...o });
const wake = (root) => cairn(root, "wake");
const green = (root) => { cairn(root, "check"); review(root); commit(root, "green"); };
const decision = (root, rests = "Rests on: R-001", extra = "") => `# D\n\nLevel: Judged\nDecided by: agent\n${rests}\nWould be wrong if: never\nHistory: none\n${extra}\n## Realized by\n\n- ${head(root)} init\n`;
const PROMOTED = "# First\n\nSlug: first\nRequirements: R-001, R-002\nPromoted from: some-item\n";

test("Concerns, Rests on, and Promoted from written as lists read as the flat form (LOOP-124)", () => {
  let root = repo();
  writeFileSync(join(root, "docs/decisions/d.md"), decision(root, "Rests on:\n  - R-001\n  - R-002")); commit(root, "list-form Rests on");
  let r = cairn(root, "reversals"); assert.equal(r.status, 0, r.stderr);
  r = wake(root); assert.equal(r.status, 1, r.stdout + r.stderr); assert.match(r.stdout, /^Resolvable: run R-001/);
  mkdirSync(join(root, ".cairn/escalations"), { recursive: true });
  writeFileSync(join(root, ".cairn/escalations/r-001.md"), "Concerns:\n  - R-001\nRaised: 2026-09-15T00:00:00.000Z\nAnswered: 2026-09-15T01:00:00.000Z\n\nDECISION\nQuestion: q\nAnswer: ok\n"); commit(root, "list-form Concerns, answered");
  r = wake(root); assert.equal(r.status, 1, r.stdout + r.stderr); assert.match(r.stdout, /^Resolvable: run R-001/); assert.match(r.stdout, /answered r-001: ok/);
  root = repo({ "docs/commitments/first.md": "# First\n\nSlug: first\nRequirements: R-001, R-002\nPromoted from:\n  - some-item\n" });
  writeFileSync(join(root, "docs/decisions/promote-some-item.md"), decision(root, "Rests on: R-001", "Promotes: some-item\n").replace("Level: Judged", "Level: Consequential"));
  mkdirSync(join(root, ".cairn/queue"), { recursive: true }); writeFileSync(join(root, ".cairn/queue/promote-some-item"), "docs/decisions/promote-some-item.md\n"); commit(root, "promotion");
  r = wake(root); assert.doesNotMatch(r.stdout, /repair docs\/commitments/, r.stdout); assert.match(r.stdout, /^Resolvable: run R-001/);
});

test("an item named by filename, path, or backticked slug resolves like the slug (LOOP-125)", () => {
  for (const form of ["foo.md", ".cairn/next-iteration/foo.md", "`foo`"]) {
    const root = repo({ ".cairn/next-iteration/foo.md": "# Foo\n\nChanges: R-001\n\nbody\n", "docs/commitments/first.md": `# First\n\nSlug: first\nRequirements: R-001, R-002\nSpecified from: ${form}\n` });
    const r = wake(root);
    assert.match(r.stdout, /^Resolvable: repair \.cairn\/next-iteration\/foo\.md/, `${form}: ${r.stdout}`); assert.match(r.stdout, /SPEC-027/);
  }
  const root = repo({ ".cairn/backlog/some-item.md": "# Some item\n\nSurfaced from: R-001\n\nbody\n", "docs/commitments/first.md": PROMOTED });
  const r = cairn(root, "decide", "--title", "Promote it", "--level", "Consequential", "--decided-by", "agent", "--rests-on", "R-001", "--wrong-if", "never", "--body", "x", "--promotes", ".cairn/backlog/some-item.md");
  assert.equal(r.status, 0, r.stderr);
  assert.match(readFileSync(join(root, "docs/decisions/promote-it.md"), "utf8"), /^Promotes: some-item$/m);
  realize(root, "promote-it"); commit(root, "recorded");
  assert.doesNotMatch(wake(root).stdout, /repair docs\/commitments/);
});

test("an input that covers Cairn's own output is named as the repair, before and after a check (LOOP-126, LOOP-105)", () => {
  for (const input of [".cairn/*", "*"]) {
    const root = repo({ ".cairn/mechanisms/m": fromFile("R-001", "R-002").replace("  - src/exit", `  - ${input}`) });
    let r = cairn(root, "check");
    assert.equal(r.status, 1, r.stdout + r.stderr); assert.match(r.stdout, /^Resolvable: repair \.cairn\/mechanisms\/m/, `${input}: ${r.stdout}`); assert.match(r.stdout, /LOOP-126/);
    assert.doesNotMatch(r.stdout, /commit \.cairn\/evidence/);
    commit(root, "the retained output");
    r = wake(root); assert.match(r.stdout, /^Resolvable: repair \.cairn\/mechanisms\/m/, `${input} after commit: ${r.stdout}`); assert.match(r.stdout, /LOOP-126/);
    assert.equal(records(root, "R-001").length, 0);
  }
});

test("an unreadable record directory is a repair, not an error exit (LOOP-127)", (t) => {
  if (process.getuid?.() === 0) return t.skip("root reads everything");
  const root = repo(); mkdirSync(join(root, ".cairn/escalations"), { recursive: true }); chmodSync(join(root, ".cairn/escalations"), 0o000);
  const r = wake(root);
  chmodSync(join(root, ".cairn/escalations"), 0o755);
  assert.equal(r.status, 1, r.stdout + r.stderr); assert.match(r.stdout, /^Resolvable: repair \.cairn\/escalations/); assert.match(r.stdout, /LOOP-107/); assert.equal(r.stderr, "");
});

test("a title that slugifies to nothing is refused (LOOP-128)", () => {
  const root = repo();
  let r = cairn(root, "backlog", "--title", "!!!", "--body", "x", "--from", "R-001");
  assert.equal(r.status, 3, r.stdout); assert.match(r.stderr, /LOOP-128/); assert.ok(!existsSync(join(root, ".cairn/backlog/.md")));
  r = cairn(root, "decide", "--title", "???", "--level", "Judged", "--decided-by", "agent", "--rests-on", "R-001", "--wrong-if", "never", "--body", "x");
  assert.equal(r.status, 3, r.stdout); assert.match(r.stderr, /LOOP-128/); assert.ok(!existsSync(join(root, "docs/decisions/.md")));
});

test("examined: [] is an empty list (LOOP-129, LOOP-108)", () => {
  const root = repo(); cairn(root, "check");
  writeFileSync(join(root, ".cairn/reviews/first.md"), `commitment: first\ncommit: ${head(root)}\nexamined: []\nfindings: []\n`); commit(root, "review");
  const r = wake(root);
  assert.match(r.stdout, /^Resolvable: repair \.cairn\/reviews\/first\.md/, r.stdout); assert.match(r.stdout, /examined/);
});

// A project at packages/app below the Git toplevel, committed; run() is the kernel from inside it.
const nested = (mechanism = passing("R-001", "R-002")) => {
  const top = repo(), project = join(top, "packages/app");
  for (const d of ["docs/spec", "docs/commitments", "docs/decisions", ".cairn/mechanisms", "src"]) mkdirSync(join(project, d), { recursive: true });
  writeFileSync(join(project, "docs/spec/roadmap.md"), "# Roadmap\n\nCurrent: first\n");
  writeFileSync(join(project, "docs/spec/test.md"), readFileSync(join(top, "docs/spec/test.md"), "utf8"));
  writeFileSync(join(project, "docs/commitments/first.md"), "# First\n\nSlug: first\nRequirements: R-001, R-002\n");
  writeFileSync(join(project, ".cairn/mechanisms/m"), mechanism);
  writeFileSync(join(project, "src/other"), "x\n");
  commit(top, "nested project");
  return { top, project, run: (...a) => spawnSync("node", [CLI, ...a], { cwd: project, encoding: "utf8" }) };
};

test("below the Git toplevel the restore check compares root-relative paths (LOOP-130, LOOP-035)", () => {
  const { top, project, run } = nested();
  writeFileSync(join(project, "src/extra"), "stray\n"); commit(top, "stray work in the nested project");
  assert.match(run("wake").stdout, /^Resolvable: scope src\/extra/);
  const raise = () => run("escalate", "--scope", "--concerns", "LOOP-035", "--question", "Acknowledge?", "--recommend", "x", "--because", "y", "--if-wrong", "z", "--instead", "w");
  let r = raise(); assert.equal(r.status, 3, r.stdout + r.stderr); assert.match(r.stderr, /restore these paths.*src\/extra/);
  unlinkSync(join(project, "src/extra")); commit(top, "restored");
  r = raise(); assert.equal(r.status, 0, r.stderr);
});

test("below the Git toplevel an uncommitted declared input is named from the project root (LOOP-132, LOOP-030)", () => {
  const { project, run } = nested();
  writeFileSync(join(project, "src/other"), "y\n");
  let r = run("wake"); assert.match(r.stdout, /^Resolvable: record src\/other\n/, r.stdout);
  r = run("check"); assert.match(r.stdout, /^Resolvable: commit src\/other\n/, r.stdout); assert.match(r.stdout, /uncommitted changes: src\/other \(LOOP-030\)/, r.stdout);
});

test("an input spelled .. from a project below the Git toplevel covers the evidence directory (LOOP-126, LOOP-105)", () => {
  const { project, run } = nested(passing("R-001", "R-002").replace("  - src/other", "  - .."));
  const r = run("check");
  assert.equal(r.status, 1, r.stdout + r.stderr); assert.match(r.stdout, /^Resolvable: repair \.cairn\/mechanisms\/m\n  input \.\. covers \.cairn\/evidence\//, r.stdout); assert.match(r.stdout, /LOOP-126/);
  assert.doesNotMatch(r.stdout, /commit .*\.cairn\/evidence/); assert.equal(existsSync(join(project, ".cairn/evidence")), false, "nothing ran");
});

test("a Consequential record this commitment added needs its queue entry committed (LOOP-131, DEC-004)", () => {
  const root = repo();
  const r = cairn(root, "decide", "--title", "Big call", "--level", "Consequential", "--decided-by", "agent", "--rests-on", "R-001", "--wrong-if", "never", "--body", "x");
  assert.equal(r.status, 0, r.stderr);
  realize(root, "big-call");
  git(root, "add", "docs/decisions"); git(root, "commit", "-qm", "the record without its queue entry");
  let out = wake(root).stdout;
  assert.match(out, /^Resolvable: commit \.cairn\/queue\/big-call/, out); assert.match(out, /LOOP-131/);
  unlinkSync(join(root, ".cairn/queue/big-call"));
  out = wake(root).stdout; assert.match(out, /^Resolvable: repair docs\/decisions\/big-call\.md/, out); assert.match(out, /LOOP-131/);
  writeFileSync(join(root, ".cairn/queue/big-call"), "docs/decisions/big-call.md\n"); commit(root, "queued");
  out = wake(root).stdout; assert.match(out, /^Resolvable: run R-001/, out);
  git(root, "rm", "-q", ".cairn/queue/big-call"); git(root, "commit", "-qm", "reviewed");
  out = wake(root).stdout; assert.match(out, /^Resolvable: run R-001/, out);
});

test("a mechanism that removes the check lock still gets its evidence, with no repair for the lock (LOOP-107)", () => {
  const root = repo({ ".cairn/mechanisms/m": passing("R-001", "R-002").replace("node -e 0", "node -e \"require('fs').unlinkSync('.git/cairn-check.lock')\"") });
  const r = cairn(root, "check");
  assert.doesNotMatch(r.stdout, /repair \.git/, r.stdout); assert.match(r.stdout, /recorded .* R-001: pass/);
  assert.equal(records(root, "R-001").length, 1);
});

test("a staged rename reads as its two paths, never as a bare origin token (LOOP-030, LOOP-110)", () => {
  const root = repo({ ".cairn/mechanisms/m": passing("R-001", "R-002").replace("  - src/other", "  - src/") });
  git(root, "mv", "src/other", "src/renamed");
  const r = cairn(root, "check");
  assert.equal(r.status, 1, r.stdout); assert.match(r.stdout, /^Resolvable: commit src\//); assert.doesNotMatch(r.stdout, /[ ,]\/other/, r.stdout); assert.match(r.stdout, /in-progress/);
});

test("a Current: line inside a fenced example is neither a second Current: line nor the commitment, before or after the real line (LOOP-104)", () => {
  let root = repo({ "docs/spec/roadmap.md": "# Roadmap\n\nThe line looks like this:\n\n```\nCurrent: example\n```\n\nCurrent: first\n" });
  assert.doesNotMatch(wake(root).stdout, /repair docs\/spec\/roadmap/);
  root = repo({ "docs/spec/roadmap.md": "# Roadmap\n\nCurrent: first\n\nThe line looks like this:\n\n```\nCurrent: example\n```\n" });
  const out = wake(root).stdout; assert.match(out, /^Resolvable: run R-001/, out); assert.doesNotMatch(out, /example/);
});

test("a Status: word is taken only from a line that carries one, never from wrapped prose after it (SPEC-018)", () => {
  const block = parseSpec("# A\n\nStatus: Draft\nPrefix: A\n\n[A-001] The tool MUST work.\nFalsifier: it does not.\nStatus: Agreed 2026-09-15\nRevised on the same day; the prose wraps onto a\nStatus: line without a status word.\n").blocks[0];
  assert.equal(block.status, "Agreed");
});

// --- the unbuilt placeholder above a resolving commit (DEC-021) ---

// A decision record whose Realized by section is exactly what is passed.
const realized = (body) => `# D\n\nLevel: Judged\nDecided by: agent\nRests on: R-001\nWould be wrong if: never\nHistory: none\n\n## Decision\n\nx\n\n## Realized by\n\n${body}\n`;

test("the placeholder left above a resolving entry is a repair naming the file (DEC-021)", () => {
  // Both orders: decide writes the placeholder, and an agent appends below or above it.
  for (const body of [`${UNBUILT}\n\n- ${"HEAD"} init`, `- ${"HEAD"} init\n\n${UNBUILT}`, `${UNBUILT}\n- ${"HEAD"} init\n- ${"HEAD"} init`]) {
    const root = repo();
    writeFileSync(join(root, "docs/decisions/d.md"), realized(body.replaceAll("HEAD", head(root))));
    commit(root, "placeholder above the commits");
    const r = wake(root);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /^Resolvable: repair docs\/decisions\/d\.md/, r.stdout);
    assert.match(r.stdout, /remove the placeholder line/, r.stdout);
    assert.match(r.stdout, /DEC-021/, r.stdout);
  }
});

test("the placeholder alone is a decision recorded and not yet built, unchanged (DEC-007)", () => {
  const root = repo();
  writeFileSync(join(root, "docs/decisions/d.md"), realized(UNBUILT));
  commit(root, "recorded, not built");
  const r = wake(root);
  assert.match(r.stdout, /^Resolvable: build docs\/decisions\/d\.md/, r.stdout);
  assert.doesNotMatch(r.stdout, /placeholder/, r.stdout);
});

test("resolving entries with no placeholder are unchanged (DEC-006)", () => {
  const root = repo();
  writeFileSync(join(root, "docs/decisions/d.md"), realized(`- ${head(root)} init`));
  commit(root, "built");
  const r = wake(root);
  assert.doesNotMatch(r.stdout, /docs\/decisions\/d\.md/, r.stdout);
  assert.match(r.stdout, /^Resolvable: run R-001/, r.stdout);
});

test("a shallow clone that cannot resolve its entries is still told to fetch, not to edit (LOOP-113 keeps precedence)", () => {
  const root = repo();
  writeFileSync(join(root, "docs/decisions/d.md"), realized(`${UNBUILT}\n\n- ${head(root)} init`));
  commit(root, "placeholder above the commits");
  const shallow = join(root, "..", `shallow-${Date.now()}`);
  assert.equal(spawnSync("git", ["clone", "-q", "--depth", "1", "--no-local", `file://${root}`, shallow], { encoding: "utf8" }).status, 0);
  // The clone's one commit is the record's own, so its identifier does not resolve there.
  writeFileSync(join(shallow, "docs/decisions/d.md"), realized(`${UNBUILT}\n\n- 0123456789abcdef0123456789abcdef01234567 gone`));
  commit(shallow, "an identifier this clone cannot resolve");
  const r = cairn(shallow, "wake");
  assert.match(r.stdout, /^Resolvable: repair docs\/decisions\/d\.md/, r.stdout);
  assert.match(r.stdout, /shallow clone/, r.stdout);
  assert.match(r.stdout, /LOOP-113/, r.stdout);
  assert.doesNotMatch(r.stdout, /placeholder/, r.stdout);
  rmSync(shallow, { recursive: true, force: true });
});

test("the placeholder quoted in a fenced example does not make a built record a repair (DEC-021)", () => {
  const root = repo();
  const quoted = "# D\n\nLevel: Judged\nDecided by: agent\nRests on: R-001\nWould be wrong if: never\nHistory: none\n\n## Decision\n\nA record that has not been built reads:\n\n```\n## Realized by\n\n" + UNBUILT + "\n```\n\n## Realized by\n\n- " + head(root) + " init\n";
  writeFileSync(join(root, "docs/decisions/d.md"), quoted);
  commit(root, "a record whose body quotes the placeholder");
  const r = wake(root);
  assert.doesNotMatch(r.stdout, /docs\/decisions\/d\.md/, r.stdout);
  assert.match(r.stdout, /^Resolvable: run R-001/, r.stdout);
});

test("supersede takes the same decider vocabulary as decide (DEC-020)", () => {
  const root = repo();
  writeFileSync(join(root, "docs/decisions/old.md"), "# Old\n\nLevel: Judged\nDecided by: agent\nRests on: R-001\nWould be wrong if: x\n\n## Realized by\n\n- abc1234 did it\n");
  const supersede = (by) => cairn(root, "supersede", "old", "--title", "New", "--level", "Judged", "--decided-by", by,
    "--rests-on", "R-001", "--wrong-if", "w", "--body", "b", "--cause", "the premise was false");
  let r = supersede("Codex");
  assert.equal(r.status, 3, r.stdout); assert.match(r.stderr, /DEC-020/);
  assert.equal(existsSync(join(root, "docs/decisions/new.md")), false, "nothing was written");
  assert.doesNotMatch(readFileSync(join(root, "docs/decisions/old.md"), "utf8"), /Superseded by/, "the old record was not stamped");
  r = supersede("Joint");
  assert.equal(r.status, 0, r.stderr);
  assert.match(readFileSync(join(root, "docs/decisions/new.md"), "utf8"), /^Decided by: joint$/m);
});

test("a superseded record is held to the same line: its placeholder above a resolving entry is a repair (DEC-021, DEC-010)", () => {
  const root = repo();
  writeFileSync(join(root, "docs/decisions/d.md"), realized(`${UNBUILT}\n\n- ${head(root)} init`).replace("History: none\n", "History: none\nSuperseded by: e\n"));
  writeFileSync(join(root, "docs/decisions/e.md"), realized(`- ${head(root)} init`).replace("History: none\n", "History: none\nSupersedes: d\nCause: the premise was false\n"));
  commit(root, "a reversed record still says it was never built");
  const r = wake(root);
  assert.match(r.stdout, /^Resolvable: repair docs\/decisions\/d\.md/, r.stdout); assert.match(r.stdout, /DEC-021/);
  // Once repaired, a superseded record with no resolving entry is still skipped, never named build.
  writeFileSync(join(root, "docs/decisions/d.md"), realized(UNBUILT).replace("History: none\n", "History: none\nSuperseded by: e\n"));
  commit(root, "repaired, and unbuilt");
  assert.doesNotMatch(wake(root).stdout, /docs\/decisions\/d\.md/);
});

test("realize() touches only the Realized by section; a body that quotes the placeholder keeps it", () => {
  const root = repo();
  const body = `## Decision\n\nUntil built, the section reads ${UNBUILT}.\n\n## Realized by\n\n${UNBUILT}\n`;
  writeFileSync(join(root, "docs/decisions/d.md"), `# D\n\nLevel: Judged\nDecided by: agent\nRests on: R-001\nWould be wrong if: never\nHistory: none\n\n${body}`);
  realize(root, "d", "built");
  const t = readFileSync(join(root, "docs/decisions/d.md"), "utf8");
  assert.ok(t.includes(`the section reads ${UNBUILT}.`), "the body sentence is untouched");
  assert.match(t, /## Realized by\n\n- [0-9a-f]+ built\n$/, t);
  commit(root, "built");
  assert.doesNotMatch(wake(root).stdout, /docs\/decisions\/d\.md/);
});
