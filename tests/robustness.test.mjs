// Bad records are repairs, and no state traps the loop (LOOP-102 to LOOP-113).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, chmodSync, readFileSync, unlinkSync, mkdtempSync, readdirSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { repo, cairn, git, commit, head, review, passing, fromFile, records, CLI } from "./helpers.mjs";

const setup = (o = {}) => repo({ ".cairn/mechanisms/m": passing("R-001", "R-002"), ...o });
const wake = (root) => cairn(root, "wake");
const green = (root) => { cairn(root, "check"); review(root); commit(root, "green"); };
const decision = (extra = "") => `# D\n\nLevel: Judged\nDecided by: agent\nRests on: R-001\nWould be wrong if: never\n${extra}\n## Decision\n\nx\n\n## Realized by\n\n- HEAD init\n`;

test("a Requirements: line written as a list is read like the flat form (LOOP-102)", () => {
  const root = setup({ "docs/commitments/first.md": "# First\n\nSlug: first\nRequirements:\n  - R-001\n  - R-002\n" });
  const r = wake(root);
  assert.equal(r.status, 1, r.stderr); assert.match(r.stdout, /^Resolvable: run R-001/);
});

test("a subdirectory or a README in a record directory changes nothing (LOOP-103)", () => {
  const root = setup(); green(root);
  mkdirSync(join(root, ".cairn/mechanisms/helpers")); writeFileSync(join(root, ".cairn/mechanisms/helpers/run.sh"), "echo hi\n");
  writeFileSync(join(root, ".cairn/escalations/README.md"), "# Escalations\n\nWhat these are.\n");
  writeFileSync(join(root, "docs/decisions/README.md"), "# Decisions\n\nWhat these are.\n");
  mkdirSync(join(root, "docs/decisions/archive")); writeFileSync(join(root, "docs/decisions/archive/old.md"), "# Old\n");
  commit(root, "strays");
  const r = wake(root);
  assert.equal(r.status, 0, r.stdout + r.stderr); assert.match(r.stdout, /^Done: first/);
});

test("two Current: lines are a roadmap repair (LOOP-104)", () => {
  const root = setup({ "docs/spec/roadmap.md": "# Roadmap\n\nCurrent: first\nCurrent: second\n" });
  const r = wake(root);
  assert.match(r.stdout, /^Resolvable: repair docs\/spec\/roadmap\.md/); assert.match(r.stdout, /LOOP-104/);
});

test("a repeated identifier, an input under the evidence directory, and a missing cwd are refused by name (LOOP-105)", () => {
  for (const [declaration, why] of [
    [passing("R-001", "R-001", "R-002"), /R-001.*(twice|repeat)/],
    [passing("R-001", "R-002").replace("  - src/other", "  - ."), /\.cairn\/evidence/],
    [passing("R-001", "R-002") + "cwd: nowhere\n", /cwd nowhere/],
  ]) {
    const root = repo({ ".cairn/mechanisms/m": declaration });
    for (const command of ["wake", "check"]) {
      const r = cairn(root, command);
      assert.match(r.stdout, /^Resolvable: repair \.cairn\/mechanisms\/m/, r.stdout + r.stderr); assert.match(r.stdout, why); assert.match(r.stdout, /LOOP-105/);
      assert.equal(records(root, "R-001").length, 0);
    }
  }
});

test("a requirement whose evidence outlives its mechanism is named declare, not a regression or an escalation (LOOP-106)", () => {
  const root = repo({ ".cairn/mechanisms/m": fromFile("R-001", "R-002") });
  cairn(root, "check");
  writeFileSync(join(root, "src/exit"), "1\n"); commit(root, "fail"); cairn(root, "check");
  writeFileSync(join(root, ".cairn/mechanisms/m"), fromFile("R-002")); writeFileSync(join(root, "src/exit"), "0\n"); commit(root, "m speaks only for R-002, and passes");
  cairn(root, "check");
  const r = wake(root);
  assert.match(r.stdout, /^Resolvable: declare R-001/, r.stdout);
});

test("an unreadable record is a repair, not an error exit (LOOP-107)", (t) => {
  if (process.getuid?.() === 0) return t.skip("root reads everything");
  const root = setup(); writeFileSync(join(root, "docs/decisions/d.md"), decision()); commit(root, "decision");
  chmodSync(join(root, "docs/decisions/d.md"), 0o000);
  const r = wake(root);
  chmodSync(join(root, "docs/decisions/d.md"), 0o644);
  assert.equal(r.status, 1, r.stdout + r.stderr); assert.match(r.stdout, /^Resolvable: repair docs\/decisions\/d\.md/); assert.match(r.stdout, /LOOP-107/);
});

