// The plugin: a manifest, a marketplace listing and a hooks file, so one
// install in a harness with a marketplace puts the command, the skills and
// the hooks in place (PKG-037, PKG-038).
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync, readdirSync, mkdtempSync, cpSync, readlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { repo as base, fromFile } from "./helpers.mjs";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const json = (p) => JSON.parse(readFileSync(here(p), "utf8"));
const claude = json("../.claude-plugin/plugin.json"), market = json("../.claude-plugin/marketplace.json"), codex = json("../.codex-plugin/plugin.json"), pkg = json("../package.json"), hooks = json("../hooks/hooks.json");

test("the manifests, the listing and package.json agree on the name and version, and name paths the repository holds (PKG-037)", () => {
  for (const m of [claude, codex, pkg]) { assert.equal(m.name, "cairn"); assert.equal(m.version, pkg.version); assert.ok(m.description, "a description"); }
  assert.equal(market.name, "cairn"); assert.equal(market.plugins.length, 1);
  const listed = market.plugins[0];
  assert.equal(listed.name, "cairn"); assert.equal(listed.source, "./", "the repository root is the plugin"); assert.equal(listed.version, pkg.version);
  assert.equal(codex.skills, "./skills/", "Codex is told where the skills are");
  const skills = readdirSync(here("../skills/"), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  assert.deepEqual(skills.sort(), ["existing-project", "install-cairn", "new-project", "next-iteration"]);
  for (const s of skills) assert.ok(existsSync(here(`../skills/${s}/SKILL.md`)), `${s} is a skill`);
  for (const f of ["hook.mjs", "cairn.mjs", "spec.mjs"]) assert.ok(existsSync(here(`../bin/${f}`)), `bin/${f} ships`);
});

test("the hooks file registers session-start and stop against the plugin's own hook.mjs through the plugin root variable (PKG-038)", () => {
  assert.deepEqual(Object.keys(hooks.hooks).sort(), ["SessionStart", "Stop"]);
  for (const [event, mode] of [["SessionStart", "session-start"], ["Stop", "stop"]]) {
    const entries = hooks.hooks[event];
    assert.equal(entries.length, 1, event); assert.equal(entries[0].hooks.length, 1, event); assert.equal(entries[0].hooks[0].type, "command");
    assert.equal(entries[0].hooks[0].command, `node "\${CLAUDE_PLUGIN_ROOT}/bin/hook.mjs" ${mode}`);
  }
});

// The registered commands, run as a harness runs them, from a plugin root that is a copy of bin/ elsewhere.
test("the registered commands print the verdict at session start, link the command into the plugin, and refuse a stop while wake says Resolvable (PKG-038, PKG-021)", () => {
  const root = base({ ".cairn/mechanisms/m": fromFile("R-001", "R-002") });
  const plugin = mkdtempSync(join(tmpdir(), "cairn-plugin-")); cpSync(here("../bin/"), join(plugin, "bin"), { recursive: true });
  const home = mkdtempSync(join(tmpdir(), "cairn-home-"));
  // node on PATH, cairn not: the hook judges with the link it makes, then with its own kernel (PKG-033).
  const run = (event) => spawnSync("sh", ["-c", hooks.hooks[event][0].hooks[0].command], { cwd: root, encoding: "utf8", input: JSON.stringify({ cwd: root, hook_event_name: event }), env: { ...process.env, PATH: `${dirname(process.execPath)}:/usr/bin:/bin`, HOME: home, CLAUDE_PLUGIN_ROOT: plugin } });
  let r = run("SessionStart");
  assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /cairn: linked /, r.stdout); assert.match(r.stdout, /cairn wake:\nResolvable: run R-001/, r.stdout);
  assert.equal(readlinkSync(join(home, ".local/bin/cairn")), join(plugin, "bin/cairn.mjs"), "the link points into the plugin");
  r = run("Stop");
  assert.equal(r.status, 0, r.stderr); assert.match(JSON.parse(r.stdout).reason, /^Resolvable: run R-001/);
});
