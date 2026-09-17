// A project that forbids AI attribution: the wake names rewording an
// unpushed commit whose message carries an attribution line (PKG-045).
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { repo as base, cairn, commit, git, passing } from "./helpers.mjs";

const repo = () => base({ ".cairn/mechanisms/m": passing("R-001", "R-002") });
const wake = (root) => cairn(root, "wake").stdout;
const empty = (root, msg) => { git(root, "commit", "-q", "--allow-empty", "-m", msg); return git(root, "rev-parse", "HEAD").stdout.trim(); };

test("with attribution forbidden, an unpushed commit carrying an AI attribution line is named reword before any work; without the policy, or once pushed, it is not (PKG-045)", () => {
  const root = repo();
  const sha = empty(root, "Some work\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>");
  assert.match(wake(root), /^Resolvable: run R-001/, "no policy: nothing named");
  writeFileSync(join(root, ".cairn/policy"), "attribution: forbidden\n"); commit(root, "the policy");
  assert.match(wake(root), new RegExp(`^Resolvable: reword ${sha}\\n`), "the attributed commit is named");
  const remote = mkdtempSync(join(tmpdir(), "cairn-remote-")); git(remote, "init", "-q", "--bare");
  git(root, "remote", "add", "origin", remote); git(root, "push", "-q", "origin", "main");
  assert.match(wake(root), /^Resolvable: run R-001/, "on a remote-tracking branch: not named");
});

test("each attribution form is caught, a prose mention is not, and the oldest attributed commit is named first (PKG-045)", () => {
  const root = repo();
  writeFileSync(join(root, ".cairn/policy"), "attribution: forbidden\n"); commit(root, "the policy");
  empty(root, "Describe the rule: a Co-Authored-By line naming Claude is refused");
  assert.match(wake(root), /^Resolvable: run R-001/, "prose that mentions the trailer is not a trailer");
  for (const line of ["Claude-Session: https://claude.ai/code/session_x", "Generated with [Claude Code](https://claude.com/claude-code)", "Co-authored-by: Codex <codex@openai.com>", "Co-Authored-By: GitHub Copilot <copilot@github.com>"]) {
    const sha = empty(root, `Work\n\n${line}`);
    assert.match(wake(root), new RegExp(`^Resolvable: reword ${sha}\\n`), line);
    git(root, "reset", "-q", "--hard", "HEAD~1");
  }
  const first = empty(root, "One\n\nClaude-Session: a"); empty(root, "Two\n\nClaude-Session: b");
  assert.match(wake(root), new RegExp(`^Resolvable: reword ${first}\\n`), "oldest first");
});