test("a review needs commit, a nonempty examined list, and a findings list, each named when missing (LOOP-108)", () => {
  const root = setup(); cairn(root, "check");
  const write = (text) => { writeFileSync(join(root, ".cairn/reviews/first.md"), text); commit(root, "review"); return wake(root).stdout; };
  assert.match(write(`commitment: first\ncommit: ${head(root)}\n`), /^Resolvable: repair \.cairn\/reviews\/first\.md\n.*examined/);
  assert.match(write(`commitment: first\ncommit: ${head(root)}\nexamined:\n  - x\n`), /^Resolvable: repair \.cairn\/reviews\/first\.md\n.*findings/);
  assert.match(write(`commitment: first\ncommit: ${head(root)}\n\n## Findings\n\nexamined:\n  - x\nfindings:\n  - open: y\n`), /^Resolvable: repair \.cairn\/reviews\/first\.md\n.*heading/);
  assert.match(write(`commitment: first\nexamined:\n  - x\nfindings: []\n`), /^Resolvable: repair \.cairn\/reviews\/first\.md\n.*commit/);
  writeFileSync(join(root, ".cairn/reviews/first.independent.md"), `commitment: first\ncommit: ${head(root)}\nreviewer: a fresh reviewer\nexamined:\n  - x at ${head(root)}\nfindings: []\n`);   // the independent report (LOOP-020)
  assert.match(write(`commitment: first\ncommit: ${head(root)}\nexamined:\n  - x\nfindings: []\n`), /^Done: first/);
});

test("a decision record missing a header field or naming a missing predecessor is a repair (LOOP-109)", () => {
  for (const [text, why] of [[decision().replace("Level: Judged\n", ""), /Level/], [decision("Supersedes: gone\nCause: the premise was false\n"), /Supersedes.*gone/]]) {
    const root = setup(); writeFileSync(join(root, "docs/decisions/d.md"), text.replace("HEAD", head(root))); commit(root, "decision");
    const r = wake(root);
    assert.match(r.stdout, /^Resolvable: repair docs\/decisions\/d\.md/, r.stdout); assert.match(r.stdout, why); assert.match(r.stdout, /LOOP-109/);
  }
  const root = setup(); writeFileSync(join(root, "docs/decisions/d.md"), decision().replace("HEAD", head(root))); commit(root, "decision");
  assert.match(wake(root).stdout, /^Resolvable: run R-001/);
});

test("a dirty declared input with no in-progress record is named record ahead of run (LOOP-022, LOOP-110)", () => {
  const root = setup();
  writeFileSync(join(root, "src/other"), "edited\n");
  let r = wake(root);
  assert.match(r.stdout, /^Resolvable: record src\/other/, r.stdout); assert.match(r.stdout, /LOOP-022/);
  writeFileSync(join(root, ".cairn/in-progress"), `action: implement\ntarget: R-001\nbase: ${head(root)}\nstarted: 2026-09-15T00:00:00Z\n`);
  r = wake(root);
  assert.match(r.stdout, /^Resolvable: reconcile implement R-001/);
  unlinkSync(join(root, ".cairn/in-progress")); commit(root, "edit");
  assert.match(wake(root).stdout, /^Resolvable: run R-001/);
});

test("with core.filemode false the index mode is the identity, so a mode-only difference does not refuse the check (LOOP-111)", () => {
  const root = setup();
  git(root, "config", "core.filemode", "false");
  chmodSync(join(root, "src/other"), 0o755);
  const r = cairn(root, "check");
  assert.match(r.stdout, /recorded .* R-001: pass/, r.stdout + r.stderr);
});

test("a project below the Git toplevel can run check (LOOP-112)", () => {
  const top = repo(); const project = join(top, "packages/app");
  mkdirSync(project, { recursive: true });
  for (const d of ["docs/spec", "docs/commitments", "docs/decisions", ".cairn/mechanisms", "src"]) mkdirSync(join(project, d), { recursive: true });
  writeFileSync(join(project, "docs/spec/roadmap.md"), "# Roadmap\n\nCurrent: first\n");
  writeFileSync(join(project, "docs/spec/test.md"), readFileSync(join(top, "docs/spec/test.md"), "utf8"));
  writeFileSync(join(project, "docs/commitments/first.md"), "# First\n\nSlug: first\nRequirements: R-001, R-002\n");
  writeFileSync(join(project, ".cairn/mechanisms/m"), passing("R-001", "R-002"));
  writeFileSync(join(project, "src/other"), "x\n");
  commit(top, "nested project");
  const r = spawnSync("node", [CLI, "check"], { cwd: project, encoding: "utf8" });
  assert.match(r.stdout, /recorded .* R-001: pass/, r.stdout + r.stderr);
});

