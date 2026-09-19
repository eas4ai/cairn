# Hand-written inputs: paths, settings, spec grammar

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parse and validate the only two hand-written inputs the kernel reads, settings and the specification grammar, plus the path rules every later plan applies, and wire the settings exclusions into plan 01's snapshots.

**Architecture:** `lib/paths.mjs` is pure string logic plus one filesystem check; `lib/settings.mjs` validates a parsed object and returns every refusal at once; `lib/spec.mjs` parses requirement blocks and the roadmap line by line and computes the text digest that start records freeze. `cairn lint docs/spec` is the grammar's falsifier: each refusal in the spec's lint sentence is a test. Every test builds its repository with `tests/helpers/repo.mjs`.

**Tech Stack:** Node 24 ES modules, `node --test`, `node:assert/strict`; plan 01's `lib/canon.mjs`, `lib/gitx.mjs`, `lib/snapshots.mjs`, `lib/cli.mjs`. No dependencies.

**Spec:** `docs/spec/cairn-v2.md` revision 5: section 2 "Paths and authority", "The hand-written tree", "Settings"; section 4 "Requirement and roadmap grammar"; section 7. Map: `docs/plans/overview.md`. Depends on plan 01.

## Global constraints

See `docs/plans/overview.md`. Specific to this plan, quoted from the spec:

- "Every repository path in settings, mechanisms, records and evaluator drafts is a UTF-8, slash-separated Git path relative to the worktree. The kernel rejects absolute paths, a `.git` root, empty components, `.`, `..`, NUL, backslash and a path that escapes after resolution. Globs match entry paths, never symlink targets."
- "The kernel refuses an unknown settings schema or field; an invalid glob; an `outside` path overlapping `source`, `interfaces`, `data`, a reserved path or a mechanism input; a reserved path under `source`, `interfaces` or `data`; a `documents` path below `source`; a secret-shaped field or value other than the public `signing_key`; an invalid authority remote; an evaluator threshold outside `[0,1]`; `enabled: true` without a model; `request_cap_bytes` above 64,000; or `mode: route` without a current passing calibration. Route mode also requires a versioned model ID, not an alias. Unknown values fail closed. The evaluator's removed `weights` and `code_tiers` fields are refused rather than ignored."
- "A requirement block begins at `[PREFIX-nnn]` at the margin and ends at the next blank line. ... Its text digest is the identifier, obligation text and falsifier after the specified whitespace normalization."
- "`cairn lint docs/spec` refuses broken order, duplicate or reused identifiers, references to absent identifiers, missing falsifiers, an Agreed block without a mechanism, noncanonical status dates, and a spec map that does not match domain prefixes."
- "The roadmap parser reads only `Current: <slug>` and, below the matching heading, `Requirements: <identifiers>`. The rest is prose."
- "A block holds its identifier, obligation, falsifier, mechanism, one optional rationale line and status." (7)

Choices this plan fixes (the spec leaves them to the kernel):

- Whitespace normalization: every run of space, tab, CR and LF becomes one space; leading and trailing whitespace is removed; nothing else changes. The text digest is `sha256(id + "\n" + obligation + "\n" + falsifier)` over the three normalized strings.
- A status value is exactly `Draft`, `Observed`, `Agreed YYYY-MM-DD` or `Retired YYYY-MM-DD`, the date a real calendar date.
- The spec map is the first Markdown table in `docs/spec/overview.md` whose header row has cells `File` and `Prefix`; each row names a domain file relative to `docs/spec/` and its prefix. Domain files are every `docs/spec/*.md` except `overview.md`, `glossary.md` and `roadmap.md`.
- A roadmap section heading is a heading line whose whole text is the slug.
- Glob overlap is decided by literal stems (the pattern up to its first wildcard segment): two patterns overlap when they are equal, one stem lies at or under the other, or one pattern matches the other's stem. Two patterns that both begin with a wildcard overlap only when equal.
- Path classification precedence: protected, kernel-managed, output, reserved, outside, data, interface, source, plain.

## File structure

- `lib/paths.mjs`: `validatePath`, `validateGlob`, `assertInside`, `matchGlob`, `classify`, `RESERVED`, `PROTECTED`, `KERNEL_MANAGED`, `OUTPUT`, `CREDENTIAL_PATTERNS`, `PathError`.
- `lib/settings.mjs`: `SETTINGS_SCHEMA`, `validateSettings`, `loadSettings`, `overlaps`, `SettingsError`.
- `lib/spec.mjs`: `normalize`, `textDigest`, `parseDomainFile`, `parseRoadmap`, `parseSpecMap`, `lint`, `requirementSet`, `SpecError`.
- Modify `lib/snapshots.mjs` (import from paths, load settings) and `lib/cli.mjs` (add `lint`).
- Tests: `tests/paths.test.mjs`, `tests/settings.test.mjs`, `tests/spec.test.mjs`; append to `tests/snapshots.test.mjs` and `tests/cli.test.mjs`.

---

### Task 1: Path validation and the reserved-path constants

**Files:**
- Create: `lib/paths.mjs`
- Test: `tests/paths.test.mjs`

