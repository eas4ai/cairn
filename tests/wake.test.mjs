// cairn wake: given only the repository, one next action, by the
// commitment's precedence. Tests spawn the CLI against real temp repos.
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync, readFileSync, chmodSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { repo, cairn, review, passing, failing, head, commit } from "./helpers.mjs";

const wake = (root) => cairn(root, "wake");

test("step 1: an in-progress record is reconciled before anything else", () => {
  const r = wake(repo({ ".cairn/in-progress": "action: implement\ntarget: R-001\nbase: abc1234\nstarted: 2026-09-04T00:00:00Z\n",
                        ".cairn/escalations/q.md": "Question: x\nStatus: open\n" }));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^Resolvable: reconcile implement R-001 at abc1234/);
});

test("step 2: an open escalation is presented and nothing else happens", () => {
  const r = wake(repo({ ".cairn/escalations/q.md": "DECISION (1 of 1)\n\nQuestion: x\nRecommend: y\n",
                        "docs/decisions/d.md": "# D\n\nLevel: Judged\n\n## Realized by\n\n(none yet)\n" }));
  assert.equal(r.status, 2);
  assert.match(r.stdout, /^Escalate: present q/);
});

test("an answered escalation is not open", () => {
  const root = repo({ ".cairn/escalations/q.md": "Question: x\nAnswer: ok\n", ".cairn/mechanisms/t": passing("R-001", "R-002") });
  cairn(root, "check"); review(root);
  assert.equal(wake(root).status, 0);
});

test("step 3: a decision with no realized-by is built, first by name (DEC-007)", () => {
  const root = repo({ "docs/decisions/b.md": "# B\n\nLevel: Judged\nDecided by: agent\nRests on: R-001\nWould be wrong if: never\n\n## Realized by\n\n(none yet)\n",
                        "docs/decisions/a.md": "# A\n\nLevel: Judged\nDecided by: agent\nRests on: R-001\nWould be wrong if: never\n\n## Realized by\n\n- abc1234  did it\n",
                        "docs/decisions/c.md": "# C\n\nLevel: Judged\nDecided by: agent\nRests on: R-001\nWould be wrong if: never\n\n## Realized by\n" });
  writeFileSync(join(root, "docs/decisions/a.md"), `# A\n\nLevel: Judged\nDecided by: agent\nRests on: R-001\nWould be wrong if: never\n\n## Realized by\n\n- ${head(root)} init\n`);
  const r = wake(root);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^Resolvable: build docs\/decisions\/b\.md/);
});

test("a superseded decision with no realized-by is not work", () => {
  const r = wake(repo({ "docs/decisions/old.md": "# Old\n\nLevel: Judged\nDecided by: agent\nRests on: R-001\nWould be wrong if: never\nSuperseded by: new\n\n## Realized by\n", ".cairn/mechanisms/t": passing("R-001", "R-002") }));
  assert.match(r.stdout, /^Resolvable: run R-001/);
});

test("step 6: a mechanism that has never run is run, not implemented (LOOP-008)", () => {
  const r = wake(repo({ ".cairn/mechanisms/t": passing("R-001", "R-002") }));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^Resolvable: run R-001/);
});

test("step 6: a requirement whose mechanism fails is implemented", () => {
  const root = repo({ ".cairn/mechanisms/m": passing("R-001"), ".cairn/mechanisms/n": failing("R-002") });
  cairn(root, "check");
  const r = wake(root);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^Resolvable: implement R-002/);
  assert.match(r.stdout, /latest evidence is fail/);
});

test("step 6 before step 7: failing evidence outranks a missing mechanism", () => {
  const root = repo({ ".cairn/mechanisms/n": failing("R-002") });
  cairn(root, "check");
  assert.match(wake(root).stdout, /^Resolvable: implement R-002/);
});

test("step 7: a requirement with no mechanism is declared (LOOP-106)", () => {
  const r = wake(repo({}));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^Resolvable: declare R-001/);
});

