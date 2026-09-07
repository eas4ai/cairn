import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, readFileSync, unlinkSync, chmodSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { repo, cairn, commit, fromFile, git, records } from "./helpers.mjs";

const ready = () => repo({ ".cairn/mechanisms/m": fromFile("R-001", "R-002") });
const write = (root, path, value) => writeFileSync(join(root, path), value);
const incident = (root) => {
  write(root, "unrelated.txt", "accidental\n"); commit(root, "accidental change");
  write(root, "unrelated.txt", "y\n"); commit(root, "restore accidental change");
};
const raise = (root, scoped = true) => {
  const r = cairn(root, "escalate", ...(scoped ? ["--scope"] : []), "--concerns", "LOOP-035",
    "--question", "Acknowledge this restored incident?", "--recommend", "Acknowledge the recorded restoration.",
    "--because", "Resume the agreed work.", "--if-wrong", "The recorded paths could be incomplete.",
    "--instead", "Correct a missing declaration within the agreement.");
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.match(/escalations\/([^/]+)\.md/)[1];
};
const answer = (root, slug, text = "ok") => {
  const r = cairn(root, "answer", slug, text); assert.equal(r.status, 0, r.stderr);
};
const approve = (root) => { const slug = raise(root); answer(root, slug); commit(root, "acknowledge restored scope history"); return slug; };
const blocked = (root) => {
  const before = records(root, "R-001").length;
  assert.match(cairn(root, "wake").stdout, /^Resolvable: scope /);
  const r = cairn(root, "check"); assert.equal(r.status, 1, r.stderr);
  assert.match(r.stdout, /^Resolvable: scope /);
  assert.equal(records(root, "R-001").length, before, "scope refusal writes no evidence");
};
const runs = (root) => {
  const before = records(root, "R-001").length;
  const r = cairn(root, "check"); assert.match(r.stdout, /recorded .cairn\/evidence\/R-001/, r.stderr);
  assert.equal(records(root, "R-001").length, before + 1);
};

test("empty footprint names declaration before scope and records no evidence (LOOP-081)", () => {
  const root = repo(); write(root, "src/exit", "0\n\n"); commit(root);
  for (const cmd of ["wake", "check"]) {
    const r = cairn(root, cmd); assert.match(r.stdout, /^Resolvable: declare R-001/);
    assert.match(r.stdout, /no .*mechanism/i); assert.equal(records(root, "R-001").length, 0);
  }
  write(root, ".cairn/mechanisms/m", fromFile("R-001", "R-002")); commit(root);
  runs(root);
});

test("first declaration still checks the full earlier history (LOOP-081)", () => {
  const root = repo(); write(root, "src/exit", "0\n\n"); write(root, "unrelated.txt", "outside\n"); commit(root);
  assert.match(cairn(root, "wake").stdout, /^Resolvable: declare R-001/);
  write(root, ".cairn/mechanisms/m", fromFile("R-001", "R-002")); commit(root);
  blocked(root);
});

test("an empty current footprint does not block an explicitly requested existing mechanism (LOOP-081)", () => {
  const root = repo({ ".cairn/mechanisms/other": fromFile("U-001"),
    "docs/spec/other.md": "# Other\n\nStatus: Agreed 2026-09-07\nPrefix: U\n\n[U-001] Other work MUST pass.\nFalsifier: other work fails.\n" });
  write(root, "unrelated.txt", "new commitment work\n"); commit(root);
  const r = cairn(root, "check", "U-001");
  assert.match(r.stdout, /recorded .cairn\/evidence\/U-001/);
  assert.match(r.stdout, /Resolvable: declare R-001/);
  assert.equal(records(root, "R-001").length, 0);
});

test("an inherited mechanism provides a footprint even before local mechanisms exist", () => {
  const root = repo({ ".cairn/mechanisms/other": fromFile("U-001"),
    "docs/spec/other.md": "# Other\n\nStatus: Agreed 2026-09-07\nScope: every commitment\nPrefix: U\n\n[U-001] Other work MUST pass.\nFalsifier: other work fails.\n" });
  write(root, "unrelated.txt", "outside\n"); commit(root);
  blocked(root);
  assert.equal(records(root, "U-001").length, 0);
});