**Interfaces:**
- Produces: `validatePath(p) -> p` (throws `PathError`), `validateGlob(g) -> g`, `assertInside(cwd, p) -> p` (async; realpath of the deepest existing ancestor must stay under the worktree), `RESERVED`, `PROTECTED`, `PROTECTED_EXCEPT` (the roadmap: reserved but not protected, per the spec's "`docs/spec/**` except `docs/spec/roadmap.md`"), `KERNEL_MANAGED`, `OUTPUT`, `CREDENTIAL_PATTERNS`, `PathError`.

- [ ] **Step 1: Write the failing tests**

```js
// tests/paths.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeRepo } from './helpers/repo.mjs';
import { validatePath, validateGlob, assertInside, PathError, RESERVED, PROTECTED, PROTECTED_EXCEPT, KERNEL_MANAGED, CREDENTIAL_PATTERNS } from '../lib/paths.mjs';

test('validatePath accepts slash-separated relative UTF-8 paths', () => {
  for (const p of ['a', 'src/a.js', '.github/w.yml', 'dir/\u00e9.md', '.cairn/settings.json']) assert.equal(validatePath(p), p);
});
test('validatePath rejects absolute, .git root, empty components, dot components, NUL, backslash, bad Unicode', () => {
  const cases = { '/etc/x': /absolute/, '.git/config': /\.git/, 'a/.git/x': /\.git/, 'a//b': /empty component/, 'a/': /empty component/, '': /empty path/,
    './a': /\. component/, 'a/../b': /\.\. component/, '..': /\.\. component/, 'a\0b': /NUL/, 'a\\b': /backslash/, 'a\ud800': /Unicode/ };
  for (const [p, re] of Object.entries(cases)) assert.throws(() => validatePath(p), (e) => e instanceof PathError && re.test(e.message), p);
});
test('validateGlob allows * ? and whole-segment **, applies the path rules otherwise', () => {
  for (const g of ['**/*.md', 'src/**', 'config/*.secret.*', 'a/**/b', 'READ?E.md']) assert.equal(validateGlob(g), g);
  for (const g of ['/abs/**', 'a/***/b', 'a**', 'a/../**', 'a\\**', '']) assert.throws(() => validateGlob(g), PathError, g);
});
test('assertInside refuses a path that escapes after symlink resolution', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  const outside = await mkdtemp(join(tmpdir(), 'cairn-outside-'));
  await writeFile(join(outside, 'secret'), 'x');
  await symlink(outside, join(repo.dir, 'vendor'));
  await mkdir(join(repo.dir, 'src'), { recursive: true });
  await symlink('../src', join(repo.dir, 'alias'));
  assert.equal(await assertInside(repo.dir, 'src/new.js'), 'src/new.js');
  assert.equal(await assertInside(repo.dir, 'alias/x.js'), 'alias/x.js');
  await assert.rejects(assertInside(repo.dir, 'vendor/secret'), /escapes/);
  await assert.rejects(assertInside(repo.dir, 'vendor/not/yet/there'), /escapes/);
});
test('the reserved constants are kernel constants', () => {
  assert.deepEqual(RESERVED, ['.cairn/**', 'docs/spec/**', 'docs/decisions.jsonl', 'AGENTS.md']);
  assert.deepEqual(PROTECTED, ['.cairn/settings.json', 'docs/spec/**', 'AGENTS.md']);
  assert.deepEqual(PROTECTED_EXCEPT, ['docs/spec/roadmap.md']);
  assert.deepEqual(KERNEL_MANAGED, ['.cairn/mechanisms', '.cairn/mechanisms/**', 'docs/decisions.jsonl']);
  assert.ok(CREDENTIAL_PATTERNS.includes('**/.env.*') && CREDENTIAL_PATTERNS.includes('**/id_ed25519'));
});
```

- [ ] **Step 2: Run it**

Run: `node --test tests/paths.test.mjs`. Expected: FAIL, `Cannot find module '../lib/paths.mjs'`.

- [ ] **Step 3: Implement**

```js
// lib/paths.mjs
import { realpath } from 'node:fs/promises';
import { join, dirname, sep } from 'node:path';

export class PathError extends Error { constructor(m) { super(m); this.name = 'PathError'; } }
export const RESERVED = ['.cairn/**', 'docs/spec/**', 'docs/decisions.jsonl', 'AGENTS.md'];
export const PROTECTED = ['.cairn/settings.json', 'docs/spec/**', 'AGENTS.md'];
export const PROTECTED_EXCEPT = ['docs/spec/roadmap.md']; // edited by the kernel at start and promote; bound structurally, not by digest
export const KERNEL_MANAGED = ['.cairn/mechanisms', '.cairn/mechanisms/**', 'docs/decisions.jsonl'];
export const OUTPUT = '.cairn/output/**';
export const CREDENTIAL_PATTERNS = ['**/.env', '**/.env.*', '**/*.pem', '**/*.p12', '**/*.pfx', '**/*.key', '**/id_rsa', '**/id_dsa', '**/id_ecdsa', '**/id_ed25519'];

export function validatePath(p) {
  if (typeof p !== 'string' || p === '') throw new PathError('empty path');
  if (p.includes('\0')) throw new PathError(`NUL in path ${JSON.stringify(p)}`);
  if (p.includes('\\')) throw new PathError(`backslash in path ${p}`);
  if (p.startsWith('/')) throw new PathError(`absolute path ${p}`);
  if (!p.isWellFormed()) throw new PathError('path is not valid Unicode');
  for (const c of p.split('/')) {
    if (c === '') throw new PathError(`empty component in ${p}`);
    if (c === '.' || c === '..') throw new PathError(`${c} component in ${p}`);
    if (c === '.git') throw new PathError(`.git component in ${p}`);
  }
  return p;
}
export function validateGlob(g) {
  validatePath(g);
  for (const seg of g.split('/')) {
    if (seg === '**') continue;
    if (seg.includes('**')) throw new PathError(`** must be a whole segment in ${g}`);
  }
  return g;
}
export async function assertInside(cwd, p) {
  validatePath(p);
  const root = await realpath(cwd);
  let probe = join(cwd, p);
  while (probe.length >= cwd.length) {
    try {
      const real = await realpath(probe);
      if (real !== root && !real.startsWith(root + sep)) throw new PathError(`${p} escapes the worktree after resolution`);
      return p;
    } catch (e) {
      if (e instanceof PathError) throw e;
      probe = dirname(probe);
    }
  }
  return p;
}
```

- [ ] **Step 4: Run it**

Run: `node --test tests/paths.test.mjs`. Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/paths.mjs tests/paths.test.mjs
git commit -m "Add repository path validation and the reserved path constants"
```

---

### Task 2: matchGlob, and snapshots use it

**Files:**
- Modify: `lib/paths.mjs` (append), `lib/snapshots.mjs` (replace `globToRegExp` and `CREDENTIAL_PATTERNS` with imports)
- Test: `tests/paths.test.mjs` (append); `tests/snapshots.test.mjs` still passes

**Interfaces:**
- Produces: `matchGlob(pattern, p) -> boolean` (`**` alone in a segment matches zero or more whole segments, `*` and `?` never match `/`; a compiled pattern is cached). `lib/snapshots.mjs` keeps exporting `globToRegExp` as an alias for compatibility with plan 01's test.

- [ ] **Step 1: Append the failing test**

```js
import { matchGlob } from '../lib/paths.mjs';

test('matchGlob matches entry paths with segment-aware wildcards', () => {
  assert.ok(matchGlob('**/.env', '.env') && matchGlob('**/.env', 'a/b/.env') && !matchGlob('**/.env', '.envrc'));
  assert.ok(matchGlob('src/api/**', 'src/api/v1/x.js') && !matchGlob('src/api/**', 'src/apix/y.js'));
  assert.ok(matchGlob('config/*.secret.*', 'config/db.secret.json') && !matchGlob('config/*.secret.*', 'config/x/db.secret.json'));
  assert.ok(matchGlob('README.md', 'README.md') && !matchGlob('README.md', 'docs/README.md'));
  assert.ok(matchGlob('a/**/b', 'a/b') && matchGlob('a/**/b', 'a/x/y/b') && matchGlob('READ?E.md', 'README.md'));
});
```

- [ ] **Step 2: Run it**

Run: `node --test tests/paths.test.mjs`. Expected: FAIL, `does not provide an export named 'matchGlob'`.

- [ ] **Step 3: Implement, then move the snapshot module onto it**

```js
// append to lib/paths.mjs
const compiled = new Map();
export function globToRegExp(pattern) {
  if (compiled.has(pattern)) return compiled.get(pattern);
  const segs = pattern.split('/');
  const re = segs.map((seg, i) => {
    const last = i === segs.length - 1;
    if (seg === '**') return last ? '.*' : '(?:[^/]+/)*';
    const lit = seg.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]');
    return last ? lit : lit + '/';
  }).join('');
  const out = new RegExp('^' + re + '$');
  compiled.set(pattern, out);
  return out;
}
export function matchGlob(pattern, p) { return globToRegExp(pattern).test(p); }
```

In `lib/snapshots.mjs` delete the `globToRegExp` function and the `CREDENTIAL_PATTERNS` constant, and add at the top:

```js
import { globToRegExp, matchGlob, CREDENTIAL_PATTERNS } from './paths.mjs';
export { globToRegExp, CREDENTIAL_PATTERNS };
```

Change `refuseSensitive` to use `matchGlob`:

```js
export function refuseSensitive(untracked, exclude) {
  const patterns = [...CREDENTIAL_PATTERNS, ...exclude];
  const hits = untracked.flatMap((p) => patterns.filter((pat) => matchGlob(pat, p)).map((pat) => `${p} (matches ${pat})`));
  if (hits.length) throw new SnapshotError(`refusing to snapshot untracked sensitive paths: ${hits.join(', ')}`);
}
```

- [ ] **Step 4: Run it**

Run: `node --test tests/paths.test.mjs tests/snapshots.test.mjs`. Expected: PASS (6 + 7 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/paths.mjs lib/snapshots.mjs tests/paths.test.mjs
git commit -m "Move glob matching into the paths module and use it for snapshot exclusions"
```

---

### Task 3: classify

**Files:**
- Modify: `lib/paths.mjs` (append)
- Test: `tests/paths.test.mjs` (append)

**Interfaces:**
- Produces: `classify(p, settings) -> 'reserved'|'protected'|'kernel-managed'|'output'|'outside'|'source'|'interface'|'data'|'plain'`; `settings` needs `outside`, `source`, `interfaces`, `data` arrays.

- [ ] **Step 1: Append the failing test**

