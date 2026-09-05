import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { repo, cairn, commit, records, review, passing, git } from "./helpers.mjs";

const text = (root, path) => readFileSync(resolve(root, path), "utf8");
const edit = (root, path, change) => writeFileSync(resolve(root, path), change(text(root, path)));
const receipt = (root, req = "R-001") => join(root, ".cairn/evidence", req, records(root, req).at(-1));
const setup = () => {
  const root = repo({ ".cairn/mechanisms/m": passing("R-001"), ".cairn/mechanisms/n": passing("R-002") });
  cairn(root, "check"); review(root); commit(root, "review original requirements");
  assert.equal(cairn(root, "wake").status, 0);
  return root;
};
const acknowledge = (root) => {
  const r = cairn(root, "wake");
  const entry = /R-001 sha256:[a-f0-9]{64}/.exec(r.stdout)?.[0];
  assert.ok(entry, r.stdout);
  edit(root, ".cairn/mechanisms/m", (s) => s + `reviewed:\n  - ${entry}\n`);
  commit(root, "record mechanism review for revised requirement");
};

test("changed requirement blocks unchecked reruns and makes the completion review stale (LOOP-058, LOOP-059)", () => {
  const root = setup(), old = readFileSync(receipt(root), "utf8");
  edit(root, "docs/spec/test.md", (s) => s.replace("The thing MUST work.", "The thing MUST also work offline."));
  commit(root, "revise requirement");
  assert.match(cairn(root, "wake").stdout, /^Resolvable: review mechanism R-001/);
  assert.match(cairn(root, "check", "R-001").stdout, /review mechanism R-001/);
  assert.equal(records(root, "R-001").length, 1, "no new receipt before mechanism review");
  assert.equal(readFileSync(receipt(root), "utf8"), old, "the old receipt survives");
  acknowledge(root);
  assert.match(cairn(root, "wake").stdout, /^Resolvable: run R-001/);
  assert.match(cairn(root, "check", "R-001").stdout, /Resolvable: review first/);
  assert.equal(records(root, "R-002").length, 1, "the neighboring requirement stays current");
  review(root);
  assert.equal(cairn(root, "wake").status, 0);
});

test("falsifier changes need review; separate rationale and other requirements do not change a receipt", () => {
  const root = setup();
  edit(root, "docs/spec/test.md", (s) => s + "\nA separate explanation for the developer.\n"); commit(root);
  assert.equal(cairn(root, "wake").status, 0);
  edit(root, "docs/spec/test.md", (s) => s.replace("Falsifier: it does not.", "Falsifier: it does not work offline.")); commit(root);
  assert.match(cairn(root, "wake").stdout, /^Resolvable: review mechanism R-001/);
  assert.match(cairn(root, "check", "R-002").stdout, /recorded .*R-002/);
  assert.equal(records(root, "R-001").length, 1);
});

test("legacy receipts recover requirement identity from their commit; unavailable history requires review", () => {
  const root = setup(), path = receipt(root);
  edit(root, path, (s) => s.replace(/^requirement_digest:.*\n/m, ""));
  assert.equal(cairn(root, "wake").status, 0, "unchanged old receipt remains usable");
  edit(root, "docs/spec/test.md", (s) => s.replace("The thing MUST work.", "The thing MUST work offline.")); commit(root);
  assert.match(cairn(root, "wake").stdout, /^Resolvable: review mechanism R-001/);
  edit(root, path, (s) => s.replace(/^commit:.*$/m, "commit: deadbeef"));
  assert.match(cairn(root, "wake").stdout, /^Resolvable: review mechanism R-001/);
});

test("check refuses uncommitted requirement text and mechanism review markers", () => {
  const root = setup();
  edit(root, "docs/spec/test.md", (s) => s.replace("The thing MUST work.", "The thing MUST work offline."));
  assert.match(cairn(root, "check").stdout, /uncommitted changes:.*docs\/spec\/test.md/);
  commit(root); acknowledge(root);
  edit(root, ".cairn/mechanisms/m", (s) => s + "\n");
  assert.match(cairn(root, "check").stdout, /uncommitted changes:.*\.cairn\/mechanisms\/m/);
  assert.equal(records(root, "R-001").length, 1);
});

