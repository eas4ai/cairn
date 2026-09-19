import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSettings, SETTINGS_SCHEMA, overlaps } from '../lib/settings.mjs';

export const GOOD = {
  schema: 1, authority_remote: 'origin',
  outside: ['README.md', 'CHANGELOG.md', '.github/**'], source: ['bin/**', 'src/**'], interfaces: ['src/api/**'], data: ['src/store/**', 'migrations/**'],
  network_exclude: ['fixtures/private/**', 'config/*.secret.*'], signing_key: null, attribution: 'forbidden',
  harness: { claude_code: { adversary_model: 'claude-fable-5-1', adversary_transport: 'remote' }, codex: { adversary_model: 'gpt-5.6-sol', adversary_transport: 'remote' }, muse: { adversary_model: 'muse-spark-1.3', adversary_transport: 'remote' } },
  typesafeai: { enabled: false, mode: 'shadow', model: 'jev-1.13.0', route_confidence: 0.8, sufficient_threshold: 0.7, outside_threshold: 0.8, contradicts_ceiling: 0.3, reversible_floor: 0.7, observed_floor: 0.6, max_false_downgrade: 0.05, min_calibration_agent_predictions: 60, request_cap_bytes: 48000 },
};
const refuses = (mutate, needle, opts) => { const s = structuredClone(GOOD); mutate(s); const r = validateSettings(s, opts); assert.ok(r.some((x) => needle.test(x)), `expected ${needle} in ${JSON.stringify(r)}`); };