```js
import { classify } from '../lib/paths.mjs';

test('classify applies the fixed precedence', () => {
  const s = { outside: ['README.md', '.github/**'], source: ['bin/**', 'src/**'], interfaces: ['src/api/**'], data: ['src/store/**', 'migrations/**'] };
  const cases = { '.cairn/settings.json': 'protected', 'docs/spec/loop.md': 'protected', 'AGENTS.md': 'protected', 'docs/spec/roadmap.md': 'reserved', '.cairn/mechanisms': 'kernel-managed',
    '.cairn/mechanisms/unit': 'kernel-managed', 'docs/decisions.jsonl': 'kernel-managed', '.cairn/output/abc': 'output', '.cairn/stray': 'reserved',
    'README.md': 'outside', '.github/w/ci.yml': 'outside', 'src/store/db.js': 'data', 'migrations/1.sql': 'data', 'src/api/v1.js': 'interface',
    'src/lib/x.js': 'source', 'bin/cairn.mjs': 'source', 'docs/guide.md': 'plain' };
  for (const [p, want] of Object.entries(cases)) assert.equal(classify(p, s), want, p);
  assert.throws(() => classify('../x', s), PathError);
});
```

- [ ] **Step 2: Run it**

Run: `node --test tests/paths.test.mjs`. Expected: FAIL, `does not provide an export named 'classify'`.

- [ ] **Step 3: Implement**

```js
// append to lib/paths.mjs
export function classify(p, settings) {
  validatePath(p);
  const any = (patterns) => patterns.some((g) => matchGlob(g, p));
  if (any(PROTECTED) && !PROTECTED_EXCEPT.includes(p)) return 'protected';
  if (any(KERNEL_MANAGED)) return 'kernel-managed';
  if (matchGlob(OUTPUT, p)) return 'output';
  if (any(RESERVED)) return 'reserved';
  if (any(settings.outside ?? [])) return 'outside';
  if (any(settings.data ?? [])) return 'data';
  if (any(settings.interfaces ?? [])) return 'interface';
  if (any(settings.source ?? [])) return 'source';
  return 'plain';
}
```

- [ ] **Step 4: Run it**

Run: `node --test tests/paths.test.mjs`. Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/paths.mjs tests/paths.test.mjs
git commit -m "Classify repository paths by authority class and settings category"
```

---

### Task 4: Settings validation: one test per refusal

**Files:**
- Create: `lib/settings.mjs`
- Test: `tests/settings.test.mjs`

**Interfaces:**
- Consumes: `validateGlob`, `matchGlob`, `RESERVED` from `lib/paths.mjs`.
- Produces: `SETTINGS_SCHEMA = 1`, `validateSettings(obj, {mechanisms = [], calibration = null, remotes = null}) -> [] | [reasons]` (`mechanisms` is `[{inputs, documents}]`, supplied by plan 05; `calibration` is `{pass: boolean}` or null, supplied by plan 11; `remotes` is the list of configured Git remotes or null to skip that check), `overlaps(a, b) -> boolean`, `SettingsError` (with `.reasons`).

- [ ] **Step 1: Write the failing tests**

```js
// tests/settings.test.mjs
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
```

- [ ] **Step 2: Run it**

Run: `node --test tests/settings.test.mjs`. Expected: FAIL, `Cannot find module '../lib/settings.mjs'`.

- [ ] **Step 3: Implement**

```js
// lib/settings.mjs
import { validateGlob, matchGlob, RESERVED, PathError } from './paths.mjs';

export class SettingsError extends Error { constructor(reasons) { super(`settings refused: ${reasons.join('; ')}`); this.name = 'SettingsError'; this.reasons = reasons; } }
export const SETTINGS_SCHEMA = 1;
const TOP = ['schema', 'authority_remote', 'outside', 'source', 'interfaces', 'data', 'network_exclude', 'signing_key', 'attribution', 'harness', 'typesafeai'];
const HARNESS = ['adversary_model', 'adversary_transport'];
const THRESHOLDS = ['route_confidence', 'sufficient_threshold', 'outside_threshold', 'contradicts_ceiling', 'reversible_floor', 'observed_floor', 'max_false_downgrade'];
const EVAL = ['enabled', 'mode', 'model', ...THRESHOLDS, 'min_calibration_agent_predictions', 'request_cap_bytes'];
const REMOVED = ['weights', 'code_tiers'];
const SECRET_KEY = /(secret|token|password|passwd|api_?key|private_?key|credential)/i;
const SECRET_VALUE = /^(-----BEGIN|(sk|pk|tsk|ghp|gho|xox[abps]|AKIA)[-_][A-Za-z0-9_-]{10,}$|[A-Za-z0-9_-]{32,}$)/;
const REMOTE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/, VERSIONED = /^[a-z][a-z0-9]*-\d+\.\d+\.\d+$/;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function stem(g) { const segs = g.split('/'); const i = segs.findIndex((s) => /[*?]/.test(s)); return (i < 0 ? segs : segs.slice(0, i)).join('/'); }
export function overlaps(a, b) {
  if (a === b) return true;
  const sa = stem(a), sb = stem(b);
  if (sa !== '' && sb !== '' && (sa === sb || sa.startsWith(sb + '/') || sb.startsWith(sa + '/'))) return true;
  return (sb !== '' && matchGlob(a, sb)) || (sa !== '' && matchGlob(b, sa));
}
function closed(obj, allowed, path, out) {
  for (const k of allowed) if (!(k in obj)) out.push(`missing field ${path}${k}`);
  for (const k of Object.keys(obj)) {
    if (REMOVED.includes(k)) out.push(`removed field ${k} is refused, not ignored`);
    else if (!allowed.includes(k)) out.push(`unknown field ${path}${k}`);
  }
}
function secrets(v, path, out) {
  if (isObj(v)) for (const [k, x] of Object.entries(v)) { if (SECRET_KEY.test(k)) out.push(`secret-shaped field ${path}${k}`); secrets(x, `${path}${k}.`, out); }
  else if (Array.isArray(v)) v.forEach((x, i) => secrets(x, `${path}${i}.`, out));
  else if (typeof v === 'string' && SECRET_VALUE.test(v)) out.push(`secret-shaped value at ${path.slice(0, -1)}`);
}
function globList(s, name, out) {
  if (!Array.isArray(s[name])) { out.push(`${name} must be an array`); return []; }
  return s[name].filter((g) => { try { validateGlob(g); return true; } catch (e) { out.push(`invalid glob in ${name}: ${e instanceof PathError ? e.message : g}`); return false; } });
}
export function validateSettings(s, { mechanisms = [], calibration = null, remotes = null } = {}) {
  const out = [];
  if (!isObj(s)) return ['settings must be a JSON object'];
  if (s.schema !== SETTINGS_SCHEMA) out.push(`unknown settings schema ${JSON.stringify(s.schema)}`);
  closed(s, TOP, '', out);
  const { signing_key, ...rest } = s; secrets(rest, '', out);
  if (signing_key !== null && signing_key !== undefined && (typeof signing_key !== 'string' || /PRIVATE/.test(signing_key))) out.push('signing_key must be a public key string or null');
  const outside = globList(s, 'outside', out), source = globList(s, 'source', out), interfaces = globList(s, 'interfaces', out), data = globList(s, 'data', out); globList(s, 'network_exclude', out);
  const inputs = mechanisms.flatMap((m) => m.inputs ?? []), documents = mechanisms.flatMap((m) => m.documents ?? []);
  for (const o of outside) {
    for (const [name, list] of [['source', source], ['interfaces', interfaces], ['data', data], ['reserved', RESERVED]]) for (const g of list) if (overlaps(o, g)) out.push(`outside ${o} overlaps ${name} ${g}`);
    for (const i of inputs) if (overlaps(o, i)) out.push(`outside ${o} overlaps mechanism input ${i}`);
  }
  for (const [name, list] of [['source', source], ['interfaces', interfaces], ['data', data]]) for (const g of list) for (const r of RESERVED) if (overlaps(g, r)) out.push(`${name} ${g} overlaps reserved ${r}`);
  for (const d of documents) for (const g of source) if (overlaps(d, g)) out.push(`documents ${d} lies below source ${g}`);
  if (s.authority_remote !== null && (typeof s.authority_remote !== 'string' || !REMOTE.test(s.authority_remote))) out.push('authority remote must be a remote name or null');
  else if (s.authority_remote !== null && remotes && !remotes.includes(s.authority_remote)) out.push(`authority remote ${s.authority_remote} is not a configured remote`);
  if (!['forbidden', 'allowed'].includes(s.attribution)) out.push('attribution must be forbidden or allowed');
  if (!isObj(s.harness)) out.push('harness must be an object');
  else for (const [name, h] of Object.entries(s.harness)) {
    if (!isObj(h)) { out.push(`harness.${name} must be an object`); continue; }
    closed(h, HARNESS, `harness.${name}.`, out);
    if (h.adversary_model !== null && typeof h.adversary_model !== 'string') out.push(`harness.${name}.adversary_model must be a string or null`);
    if (!['local', 'remote'].includes(h.adversary_transport)) out.push(`harness.${name}.adversary_transport must be local or remote`);
  }
  const e = s.typesafeai;
  if (!isObj(e)) out.push('typesafeai must be an object');
  else {
    closed(e, EVAL, 'typesafeai.', out);
    if (typeof e.enabled !== 'boolean') out.push('typesafeai.enabled must be boolean');
    if (!['shadow', 'route'].includes(e.mode)) out.push('typesafeai.mode must be shadow or route');
    if (e.model !== null && typeof e.model !== 'string') out.push('typesafeai.model must be a string or null');
    for (const k of THRESHOLDS) if (typeof e[k] !== 'number' || e[k] < 0 || e[k] > 1) out.push(`typesafeai.${k} must be a number in [0,1]`);
    if (!Number.isInteger(e.min_calibration_agent_predictions) || e.min_calibration_agent_predictions < 1) out.push('typesafeai.min_calibration_agent_predictions must be a positive integer');
    if (!Number.isInteger(e.request_cap_bytes) || e.request_cap_bytes < 1 || e.request_cap_bytes > 64000) out.push('typesafeai.request_cap_bytes must be an integer from 1 to 64000');
    if (e.enabled === true && !e.model) out.push('typesafeai enabled without a model');
    if (e.mode === 'route') {
      if (!calibration || calibration.pass !== true) out.push('route mode needs a current passing calibration');
      if (typeof e.model !== 'string' || !VERSIONED.test(e.model)) out.push('route mode needs a versioned model ID, not an alias');
    }
  }
  return out;
}
```

- [ ] **Step 4: Run it**

Run: `node --test tests/settings.test.mjs`. Expected: PASS (16 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/settings.mjs tests/settings.test.mjs
git commit -m "Validate settings with one refusal per rule in the specification"
```

