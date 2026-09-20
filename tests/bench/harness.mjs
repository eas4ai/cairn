// tests/bench/harness.mjs -- the live benchmark harness (plan 18, Task 3). Guarded by
// assertBenchEnabled: nothing here runs -- no project is built, no process is spawned, no network
// call is ever attempted -- unless CAIRN_BENCH=1 and TYPESAFEAI_API_KEY are both present. The key
// itself is read only through spawnSync's env option (bin/typesafeai.mjs reads it from the spawned
// child's own process.env); this module never reads, prints, logs or writes it anywhere.
import { writeFile, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { buildLedgerProject } from './build.mjs';
import { scoreRun, renderResultsMd } from './scoring.mjs';
import { readLog } from '../../lib/records.mjs';
import { loadSettings } from '../../lib/settings.mjs';
import { policyDigest } from '../../lib/evaluate.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..', '..');
const KERNEL = join(REPO_ROOT, 'bin', 'cairn.mjs');
const GIT = '/usr/bin/git'; // Global constraint: /usr/bin/git for every git command this file runs itself.
const SCENARIOS = JSON.parse(await readFile(join(HERE, 'scenarios.json'), 'utf8'));

// Ruling 1: a scenario's measurement can come back 'unavailable' with the transport's own
// rate-limit class. bin/typesafeai.mjs's classify() maps HTTP 429 and 529 to 'overloaded' (after
// its own retries -- MAX_RETRIES=2 -- are exhausted); lib/evaluate.mjs's measure() then records
// that as a measurement with outcome 'unavailable' and reason `unavailable ${e.klass}`, i.e.
// exactly this string.
const RATE_LIMIT_REASON = 'unavailable overloaded';
const RATE_LIMIT_WAIT_MS = 30000;

export class BenchGuardError extends Error {}

export function assertBenchEnabled(env) {
  if (env.CAIRN_BENCH !== '1') throw new BenchGuardError('cairn bench: set CAIRN_BENCH=1 to run the live benchmark (it makes real network calls)');
  if (!env.TYPESAFEAI_API_KEY || typeof env.TYPESAFEAI_API_KEY !== 'string') throw new BenchGuardError('cairn bench: TYPESAFEAI_API_KEY is not set');
}

// Harness-env note: each spawned `cairn measure` gets a controlled env containing only PATH (git
// is spawned by bare name in lib/gitx.mjs, so the child needs PATH to find it), HOME (git may
// consult it, e.g. a global .gitconfig or a safe.directory check) and TYPESAFEAI_API_KEY
// (bin/typesafeai.mjs's post() reads it from the child's own process.env) -- never the parent
// shell's own harness markers (CLAUDECODE, CODEX_HOME, MUSE_SESSION) or anything else, so a run
// proves the autonomous, unattended CLI path rather than inheriting whatever agent shell launched
// it. Exported so this allowlist is directly, independently testable.
export function childEnv(env) {
  const out = {};
  if (env.PATH) out.PATH = env.PATH;
  if (env.HOME) out.HOME = env.HOME;
  out.TYPESAFEAI_API_KEY = env.TYPESAFEAI_API_KEY;
  return out;
}

function draftArgs(slug, sc) {
  const argv = ['--commitment', slug];
  for (const c of sc.draft.concerns) argv.push('--concern', c);
  argv.push('--question', sc.draft.question, '--recommendation', sc.draft.recommendation, '--because', sc.draft.because,
    '--if-wrong', sc.draft.if_wrong, '--instead', sc.draft.instead);
  for (const o of sc.draft.options) argv.push('--option', o);
  for (const p of sc.draft.paths) argv.push('--path', p);
  return argv;
}

function defaultSpawn(cmd, args, opts) { return spawnSync(cmd, args, opts); }
function defaultSleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function isRateLimited(measurement) {
  return !!measurement && measurement.outcome === 'unavailable' && measurement.reason === RATE_LIMIT_REASON;
}

// One attempt at one scenario: spawn `cairn measure` for it and read back whatever measurement
// record landed on the project's log as a result (readLog before/after, same diffing approach the
// brief's own reference implementation uses).
async function measureScenarioOnce(project, sc, env, spawnImpl) {
  const before = (await readLog(project.dir)).length;
  const r = await spawnImpl(process.execPath, [KERNEL, 'measure', ...draftArgs(project.slug, sc)],
    { cwd: project.dir, encoding: 'utf8', env: childEnv(env) });
  const log = await readLog(project.dir);
  const added = log.slice(before);
  const measurement = added.find((x) => x.kind === 'measurement');
  return { r, measurement };
}

