import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, readFileSync, unlinkSync, chmodSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { repo, cairn, commit, fromFile, git, records, review } from "./helpers.mjs";

const write = (root, path, text) => writeFileSync(join(root, path), text);
const ready = () => repo({ ".cairn/mechanisms/m": fromFile("R-001", "R-002") });
const change = (root) => { write(root, "unrelated.txt", "correct work\n"); commit(root, "correct work in the wrong window"); };
const raise = (root, keep = true) => {
  const r = cairn(root, "escalate", "--scope", ...(keep ? ["--keep"] : []), "--concerns", "LOOP-035",
    "--question", "Keep these exact changes?", "--recommend", "Keep the recorded work.",
    "--because", "The work is correct but landed in the wrong window.",
    "--if-wrong", "The retained work may have undeclared dependencies.", "--instead", "Restore the accidental work.");
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.match(/escalations\/([^/]+)\.md/)[1];
};
const approve = (root) => {
  const slug = raise(root); assert.equal(cairn(root, "answer", slug, "ok").status, 0);
  commit(root, "approve exact retained work"); return slug;
};
const blocked = (root) => {
  const before = records(root, "R-001").length;
  for (const command of ["wake", "check"]) assert.match(cairn(root, command).stdout, /^Resolvable: scope /);
  assert.equal(records(root, "R-001").length, before);
};
const runs = (root) => {
  const before = records(root, "R-001").length;
  assert.match(cairn(root, "check").stdout, /^recorded .cairn\/evidence\/runs\/\S+ R-001/m);
  assert.equal(records(root, "R-001").length, before + 1);
};

test("explicit committed retention keeps correct work and requires new evidence and review (LOOP-084, LOOP-085)", () => {
  const root = ready(); runs(root); commit(root); review(root); commit(root);
  assert.match(cairn(root, "wake").stdout, /^Done:/);
  change(root); blocked(root);
  const slug = approve(root);
  const text = readFileSync(join(root, `.cairn/escalations/${slug}.md`), "utf8");
  assert.match(text, /"mode":"keep"/); assert.match(text, /Scope approved: sha256:/);
  assert.match(text, /keep/i); assert.match(text, /future changes/i);
  const w = cairn(root, "wake");
  assert.match(w.stdout, /^Resolvable: run R-001/); assert.match(w.stdout, /retention approval/);
  runs(root); commit(root);
  assert.match(cairn(root, "wake").stdout, /^Resolvable: review first/);
  review(root); commit(root); assert.match(cairn(root, "wake").stdout, /^Done:/);
  assert.equal(readFileSync(join(root, "unrelated.txt"), "utf8"), "correct work\n");
});

test("a missing declaration covers correct earlier work without retention or revert", () => {
  const root = ready(); change(root); blocked(root);
  write(root, ".cairn/mechanisms/m", fromFile("R-001", "R-002").replace("  - src/exit", "  - src/exit\n  - unrelated.txt"));
  commit(root, "declare the missing dependency"); runs(root);
  assert.equal(readFileSync(join(root, "unrelated.txt"), "utf8"), "correct work\n");
});

test("keep requires scope and an unchanged committed candidate", () => {
  const root = ready(); change(root);
  const invalid = cairn(root, "escalate", "--keep", "--concerns", "LOOP-035");
  assert.equal(invalid.status, 3); assert.match(invalid.stderr, /--keep requires --scope/);
  write(root, "unrelated.txt", "unsaved change\n");
  const r = cairn(root, "escalate", "--scope", "--keep", "--concerns", "LOOP-035", "--question", "q",
    "--recommend", "r", "--because", "b", "--if-wrong", "w", "--instead", "i");
  assert.equal(r.status, 3); assert.match(r.stderr, /commit|dirty/i);
});

test("uncommitted retention and instead answers cannot clear the incident", () => {
  const root = ready(); change(root); const slug = raise(root);
  assert.equal(cairn(root, "answer", slug, "ok").status, 0); blocked(root);
  commit(root); runs(root);
  write(root, "unrelated.txt", "another correct change\n"); commit(root); const second = raise(root);
  assert.equal(cairn(root, "answer", second, "instead Correct scope first.").status, 0);
  commit(root); blocked(root);
});

test("retention does not grant future edits, even when reverted to the approved tree", () => {
  const root = ready(); change(root); approve(root); runs(root);
  write(root, "unrelated.txt", "new work\n"); commit(root); blocked(root);
  write(root, "unrelated.txt", "correct work\n"); commit(root); blocked(root);
  approve(root); runs(root);
});

