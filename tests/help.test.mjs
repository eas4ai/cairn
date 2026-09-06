import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cairn } from "./helpers.mjs";

test("help works outside a repository without running a command (PKG-017)", (t) => {
  const root = mkdtempSync(join(tmpdir(), "cairn-help-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const expected = cairn(root, "--help");
  assert.equal(expected.status, 0, expected.stderr);
  assert.equal(expected.stderr, "");
  assert.match(expected.stdout, /Usage: cairn/);
  for (const cmd of ["wake", "check", "decide", "escalate", "answer", "backlog", "supersede", "reversals"]) {
    assert.match(expected.stdout, new RegExp(`\\b${cmd}\\b`));
    for (const flag of ["--help", "-h"]) {
      const r = cairn(root, cmd, flag, "--root", join(root, "missing"));
      assert.equal(r.status, 0, r.stderr);
      assert.equal(r.stderr, "");
      assert.equal(r.stdout, expected.stdout);
    }
  }
  assert.equal(cairn(root, "-h").stdout, expected.stdout);
  assert.equal(cairn(root, "--help", "check").stdout, expected.stdout);
  assert.deepEqual(readdirSync(root), [], "help must not create repository records");
});

test("help does not hide invalid options or consume literal arguments", (t) => {
  const root = mkdtempSync(join(tmpdir(), "cairn-help-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const args of [["--unknown"], ["--help", "--unknown"], ["--", "--help"], ["--root"]]) {
    const r = cairn(root, ...args);
    assert.equal(r.status, 3, JSON.stringify(args));
    assert.equal(r.stdout, "");
    assert.match(r.stderr, /cairn:/);
  }
});