test("scope reports every path, escapes line breaks, and gives identical remedies (LOOP-082)", () => {
  const root = ready();
  const paths = ["a.txt", "z.txt", "newline\nname", "tab\tname"];
  for (const path of paths) write(root, path, "outside\n"); commit(root);
  const wake = cairn(root, "wake"), check = cairn(root, "check");
  assert.equal(check.stdout, wake.stdout);
  assert.match(wake.stdout, /4 unresolved scope paths/);
  for (const path of paths) assert.ok(wake.stdout.includes(JSON.stringify(path)), path);
  assert.ok(!wake.stdout.includes("newline\nname"));
  assert.match(wake.stdout, /--scope/);
});

test("scope verdict reuses the answered-escalation annotation (LOOP-048, LOOP-051, LOOP-083)", () => {
  const root = ready(); incident(root);
  const slug = raise(root, false); answer(root, slug, "instead Correct the declaration after agreement."); commit(root);
  const w = cairn(root, "wake"), c = cairn(root, "check");
  assert.match(w.stdout, /answered loop-035: instead Correct the declaration after agreement\./);
  assert.equal(c.stdout, w.stdout); blocked(root);
});

test("a committed scope acknowledgment lets restored history proceed (LOOP-083)", () => {
  const root = ready(); incident(root); blocked(root);
  const slug = approve(root);
  const text = readFileSync(join(root, `.cairn/escalations/${slug}.md`), "utf8");
  assert.match(text, /Scope: /); assert.match(text, /Scope approved: sha256:/);
  assert.match(text, /future changes/i);
  runs(root);
});

test("scope acknowledgment must be committed before it can clear a breach", () => {
  const root = ready(); incident(root);
  const slug = raise(root); answer(root, slug); blocked(root);
  commit(root); runs(root);
});

test("ordinary ok does not acknowledge scope history", () => {
  const root = ready(); incident(root);
  const slug = raise(root, false); answer(root, slug); commit(root); blocked(root);
});

test("scope escalation refuses unrestored paths and names the restoration remedy", () => {
  const root = ready(); write(root, "unrelated.txt", "outside\n"); commit(root);
  const r = cairn(root, "escalate", "--scope", "--concerns", "LOOP-035", "--question", "q", "--recommend", "r", "--because", "b", "--if-wrong", "w", "--instead", "i");
  assert.equal(r.status, 3); assert.match(r.stderr, /restore.*commit/i); blocked(root);
});

test("an invalid scope request still records an explicitly Blocking decision", () => {
  const root = ready(); write(root, "unrelated.txt", "outside\n"); commit(root);
  const r = cairn(root, "escalate", "--scope", "--level", "Blocking", "--concerns", "LOOP-035", "--question", "q", "--recommend", "r", "--because", "b", "--if-wrong", "w", "--instead", "i");
  assert.equal(r.status, 0, r.stderr);
  assert.match(readFileSync(join(root, ".cairn/escalations/loop-035.md"), "utf8"), /Malformed: scope/);
  assert.match(cairn(root, "wake").stdout, /^Escalate: present loop-035/);
});