test("a shallow clone names history to fetch, not a decision to build (LOOP-113)", () => {
  const root = setup(); writeFileSync(join(root, "docs/decisions/d.md"), decision().replace("HEAD", head(root))); commit(root, "decision");
  for (let i = 0; i < 3; i++) { writeFileSync(join(root, "unrelated.txt"), `${i}\n`); commit(root, `c${i}`); }
  const clone = root + "-shallow";
  assert.equal(git(root, "clone", "-q", "--depth", "1", `file://${root}`, clone).status, 0);
  const r = spawnSync("node", [CLI, "wake"], { cwd: clone, encoding: "utf8" });
  assert.doesNotMatch(r.stdout, /^Resolvable: build/); assert.match(r.stdout, /shallow/); assert.match(r.stdout, /LOOP-113/);
});

test("record-writing commands refuse to run outside a Cairn repository and write nothing (LOOP-118)", () => {
  const plain = mkdtempSync(join(tmpdir(), "not-cairn-"));
  const fields = ["--title", "T", "--level", "Judged", "--decided-by", "agent", "--rests-on", "R-001", "--wrong-if", "never", "--body", "x"];
  for (const args of [["decide", ...fields], ["escalate", "--concerns", "R-001", "--question", "q", "--recommend", "r", "--because", "b", "--if-wrong", "w", "--instead", "i"], ["answer", "q", "ok"], ["backlog", "--title", "T", "--body", "b"], ["supersede", "old", "--cause", "the premise was false", ...fields], ["reversals"]]) {
    const r = cairn(plain, ...args);
    assert.equal(r.status, 3, args[0] + ": " + r.stdout + r.stderr); assert.match(r.stderr, /not a Cairn repository/, args[0]);
  }
  assert.deepEqual(readdirSync(plain), []);
});

test("a git that cannot start is one line and exit 3 from wake and from check, with nothing recorded (LOOP-137)", () => {
  const root = setup();
  // A PATH whose only git is a file that cannot be executed, beside node.
  const bin = mkdtempSync(join(tmpdir(), "cairn-nogit-")); writeFileSync(join(bin, "git"), "not a program\n"); chmodSync(join(bin, "git"), 0o644);
  const env = { ...process.env, PATH: `${bin}:${join(process.execPath, "..")}` };
  for (const cmd of ["wake", "check"]) {
    const r = spawnSync(process.execPath, [CLI, cmd], { cwd: root, encoding: "utf8", env });
    assert.equal(r.status, 3, cmd + ": " + r.stdout + r.stderr); assert.equal(r.stdout, "", cmd + " printed a verdict: " + r.stdout);
    assert.equal(r.stderr.trim().split("\n").length, 1, cmd + ": one line: " + r.stderr); assert.match(r.stderr, /^cairn: cannot run git: .*EACCES/, cmd + ": " + r.stderr);
  }
  assert.deepEqual(records(root, "R-001"), [], "no receipt"); assert.equal(readdirSync(join(root, ".git")).includes("cairn-check.lock"), false, "no lock left behind");
});

test("an unexplained or uncommitted stop record is named explain before any other action; explained and committed, the wake moves on (LOOP-139)", () => {
  const root = setup();
  mkdirSync(join(root, ".cairn/stops"), { recursive: true });
  const rec = join(root, ".cairn/stops/20260917T000000000Z.md");
  writeFileSync(rec, "# A stop allowed without progress\n\nSession: s\nVerdict: Resolvable: run R-001\n");
  assert.match(wake(root).stdout, /^Resolvable: explain \.cairn\/stops\/20260917T000000000Z\.md\n/, "untracked and unexplained");
  commit(root, "the record, unexplained");
  assert.match(wake(root).stdout, /^Resolvable: explain /, "committed but unexplained");
  appendFileSync(rec, "Explanation: waited for the developer's answer to a question the loop does not model\n");
  assert.match(wake(root).stdout, /^Resolvable: explain /, "explained but not committed");
  commit(root, "explained");
  assert.match(wake(root).stdout, /^Resolvable: run R-001/);
});
