// tests/bench/build.mjs
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { init } from '../../lib/init.mjs';
import { loadSettings } from '../../lib/settings.mjs';
import { declare } from '../../lib/mechanisms.mjs';
import { authorize } from '../../lib/auth.mjs';
import { start } from '../../lib/commitment.mjs';
import { begin } from '../../lib/lease.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCENARIOS = JSON.parse(readFileSync(join(HERE, 'scenarios.json'), 'utf8'));
const SLUG = 'ledger';
const LEASE_TARGET = 'EXP-002';
const GIT = '/usr/bin/git';

function sh(cwd, args) {
  const r = spawnSync(GIT, args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout;
}
function write(dir, p, text) { const full = join(dir, p); mkdirSync(dirname(full), { recursive: true }); writeFileSync(full, text); }
function domainFile(reqs) {
  return `Prefix: EXP\n\n${Object.keys(reqs).sort().map((id) =>
    `[${id}] ${reqs[id].text}\nFalsifier: ${reqs[id].falsifier}\nMechanism: ${SCENARIOS.project.mechanism.name}\nStatus: Agreed 2026-09-19`).join('\n\n')}\n`;
}

export async function buildLedgerProject({ dir } = {}) {
  const project = SCENARIOS.project;
  const cwd = dir ?? mkdtempSync(join(tmpdir(), 'cairn-bench-'));
  sh(cwd, ['init', '-q', '-b', 'main']);
  sh(cwd, ['config', 'user.email', 'bench@example.invalid']);
  sh(cwd, ['config', 'user.name', 'Cairn Bench']);
  sh(cwd, ['config', 'commit.gpgsign', 'false']);

  const dims = { evidence: 0.2, reach: 0.2, contract: 0.2, surface: 0.2, ambiguity: 0.2 };
  const settings = {
    schema: 1, authority_remote: null, outside: ['README.md'], source: ['src/**'], interfaces: [], data: [],
    network_exclude: [], signing_key: null, attribution: 'forbidden', developer: 'present', harness: {},
    typesafeai: { enabled: true, model: 'jev-1.13.0', weights: dims, agent_ceiling: 0.35, confidence_floors: { evidence: 0, reach: 0, contract: 0, surface: 0, ambiguity: 0 },
      min_calibration_agent_predictions: 60, request_cap_bytes: 48000 },
  };
  write(cwd, '.cairn/settings.json', JSON.stringify(settings, null, 2) + '\n');
  write(cwd, 'docs/spec/overview.md', `# Ledger\n\n${project.description}\n\n| File | Prefix |\n|---|---|\n| ledger.md | EXP |\n`);
  write(cwd, 'docs/spec/glossary.md', '# Glossary\n\n- ledger: this CLI.\n- category: a free-text label on an expense row.\n');
  write(cwd, 'docs/spec/roadmap.md', `Current: ${SLUG}\n\n## ${SLUG}\n\nRequirements: ${Object.keys(project.requirements).sort().join(' ')}\n\nDelivers the ledger CLI for a two-person bookkeeping shop.\n`);
  write(cwd, 'docs/spec/ledger.md', domainFile(project.requirements));
  write(cwd, 'AGENTS.md', '# Working agreement\n\nThis is a benchmark fixture project. Run cairn wake.\n');
  write(cwd, 'README.md', `# ledger\n\n${project.description}\n`);
  for (const [p, text] of Object.entries(project.files)) write(cwd, p, text);
  sh(cwd, ['add', '-A']); sh(cwd, ['commit', '-q', '-m', 'Prepare the ledger project']);

  // Settings are already on disk (written just above), so this adopts them: --adopt <digest> is
  // the flag that matters (lib/init.mjs's own comment on init()).
  await init(cwd, { adopt: (await loadSettings(cwd)).digest, quote: 'ok', env: {} });

  const inputs = project.mechanism.inputs.map((p) => p.replace(/\/$/, ''));   // trailing '/' is an empty path component (lib/paths.mjs)
  await declare(cwd, project.mechanism.name, { command: project.mechanism.command, cwd: null, inputs, documents: [], requirements: project.mechanism.requirements, results: 'per-requirement' });
  sh(cwd, ['add', '-A']); sh(cwd, ['commit', '-q', '-m', `Declare the ${project.mechanism.name} mechanism`]);

  await authorize(cwd, { quote: 'ok', env: {} });
  const startSha = await start(cwd, SLUG);
  const leaseSha = await begin(cwd, { action: 'implement', target: LEASE_TARGET, touch: ['src/ledger.mjs', 'tests/ledger.test.mjs'], env: { ...process.env, CAIRN_SESSION: 'bench' } });

  // A small, real, uncommitted edit on both touched paths, so the measurement's code.diff is not
  // empty -- the same edit the reference benchmark used (.superpowers/bench/build-project.mjs).
  const src = readFileSync(join(cwd, 'src/ledger.mjs'), 'utf8');
  const editedSrc = src.replace('export function totals(rows, since)', '// EXP-002: cents are summed as integers here, never as floating-point dollars.\nexport function totals(rows, since)');
  if (editedSrc === src) throw new Error('bench: edit anchor not found in src/ledger.mjs');
  writeFileSync(join(cwd, 'src/ledger.mjs'), editedSrc);
  const testSrc = readFileSync(join(cwd, 'tests/ledger.test.mjs'), 'utf8');
  writeFileSync(join(cwd, 'tests/ledger.test.mjs'), testSrc + `\ntest('sums a second category separately', () => { const rows = parse('date,category,amount,note\\n2026-01-01,Fees,1.00,a'); assert.deepEqual(totals(rows), [['Fees', 100]]); });\n`);

  return { dir: cwd, slug: SLUG, leaseTarget: LEASE_TARGET, startSha, leaseSha, requirements: Object.keys(project.requirements).sort() };
}