test("tightened response limit cannot reuse the old passing check", () => {
  const spec = (n) => `# Response\n\nStatus: Agreed\nPrefix: R\n\n[R-001] The service MUST respond within ${n} milliseconds.\nFalsifier: A response takes more than ${n} milliseconds.\n\n[R-002] The service MUST exist.\nFalsifier: It does not.\n`;
  const check = (n) => `import { readFileSync } from 'node:fs';\nprocess.exit(Number(readFileSync('src/elapsed')) <= ${n} ? 0 : 1);\n`;
  const root = repo({ "docs/spec/test.md": spec(500), "src/elapsed": "200", "src/check.mjs": check(500),
    ".cairn/mechanisms/m": "command: node src/check.mjs\ninputs:\n  - src/\nrequirements:\n  - R-001\n",
    ".cairn/mechanisms/n": passing("R-002") });
  cairn(root, "check"); review(root); commit(root);
  writeFileSync(join(root, "docs/spec/test.md"), spec(100)); commit(root);
  assert.match(cairn(root, "check").stdout, /review mechanism R-001/);
  writeFileSync(join(root, "src/check.mjs"), check(100)); acknowledge(root);
  assert.match(cairn(root, "check").stdout, /Resolvable: implement R-001/);
  writeFileSync(join(root, "src/elapsed"), "50"); commit(root); cairn(root, "check"); review(root);
  assert.equal(cairn(root, "wake").status, 0);
});

test("a declared input over 1 MiB agrees at a commit and in the tree (LOOP-060)", () => {
  const root = repo({ ".cairn/mechanisms/m": "command: node -e 0\ninputs:\n  - src/big\nrequirements:\n  - R-001\n  - R-002\n" });
  writeFileSync(join(root, "src/big"), Buffer.alloc(1_200_000, 0x61)); commit(root, "big");
  cairn(root, "check"); review(root);
  const r = cairn(root, "wake");
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /^Done: first/);
  writeFileSync(join(root, "src/big"), Buffer.alloc(1_200_000, 0x62)); commit(root, "change");
  assert.match(cairn(root, "wake").stdout, /^Resolvable: run R-001/);
});

test("a failed Git blob read cannot be hashed as an empty blob", () => {
  const root = repo({ "src/empty": "", ".cairn/mechanisms/m": "command: node -e 0\ninputs:\n  - src/empty\nrequirements:\n  - R-001\n  - R-002\n" });
  cairn(root, "check"); review(root);
  assert.equal(cairn(root, "wake").status, 0);
  const id = git(root, "rev-parse", "HEAD:src/empty").stdout.trim();
  rmSync(join(root, ".git/objects", id.slice(0, 2), id.slice(2)));
  assert.match(cairn(root, "wake").stdout, /^Resolvable: review first/);
});

test("Git listings over 1 MiB include the last declared input", (t) => {
  const root = repo({ ".cairn/mechanisms/m": "command: node -e 0\ninputs:\n  - src/many/\nrequirements:\n  - R-001\n  - R-002\n" });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "src/many"));
  let last;
  for (let i = 0; i < 4800; i++) {
    last = join(root, "src/many", String(i).padStart(4, "0") + "x".repeat(230));
    writeFileSync(last, "original");
  }
  commit(root, "declare a large set of paths");
  assert.match(cairn(root, "check").stdout, /recorded .*R-001/);
  writeFileSync(last, "changed"); commit(root);
  assert.match(cairn(root, "wake").stdout, /^Resolvable: run R-001/);
});

test("requirement identity excludes fenced examples and status dates", () => {
  const root = setup();
  edit(root, "docs/spec/test.md", (s) => s.replace("Agreed 2026-09-04", "Agreed 2026-09-05") + "\n```md\n[R-001] An example, not another definition.\n```\n");
  commit(root);
  assert.equal(cairn(root, "wake").status, 0);
});
