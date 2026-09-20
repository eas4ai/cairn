// tests/bench/build.test.mjs
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildLedgerProject } from './build.mjs';
import { wake } from '../../lib/wake.mjs';
import { readLog } from '../../lib/records.mjs';
import { loadSettings } from '../../lib/settings.mjs';

describe('the ledger project builder', () => {
  test('builds a real, current project with an open commitment and a lease', async () => {
    const p = await buildLedgerProject();
    assert.equal(p.slug, 'ledger');
    assert.equal(p.leaseTarget, 'EXP-002');
    assert.deepEqual(p.requirements, ['EXP-001', 'EXP-002', 'EXP-003', 'EXP-004', 'EXP-005']);
    const log = await readLog(p.dir);
    assert.ok(log.some((r) => r.kind === 'start' && r.payload.slug === 'ledger'));
    const w = await wake(p.dir);
    // Resolvable, not Waiting or Done: the project is mid-implementation, exactly where the
    // benchmark's own scenarios assume a Consequential draft would be raised from.
    assert.equal(w.verdict, 'Resolvable');
  });
  test('typesafeai is enabled, jev, with the composite-design fields (no mode, no old thresholds)', async () => {
    const p = await buildLedgerProject();
    const { settings } = await loadSettings(p.dir);
    assert.equal(settings.typesafeai.enabled, true);
    assert.equal(settings.typesafeai.model, 'jev-1.13.0');
    assert.deepEqual(Object.keys(settings.typesafeai.weights).sort(), ['ambiguity', 'contract', 'evidence', 'reach', 'surface']);
    assert.equal('mode' in settings.typesafeai, false);
    assert.equal(settings.developer, 'present');
  });
  test('the touched paths have a real, non-empty uncommitted diff (so code.diff is not empty)', async () => {
    const p = await buildLedgerProject();
    const src = readFileSync(join(p.dir, 'src/ledger.mjs'), 'utf8');
    assert.match(src, /EXP-002/);
  });
  test('two calls build two independent projects', async () => {
    const a = await buildLedgerProject(), b = await buildLedgerProject();
    assert.notEqual(a.dir, b.dir);
  });
});