// One scenario, with Ruling 1's retry: a rate-limited outcome waits 30s and is retried exactly
// once before being recorded, whatever the retry itself comes back as.
async function measureScenario(project, sc, env, spawnImpl, sleepImpl) {
  let { r, measurement } = await measureScenarioOnce(project, sc, env, spawnImpl);
  if (isRateLimited(measurement?.payload)) {
    await sleepImpl(RATE_LIMIT_WAIT_MS);
    ({ r, measurement } = await measureScenarioOnce(project, sc, env, spawnImpl));
  }
  if (!measurement) return { id: sc.id, expect: sc.expect, category: sc.category, error: `no measurement record written (exit ${r.status}): ${r.stderr}` };
  return { id: sc.id, expect: sc.expect, category: sc.category, measurement: measurement.payload };
}

// Ruling 1: every scenario runs strictly one at a time, never concurrently -- this loop awaits
// each scenario (including its own rate-limit retry and 30s wait) fully before starting the next,
// so two scenarios' calls can never interleave. Exported separately from runBenchmark so the dry
// loop test can prove sequential order and the retry with a fake spawnImpl, without also
// exercising runBenchmark's own results.json/results.md file-writing side effect.
export async function runScenarios(project, scenarios, env, { spawnImpl = defaultSpawn, sleepImpl = defaultSleep } = {}) {
  const rows = [];
  for (const sc of scenarios) rows.push(await measureScenario(project, sc, env, spawnImpl, sleepImpl));
  return rows;
}

function cairnHeadSha() {
  const r = spawnSync(GIT, ['-C', REPO_ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`cairn bench: git rev-parse HEAD failed: ${r.stderr}`);
  return r.stdout.trim();
}

// Ruling 2: results.json's meta -- model, agent_ceiling, confidence_floors, weights, the policy
// digest, started/finished timestamps and the cairn kernel's own HEAD SHA -- so the controller can
// judge a run (which kernel commit produced it, under which policy) before committing it. Pure
// function of its inputs, exported for a direct test independent of any I/O.
export function buildMeta({ settings, started, finished, cairnHead, scenarioCount, usableCount, projectDir }) {
  const t = settings.typesafeai;
  return {
    model: t.model, agent_ceiling: t.agent_ceiling, confidence_floors: t.confidence_floors, weights: t.weights,
    policy_digest: policyDigest(settings), started, finished, cairn_head: cairnHead,
    scenario_count: scenarioCount, usable_count: usableCount, project_dir: projectDir,
  };
}

// scenarios/spawnImpl/sleepImpl/outDir are additional, optional test seams (all default to the
// real 24-scenario set, the real spawnSync, a real 30s sleep, and this file's own directory) --
// runBenchmark({env}) with no other options is exactly the brief's documented call shape and
// writes exactly tests/bench/results.json and tests/bench/results.md.
export async function runBenchmark({ env = process.env, scenarios = SCENARIOS.scenarios, spawnImpl = defaultSpawn, sleepImpl = defaultSleep, outDir = HERE } = {}) {
  assertBenchEnabled(env);
  const started = new Date().toISOString();
  const project = await buildLedgerProject();
  const { settings } = await loadSettings(project.dir);
  const rows = await runScenarios(project, scenarios, env, { spawnImpl, sleepImpl });
  const finished = new Date().toISOString();
  const usable = rows.filter((r) => r.measurement);
  const scored = scoreRun(usable);
  const meta = buildMeta({ settings, started, finished, cairnHead: cairnHeadSha(), scenarioCount: scenarios.length, usableCount: usable.length, projectDir: project.dir });
  await writeFile(join(outDir, 'results.json'), JSON.stringify({ meta, rows }, null, 2) + '\n');
  await writeFile(join(outDir, 'results.md'), renderResultsMd({ meta, rows: usable, scored }));
  return { meta, rows, scored };
}

// `node tests/bench/harness.mjs` (and `npm run bench`) runs the live benchmark directly. Node has
// no `import.meta.main`; this is the same "am I the entry module" check scripts/release.mjs and
// scripts/cutlist.mjs already use (already committed, so already proven correct on this Node
// version).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runBenchmark().then((r) => { console.log(`wrote tests/bench/results.md: ${r.scored.overall.correct}/${r.scored.overall.total}`); })
    .catch((e) => { console.error(e instanceof BenchGuardError ? e.message : (e.stack || e.message)); process.exit(1); });
}
