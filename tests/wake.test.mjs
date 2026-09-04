// cairn wake: given only the repository, one next action. Tests spawn the
// CLI against a temp repository so they exercise the shipped contract.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const CLI = new URL("../bin/cairn.mjs", import.meta.url).pathname;

function repo(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), "cairn-"));
  const w = (rel, text) => { mkdirSync(join(root, rel, ".."), { recursive: true }); writeFileSync(join(root, rel), text); };
  w("docs/spec/roadmap.md", "# Roadmap\n\nCurrent: first\n");
  w("docs/commitments/first.md", "# First\n\nSlug: first\nRequirements: R-001, R-002\nInherits: every PKG requirement\n\n## Goal\n");
  mkdirSync(join(root, "docs/decisions"), { recursive: true });
  for (const d of ["escalations", "mechanisms", "evidence", "queue"]) mkdirSync(join(root, ".cairn", d), { recursive: true });
  for (const [rel, text] of Object.entries(overrides)) text === null ? rmSync(join(root, rel), { force: true }) : w(rel, text);
  return root;
}
const wake = (root) => spawnSync("node", [CLI, "wake"], { cwd: root, encoding: "utf8" });
const mech = "command: node --test\ninputs:\n  - src/\nrequirements:\n  - R-001\n  - R-002\n";
const pass = (req) => `requirement: ${req}\nmechanism: t\ninputs_digest: sha256:0\nmechanism_digest: sha256:0\nresult: pass\nrecorded: 2026-09-04T00:00:00Z\n`;

test("step 1: an in-progress record is reconciled before anything else", () => {
  const r = wake(repo({ ".cairn/in-progress": "action: implement\ntarget: R-001\nbase: abc1234\nstarted: 2026-09-04T00:00:00Z\n",
                        ".cairn/escalations/q.md": "Question: x\nStatus: open\n" }));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^Resolve: reconcile implement R-001 at abc1234/);
});

test("step 2: an open escalation is presented and nothing else happens", () => {
  const r = wake(repo({ ".cairn/escalations/q.md": "DECISION (1 of 1)\n\nQuestion: x\nRecommend: y\n",
                        "docs/decisions/d.md": "# D\n\nLevel: Judged\n\n## Realized by\n\n(none yet)\n" }));
  assert.equal(r.status, 2);
  assert.match(r.stdout, /^Escalate: present q/);
});

test("an answered escalation is not open", () => {
  const r = wake(repo({ ".cairn/escalations/q.md": "Question: x\nAnswer: ok\n", ".cairn/mechanisms/t": mech,
                        ".cairn/evidence/R-001/1": pass("R-001"), ".cairn/evidence/R-002/1": pass("R-002") }));
  assert.equal(r.status, 0);
});

test("step 3: a decision with no realized-by is built, first by name", () => {
  const r = wake(repo({ "docs/decisions/b.md": "# B\n\nLevel: Judged\n\n## Realized by\n\n(none yet)\n",
                        "docs/decisions/a.md": "# A\n\nLevel: Judged\n\n## Realized by\n\n- abc1234  did it\n",
                        "docs/decisions/c.md": "# C\n\nLevel: Judged\n\n## Realized by\n" }));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^Resolve: build docs\/decisions\/b\.md/);
});

test("step 4: a requirement with a mechanism and no passing evidence is implemented", () => {
  const r = wake(repo({ ".cairn/mechanisms/t": mech, ".cairn/evidence/R-001/1": pass("R-001"),
                        ".cairn/evidence/R-002/1": pass("R-002").replace("pass", "fail") }));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^Resolve: implement R-002/);
  assert.match(r.stdout, /latest evidence is fail/);
});

test("step 4: a mechanism that has never run is run, not implemented", () => {
  const r = wake(repo({ ".cairn/mechanisms/t": mech }));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^Resolve: run R-001/);
});

test("a superseded decision with no realized-by is not work", () => {
  const r = wake(repo({ "docs/decisions/old.md": "# Old\n\nLevel: Judged\nSuperseded by: new\n\n## Realized by\n", ".cairn/mechanisms/t": mech }));
  assert.match(r.stdout, /^Resolve: run R-001/);
});

test("step 4 before step 5: failing evidence outranks a missing mechanism", () => {
  const m1 = "command: x\ninputs:\n  - a\nrequirements:\n  - R-002\n";
  const r = wake(repo({ ".cairn/mechanisms/t": m1, ".cairn/evidence/R-002/1": pass("R-002").replace("pass", "fail") }));
  assert.match(r.stdout, /^Resolve: implement R-002/);
});

test("step 5: a requirement with no mechanism is declared", () => {
  const r = wake(repo({}));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^Resolve: declare R-001/);
});

test("step 6: every requirement current and passing is Done", () => {
  const r = wake(repo({ ".cairn/mechanisms/t": mech, ".cairn/evidence/R-001/1": pass("R-001"), ".cairn/evidence/R-002/1": pass("R-002") }));
  assert.equal(r.status, 0);
  assert.match(r.stdout, /^Done: first/);
});

test("malformed roadmap is Resolvable, not fatal", () => {
  const r = wake(repo({ "docs/spec/roadmap.md": "# Roadmap\n\nno current line\n" }));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^Resolve: repair docs\/spec\/roadmap\.md/);
});

test("a commitment naming no requirements is Resolvable", () => {
  const r = wake(repo({ "docs/commitments/first.md": "# First\n\nSlug: first\n" }));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^Resolve: repair docs\/commitments\/first\.md/);
});

test("the primary test: two wakes on the same checkout give the same action", () => {
  const root = repo({ "docs/decisions/z.md": "# Z\n\nLevel: Judged\n\n## Realized by\n", ".cairn/mechanisms/t": mech });
  const a = wake(root), b = wake(root);
  assert.equal(a.stdout, b.stdout);
  assert.equal(a.status, b.status);
});

test("outside a cairn repository wake cannot run", () => {
  const root = mkdtempSync(join(tmpdir(), "cairn-none-"));
  const r = wake(root);
  assert.equal(r.status, 3);
});