---

### Task 5: loadSettings and the settings digest

**Files:**
- Modify: `lib/settings.mjs` (append)
- Test: `tests/settings.test.mjs` (append)

**Interfaces:**
- Consumes: `canonicalize`, `sha256` from `lib/canon.mjs`; `git` from `lib/gitx.mjs`.
- Produces: `loadSettings(cwd, opts) -> {settings, digest}` (reads `.cairn/settings.json`, passes the configured remotes, throws `SettingsError` listing every refusal; `digest` is `sha256(canonicalize(settings))`), `SETTINGS_PATH`.

- [ ] **Step 1: Append the failing test**

```js
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
```

- [ ] **Step 2: Run it**

Run: `node --test tests/settings.test.mjs`. Expected: FAIL, `does not provide an export named 'loadSettings'`.

- [ ] **Step 3: Implement**

```js
// append to lib/settings.mjs
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { canonicalize, sha256 } from './canon.mjs';
import { git } from './gitx.mjs';
export const SETTINGS_PATH = '.cairn/settings.json';

export async function loadSettings(cwd, opts = {}) {
  let text;
  try { text = await readFile(join(cwd, SETTINGS_PATH), 'utf8'); } catch { throw new SettingsError([`no ${SETTINGS_PATH}; run cairn init`]); }
  let settings;
  try { settings = JSON.parse(text); } catch (e) { throw new SettingsError([`${SETTINGS_PATH} is not valid JSON: ${e.message}`]); }
  const remotes = (await git(['remote'], { cwd })).stdout.split('\n').filter(Boolean);
  const reasons = validateSettings(settings, { remotes, ...opts });
  if (reasons.length) throw new SettingsError(reasons);
  return { settings, digest: sha256(canonicalize(settings)) };
}
```

Move the `import` lines to the top of the file.

- [ ] **Step 4: Run it**