test("retention cannot cover another path or another activation", () => {
  const root = ready(); change(root); approve(root);
  write(root, "other.txt", "unapproved\n"); commit(root); blocked(root);
  assert.match(cairn(root, "wake").stdout, /other.txt/);
  write(root, "docs/commitments/second.md", "# Second\n\nRequirements: R-001, R-002\n");
  write(root, "docs/spec/roadmap.md", "# Roadmap\n\nCurrent: second\n"); commit(root);
  write(root, "docs/spec/roadmap.md", "# Roadmap\n\nCurrent: first\n"); commit(root);
  write(root, "unrelated.txt", "another window\n"); commit(root); blocked(root);
});

test("imported changes must still match the retained tree", () => {
  const root = ready(); change(root); approve(root); runs(root); commit(root);
  assert.equal(git(root, "checkout", "-q", "-b", "side").status, 0);
  write(root, "unrelated.txt", "imported work\n"); commit(root);
  assert.equal(git(root, "checkout", "-q", "main").status, 0);
  assert.equal(git(root, "merge", "--no-ff", "side", "-m", "import work").status, 0);
  blocked(root);
});

test("retention handles additions, deletions, modes, symlinks, and literal filenames", () => {
  for (const kind of ["addition", "deletion", "mode", "symlink", "literal"]) {
    const root = ready(), path = join(root, "unrelated.txt");
    if (kind === "addition") write(root, "added.txt", "correct\n");
    if (kind === "deletion") unlinkSync(path);
    if (kind === "mode") { chmodSync(path, 0o755); assert.equal(git(root, "config", "core.filemode", "true").status, 0); }
    if (kind === "symlink") { unlinkSync(path); symlinkSync("src/other", path); }
    if (kind === "literal") write(root, "*\n.txt", "correct\n");
    commit(root); approve(root); runs(root);
  }
});

test("retention cannot convert an existing restoration answer or accept an unknown mode", () => {
  const root = ready(); change(root); write(root, "unrelated.txt", "y\n"); commit(root);
  const slug = raise(root, false); assert.equal(cairn(root, "answer", slug, "ok").status, 0); commit(root);
  const p = join(root, `.cairn/escalations/${slug}.md`), original = readFileSync(p, "utf8");
  change(root);
  for (const mode of ["keep", "anything"]) {
    writeFileSync(p, original.replace('Scope: {', `Scope: {"mode":"${mode}",`)); commit(root); blocked(root);
  }
});

test("a check failure after retention remains a failure", () => {
  const root = ready(); runs(root); commit(root); change(root); approve(root);
  write(root, "src/exit", "1\n"); commit(root); runs(root);
  assert.match(cairn(root, "wake").stdout, /^Resolvable: implement R-001/);
});

test("retained paths stay part of the stable checked candidate without extending its footprint", () => {
  for (const timing of ["before", "during"]) {
    const root = ready();
    if (timing === "during") {
      write(root, ".cairn/mechanisms/m", fromFile("R-001", "R-002").replace(/^command:.*$/m,
        `command: node -e "require('fs').writeFileSync('unrelated.txt','unapproved')"`)); commit(root);
    }
    change(root); approve(root);
    assert.equal(git(root, "update-index", "--skip-worktree", "unrelated.txt").status, 0);
    if (timing === "before") write(root, "unrelated.txt", "unapproved");
    const r = cairn(root, "check");
    assert.notEqual(r.status, 0); assert.equal(records(root, "R-001").length, 0, r.stdout);
    assert.match(r.stdout, /candidate|uncommitted|changed/i);
  }
});

test("retention ask needs an explanation and final committed approval", () => {
  const root = ready(); change(root); const slug = raise(root);
  assert.equal(cairn(root, "answer", slug, "ask What am I keeping?").status, 0); commit(root);
  assert.match(cairn(root, "wake").stdout, /^Resolvable: reply/);
  assert.equal(cairn(root, "answer", slug, "Only the committed changes at the listed paths.").status, 0); commit(root);
  assert.match(cairn(root, "wake").stdout, /^Escalate: present/);
  assert.equal(cairn(root, "answer", slug, "ok").status, 0); commit(root); runs(root);
});

test("an unknown scope mode remains invalid even with a matching approval digest", () => {
  const root = ready(); change(root); const slug = approve(root);
  const p = join(root, `.cairn/escalations/${slug}.md`), text = readFileSync(p, "utf8");
  const snapshot = text.match(/^Scope: (.*)$/m)[1].replace('"mode":"keep"', '"mode":"anything"');
  const digest = "sha256:" + createHash("sha256").update(snapshot).digest("hex");
  writeFileSync(p, text.replace(/^Scope: .*$/m, `Scope: ${snapshot}`).replace(/^Scope approved: .*$/m, `Scope approved: ${digest}`));
  commit(root); blocked(root);
});
