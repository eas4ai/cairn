import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { validateSettings, SETTINGS_SCHEMA, overlaps } from '../lib/settings.mjs';

const DIMS = { evidence: 0.2, reach: 0.2, contract: 0.2, surface: 0.2, ambiguity: 0.2 };

export const GOOD = {
  schema: 1, authority_remote: 'origin',
  outside: ['README.md', 'CHANGELOG.md', '.github/**'], source: ['bin/**', 'src/**'], interfaces: ['src/api/**'], data: ['src/store/**', 'migrations/**'],
  network_exclude: ['fixtures/private/**', 'config/*.secret.*'], signing_key: null, attribution: 'forbidden', developer: 'present',
  harness: { claude_code: { adversary_model: 'claude-fable-5-1', adversary_transport: 'remote' }, codex: { adversary_model: 'gpt-5.6-sol', adversary_transport: 'remote' }, muse: { adversary_model: 'muse-spark-1.3', adversary_transport: 'remote' } },
  typesafeai: { enabled: false, model: 'jev-1.13.0', weights: DIMS, agent_ceiling: 0.35, confidence_floors: DIMS, min_calibration_agent_predictions: 60, request_cap_bytes: 48000 },
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
  refuses((s) => { s.data.push('.sudus/**'); }, /data .sudus\/\*\* overlaps reserved/);
});
test('refuses a documents path below source', () => refuses(() => {}, /documents src\/README.md lies below source/, { mechanisms: [{ inputs: ['src/README.md'], documents: ['src/README.md'] }] }));
test('S3: a source root nested under a documents directory is accepted, only the reverse is refused', () => {
  assert.deepEqual(validateSettings({ ...GOOD, source: [...GOOD.source, 'docs/lib/**'] }, { mechanisms: [{ inputs: ['docs'], documents: ['docs'] }] }), []);
});
test('fix round 2 S3: a wildcard-leading source root still catches a documents entry below it', () => {
  refuses((s) => { s.source.push('**/lib/**'); }, /documents lib\/README.md lies below source \*\*\/lib\/\*\*/, { mechanisms: [{ inputs: ['lib/README.md'], documents: ['lib/README.md'] }] });
});
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
test('refuses enabled: true without a model', () => refuses((s) => { s.typesafeai.enabled = true; s.typesafeai.model = null; }, /enabled without a model/));
test('refuses request_cap_bytes above 64,000', () => refuses((s) => { s.typesafeai.request_cap_bytes = 64001; }, /request_cap_bytes/));
test('unknown values fail closed', () => {
  refuses((s) => { s.attribution = 'maybe'; }, /attribution/);
  refuses((s) => { s.harness.muse.adversary_transport = 'cloud'; }, /adversary_transport/); refuses((s) => { s.typesafeai.min_calibration_agent_predictions = 0; }, /min_calibration/);
  refuses((s) => { s.outside = 'README.md'; }, /outside must be an array/);
});
test('S5: AKIA is the real AWS key-id shape with no separator, and long hyphenated model ids are not secret-shaped', () => {
  refuses((s) => { s.authority_remote = 'AKIAIOSFODNN7EXAMPLE'; }, /secret-shaped value/);
  assert.deepEqual(validateSettings({ ...GOOD, typesafeai: { ...GOOD.typesafeai, model: 'claude-fable-5-1' } }), []);
  assert.deepEqual(validateSettings({ ...GOOD, typesafeai: { ...GOOD.typesafeai, model: 'jev-1.13.0' } }), []);
  // 32 characters, mixes letters and digits, and would have matched the old unrestricted
  // [A-Za-z0-9_-]{32,} alternative: a false positive the old regex would have flagged.
  assert.deepEqual(validateSettings({ ...GOOD, typesafeai: { ...GOOD.typesafeai, model: 'claude-opus-5-1-20260301-preview' } }), []);
});
test('overlaps follows glob-vs-glob language intersection, not literal-stem containment', () => {
  assert.ok(overlaps('src/**', 'src/api/**') && overlaps('docs/spec/**', 'docs/spec/a.md') && overlaps('a/b', 'a/b') && overlaps('config/*.json', 'config/x.json'));
  assert.ok(!overlaps('src/**', 'srcx/**') && !overlaps('README.md', 'bin/**') && !overlaps('**/*.md', '**/*.js'));
});

import { matchGlob } from '../lib/paths.mjs';

test('S1: a wildcard-leading glob overlapping a reserved path is caught, not just stem containment', () => {
  assert.ok(matchGlob('**/*.json', '.sudus/settings.json'));
  assert.ok(overlaps('**/*.json', '.sudus/**'));
  assert.ok(overlaps('**/spec/**', 'docs/spec/**'));
  refuses((s) => { s.outside.push('**/*.json'); }, /outside \*\*\/\*\.json overlaps reserved \.sudus\/\*\*/);
  refuses((s) => { s.outside.push('**/spec/**'); }, /outside \*\*\/spec\/\*\* overlaps reserved docs\/spec\/\*\*/);
});

const dims = () => ({ evidence: 0.2, reach: 0.2, contract: 0.2, surface: 0.2, ambiguity: 0.2 });
const goodTypesafeai = () => ({
  enabled: false, model: null, weights: dims(), agent_ceiling: 0.35, confidence_floors: dims(),
  min_calibration_agent_predictions: 60, request_cap_bytes: 48000,
});
const base = () => ({
  schema: 1, authority_remote: null, outside: [], source: [], interfaces: [], data: [], network_exclude: [],
  signing_key: null, attribution: 'forbidden', developer: 'present', harness: {}, typesafeai: goodTypesafeai(),
});