Run: `node --test tests/settings.test.mjs`. Expected: PASS (17 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/settings.mjs tests/settings.test.mjs
git commit -m "Load settings from the repository and digest their canonical form"
```

---

### Task 6: Requirement block grammar and the text digest

**Files:**
- Create: `lib/spec.mjs`
- Test: `tests/spec.test.mjs`

**Interfaces:**
- Consumes: `sha256` from `lib/canon.mjs`.
- Produces: `normalize(text) -> string`, `textDigest(id, obligation, falsifier) -> 'sha256:...'`, `parseDomainFile(text) -> {header: {prefix, scopeEvery, hostPaths}, blocks: [Block], problems: [{line, reason}]}`, `Block = {id, line, obligation, falsifier, mechanism, rationale, status: {kind, date}, textDigest}` (obligation and falsifier are stored normalized), `ID_RE`, `SpecError`. A problem's `line` is the offending line for an out-of-order or malformed field and the block's opening line for a missing field.

- [ ] **Step 1: Write the failing tests**

```js
// tests/spec.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sha256 } from '../lib/canon.mjs';
import { normalize, textDigest, parseDomainFile } from '../lib/spec.mjs';

const FILE = `# Loop
Prefix: LOOP
Scope: every commitment
Host paths: ~/.claude/settings.json, /etc/hosts

Some prose the parser ignores.

[LOOP-001] The kernel refuses a write
  to a durable ref whose old OID differs.
Falsifier: a ref advances past a stale expected OID.
Mechanism: refs-cas
Rationale: the log is append-only.
Status: Agreed 2026-09-19

[LOOP-002] Wake writes nothing.
Falsifier: any ref or file changes during wake.
Mechanism:
Status: Draft
`;

test('normalize collapses whitespace runs and trims', () => {
  assert.equal(normalize('  a \t b\r\n c  '), 'a b c');
});
test('parseDomainFile reads the header and blocks in order', () => {
  const { header, blocks, problems } = parseDomainFile(FILE);
  assert.deepEqual(header, { prefix: 'LOOP', scopeEvery: true, hostPaths: ['~/.claude/settings.json', '/etc/hosts'] });
  assert.deepEqual(problems, []);
  assert.equal(blocks.length, 2);
  const b = blocks[0];
  assert.deepEqual([b.id, b.line, b.obligation, b.falsifier, b.mechanism, b.rationale, b.status],
    ['LOOP-001', 8, 'The kernel refuses a write to a durable ref whose old OID differs.', 'a ref advances past a stale expected OID.', 'refs-cas', 'the log is append-only.', { kind: 'Agreed', date: '2026-09-19' }]);
  assert.equal(b.textDigest, sha256('LOOP-001\nThe kernel refuses a write to a durable ref whose old OID differs.\na ref advances past a stale expected OID.'));
  assert.deepEqual([blocks[1].mechanism, blocks[1].rationale, blocks[1].status], ['', null, { kind: 'Draft', date: null }]);
});
test('the digest ignores reflow and the Mechanism and Rationale lines, not word changes', () => {
  const reflowed = FILE.replace('a write\n  to a durable', 'a write to a durable').replace('refs-cas', 'other').replace('Rationale: the log is append-only.\n', '');
  assert.equal(parseDomainFile(reflowed).blocks[0].textDigest, parseDomainFile(FILE).blocks[0].textDigest);
  assert.notEqual(parseDomainFile(FILE.replace('stale expected', 'stale')).blocks[0].textDigest, parseDomainFile(FILE).blocks[0].textDigest);
  assert.equal(textDigest('LOOP-001', ' x ', 'y'), sha256('LOOP-001\nx\ny'));
});
test('broken order, repeated lines and bad status are reported as problems with line numbers', () => {
  const bad = (text) => parseDomainFile(text).problems.map((p) => p.reason);
  assert.match(bad('[A-001] x\nStatus: Draft\nFalsifier: f\n').join(), /Falsifier: after Status:/);
  assert.match(bad('[A-001] x\nFalsifier: f\nRationale: r\nRationale: r2\nStatus: Draft\n').join(), /second Rationale:/);
  assert.match(bad('[A-001] x\nFalsifier: f\nMechanism: m\nmore text\nStatus: Draft\n').join(), /unexpected line after Falsifier:/);
  assert.match(bad('[A-001] x\nFalsifier: f\nStatus: Agreed 2026-9-1\n').join(), /noncanonical status date/);
  assert.match(bad('[A-001] x\nFalsifier: f\nStatus: Agreed 2026-02-30\n').join(), /noncanonical status date/);
  assert.match(bad('[A-001] x\nFalsifier: f\nStatus: Done\n').join(), /unknown status/);
  assert.match(bad('[A-001] x\nMechanism: m\nStatus: Draft\n').join(), /missing Falsifier:/);
  assert.match(bad('[A-001] x\nFalsifier: f\n').join(), /missing Status:/);
  assert.match(bad('[A-001]\nFalsifier: f\nStatus: Draft\n').join(), /empty obligation/);
});
```

- [ ] **Step 2: Run it**

Run: `node --test tests/spec.test.mjs`. Expected: FAIL, `Cannot find module '../lib/spec.mjs'`.

- [ ] **Step 3: Implement**

```js
// lib/spec.mjs
import { sha256 } from './canon.mjs';

export class SpecError extends Error { constructor(m) { super(m); this.name = 'SpecError'; } }
export const ID_RE = /^\[([A-Z][A-Z0-9]*-[0-9]{3})\]\s*(.*)$/;
const FIELD = /^(Falsifier|Mechanism|Rationale|Status):\s*(.*)$/;
const STATUS = /^(Draft|Observed|Agreed ([0-9]{4}-[0-9]{2}-[0-9]{2})|Retired ([0-9]{4}-[0-9]{2}-[0-9]{2}))$/;

export function normalize(text) { return text.replace(/[ \t\r\n]+/g, ' ').trim(); }
export function textDigest(id, obligation, falsifier) { return sha256(`${id}\n${normalize(obligation)}\n${normalize(falsifier)}`); }
function calendarDate(s) { const [y, m, d] = s.split('-').map(Number); const dt = new Date(Date.UTC(y, m - 1, d)); return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d; }
export function parseStatus(raw) {
  const m = STATUS.exec(raw.trim());
  if (!m) return { error: /^(Agreed|Retired) /.test(raw.trim()) ? `noncanonical status date in "${raw.trim()}"` : `unknown status "${raw.trim()}"` };
  const date = m[2] ?? m[3] ?? null;
  if (date && !calendarDate(date)) return { error: `noncanonical status date ${date}` };
  return { kind: m[1].split(' ')[0], date };
}

export function parseDomainFile(text) {
  const lines = text.split('\n');
  const header = { prefix: null, scopeEvery: false, hostPaths: [] };
  const blocks = [], problems = [];
  let i = 0;
  while (i < lines.length && !ID_RE.test(lines[i])) {
    const h = /^(Prefix|Scope|Host paths):\s*(.*)$/.exec(lines[i]);
    if (h?.[1] === 'Prefix') header.prefix = h[2].trim();
    if (h?.[1] === 'Scope' && h[2].trim() === 'every commitment') header.scopeEvery = true;
    if (h?.[1] === 'Host paths') header.hostPaths = h[2].split(',').map((s) => s.trim()).filter(Boolean);
    i++;
  }
  while (i < lines.length) {
    const open = ID_RE.exec(lines[i]);
    if (!open) { i++; continue; }
    const line = i + 1, b = { id: open[1], line, obligation: open[2], falsifier: null, mechanism: null, rationale: null, status: null };
    const bad = (reason, at = i + 1) => problems.push({ line: at, reason: `${b.id}: ${reason}` });
    let stage = 'obligation';
    for (i++; i < lines.length && lines[i].trim() !== '' && !ID_RE.test(lines[i]); i++) {
      const f = FIELD.exec(lines[i]);
      if (!f) { if (stage === 'obligation') b.obligation += ' ' + lines[i]; else bad(`unexpected line after Falsifier: "${lines[i].trim()}"`); continue; }
      const [, key, value] = f;
      if (key === 'Falsifier') { if (stage !== 'obligation') bad(`Falsifier: after ${stage === 'falsifier' ? 'Falsifier:' : 'Status:'}`); b.falsifier ??= value; stage = b.status ? 'status' : 'falsifier'; }
      else if (key === 'Mechanism') { if (b.mechanism !== null) bad('second Mechanism:'); else if (stage !== 'falsifier' || b.rationale !== null) bad('Mechanism: out of order'); b.mechanism = value.trim(); }
      else if (key === 'Rationale') { if (b.rationale !== null) bad('second Rationale:'); else if (stage !== 'falsifier') bad('Rationale: out of order'); b.rationale = value.trim(); }
      else { if (b.status !== null) bad('second Status:'); const st = parseStatus(value); if (st.error) bad(st.error); else b.status = st; stage = 'status'; }
    }
    b.obligation = normalize(b.obligation);
    if (b.falsifier !== null) b.falsifier = normalize(b.falsifier);
    if (b.obligation === '') bad('empty obligation', line);
    if (b.falsifier === null) bad('missing Falsifier:', line);
    if (b.status === null && !problems.some((p) => p.reason.startsWith(`${b.id}: `) && /status/i.test(p.reason))) bad('missing Status:', line);
    b.mechanism ??= '';
    b.textDigest = textDigest(b.id, b.obligation, b.falsifier ?? '');
    blocks.push(b);
  }
  return { header, blocks, problems };
}
```

- [ ] **Step 4: Run it**

Run: `node --test tests/spec.test.mjs`. Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/spec.mjs tests/spec.test.mjs
git commit -m "Parse requirement blocks and compute the frozen text digest"
```

---

### Task 7: The roadmap parser

**Files:**
- Modify: `lib/spec.mjs` (append)
- Test: `tests/spec.test.mjs` (append)

**Interfaces:**
- Produces: `parseRoadmap(text) -> {current, sections: {slug: {requirements, line}}}`.

- [ ] **Step 1: Append the failing test**

```js
import { parseRoadmap } from '../lib/spec.mjs';

test('parseRoadmap reads only Current: and Requirements: under the matching heading', () => {
  const r = parseRoadmap('# Roadmap\n\nCurrent: hooks\n\n## records\n\nRequirements: LOOP-001, LOOP-002\nDone when the log reads.\n\n## hooks\n\nProse first.\nRequirements: LOOP-003 LOOP-001\nRequirements: LOOP-999\n\n### notes\n');
  assert.equal(r.current, 'hooks');
  assert.deepEqual(r.sections.records, { requirements: ['LOOP-001', 'LOOP-002'], line: 5 });
  assert.deepEqual(r.sections.hooks.requirements, ['LOOP-003', 'LOOP-001']);
  assert.deepEqual(r.sections.notes.requirements, []);
  assert.equal(parseRoadmap('no current line').current, null);
});
```

- [ ] **Step 2: Run it**

Run: `node --test tests/spec.test.mjs`. Expected: FAIL, `does not provide an export named 'parseRoadmap'`.

- [ ] **Step 3: Implement**

```js
// append to lib/spec.mjs
export function parseRoadmap(text) {
  const out = { current: null, sections: {} };
  let section = null;
  text.split('\n').forEach((raw, i) => {
    const cur = /^Current:\s*(\S+)\s*$/.exec(raw);
    if (cur && out.current === null) { out.current = cur[1]; return; }
    const head = /^#+\s+(.+?)\s*$/.exec(raw);
    if (head) { section = head[1]; out.sections[section] ??= { requirements: [], line: i + 1 }; return; }
    const req = /^Requirements:\s*(.*)$/.exec(raw);
    if (req && section && out.sections[section].requirements.length === 0) out.sections[section].requirements = req[1].split(/[\s,]+/).filter(Boolean);
  });
  return out;
}
```

- [ ] **Step 4: Run it**

Run: `node --test tests/spec.test.mjs`. Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/spec.mjs tests/spec.test.mjs
git commit -m "Read Current and Requirements lines from the roadmap"
```

---

### Task 8: The spec map and lint, one test per refusal

**Files:**
- Modify: `lib/spec.mjs` (append)
- Test: `tests/spec.test.mjs` (append)

**Interfaces:**
- Consumes: `makeRepo` (tests).
- Produces: `parseSpecMap(text) -> [{file, prefix}]`, `readSpec(cwd) -> {map, domains: {file: parsed}, roadmap, blocks: Map<id, block+file>}`, `lint(cwd) -> [] | [{file, line, reason}]`, `SPEC_DIR = 'docs/spec'`, `NON_DOMAIN`.

- [ ] **Step 1: Append the failing tests**

```js
import { makeRepo } from './helpers/repo.mjs';
import { lint, parseSpecMap } from '../lib/spec.mjs';

const OVERVIEW = '# Overview\n\nWhat it is.\n\n| File | Prefix |\n|---|---|\n| loop.md | LOOP |\n| ui.md | UI |\n';
const LOOP = 'Prefix: LOOP\n\n[LOOP-001] The kernel refuses stale writes.\nFalsifier: a stale write lands.\nMechanism: refs-cas\nStatus: Agreed 2026-09-19\n\n[LOOP-002] Wake writes nothing.\nFalsifier: wake changes a file.\nMechanism:\nStatus: Draft\n';
const UI = 'Prefix: UI\n\n[UI-001] The CLI prints usage.\nFalsifier: --help prints nothing.\nMechanism: cli\nStatus: Observed\n';
async function specRepo(t, files = {}) {
  const repo = await makeRepo(); t.after(repo.remove);
  const all = { 'overview.md': OVERVIEW, 'glossary.md': '# Glossary\n', 'roadmap.md': '# Roadmap\n\nCurrent: first\n\n## first\n\nRequirements: LOOP-001\n', 'loop.md': LOOP, 'ui.md': UI, ...files };
  for (const [name, text] of Object.entries(all)) await repo.write(`docs/spec/${name}`, text);
  return repo;
}
const reasons = async (repo) => (await lint(repo.dir)).map((f) => `${f.file}:${f.line}: ${f.reason}`);

test('parseSpecMap reads the File/Prefix table', () => {
  assert.deepEqual(parseSpecMap(OVERVIEW), [{ file: 'loop.md', prefix: 'LOOP' }, { file: 'ui.md', prefix: 'UI' }]);
  assert.deepEqual(parseSpecMap('# no table'), []);
});
test('a consistent spec lints clean', async (t) => { assert.deepEqual(await reasons(await specRepo(t)), []); });
test('lint refuses broken order', async (t) => {
  const repo = await specRepo(t, { 'ui.md': 'Prefix: UI\n\n[UI-001] x\nStatus: Draft\nFalsifier: f\n' });
  assert.match((await reasons(repo)).join(), /docs\/spec\/ui.md:5: UI-001: Falsifier: after Status:/);
});
test('lint refuses duplicate identifiers across files and a reused Retired identifier', async (t) => {
  const repo = await specRepo(t, { 'ui.md': UI + '\n[LOOP-001] Again.\nFalsifier: f\nStatus: Draft\n' });
  assert.match((await reasons(repo)).join(), /duplicate identifier LOOP-001 \(also docs\/spec\/loop.md:3\)/);
  const reused = await specRepo(t, { 'ui.md': UI + '\n[UI-002] Old.\nFalsifier: f\nStatus: Retired 2026-01-01\n\n[UI-002] New.\nFalsifier: f\nStatus: Draft\n' });
  assert.match((await reasons(reused)).join(), /duplicate identifier UI-002/);
});
test('lint refuses references to absent identifiers', async (t) => {
  const repo = await specRepo(t, { 'roadmap.md': '# Roadmap\n\nCurrent: first\n\n## first\n\nRequirements: LOOP-001, LOOP-007\n', 'glossary.md': 'See UI-009.\n' });
  const r = (await reasons(repo)).join();
  assert.match(r, /docs\/spec\/roadmap.md:7: reference to absent identifier LOOP-007/);
  assert.match(r, /docs\/spec\/glossary.md:1: reference to absent identifier UI-009/);
});
test('lint refuses a missing falsifier', async (t) => {
  const repo = await specRepo(t, { 'ui.md': 'Prefix: UI\n\n[UI-001] x\nMechanism: m\nStatus: Draft\n' });
  assert.match((await reasons(repo)).join(), /UI-001: missing Falsifier:/);
});
test('lint refuses an Agreed block without a mechanism', async (t) => {
  const repo = await specRepo(t, { 'ui.md': 'Prefix: UI\n\n[UI-001] x\nFalsifier: f\nStatus: Agreed 2026-09-19\n' });
  assert.match((await reasons(repo)).join(), /UI-001: Agreed block without a mechanism/);
});
test('lint refuses noncanonical status dates', async (t) => {
  const repo = await specRepo(t, { 'ui.md': 'Prefix: UI\n\n[UI-001] x\nFalsifier: f\nMechanism: m\nStatus: Agreed 19/09/2026\n' });
  assert.match((await reasons(repo)).join(), /noncanonical status date/);
});
test('lint refuses a spec map that does not match domain prefixes', async (t) => {
  const missingRow = await specRepo(t, { 'overview.md': '| File | Prefix |\n|---|---|\n| loop.md | LOOP |\n' });
  assert.match((await reasons(missingRow)).join(), /docs\/spec\/overview.md:1: spec map has no row for ui.md/);
  const wrongPrefix = await specRepo(t, { 'overview.md': OVERVIEW.replace('| UI |', '| UX |') });
  assert.match((await reasons(wrongPrefix)).join(), /spec map says ui.md has prefix UX, file says UI/);
  const extraRow = await specRepo(t, { 'overview.md': OVERVIEW + '| gone.md | GONE |\n' });
  assert.match((await reasons(extraRow)).join(), /spec map names missing file gone.md/);
  const wrongBlock = await specRepo(t, { 'ui.md': 'Prefix: UI\n\n[UX-001] x\nFalsifier: f\nStatus: Draft\n' });
  assert.match((await reasons(wrongBlock)).join(), /UX-001 does not carry prefix UI/);
  const noHeader = await specRepo(t, { 'ui.md': '[UI-001] x\nFalsifier: f\nStatus: Draft\n' });
  assert.match((await reasons(noHeader)).join(), /docs\/spec\/ui.md:1: no Prefix: header/);
});
```

- [ ] **Step 2: Run it**

Run: `node --test tests/spec.test.mjs`. Expected: FAIL, `does not provide an export named 'lint'`.

- [ ] **Step 3: Implement**

```js
// append to lib/spec.mjs
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
export const SPEC_DIR = 'docs/spec';
export const NON_DOMAIN = ['overview.md', 'glossary.md', 'roadmap.md'];
const REF_RE = /\b([A-Z][A-Z0-9]*-[0-9]{3})\b/g;

export function parseSpecMap(text) {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length - 1; i++) {
    const cells = (l) => l.split('|').map((c) => c.trim()).filter((c, j, a) => j > 0 && j < a.length - 1);
    if (!lines[i].startsWith('|')) continue;
    const head = cells(lines[i]), fi = head.indexOf('File'), pi = head.indexOf('Prefix');
    if (fi < 0 || pi < 0) continue;
    const rows = [];
    for (let j = i + 2; j < lines.length && lines[j].startsWith('|'); j++) { const c = cells(lines[j]); rows.push({ file: c[fi], prefix: c[pi] }); }
    return rows;
  }
  return [];
}
export async function readSpec(cwd) {
  const dir = join(cwd, SPEC_DIR);
  const read = async (name) => { try { return await readFile(join(dir, name), 'utf8'); } catch { return null; } };
  const names = (await readdir(dir)).filter((n) => n.endsWith('.md')).sort();
  const texts = Object.fromEntries(await Promise.all(names.map(async (n) => [n, await read(n)])));
  const domains = Object.fromEntries(names.filter((n) => !NON_DOMAIN.includes(n)).map((n) => [n, parseDomainFile(texts[n])]));
  const blocks = new Map();
  for (const [file, d] of Object.entries(domains)) for (const b of d.blocks) if (!blocks.has(b.id)) blocks.set(b.id, { ...b, file });
  return { texts, map: parseSpecMap(texts['overview.md'] ?? ''), domains, roadmap: parseRoadmap(texts['roadmap.md'] ?? ''), blocks };
}
export async function lint(cwd) {
  const { texts, map, domains, blocks } = await readSpec(cwd);
  const out = [], f = (file, line, reason) => out.push({ file: `${SPEC_DIR}/${file}`, line, reason });
  const seen = new Map();
  for (const [file, d] of Object.entries(domains)) {
    for (const p of d.problems) f(file, p.line, p.reason);
    if (!d.header.prefix) f(file, 1, 'no Prefix: header');
    for (const b of d.blocks) {
      if (seen.has(b.id)) f(file, b.line, `duplicate identifier ${b.id} (also ${seen.get(b.id)})`); else seen.set(b.id, `${SPEC_DIR}/${file}:${b.line}`);
      if (d.header.prefix && !b.id.startsWith(d.header.prefix + '-')) f(file, b.line, `${b.id} does not carry prefix ${d.header.prefix}`);
      if (b.status?.kind === 'Agreed' && b.mechanism === '') f(file, b.line, `${b.id}: Agreed block without a mechanism`);
    }
  }
  const prefixes = new Set(Object.values(domains).map((d) => d.header.prefix).filter(Boolean));
  for (const [file, text] of Object.entries(texts)) text.split('\n').forEach((line, i) => {
    if (ID_RE.test(line)) return;
    for (const m of line.matchAll(REF_RE)) if (prefixes.has(m[1].split('-')[0]) && !blocks.has(m[1])) f(file, i + 1, `reference to absent identifier ${m[1]}`);
  });
  for (const row of map) {
    const d = domains[row.file];
    if (!d) f('overview.md', 1, `spec map names missing file ${row.file}`);
    else if (d.header.prefix !== row.prefix) f('overview.md', 1, `spec map says ${row.file} has prefix ${row.prefix}, file says ${d.header.prefix}`);
  }
  for (const file of Object.keys(domains)) if (!map.some((r) => r.file === file)) f('overview.md', 1, `spec map has no row for ${file}`);
  return out.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}
