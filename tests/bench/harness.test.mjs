// tests/bench/harness.test.mjs -- this file never spawns a real `cairn measure` process and never
// opens a socket. Every test that exercises the scenario loop supplies its own fake spawnImpl
// (an async function standing in for node:child_process's spawnSync), so a rate-limit retry, a
// crash, or a full run can all be proven without the live transport (bin/typesafeai.mjs) ever
// running. buildLedgerProject() itself is real but 100% local (git plus lib/ calls, no network),
// the same project-building function build.test.mjs already exercises.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertBenchEnabled, BenchGuardError, runBenchmark, runScenarios, childEnv, buildMeta } from './harness.mjs';
import { buildLedgerProject } from './build.mjs';
import { appendRecord } from '../../lib/records.mjs';

// A minimal, schema-valid 'measurement' payload (lib/records.mjs SCHEMAS.measurement) a fake
// spawnImpl can append directly to a real project's log, standing in for what a real `cairn
// measure` child process would have written.
function measurementPayload({ outcome, reason, suggested = null }) {
  return {
    intent: 'a'.repeat(40), call: null, draft_digest: 'sha256:' + 'a'.repeat(64), source: 'jev',
    model: outcome === 'composite' ? 'jev-1.13.0' : null,
    levels: outcome === 'composite' ? [{ dimension: 'evidence', level: 1, confidence: 0.9 }] : [],
    composite: outcome === 'composite' ? 0.1 : null, veto: null, suggested, outcome, reason,
  };
}
const RATE_LIMITED = measurementPayload({ outcome: 'unavailable', reason: 'unavailable overloaded' });
const SUCCESS = (suggested) => measurementPayload({ outcome: 'composite', reason: 'composite 0.100 <= 0.35, confidences ok', suggested });

function fakeScenario(id, expect, concern) {
  return { id, expect, category: 'dry', draft: { concerns: [concern], question: 'q', recommendation: 'r', because: 'b', if_wrong: 'w', instead: 'i', options: ['r'], paths: ['p'] } };
}

describe('the CAIRN_BENCH and key guard', () => {
  test('refuses with neither set', () => assert.throws(() => assertBenchEnabled({}), BenchGuardError));
  test('refuses with CAIRN_BENCH=1 but no key', () => assert.throws(() => assertBenchEnabled({ CAIRN_BENCH: '1' }), BenchGuardError));
  test('refuses with a key but CAIRN_BENCH unset or not exactly "1"', () => {
    assert.throws(() => assertBenchEnabled({ TYPESAFEAI_API_KEY: 'k' }), BenchGuardError);
    assert.throws(() => assertBenchEnabled({ CAIRN_BENCH: 'true', TYPESAFEAI_API_KEY: 'k' }), BenchGuardError);
  });
  test('passes with both set', () => assert.doesNotThrow(() => assertBenchEnabled({ CAIRN_BENCH: '1', TYPESAFEAI_API_KEY: 'k' })));
  test('runBenchmark refuses before building anything, spawning anything, or touching the network', async () => {
    // Fix (Minor M2, final-review.md): `built` used to be asserted without anything, real or
    // fake, ever setting it true -- a tautological pass regardless of guard order. buildImpl
    // (harness.mjs, this fix's other half) is the seam that lets this fake actually record
    // whether building was attempted, the same way spawnImpl already does for spawning below.
    let built = false;
    const buildImpl = async () => { built = true; throw new Error('runBenchmark: buildImpl should never run after the guard rejects'); };
    await assert.rejects(runBenchmark({ env: {}, buildImpl }), BenchGuardError);
    assert.equal(built, false);
  });
});

describe('childEnv: the controlled env a spawned cairn measure gets (pure function, no I/O)', () => {
  test('keeps PATH, HOME and TYPESAFEAI_API_KEY, and only those', () => {
    const out = childEnv({ PATH: '/usr/bin:/bin', HOME: '/home/x', TYPESAFEAI_API_KEY: 'k' });
    assert.deepEqual(out, { PATH: '/usr/bin:/bin', HOME: '/home/x', TYPESAFEAI_API_KEY: 'k' });
  });
  test('strips the parent shell harness markers (CLAUDECODE, CODEX_HOME, MUSE_SESSION) and everything else not on the allowlist', () => {
    const out = childEnv({
      PATH: '/usr/bin', HOME: '/home/x', TYPESAFEAI_API_KEY: 'k',
      CLAUDECODE: '1', CODEX_HOME: '/somewhere', MUSE_SESSION: 'abc', SHELL: '/bin/bash', RANDOM_VAR: 'x',
    });
    assert.deepEqual(Object.keys(out).sort(), ['HOME', 'PATH', 'TYPESAFEAI_API_KEY']);
  });
  test('omits PATH or HOME entirely when the parent env lacks them, rather than setting them to undefined', () => {
    const out = childEnv({ TYPESAFEAI_API_KEY: 'k' });
    assert.deepEqual(out, { TYPESAFEAI_API_KEY: 'k' });
    assert.equal('PATH' in out, false);
    assert.equal('HOME' in out, false);
  });
});