describe('developer field', () => {
  test('present and absent both validate', () => {
    assert.deepEqual(validateSettings({ ...base(), developer: 'present' }), []);
    assert.deepEqual(validateSettings({ ...base(), developer: 'absent' }), []);
  });
  test('anything else is refused', () => {
    for (const v of ['maybe', '', null, 1, undefined]) {
      assert.match(validateSettings({ ...base(), developer: v }).join(' '), /developer/);
    }
  });
  test('the field is required, not defaulted by validateSettings', () => {
    const { developer, ...rest } = base();
    assert.match(validateSettings(rest).join(' '), /developer/);
  });
});

describe('typesafeai weights/agent_ceiling/confidence_floors', () => {
  test('defaults validate', () => assert.deepEqual(validateSettings(base()), []));
  test('a typesafeai.mode field at all is refused', () =>
    assert.match(validateSettings({ ...base(), typesafeai: { ...goodTypesafeai(), mode: 'shadow' } }).join(' '), /mode/));
  test('a weight, agent_ceiling or confidence floor outside [0,1] is refused', () => {
    for (const bad of [{ weights: { ...dims(), evidence: 1.5 } }, { weights: { ...dims(), reach: -0.1 } },
      { agent_ceiling: 1.1 }, { agent_ceiling: -0.01 }, { confidence_floors: { ...dims(), surface: 2 } }]) {
      assert.match(validateSettings({ ...base(), typesafeai: { ...goodTypesafeai(), ...bad } }).join(' '), /weight|agent_ceiling|confidence/);
    }
  });
  // computeComposite (lib/evaluate.mjs) performs no renormalization over typesafeai.weights --
  // it is only a weighted mean over [0,1] when the five weights already sum to 1, and
  // dimensionMap alone (shape and per-entry range) never checked that. weightsSum does, within
  // 1e-6, and names the actual sum in its reason text.
  test('weights must sum to 1: a sum of 0.9 is refused, naming the sum; a sum of 1.0 is accepted', () => {
    const low = { evidence: 0.2, reach: 0.2, contract: 0.2, surface: 0.2, ambiguity: 0.1 }; // sums to 0.9
    const reasons = validateSettings({ ...base(), typesafeai: { ...goodTypesafeai(), weights: low } });
    assert.match(reasons.join(' '), /typesafeai\.weights must sum to 1, sums to 0\.9/);
    assert.deepEqual(validateSettings({ ...base(), typesafeai: { ...goodTypesafeai(), weights: dims() } }), []);
  });
  test('weights and confidence_floors are closed objects over exactly the five dimensions', () => {
    const { evidence, ...four } = dims();
    assert.match(validateSettings({ ...base(), typesafeai: { ...goodTypesafeai(), weights: four } }).join(' '), /weights/);
    assert.match(validateSettings({ ...base(), typesafeai: { ...goodTypesafeai(), weights: { ...dims(), extra: 0.1 } } }).join(' '), /weights/);
  });
  test('code_tiers is still refused; weights is no longer refused', () =>
    assert.match(validateSettings({ ...base(), typesafeai: { ...goodTypesafeai(), code_tiers: [] } }).join(' '), /code_tiers/));
  test('enabled without a model, or an alias, is refused', () => {
    assert.match(validateSettings({ ...base(), typesafeai: { ...goodTypesafeai(), enabled: true, model: null } }).join(' '), /model/);
    assert.match(validateSettings({ ...base(), typesafeai: { ...goodTypesafeai(), enabled: true, model: 'jev-latest' } }).join(' '), /alias|versioned/);
    assert.deepEqual(validateSettings({ ...base(), typesafeai: { ...goodTypesafeai(), enabled: true, model: 'jev-1.13.0' } }), []);
  });
  test('request_cap_bytes above 64000 is refused', () =>
    assert.match(validateSettings({ ...base(), typesafeai: { ...goodTypesafeai(), request_cap_bytes: 64001 } }).join(' '), /request_cap_bytes/));
  test('no route-mode gate remains: validateSettings takes no calibration option any more', () => {
    // Passing one is simply ignored; the old route-mode refusal path is gone.
    assert.deepEqual(validateSettings(base(), { calibration: null }), []);
  });
});

import { makeRepo } from './helpers/repo.mjs';
import { loadSettings, SettingsError } from '../lib/settings.mjs';
import { sha256, canonicalize } from '../lib/canon.mjs';

test('loadSettings reads .sudus/settings.json, checks remotes, and digests the canonical form', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  await assert.rejects(loadSettings(repo.dir), /no .sudus\/settings.json/);
  await repo.write('.sudus/settings.json', JSON.stringify(GOOD, null, 2) + '\n');
  await assert.rejects(loadSettings(repo.dir), (e) => e instanceof SettingsError && e.reasons.some((r) => /not a configured remote/.test(r)));
  await repo.git('remote', 'add', 'origin', '/nonexistent/origin.git');
  const a = await loadSettings(repo.dir);
  assert.deepEqual(a.settings, GOOD);
  assert.equal(a.digest, sha256(canonicalize(GOOD)));
  await repo.write('.sudus/settings.json', JSON.stringify(GOOD));
  assert.equal((await loadSettings(repo.dir)).digest, a.digest);
  await repo.write('.sudus/settings.json', '{ not json');
  await assert.rejects(loadSettings(repo.dir), /not valid JSON/);
});

import { mkdir } from 'node:fs/promises';
import { join as pathJoin } from 'node:path';

test('Q6: loadSettings reports a non-ENOENT read error with its code and the relative path', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  await mkdir(pathJoin(repo.dir, '.sudus/settings.json'), { recursive: true });
  await assert.rejects(loadSettings(repo.dir), (e) => e instanceof SettingsError
    && e.reasons.some((r) => r.includes('EISDIR') && r.includes('.sudus/settings.json'))
    && !e.reasons.some((r) => /run sudus init/.test(r)));
});