```

Move the `import` lines to the top. A Retired block keeps its identifier in the file, so reusing it is a duplicate; the parser problems from task 6 supply broken order, missing falsifier and noncanonical date.

- [ ] **Step 4: Run it**

Run: `node --test tests/spec.test.mjs`. Expected: PASS (14 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/spec.mjs tests/spec.test.mjs
git commit -m "Lint the specification with one refusal per grammar rule"
```

---

### Task 9: requirementSet

**Files:**
- Modify: `lib/spec.mjs` (append)
- Test: `tests/spec.test.mjs` (append)

**Interfaces:**
- Produces: `requirementSet(cwd, slug) -> [{id, textDigest}]` sorted by id: the roadmap section's identifiers plus every Agreed block in a `Scope: every commitment` file; throws `SpecError` when the section is missing, an identifier is absent, or a named block is not Agreed.

- [ ] **Step 1: Append the failing test**

```js
import { requirementSet, SpecError } from '../lib/spec.mjs';

test('requirementSet is the section plus every Agreed Scope: every commitment block, Agreed only', async (t) => {
  const repo = await specRepo(t, { 'ui.md': 'Prefix: UI\nScope: every commitment\n\n[UI-001] x\nFalsifier: f\nMechanism: cli\nStatus: Agreed 2026-09-19\n\n[UI-002] y\nFalsifier: f\nMechanism: cli\nStatus: Draft\n' });
  const set = await requirementSet(repo.dir, 'first');
  assert.deepEqual(set.map((r) => r.id), ['LOOP-001', 'UI-001']);
  assert.match(set[0].textDigest, /^sha256:[0-9a-f]{64}$/);
  await assert.rejects(requirementSet(repo.dir, 'none'), (e) => e instanceof SpecError && /no roadmap section none/.test(e.message));
  const draft = await specRepo(t, { 'roadmap.md': 'Current: first\n\n## first\n\nRequirements: LOOP-002\n' });
  await assert.rejects(requirementSet(draft.dir, 'first'), /LOOP-002 is Draft, not Agreed/);
  const absent = await specRepo(t, { 'roadmap.md': 'Current: first\n\n## first\n\nRequirements: LOOP-009\n' });
  await assert.rejects(requirementSet(absent.dir, 'first'), /LOOP-009 is not defined/);
});
```