describe('buildMeta: the results.json meta shape (pure function, no I/O)', () => {
  test('carries model, agent_ceiling, confidence_floors, weights, a policy digest and the run bounds', () => {
    const settings = {
      typesafeai: {
        model: 'jev-1.13.0', agent_ceiling: 0.35,
        confidence_floors: { evidence: 0, reach: 0, contract: 0, surface: 0, ambiguity: 0 },
        weights: { evidence: 0.2, reach: 0.2, contract: 0.2, surface: 0.2, ambiguity: 0.2 },
        request_cap_bytes: 48000,
      },
      network_exclude: [],
    };
    const meta = buildMeta({ settings, started: 'S', finished: 'F', cairnHead: 'b'.repeat(40), scenarioCount: 24, usableCount: 22, projectDir: '/tmp/x' });
    assert.equal(meta.model, 'jev-1.13.0');
    assert.equal(meta.agent_ceiling, 0.35);
    assert.deepEqual(meta.confidence_floors, settings.typesafeai.confidence_floors);
    assert.deepEqual(meta.weights, settings.typesafeai.weights);
    assert.match(meta.policy_digest, /^sha256:[0-9a-f]{64}$/);
    assert.equal(meta.started, 'S');
    assert.equal(meta.finished, 'F');
    assert.equal(meta.cairn_head, 'b'.repeat(40));
    assert.equal(meta.scenario_count, 24);
    assert.equal(meta.usable_count, 22);
    assert.equal(meta.project_dir, '/tmp/x');
  });
});

