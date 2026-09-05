import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { repo, cairn, records, commit, git } from "./helpers.mjs";

const mechanism = (command) => `command: ${command}\ninputs:\n  - src/\nrequirements:\n  - R-001\n  - R-002\n`;
const receipt = (root, req) => Object.fromEntries(readFileSync(join(root, ".cairn/evidence", req, records(root, req).at(-1)), "utf8").split("\n").filter((l) => l.includes(": ")).map((l) => [l.slice(0, l.indexOf(": ")), l.slice(l.indexOf(": ") + 2)]));

test("three megabytes are retained exactly once with matching digests (LOOP-041, LOOP-042)", () => {
  const root = repo({ ".cairn/mechanisms/m": mechanism('node -e "process.stdout.write(Buffer.alloc(3000000,97))"') });
  cairn(root, "check");
  const a = receipt(root, "R-001"), b = receipt(root, "R-002"), bytes = readFileSync(join(root, a.output));
  assert.equal(a.result, "pass"); assert.equal(b.result, "pass");
  assert.equal(bytes.length, 3000000); assert.ok(bytes.equals(Buffer.alloc(3000000, 97)));
  assert.equal(a.output, b.output);
  assert.equal(a.output_digest, "sha256:" + createHash("sha256").update(bytes).digest("hex"));
  assert.equal(readdirSync(join(root, ".cairn/evidence/R-001")).filter((n) => n.endsWith(".out")).length, 1);
  assert.equal(readdirSync(join(root, ".cairn/evidence/R-002")).filter((n) => n.endsWith(".out")).length, 0);
});

test("split stdout result lines survive a long non-result line; stderr is never a verdict", () => {
  const source = "process.stdout.write('x'.repeat(2000000)+'\\n'); process.stdout.write('cairn: R-001: pa'); setTimeout(()=>{process.stdout.write('ss\\n'); process.stderr.write('cairn: R-002: pass\\n');},20);";
  const root = repo({ "src/reporter.mjs": source, ".cairn/mechanisms/m": mechanism("node src/reporter.mjs") });
  cairn(root, "check");
  assert.equal(receipt(root, "R-001").result, "pass");
  const r = receipt(root, "R-002"); assert.equal(r.result, "unverified");
  assert.equal(readFileSync(join(root, r.stderr_output), "utf8"), "cairn: R-002: pass\n");
  assert.ok(readFileSync(join(root, r.output), "utf8").includes("cairn: R-002: pass\n"));
});

test("signal termination is recorded and logs survive a clone (LOOP-043)", () => {
  const root = repo({ ".cairn/mechanisms/m": mechanism('exec node -e "process.kill(process.pid,\'SIGTERM\')"') });
  cairn(root, "check");
  const r = receipt(root, "R-001"); assert.equal(r.exit, "signal SIGTERM"); assert.equal(r.result, "fail");
  commit(root, "keep the failing evidence");
  const clone = join(mkdtempSync(join(tmpdir(), "cairn-clone-")), "copy");
  assert.equal(git(root, "clone", "-q", root, clone).status, 0);
  assert.deepEqual(receipt(clone, "R-001"), r);
  assert.deepEqual(readFileSync(join(clone, r.output)), readFileSync(join(root, r.output)));
});

test("working agreements and ignore changes are Cairn records inside the footprint", () => {
  const root = repo({ ".cairn/mechanisms/m": mechanism("node -e 0") });
  writeFileSync(join(root, "AGENTS.md"), "# Agreement\n");
  writeFileSync(join(root, ".gitignore"), ".cairn/in-progress\nnode_modules/\n"); commit(root);
  assert.match(cairn(root, "check").stdout, /recorded /);
});