- [ ] **Step 2: Run it**

Run: `node --test tests/spec.test.mjs`. Expected: FAIL, `does not provide an export named 'requirementSet'`.

- [ ] **Step 3: Implement**

```js
// append to lib/spec.mjs
export async function requirementSet(cwd, slug) {
  const { domains, roadmap, blocks } = await readSpec(cwd);
  const section = roadmap.sections[slug];
  if (!section) throw new SpecError(`no roadmap section ${slug}`);
  const ids = new Set(section.requirements);
  for (const d of Object.values(domains)) if (d.header.scopeEvery) for (const b of d.blocks) if (b.status?.kind === 'Agreed') ids.add(b.id);
  return [...ids].sort().map((id) => {
    const b = blocks.get(id);
    if (!b) throw new SpecError(`${id} is not defined in ${SPEC_DIR}`);
    if (b.status?.kind !== 'Agreed') throw new SpecError(`${id} is ${b.status?.kind ?? 'unreadable'}, not Agreed`);
    return { id, textDigest: b.textDigest };
  });
}
```

- [ ] **Step 4: Run it**

Run: `node --test tests/spec.test.mjs`. Expected: PASS (15 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/spec.mjs tests/spec.test.mjs
git commit -m "Resolve a commitment's requirement set with frozen text digests"
```

---

### Task 10: cairn lint docs/spec

**Files:**
- Modify: `lib/cli.mjs` (add a command)
- Test: `tests/cli.test.mjs` (append)

**Interfaces:**
- Consumes: `lint` from `lib/spec.mjs`; `COMMANDS`, `Refusal` from `lib/cli.mjs`.
- Produces: `cairn lint docs/spec`: exit 0 and no output when clean; otherwise one `path:line: reason` line per finding on stdout and one `cairn: lint found N problems` line on stderr, exit 1. Any other argument is a refusal.

- [ ] **Step 1: Append the failing test**

```js
// tests/cli.test.mjs (append; run, makeRepo and main are imported at the top of the file)
test('cairn lint docs/spec prints findings and exits 1, exits 0 when clean, refuses other paths', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  await repo.write('docs/spec/overview.md', '| File | Prefix |\n|---|---|\n| a.md | A |\n');
  await repo.write('docs/spec/roadmap.md', 'Current: x\n\n## x\n\nRequirements: A-001\n');
  await repo.write('docs/spec/a.md', 'Prefix: A\n\n[A-001] x\nFalsifier: f\nMechanism: m\nStatus: Agreed 2026-09-19\n');
  const clean = await run(['lint', 'docs/spec'], repo.dir);
  assert.deepEqual([clean.code, clean.out, clean.err], [0, '', '']);
  await repo.write('docs/spec/a.md', 'Prefix: A\n\n[A-001] x\nStatus: Draft\n');
  const dirty = await run(['lint', 'docs/spec'], repo.dir);
  assert.equal(dirty.code, 1);
  assert.match(dirty.out, /^docs\/spec\/a.md:3: A-001: missing Falsifier:/m);
  assert.match(dirty.err, /^cairn: lint found \d+ problems\n$/);
  const other = await run(['lint', 'docs'], repo.dir);
  assert.equal(other.code, 1); assert.match(other.err, /^cairn: lint takes docs\/spec/);
});
```

- [ ] **Step 2: Run it**

Run: `node --test tests/cli.test.mjs`. Expected: FAIL, `unknown command lint`.

- [ ] **Step 3: Implement**

Add to `lib/cli.mjs`, before `COMMANDS`:

```js
import { lint, SPEC_DIR } from './spec.mjs';

