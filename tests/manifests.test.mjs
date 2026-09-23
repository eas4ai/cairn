import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./helpers/hookenv.mjs";

const read = (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));
const MANIFESTS = [".claude-plugin/plugin.json", ".claude-plugin/marketplace.json", ".codex-plugin/plugin.json", ".muse-plugin/plugin.json"];
const SKILLS = ["install-sudus", "new-project", "existing-project", "next-feature"];

test("every manifest carries package.json's version exactly once", () => {
  const v = read("package.json").version;
  for (const m of MANIFESTS) {
    const text = readFileSync(join(ROOT, m), "utf8");
    assert.equal((text.match(/"version"\s*:\s*"[^"]+"/g) ?? []).length, 1, m);
    assert.ok(new RegExp(`"version"\\s*:\\s*"${v}"`).test(text), `${m} lacks ${v}`);
  }
});
test("Claude Code registers session-start, turn and stop", () => {
  const h = read("hooks/hooks.json").hooks;
  assert.ok(h.SessionStart[0].hooks[0].command.endsWith('/hooks/session-start.sh"'));
  assert.ok(h.UserPromptSubmit[0].hooks[0].command.endsWith('/hooks/turn.sh"'));
  assert.ok(h.Stop[0].hooks[0].command.endsWith('/hooks/stop.sh"'));
});
test("Muse registers the hooks it supports and lists the four skills", () => {
  const m = read(".muse-plugin/plugin.json");
  assert.deepEqual(m.capabilities.hooks.map((x) => x.event).sort(), ["SessionStart", "Stop"]);
  for (const x of m.capabilities.hooks) assert.equal(x.command[0], "sh");
  assert.deepEqual(m.capabilities.skills.map((s) => s.id), SKILLS);
});
test("Codex lists the skills directory and the four skills exist", () => {
  assert.equal(read(".codex-plugin/plugin.json").skills, "./skills/");
  for (const s of SKILLS) assert.ok(existsSync(join(ROOT, "skills", s, "SKILL.md")), s);
});
test("no manifest, hook file or skill names next-iteration", () => {
  for (const p of [...MANIFESTS, "hooks/hooks.json", ...SKILLS.map((s) => `skills/${s}/SKILL.md`)]) {
    if (existsSync(join(ROOT, p))) assert.ok(!readFileSync(join(ROOT, p), "utf8").includes("next-iteration"), p);
  }
});
test("docs/plans is not shipped", () => {
  const files = read("package.json").files;
  assert.ok(Array.isArray(files) && !files.some((f) => f.startsWith("docs/plans")));
  for (const f of ["bin/", "lib/", "hooks/", "skills/"]) assert.ok(files.includes(f), f);
});
