import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { throwawayRepo } from "./helpers/hookenv.mjs";
import { scanAttribution, release } from "../scripts/release.mjs";

const SETTINGS = { schema: 1, authority_remote: null, outside: [], source: [], interfaces: [], data: [], network_exclude: [], signing_key: null, attribution: "forbidden", developer: "present", harness: {},
  typesafeai: { enabled: false, model: "jev-1.13.0", weights: { evidence: 0.2, reach: 0.2, contract: 0.2, surface: 0.2, ambiguity: 0.2 }, agent_ceiling: 0.35, confidence_floors: { evidence: 0.2, reach: 0.2, contract: 0.2, surface: 0.2, ambiguity: 0.2 }, min_calibration_agent_predictions: 60, request_cap_bytes: 48000 } };

function releasable() {
  const r = throwawayRepo();
  mkdirSync(join(r.dir, ".sudus")); writeFileSync(join(r.dir, ".sudus/settings.json"), JSON.stringify(SETTINGS) + "\n");
  writeFileSync(join(r.dir, "package.json"), '{"name":"x","version":"2.0.0"}\n');
  for (const d of [".claude-plugin", ".codex-plugin", ".muse-plugin"]) { mkdirSync(join(r.dir, d)); writeFileSync(join(r.dir, d, "plugin.json"), '{"version":"2.0.0"}\n'); }
  writeFileSync(join(r.dir, ".claude-plugin/marketplace.json"), '{"plugins":[{"version":"2.0.0"}]}\n');
  writeFileSync(join(r.dir, "CHANGELOG.md"), "## 2.0.1 - 2026-09-19\n\n- a change\n");
  r.git("add", "-A"); r.git("commit", "-q", "-m", "Prepare the release files");
  return r;
}
const tainted = (r, body) => { writeFileSync(join(r.dir, "a.txt"), "a\n"); r.git("add", "a.txt"); r.git("commit", "-q", "-m", `Add a\n\n${body}`); };
const done = { wake: async () => ({ verdict: "Done" }) };

test("scanAttribution finds an attribution trailer and names its commit", () => {
  const r = releasable(); tainted(r, "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>");
  const found = scanAttribution(r.dir, "HEAD~1..HEAD");
  assert.equal(found.length, 1); assert.equal(found[0].sha, r.git("rev-parse", "HEAD").trim()); assert.match(found[0].line, /^Co-Authored-By: Claude/);
});
test("release refuses the range and writes nothing", async () => {
  const r = releasable(); tainted(r, "Claude-Session: https://claude.ai/code/session_x");
  const head = r.git("rev-parse", "HEAD");
  await assert.rejects(release(r.dir, "2.0.1", done), /attribution/);
  assert.equal(r.git("rev-parse", "HEAD"), head); assert.equal(r.git("tag", "-l").trim(), "");
});
test("a clean range releases: one commit, one tag, every version file changed", async () => {
  const r = releasable();
  assert.equal((await release(r.dir, "2.0.1", done)).tag, "v2.0.1");
  assert.equal(r.git("tag", "-l").trim(), "v2.0.1");
  for (const f of ["package.json", ".muse-plugin/plugin.json", ".claude-plugin/marketplace.json"]) assert.ok(r.git("show", `HEAD:${f}`).includes('"version":"2.0.1"'), f);
});
test("release refuses when wake is not Done", async () => {
  const r = releasable();
  await assert.rejects(release(r.dir, "2.0.1", { wake: async () => ({ verdict: "Resolvable", action: "review", target: "x" }) }), /not at Done/);
});
