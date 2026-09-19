import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, throwawayRepo, fakeCairn, fingerprint, runHook, RESOLVABLE } from "./helpers/hookenv.mjs";

function env(dir, verdict) {
  const bin = join(dir, "fakebin");
  fakeCairn(bin, { stdout: verdict });
  return { PATH: `${bin}:/usr/bin:/bin`, HOME: join(dir, "home") };
}

test("session-start prints verdict, action, reason and predicate and exits 0", () => {
  const { dir } = throwawayRepo();
  const r = runHook("session-start.sh", { cwd: dir, env: env(dir, RESOLVABLE) });
  assert.equal(r.status, 0);
  assert.ok(r.stdout.includes(RESOLVABLE), r.stdout);
});