async function lintCommand([target], { cwd, stdout }) {
  if (target !== SPEC_DIR) throw new Refusal(`lint takes ${SPEC_DIR} and nothing else`);
  const findings = await lint(cwd);
  for (const f of findings) stdout.write(`${f.file}:${f.line}: ${f.reason}\n`);
  if (findings.length) throw new Refusal(`lint found ${findings.length} problems`);
}
```

and extend the table:

```js
export const COMMANDS = { show: { usage: 'show <sha>', run: show }, lint: { usage: 'lint docs/spec', run: lintCommand } };
```

- [ ] **Step 4: Run it**

Run: `node --test tests/cli.test.mjs`. Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/cli.mjs tests/cli.test.mjs
git commit -m "Add cairn lint for the specification directory"
```

---

### Task 11: Snapshots read network_exclude from settings

**Files:**
- Modify: `lib/snapshots.mjs` (`writeWorkspaceSnapshot`, `writeInputSnapshot`)
- Test: `tests/snapshots.test.mjs` (append)

**Interfaces:**
- Consumes: `loadSettings`, `SETTINGS_PATH` from `lib/settings.mjs`.
- Produces: `writeWorkspaceSnapshot(cwd, {exclude})` and `writeInputSnapshot(cwd, {mechanism, inputs, exclude})` now default `exclude` to `settings.network_exclude` when `.cairn/settings.json` exists; an explicit `exclude` is still honored; an unreadable settings file throws `SettingsError`.

- [ ] **Step 1: Append the failing test**

```js
// tests/snapshots.test.mjs (append; makeRepo and writeWorkspaceSnapshot are imported at the top of the file)
import { SettingsError } from '../lib/settings.mjs';
import { writeInputSnapshot as writeInput } from '../lib/snapshots.mjs';

test('snapshots refuse untracked paths matched by settings network_exclude', async (t) => {
  const repo = await makeRepo(); t.after(repo.remove);
  const settings = { schema: 1, authority_remote: null, outside: [], source: [], interfaces: [], data: [], network_exclude: ['fixtures/private/**'], signing_key: null, attribution: 'forbidden', harness: {}, typesafeai: { enabled: false, mode: 'shadow', model: null, route_confidence: 0.8, sufficient_threshold: 0.7, outside_threshold: 0.8, contradicts_ceiling: 0.3, reversible_floor: 0.7, observed_floor: 0.6, max_false_downgrade: 0.05, min_calibration_agent_predictions: 60, request_cap_bytes: 48000 } };
  await repo.write('.cairn/settings.json', JSON.stringify(settings)); await repo.write('a.txt', 'a'); await repo.commit('base');
  await repo.write('fixtures/private/k.json', '{}');
  await assert.rejects(writeWorkspaceSnapshot(repo.dir), /fixtures\/private\/k.json \(matches fixtures\/private\/\*\*\)/);
  await assert.rejects(writeInput(repo.dir, { mechanism: 'm', inputs: ['fixtures'] }), /fixtures\/private\/k.json/);
  assert.match(await writeWorkspaceSnapshot(repo.dir, { exclude: [] }), /^[0-9a-f]{40}$/);
  await repo.write('.cairn/settings.json', '{"schema":2}');
  await assert.rejects(writeWorkspaceSnapshot(repo.dir), SettingsError);
});
```

- [ ] **Step 2: Run it**

Run: `node --test tests/snapshots.test.mjs`. Expected: FAIL, the first `assert.rejects` resolves (the snapshot is written).

- [ ] **Step 3: Implement**

In `lib/snapshots.mjs` add the import and a resolver, and use it in both writers:

```js
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { loadSettings, SETTINGS_PATH } from './settings.mjs';

async function resolveExclude(cwd, exclude) {
  if (exclude !== undefined) return exclude;
  try { await access(join(cwd, SETTINGS_PATH)); } catch { return []; }
  return (await loadSettings(cwd)).settings.network_exclude;
}
export async function writeWorkspaceSnapshot(cwd, { exclude } = {}) {
  const { tracked, untracked } = await listPaths(cwd);
  refuseSensitive(untracked, await resolveExclude(cwd, exclude));
  return writeSnapshot(cwd, { kind: 'workspace' }, [...tracked, ...untracked]);
}
export async function writeInputSnapshot(cwd, { mechanism, inputs, exclude }) {
  if (!Array.isArray(inputs) || inputs.length === 0) throw new SnapshotError('an input snapshot needs at least one declared input');
  const { tracked, untracked } = await listPaths(cwd, inputs);
  refuseSensitive(untracked, await resolveExclude(cwd, exclude));
  return writeSnapshot(cwd, { kind: 'input', mechanism, inputs: [...inputs] }, [...tracked, ...untracked]);
}
```

Plan 03's `cairn init` makes the settings file mandatory; until then an absent file means only the built-in credential patterns apply.

- [ ] **Step 4: Run it**

Run: `node --test tests/*.test.mjs`. Expected: PASS, every file.

- [ ] **Step 5: Commit**

```bash
git add lib/snapshots.mjs tests/snapshots.test.mjs
git commit -m "Apply the settings network_exclude list when writing snapshots"
```

---

## Spec coverage

| Spec sentence (section) | Task |
|---|---|
| Reserved paths are kernel constants; protected (`docs/spec/**` except the roadmap) and kernel-managed classes; `.cairn/output/` (2, Paths and authority) | 1, 3 |
| Every repository path is UTF-8, slash-separated, relative; rejects absolute, `.git` root, empty components, `.`, `..`, NUL, backslash, escape after resolution (2) | 1 |
| Globs match entry paths, never symlink targets (2) | 2 (matcher), plan 01 task 9 test (symlink entry) |
| Only a header's `Host paths:` may name absolute or home-relative paths; Cairn reads the field and never scans block text (2) | 6 (`hostPaths` parsed from the header only) |
| Specification files, keystone with spec map, glossary, roadmap with `Current:` and per-section `Requirements:` (2, The hand-written tree) | 7, 8 |
| Requirement block fields; `Scope: every commitment` contributes Agreed blocks at start (2) | 6, 9 |
| Status values; Retired identifiers never reused; only Agreed blocks digested and checked; a commitment names only Agreed requirements (2) | 6, 8, 9 |
| Settings fields and the shape shown once (2, Settings) | 4 (the shape is the fixture) |
| Every refusal in "The kernel refuses an unknown settings schema or field ..." including route-mode versioned model, unknown values fail closed, `weights` and `code_tiers` (2) | 4 (one test each) |
| Block grammar: begins at `[PREFIX-nnn]` at the margin, ends at a blank line, field order, digest of identifier + obligation + falsifier after normalization; header fields; other prose ignored (4) | 6 |
| Lint refuses broken order, duplicate or reused identifiers, absent references, missing falsifiers, Agreed without mechanism, noncanonical dates, spec map mismatch (4) | 8, 10 |
| Roadmap parser reads only `Current:` and `Requirements:` (4) | 7 |
| A block holds identifier, obligation, falsifier, mechanism, one optional rationale line and status (7) | 6 (second Rationale is a problem) |
| Snapshots refuse untracked `network_exclude` matches (2, Snapshots and refs) | 11 |

Left to other plans: developer authorization of protected paths and `cairn init` creating or adopting settings (plan 03); kernel-managed mutation exemption and scope breach (plan 07); `documents` declared in mechanisms and mechanism inputs passed to `validateSettings` (plan 05); a current passing calibration passed to `validateSettings` and the policy digest (plan 11); the working agreement template (plan 13); `cairn start` resolving the set before writing (plan 06 calls `requirementSet`); Host paths never copied into a projection or model request (plans 10 and 11).
