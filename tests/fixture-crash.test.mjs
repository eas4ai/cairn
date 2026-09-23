// tests/fixture-crash.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildProject, KERNEL, MECH_DEFINITION } from "./helpers/fixture.mjs";
import { recover, pendingTransaction } from "../lib/tx.mjs";
import { readRef } from "../lib/gitx.mjs";
import { wake } from "../lib/wake.mjs";

function fakeGit(dir, { killRef, killAt }) {
  const bin = join(dir, "fakebin"); mkdirSync(bin, { recursive: true });
  const counter = join(dir, "fakebin", "count");
  writeFileSync(counter, "0");
  writeFileSync(join(bin, "git"), `#!/bin/sh
if [ "$1" = "update-ref" ] && [ "$2" = "${killRef}" ]; then
  n=$(cat "${counter}"); n=$((n+1)); printf '%s' "$n" > "${counter}"
  if [ "$n" -eq ${killAt} ]; then kill -9 $PPID; sleep 5; exit 1; fi
fi
exec /usr/bin/git "$@"
`);
  chmodSync(join(bin, "git"), 0o755);
  return `${bin}:${process.env.PATH}`;
}

async function prepared() {
  const p = buildProject();
  // Run the tail up to the authorization but not the start.
  // Deviation from the plan text, recorded in the report: declare takes one --file JSON
  // definition (lib/cli.mjs), not the plan's --command/--input/--requirement/--results/--identity
  // flags; see tests/helpers/fixture.mjs's MECH_DEFINITION.
  await p.developer.init();
  p.write("docs/spec/add.md", readFileSync(join(p.dir, "docs/spec/add.md"), "utf8").replaceAll("Status: Draft", "Status: Agreed 2026-09-19"));
  p.commit("Agree");
  p.sudus(["declare", "tests", "--file", p.outFile("mech-tests.json", MECH_DEFINITION)]);
  p.commit("Declare");
  p.write("AGENTS.md", "# Working agreement\n"); p.commit("Agreement");
  await p.developer.authorize();
  return p;
}

for (const [name, cfg, expectForward] of [
  ["A: killed at the start record after the snapshot ref advanced", { killRef: "refs/sudus/log", killAt: 2 }, true],
  ["B: killed at the snapshot ref right after the intent", { killRef: "refs/sudus/snapshots", killAt: 1 }, false],
]) {
  test(`crash ${name}: recover completes and wake resumes`, async () => {
    const p = await prepared();
    const PATH = fakeGit(p.dir, cfg);
    const r = spawnSync(process.execPath, [KERNEL, "start", "fixture"], { cwd: p.dir, encoding: "utf8", env: { ...process.env, PATH } });
    assert.equal(r.signal, "SIGKILL", `expected a kill, got exit ${r.status}: ${r.stderr}`);
    // Deviation from the plan text: lib/tx.mjs's pendingTransaction(cwd, log) is async and
    // returns the pending command-intent record itself, whose own `target` field names the
    // transaction id (the 'command-intent' schema has no `payload.transaction` field, the plan's
    // own guess); recover(cwd, tx) takes that id as its second argument.
    const intent = await pendingTransaction(p.dir, await p.readLog());
    assert.ok(intent, "an intent record exists");
    const w = await wake(p.dir);
    assert.equal(w.exit, 3);
    // Kernel fix round (plan 14 fixture, defect 1): this used to assert the defect directly (same
    // root cause as tests/fixture.test.mjs's isolated "wake demands a nonsensical push" test,
    // recorded in the plan 14 report) -- the crash always happens during `sudus start`, before its
    // terminal 'start' record lands, so the roadmap's Current: line still names a commitment with
    // no matching start record, and lib/travel.mjs's validateAfterFetch (called unconditionally
    // inside wake() on every ordinary call) read that as a dangling reference and masked the real
    // "sudus recover <tx>" guidance behind a nonsensical "sudus push" line. Fixed two ways: wake()
    // no longer calls validateAfterFetch on its ordinary path, and validateAfterFetch itself no
    // longer reads a Current: line with no start record anywhere in the log (the ordinary
    // spec-phase state) as dangling. wake() now correctly names the pending recovery.
    assert.equal(w.line, `sudus recover ${intent.target}`);
    const out = await recover(p.dir, intent.target);
    const kinds = (await p.kinds());
    if (expectForward) {
      assert.equal(out.completed, "forward");
      assert.deepEqual(kinds.slice(-2), ["command-intent", "start"]);
      await p.wakeIs("Resolvable", "run", "REQ-001");
      assert.ok(await readRef(p.dir, "refs/sudus/snapshots"));
    } else {
      assert.ok(["forward", "abort"].includes(out.completed));
      assert.deepEqual(kinds.slice(-2), out.completed === "forward" ? ["command-intent", "start"] : ["command-intent", "command-abort"]);
      if (out.completed === "abort") {
        const w2 = await wake(p.dir);
        assert.equal(w2.exit, 3); assert.match(w2.line, /start fixture/);
        p.sudus(["start", "fixture"]);
        await p.wakeIs("Resolvable", "run", "REQ-001");
      }
    }
    // Recovery is idempotent: a second call reports the same outcome and appends nothing.
    const settled = await p.kinds();
    const again = await recover(p.dir, intent.target);
    assert.equal(again.completed, out.completed);
    assert.deepEqual(await p.kinds(), settled);
  });
}
