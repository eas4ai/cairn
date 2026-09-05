// Execute the guide itself so its commands cannot silently drift from the CLI.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { CLI } from "./helpers.mjs";

test("the linked walkthrough runs from agreement through the next commitment (PKG-016)", (t) => {
  const doc = new URL("../docs/walkthrough.md", import.meta.url);
  assert.ok(readFileSync(new URL("../README.md", import.meta.url), "utf8").includes("docs/walkthrough.md"));
  const blocks = [...readFileSync(doc, "utf8").matchAll(/^```sh\n([\s\S]*?)^```/gm)].map((m) => m[1]);
  const steps = [
    [1, /Resolvable: run APP-001/],
    [1, /recorded .*: fail.*\nResolvable: implement APP-001/],
    [1, /recorded .*: pass.*\nResolvable: review reject-empty-names/],
    [0, /Done: reject-empty-names/],
    [2, /Escalate: present app-002/],
    [0, /answered .cairn\/escalations\/app-002.md/],
    [1, /Resolvable: run APP-002/],
  ];
  assert.equal(blocks.length, steps.length);
  const root = mkdtempSync(join(tmpdir(), "cairn-walkthrough-")), bin = join(root, "tools"), project = join(root, "project");
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(bin); mkdirSync(project);
  const quote = (s) => "'" + s.replaceAll("'", "'\\''") + "'";
  writeFileSync(join(bin, "cairn"), `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(CLI)} "$@"\n`, { mode: 0o755 });
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, GIT_AUTHOR_NAME: "Walkthrough", GIT_COMMITTER_NAME: "Walkthrough", GIT_AUTHOR_EMAIL: "test@example.invalid", GIT_COMMITTER_EMAIL: "test@example.invalid", GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "commit.gpgsign", GIT_CONFIG_VALUE_0: "false" };
  for (const [i, block] of blocks.entries()) {
    const r = spawnSync("sh", ["-e", "-c", block], { cwd: project, env, encoding: "utf8" });
    assert.equal(r.status, steps[i][0], `step ${i + 1}: ${r.stdout}\n${r.stderr}`);
    assert.match(r.stdout, steps[i][1], `step ${i + 1}: ${r.stderr}`);
  }
});