describe('runScenarios: the sequential loop and the rate-limit retry (dry: fake spawn, no socket)', () => {
  test('runs every scenario strictly one at a time, in order, and retries a rate-limited scenario once after a 30s wait', async () => {
    const project = await buildLedgerProject();
    const scenarios = [fakeScenario('X1', 'agent', 'EXP-001'), fakeScenario('X2', 'developer', 'EXP-002')];
    const calls = [], sleeps = [];
    let n = 0;
    const spawnImpl = async (cmd, args, opts) => {
      const i = n++;
      calls.push(args[args.indexOf('--concern') + 1]);
      // X1's first attempt comes back rate-limited; every later attempt (X1's retry, then X2) succeeds.
      await appendRecord(opts.cwd, 'measurement', project.slug, i === 0 ? RATE_LIMITED : SUCCESS('agent'));
      return { status: 0, stderr: '' };
    };
    const sleepImpl = async (ms) => { sleeps.push(ms); };
    const rows = await runScenarios(project, scenarios, { CAIRN_BENCH: '1', TYPESAFEAI_API_KEY: 'k' }, { spawnImpl, sleepImpl });

    // Exactly 3 spawns: X1, X1's retry, X2 -- in that order. Concurrent scenarios could not
    // guarantee X1's retry (and its 30s wait) lands before X2's own first attempt ever starts.
    assert.deepEqual(calls, ['EXP-001', 'EXP-001', 'EXP-002']);
    assert.deepEqual(sleeps, [30000]);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].id, 'X1'); assert.equal(rows[0].measurement.outcome, 'composite');
    assert.equal(rows[1].id, 'X2'); assert.equal(rows[1].measurement.outcome, 'composite');
  });

  test('a scenario still rate-limited after its one retry is recorded unavailable, never retried a second time', async () => {
    const project = await buildLedgerProject();
    const scenarios = [fakeScenario('X1', 'agent', 'EXP-001')];
    let n = 0; const sleeps = [];
    const spawnImpl = async (cmd, args, opts) => { n++; await appendRecord(opts.cwd, 'measurement', project.slug, RATE_LIMITED); return { status: 0, stderr: '' }; };
    const sleepImpl = async (ms) => { sleeps.push(ms); };
    const rows = await runScenarios(project, scenarios, { CAIRN_BENCH: '1', TYPESAFEAI_API_KEY: 'k' }, { spawnImpl, sleepImpl });
    assert.equal(n, 2); // one attempt, one retry, never a third
    assert.deepEqual(sleeps, [30000]);
    assert.equal(rows[0].measurement.outcome, 'unavailable');
    assert.equal(rows[0].measurement.reason, 'unavailable overloaded');
  });

  test('a non-rate-limited unavailable outcome (e.g. auth, malformed) is recorded as-is, never retried', async () => {
    const project = await buildLedgerProject();
    const scenarios = [fakeScenario('X1', 'agent', 'EXP-001')];
    let n = 0;
    const spawnImpl = async (cmd, args, opts) => { n++; await appendRecord(opts.cwd, 'measurement', project.slug, measurementPayload({ outcome: 'unavailable', reason: 'unavailable auth' })); return { status: 0, stderr: '' }; };
    const rows = await runScenarios(project, scenarios, { CAIRN_BENCH: '1', TYPESAFEAI_API_KEY: 'k' }, { spawnImpl, sleepImpl: async () => { throw new Error('must not sleep'); } });
    assert.equal(n, 1);
    assert.equal(rows[0].measurement.reason, 'unavailable auth');
  });

  test('a scenario whose child writes no measurement at all is recorded with an error, not thrown, and not retried', async () => {
    const project = await buildLedgerProject();
    const scenarios = [fakeScenario('X1', 'agent', 'EXP-001')];
    let n = 0;
    const spawnImpl = async () => { n++; return { status: 1, stderr: 'boom' }; };
    const rows = await runScenarios(project, scenarios, { CAIRN_BENCH: '1', TYPESAFEAI_API_KEY: 'k' }, { spawnImpl, sleepImpl: async () => { throw new Error('must not sleep'); } });
    assert.equal(n, 1);
    assert.equal(rows[0].measurement, undefined);
    assert.match(rows[0].error, /no measurement record written \(exit 1\): boom/);
  });

  test('passes each spawned command the controlled env, never the caller-supplied harness markers', async () => {
    const project = await buildLedgerProject();
    const scenarios = [fakeScenario('X1', 'agent', 'EXP-001')];
    let seenEnv = null;
    const spawnImpl = async (cmd, args, opts) => { seenEnv = opts.env; await appendRecord(opts.cwd, 'measurement', project.slug, SUCCESS('developer')); return { status: 0, stderr: '' }; };
    await runScenarios(project, scenarios,
      { CAIRN_BENCH: '1', TYPESAFEAI_API_KEY: 'k', PATH: '/bin', HOME: '/home/x', CLAUDECODE: '1', CODEX_HOME: '/y', MUSE_SESSION: 'z' },
      { spawnImpl, sleepImpl: async () => {} });
    assert.deepEqual(Object.keys(seenEnv).sort(), ['HOME', 'PATH', 'TYPESAFEAI_API_KEY']);
  });
});

describe('runBenchmark: guard, build, run, score and write (dry: fake spawn, no socket)', () => {
  test('writes results.json (meta + rows) and results.md under outDir, and returns the same data', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'cairn-bench-test-out-'));
    const scenarios = [fakeScenario('X1', 'agent', 'EXP-001'), fakeScenario('X2', 'developer', 'EXP-002')];
    const spawnImpl = async (cmd, args, opts) => {
      const slug = args[args.indexOf('--commitment') + 1];
      const suggested = args[args.indexOf('--concern') + 1] === 'EXP-001' ? 'agent' : 'developer';
      await appendRecord(opts.cwd, 'measurement', slug, SUCCESS(suggested));
      return { status: 0, stderr: '' };
    };
    const result = await runBenchmark({
      env: { CAIRN_BENCH: '1', TYPESAFEAI_API_KEY: 'k' },
      scenarios, spawnImpl, sleepImpl: async () => { throw new Error('must not sleep'); }, outDir,
    });

    assert.equal(result.rows.length, 2);
    assert.equal(result.scored.overall.total, 2);
    assert.equal(result.scored.overall.correct, 2);
    assert.equal(result.meta.scenario_count, 2);
    assert.equal(result.meta.usable_count, 2);
    assert.match(result.meta.cairn_head, /^[0-9a-f]{40}$/);
    assert.match(result.meta.policy_digest, /^sha256:[0-9a-f]{64}$/);
    assert.ok(result.meta.started <= result.meta.finished);

    const written = JSON.parse(readFileSync(join(outDir, 'results.json'), 'utf8'));
    assert.deepEqual(written.rows.map((r) => r.id), ['X1', 'X2']);
    assert.equal(written.meta.model, 'jev-1.13.0');

    const md = readFileSync(join(outDir, 'results.md'), 'utf8');
    assert.match(md, /Route accuracy/);
    assert.match(md, /2\/2/);
    assert.ok(!/[^\x00-\x7f]/.test(md));
  });
});