test("every verdict names who acts: Resolvable is the agent's, Done needs nobody, Escalate waits for the developer (LOOP-004)", () => {
  const root = repo({ ".cairn/mechanisms/t": passing("R-001", "R-002") });
  let r = wake(root); assert.equal(r.status, 1); assert.match(r.stdout, /^Resolvable: run R-001/, "missing evidence is the agent's to resolve, never the developer's");
  cairn(root, "check"); review(root);
  r = wake(root); assert.equal(r.status, 0); assert.match(r.stdout, /^Done: first/);
  cairn(root, "escalate", "--concerns", "R-001", "--question", "q", "--recommend", "x", "--because", "y", "--if-wrong", "z", "--instead", "w");
  r = wake(root); assert.equal(r.status, 2); assert.match(r.stdout, /^Escalate: present r-001/, "only an escalation waits for the developer");
});

test("malformed roadmap is Resolvable, not fatal (LOOP-005)", () => {
  const r = wake(repo({ "docs/spec/roadmap.md": "# Roadmap\n\nno current line\n" }));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^Resolvable: repair docs\/spec\/roadmap\.md/);
});

test("a commitment naming no requirements is Resolvable (LOOP-018)", () => {
  const r = wake(repo({ "docs/commitments/first.md": "# First\n\nSlug: first\n" }));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^Resolvable: repair docs\/commitments\/first\.md/);
});

test("the primary test: two wakes on the same checkout give the same action, before and after a persisted transition (LOOP-001, LOOP-003)", () => {
  const root = repo({ "docs/decisions/z.md": "# Z\n\nLevel: Judged\nDecided by: agent\nRests on: R-001\nWould be wrong if: never\n\n## Realized by\n", ".cairn/mechanisms/t": passing("R-001", "R-002") });
  let a = wake(root), b = wake(root);
  assert.match(a.stdout, /^Resolvable: build docs\/decisions\/z\.md/); assert.equal(a.stdout, b.stdout); assert.equal(a.status, b.status);
  writeFileSync(join(root, "docs/decisions/z.md"), "# Z\n\nLevel: Judged\nDecided by: agent\nRests on: R-001\nWould be wrong if: never\n\n## Realized by\n\n- " + head(root) + " init\n"); commit(root, "built");
  cairn(root, "check");   // a persisted transition: evidence on disk
  a = wake(root); b = wake(root);
  assert.match(a.stdout, /^Resolvable: review first/); assert.equal(a.stdout, b.stdout); assert.equal(a.status, b.status);
});

test("outside a cairn repository wake cannot run", () => {
  const r = wake(mkdtempSync(join(tmpdir(), "cairn-none-")));
  assert.equal(r.status, 3);
});

test("the loop never waits on the review queue (DEC-015)", () => {
  const root = repo({ ".cairn/mechanisms/t": passing("R-001", "R-002"), ".cairn/queue/some-decision": "decision: some-decision\nqueued: 2026-09-04T00:00:00Z\n" });
  cairn(root, "check"); review(root);
  assert.equal(wake(root).status, 0);
});

test("twenty built records cost one git call to resolve, not twenty (DEC-023)", () => {
  const root = repo({ ".cairn/mechanisms/m": passing("R-001", "R-002") });
  for (let i = 0; i < 20; i++) writeFileSync(join(root, `docs/decisions/d${i}.md`), `# D${i}\n\nLevel: Judged\nDecided by: agent\nRests on: R-001\nWould be wrong if: never\n\n## Realized by\n\n- ${head(root)} init\n`);
  commit(root, "twenty built decisions");
  // A git on PATH that logs each invocation, then runs the real one.
  const real = spawnSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).stdout.trim(), bin = mkdtempSync(join(tmpdir(), "cairn-git-")), log = join(bin, "calls");
  writeFileSync(join(bin, "git"), `#!/bin/sh\necho "$@" >> "${log}"\nexec "${real}" "$@"\n`); chmodSync(join(bin, "git"), 0o755);
  const r = spawnSync(process.execPath, [fileURLToPath(new URL("../bin/cairn.mjs", import.meta.url)), "wake"], { cwd: root, encoding: "utf8", env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } });
  assert.match(r.stdout, /^Resolvable: run R-001/, r.stdout + r.stderr);
  const calls = readFileSync(log, "utf8").trim().split("\n");
  assert.equal(calls.filter((c) => /^rev-parse --verify /.test(c)).length, 0, "no per-entry rev-parse: " + calls.join(" | "));
  assert.equal(calls.filter((c) => c === "cat-file --batch-check").length, 1, "one batch call: " + calls.join(" | "));
});