test("ask and explanation stay open; only the final committed ok acknowledges scope", () => {
  const root = ready(); incident(root); const slug = raise(root);
  answer(root, slug, "ask Which history is covered?"); commit(root);
  assert.match(cairn(root, "wake").stdout, /^Resolvable: reply /);
  assert.doesNotMatch(cairn(root, "check").stdout, /^recorded \.cairn\/evidence\//m);
  answer(root, slug, "Only the restored paths through the recorded commit."); commit(root);
  assert.match(cairn(root, "wake").stdout, /^Escalate: present /);
  answer(root, slug); commit(root); runs(root);
});

test("instead is visible but does not silently authorize a scope exception", () => {
  const root = ready(); incident(root); const slug = raise(root);
  answer(root, slug, "instead Reconsider the declaration."); commit(root);
  assert.match(cairn(root, "wake").stdout, /answered loop-035: instead Reconsider/);
  blocked(root);
});

test("later changes to an acknowledged path still block, including later reverts", () => {
  const root = ready(); incident(root); approve(root); runs(root);
  write(root, "unrelated.txt", "another incident\n"); commit(root); blocked(root);
  write(root, "unrelated.txt", "y\n"); commit(root); blocked(root);
  approve(root); runs(root);
});

test("approval cannot hide another path changed after the snapshot", () => {
  const root = ready(); incident(root); const slug = raise(root);
  write(root, "other-breach", "x\n"); commit(root);
  answer(root, slug); commit(root); blocked(root);
  assert.match(cairn(root, "wake").stdout, /other-breach/);
});

test("acknowledged history remains conditional on the paths staying restored", () => {
  const root = ready(); incident(root); approve(root); runs(root);
  commit(root, "record evidence");
  assert.equal(git(root, "checkout", "-q", "-b", "side").status, 0);
  write(root, "unrelated.txt", "imported content\n"); commit(root);
  assert.equal(git(root, "checkout", "-q", "main").status, 0);
  const merge = git(root, "merge", "--no-ff", "side", "-m", "import side"); assert.equal(merge.status, 0, merge.stderr);
  // The merge is not a new own-commit breach, but the old incident is no
  // longer restored. Its acknowledgment must not hide that retained content.
  blocked(root);
});

test("editing the scope snapshot after answer invalidates its acknowledgment", () => {
  const root = ready(); incident(root); const slug = approve(root);
  const p = join(root, `.cairn/escalations/${slug}.md`), text = readFileSync(p, "utf8");
  writeFileSync(p, text.replace('"unrelated.txt"', '"src/exit"')); commit(root); blocked(root);
});

test("malformed scope metadata cannot suppress a breach", () => {
  const root = ready(); incident(root); const slug = approve(root);
  const p = join(root, `.cairn/escalations/${slug}.md`), text = readFileSync(p, "utf8");
  const snapshot = JSON.parse(text.match(/^Scope: (.*)$/m)[1]);
  const bad = [null, [], {}, { ...snapshot, began: [snapshot.began] }, { ...snapshot, through: [snapshot.through] },
    { ...snapshot, paths: ["../unrelated.txt"] }, { ...snapshot, paths: [null] }, { ...snapshot, paths: [] }];
  for (const shape of [...bad.map((s) => JSON.stringify(s)), "not JSON"]) {
    const digest = "sha256:" + createHash("sha256").update(shape).digest("hex");
    writeFileSync(p, text.replace(/^Scope: .*$/m, `Scope: ${shape}`).replace(/^Scope approved: .*$/m, `Scope approved: ${digest}`));
    commit(root); blocked(root);
  }
});

test("damaged acknowledgment fields cannot suppress a breach", () => {
  const root = ready(); incident(root); const slug = approve(root);
  const p = join(root, `.cairn/escalations/${slug}.md`), text = readFileSync(p, "utf8");
  for (const replacement of [text.replace(/^Answered: .*$/m, "Answered: broken"),
    text.replace(/^Concerns: .*$/m, "Concerns: R-001"), text + "Malformed: question\n"]) {
    writeFileSync(p, replacement); commit(root); blocked(root);
  }
});

test("scope path matching is literal, including wildcard filenames and control characters", () => {
  const root = ready();
  for (const p of ["*.txt", "line\nname", "paragraph\u2028name"]) write(root, p, "x\n"); commit(root);
  for (const p of ["*.txt", "line\nname", "paragraph\u2028name"]) unlinkSync(join(root, p)); commit(root);
  approve(root); runs(root);
  write(root, "unrelated.txt", "outside\n"); commit(root); blocked(root);
});

test("scope acknowledgment does not carry into another activation of the same slug", () => {
  const root = ready(); incident(root); approve(root);
  write(root, "docs/commitments/second.md", "# Second\n\nRequirements: R-001, R-002\n");
  write(root, "docs/spec/roadmap.md", "# Roadmap\n\nCurrent: second\n"); commit(root);
  write(root, "docs/spec/roadmap.md", "# Roadmap\n\nCurrent: first\n"); commit(root);
  incident(root); blocked(root);
});

test("restoration checks additions, deletions, executable modes, and symlink kinds", () => {
  for (const kind of ["addition", "deletion", "mode", "symlink"]) {
    const root = ready(), path = join(root, "unrelated.txt");
    if (kind === "addition") write(root, "added.txt", "outside\n");
    if (kind === "deletion") unlinkSync(path);
    if (kind === "mode") { chmodSync(path, 0o755); assert.equal(git(root, "config", "core.filemode", "true").status, 0); }
    if (kind === "symlink") { unlinkSync(path); symlinkSync("src/other", path); }
    commit(root);
    if (kind === "addition") unlinkSync(join(root, "added.txt"));
    if (kind === "deletion") write(root, "unrelated.txt", "y\n");
    if (kind === "mode") chmodSync(path, 0o644);
    if (kind === "symlink") { unlinkSync(path); write(root, "unrelated.txt", "y\n"); }
    commit(root); approve(root); runs(root);
  }
});