test('the spec fixture is accepted and the schema constant is 1', () => { assert.deepEqual(validateSettings(GOOD), []); assert.equal(SETTINGS_SCHEMA, 1); });
test('refuses an unknown settings schema', () => refuses((s) => { s.schema = 2; }, /schema/));
test('refuses an unknown field at any level', () => {
  refuses((s) => { s.extra = 1; }, /unknown field extra/);
  refuses((s) => { s.harness.codex.temperature = 1; }, /unknown field harness.codex.temperature/);
  refuses((s) => { delete s.attribution; }, /missing field attribution/);
});
test('refuses an invalid glob', () => { refuses((s) => { s.outside.push('/abs/**'); }, /invalid glob/); refuses((s) => { s.source.push('a/***'); }, /invalid glob/); });
test('refuses an outside path overlapping source, interfaces, data, a reserved path or a mechanism input', () => {
  refuses((s) => { s.outside.push('src/generated/**'); }, /outside src\/generated\/\*\* overlaps source/);
  refuses((s) => { s.outside.push('src/api/v1.js'); }, /overlaps interfaces/);
  refuses((s) => { s.outside.push('migrations/**'); }, /overlaps data/);
  refuses((s) => { s.outside.push('docs/spec/notes.md'); }, /overlaps reserved/);
  refuses((s) => { s.outside.push('tests/fixtures/**'); }, /overlaps mechanism input tests\/fixtures/, { mechanisms: [{ inputs: ['tests/fixtures'], documents: [] }] });
});
test('refuses a reserved path under source, interfaces or data', () => {
  refuses((s) => { s.source.push('docs/**'); }, /source docs\/\*\* overlaps reserved/);
  refuses((s) => { s.interfaces.push('AGENTS.md'); }, /interfaces AGENTS.md overlaps reserved/);
  refuses((s) => { s.data.push('.cairn/**'); }, /data .cairn\/\*\* overlaps reserved/);
});
test('refuses a documents path below source', () => refuses(() => {}, /documents src\/README.md lies below source/, { mechanisms: [{ inputs: ['src/README.md'], documents: ['src/README.md'] }] }));
test('refuses a secret-shaped field or value other than the public signing_key', () => {
  refuses((s) => { s.harness.codex.api_token = 'x'; }, /secret-shaped field/);
  refuses((s) => { s.authority_remote = 'ghp_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789'; }, /secret-shaped value/);
  refuses((s) => { s.signing_key = '-----BEGIN OPENSSH PRIVATE KEY-----'; }, /signing_key must be a public key/);
  assert.deepEqual(validateSettings({ ...GOOD, signing_key: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGxVJt8m3ZC0ZQ6xkc2yW1i8lKxk1v4p9mQ2nJg8Yz3A' }), []);
});
test('refuses an invalid authority remote', () => {
  refuses((s) => { s.authority_remote = 'https://x/y.git'; }, /authority remote/);
  refuses((s) => { s.authority_remote = 'upstream'; }, /not a configured remote/, { remotes: ['origin'] });
  assert.deepEqual(validateSettings({ ...GOOD, authority_remote: null }, { remotes: [] }), []);
});
test('refuses an evaluator threshold outside [0,1]', () => { refuses((s) => { s.typesafeai.route_confidence = 1.2; }, /route_confidence/); refuses((s) => { s.typesafeai.observed_floor = -0.1; }, /observed_floor/); });
test('refuses enabled: true without a model', () => refuses((s) => { s.typesafeai.enabled = true; s.typesafeai.model = null; }, /enabled without a model/));
test('refuses request_cap_bytes above 64,000', () => refuses((s) => { s.typesafeai.request_cap_bytes = 64001; }, /request_cap_bytes/));
test('refuses mode: route without a current passing calibration, and an alias model in route mode', () => {
  refuses((s) => { s.typesafeai.mode = 'route'; }, /route mode needs a current passing calibration/);
  refuses((s) => { s.typesafeai.mode = 'route'; }, /calibration/, { calibration: { pass: false } });
  refuses((s) => { s.typesafeai.mode = 'route'; s.typesafeai.model = 'jev-latest'; }, /versioned model/, { calibration: { pass: true } });
  assert.deepEqual(validateSettings({ ...GOOD, typesafeai: { ...GOOD.typesafeai, mode: 'route' } }, { calibration: { pass: true } }), []);
});
test('unknown values fail closed', () => {
  refuses((s) => { s.attribution = 'maybe'; }, /attribution/); refuses((s) => { s.typesafeai.mode = 'auto'; }, /mode/);
  refuses((s) => { s.harness.muse.adversary_transport = 'cloud'; }, /adversary_transport/); refuses((s) => { s.typesafeai.min_calibration_agent_predictions = 0; }, /min_calibration/);
  refuses((s) => { s.outside = 'README.md'; }, /outside must be an array/);
});
test('the removed weights and code_tiers fields are refused by name', () => {
  refuses((s) => { s.typesafeai.weights = {}; }, /removed field weights/); refuses((s) => { s.typesafeai.code_tiers = []; }, /removed field code_tiers/);
});
test('overlaps follows the literal-stem rule', () => {
  assert.ok(overlaps('src/**', 'src/api/**') && overlaps('docs/spec/**', 'docs/spec/a.md') && overlaps('a/b', 'a/b') && overlaps('config/*.json', 'config/x.json'));
  assert.ok(!overlaps('src/**', 'srcx/**') && !overlaps('README.md', 'bin/**') && !overlaps('**/*.md', '**/*.js'));
});

import { makeRepo } from './helpers/repo.mjs';
import { loadSettings, SettingsError } from '../lib/settings.mjs';
import { sha256, canonicalize } from '../lib/canon.mjs';

test('loadSettings reads .cairn/settings.json, checks remotes, and digests the canonical form', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  await assert.rejects(loadSettings(repo.dir), /no .cairn\/settings.json/);
  await repo.write('.cairn/settings.json', JSON.stringify(GOOD, null, 2) + '\n');
  await assert.rejects(loadSettings(repo.dir), (e) => e instanceof SettingsError && e.reasons.some((r) => /not a configured remote/.test(r)));
  await repo.git('remote', 'add', 'origin', '/nonexistent/origin.git');
  const a = await loadSettings(repo.dir);
  assert.deepEqual(a.settings, GOOD);
  assert.equal(a.digest, sha256(canonicalize(GOOD)));
  await repo.write('.cairn/settings.json', JSON.stringify(GOOD));
  assert.equal((await loadSettings(repo.dir)).digest, a.digest);
  await repo.write('.cairn/settings.json', '{ not json');
  await assert.rejects(loadSettings(repo.dir), /not valid JSON/);
});
