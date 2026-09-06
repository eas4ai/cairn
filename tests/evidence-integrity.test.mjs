import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repo, cairn, commit, records, review, passing } from "./helpers.mjs";

const latest = (root) => join(root, ".cairn/evidence/R-001", records(root, "R-001").at(-1));
const field = (text, key) => new RegExp(`^${key}: (.*)$`, "m").exec(text)?.[1];
const setup = () => {
  const root = repo({ ".cairn/mechanisms/m": passing("R-001", "R-002").replace("node -e 0", "node -e \"console.log('checked'); console.error('diagnostic')\"") });
  cairn(root, "check"); review(root); commit(root);
  assert.equal(cairn(root, "wake").status, 0);
  return root;
};

for (const key of ["output", "stderr_output"]) for (const damage of ["delete", "corrupt"]) test(`LOOP-065: ${damage} of ${key} refuses Done and a new run recovers`, () => {
  const root = setup(), receipt = latest(root), text = readFileSync(receipt, "utf8"), path = join(root, field(text, key));
  if (damage === "delete") rmSync(path); else writeFileSync(path, "different bytes\n");
  commit(root, "damaged log");
  const r = cairn(root, "wake");
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /^Resolvable: run R-001/);
  assert.ok(r.stdout.includes(records(root, "R-001").at(-1)), "names the damaged receipt");
  assert.match(r.stdout, /output|stderr/);
  cairn(root, "check");
  assert.equal(cairn(root, "wake").status, 0, "new intact evidence replaces the damaged latest evidence");
  assert.equal(readFileSync(receipt, "utf8"), text, "the older receipt is unchanged");
});

for (const key of ["output", "output_digest", "stderr_output", "stderr_digest"]) test(`LOOP-065: a receipt without ${key} needs a new check`, () => {
  const root = setup(), receipt = latest(root), text = readFileSync(receipt, "utf8");
  writeFileSync(receipt, text.replace(new RegExp(`^${key}: .*\\n`, "m"), "")); commit(root);
  assert.match(cairn(root, "wake").stdout, /^Resolvable: run R-001/);
});

test("LOOP-065: legacy unverifiable output is rerun without rewriting history", () => {
  const root = setup(), receipt = latest(root);
  const old = readFileSync(receipt, "utf8").replace(/^(?:output|stderr_output|stderr_digest): .*\n/gm, "") + 'stderr: "diagnostic\\n"\n';
  writeFileSync(receipt, old); commit(root);
  assert.match(cairn(root, "wake").stdout, /^Resolvable: run R-001/);
  cairn(root, "check"); assert.equal(cairn(root, "wake").status, 0);
  assert.equal(readFileSync(receipt, "utf8"), old);
});
