import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { validateGlob, RESERVED, PathError, CREDENTIAL_PATTERNS } from './paths.mjs';
import { canonicalize, sha256 } from './canon.mjs';
import { git } from './gitx.mjs';
import { readLog } from './records.mjs';

export class SettingsError extends Error { constructor(reasons) { super(`settings refused: ${reasons.join('; ')}`); this.name = 'SettingsError'; this.reasons = reasons; } }
export const SETTINGS_SCHEMA = 1;
const TOP = ['schema', 'authority_remote', 'outside', 'source', 'interfaces', 'data', 'network_exclude', 'signing_key', 'attribution', 'harness', 'typesafeai'];
const HARNESS = ['adversary_model', 'adversary_transport'];
const THRESHOLDS = ['route_confidence', 'sufficient_threshold', 'outside_threshold', 'contradicts_ceiling', 'reversible_floor', 'observed_floor', 'max_false_downgrade'];
const EVAL = ['enabled', 'mode', 'model', ...THRESHOLDS, 'min_calibration_agent_predictions', 'request_cap_bytes'];
const REMOVED = ['weights', 'code_tiers'];
const SECRET_KEY = /(secret|token|password|passwd|api_?key|private_?key|credential)/i;
// AKIA (AWS access key ID) has no separator after the prefix: AKIA followed by 16 upper-case
// alphanumerics, not AKIA-<token> or AKIA_<token>. The long-token alternative is restricted to
// values that mix letters and digits with no dots or hyphens, so a dotted/hyphenated version
// string such as a model id (claude-fable-5-1, jev-1.13.0) is never secret-shaped.
const SECRET_VALUE = /^(-----BEGIN|(sk|pk|tsk|ghp|gho|xox[abps])[-_][A-Za-z0-9_-]{10,}$|AKIA[0-9A-Z]{16}$|(?=[A-Za-z0-9_]{32,}$)(?=[A-Za-z0-9_]*[A-Za-z])(?=[A-Za-z0-9_]*[0-9])[A-Za-z0-9_]{32,}$)/;
const REMOTE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/, VERSIONED = /^[a-z][a-z0-9]*-\d+\.\d+\.\d+$/;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Two single-segment wildcard patterns (chars, '*' = 0+ chars, '?' = exactly 1 char) intersect
// when some string matches both. Classic two-pattern wildcard-matching DP: at every position
// where either side is '*', try consuming zero or one more unit from the other side.
function segIntersect(pa, pb) {
  const memo = new Map();
  const dp = (i, j) => {
    const key = i + ',' + j;
    if (memo.has(key)) return memo.get(key);
    let result;
    if (i === pa.length && j === pb.length) result = true;
    else if (i < pa.length && pa[i] === '*') result = dp(i + 1, j) || (j < pb.length && dp(i, j + 1));
    else if (j < pb.length && pb[j] === '*') result = dp(i, j + 1) || (i < pa.length && dp(i + 1, j));
    else if (i === pa.length || j === pb.length) result = false;
    else if (pa[i] === '?' || pb[j] === '?') result = dp(i + 1, j + 1);
    else result = pa[i] === pb[j] && dp(i + 1, j + 1);
    memo.set(key, result);
    return result;
  };
  return dp(0, 0);
}
// Full glob-vs-glob intersection over '/'-separated segments, '**' matching zero or more whole
// segments. Two patterns overlap when some path matches both, not merely when one pattern's
// literal stem lies under the other's: a wildcard-leading pattern like '**/*.json' has no literal
// stem at all, so a stem-only comparison never catches it matching a reserved path.
export function overlaps(a, b) {
  if (a === b) return true;
  const aSegs = a.split('/'), bSegs = b.split('/');
  const memo = new Map();
  const go = (i, j) => {
    const key = i + ',' + j;
    if (memo.has(key)) return memo.get(key);
    let result;
    if (i === aSegs.length && j === bSegs.length) result = true;
    else if (i === aSegs.length) result = bSegs.slice(j).every((s) => s === '**');
    else if (j === bSegs.length) result = aSegs.slice(i).every((s) => s === '**');
    else if (aSegs[i] === '**') result = go(i + 1, j) || go(i, j + 1);
    else if (bSegs[j] === '**') result = go(i, j + 1) || go(i + 1, j);
    else result = segIntersect(aSegs[i], bSegs[j]) && go(i + 1, j + 1);
    memo.set(key, result);
    return result;
  };
  return go(0, 0);
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
  // A documents entry is a path: a glob with no wildcards. overlaps(d, g) is exactly the
  // containment test here, because a bare wildcard-free path only ever overlaps a glob that
  // matches it or something under it (source nested under documents, e.g. documents: ['docs']
  // with source: ['docs/lib/**'], does not overlap, since 'docs' alone never matches a string
  // under 'docs/lib/'). A stem-only comparison (the earlier fix) missed a wildcard-leading
  // source root such as '**/lib/**', which has no literal stem at all.
  for (const d of documents) for (const g of source) if (overlaps(d, g)) out.push(`documents ${d} lies below source ${g}`);
  if (s.authority_remote !== null && (typeof s.authority_remote !== 'string' || !REMOTE.test(s.authority_remote))) out.push('authority remote must be a remote name or null');
  else if (s.authority_remote !== null && remotes && !remotes.includes(s.authority_remote)) out.push(`authority remote ${s.authority_remote} is not a configured remote`);
  if (!['forbidden', 'allowed'].includes(s.attribution)) out.push('attribution must be forbidden or allowed');
  if (!isObj(s.harness)) out.push('harness must be an object');
  // A harness entry of null names a supported harness with no pinned model or transport (section 9:
  // "A null or unknown entry means any model"); it is distinct from the key being absent entirely,
  // which lib/review.mjs's detectHarness refuses as "no settings entry".
  else for (const [name, h] of Object.entries(s.harness)) {
    if (h === null) continue;
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

export const SETTINGS_PATH = '.cairn/settings.json';

// Fix round 3 (plan 11 review): POLICY and policyDigest moved here from lib/evaluate.mjs. They are
// needed by loadSettings itself now (below), which must not take a static dependency on
// lib/evaluate.mjs: lib/evaluate.mjs already statically imports from lib/adr.mjs (readAdr, queue,
// adrDigest), and lib/adr.mjs and lib/scope.mjs both already statically import from this file, so
// the reverse edge (settings.mjs -> evaluate.mjs) would close a cycle
// (settings.mjs -> evaluate.mjs -> adr.mjs -> settings.mjs, and similarly through scope.mjs).
// Hosting POLICY/policyDigest here instead closes nothing: this file has no dependency on
// lib/evaluate.mjs, lib/adr.mjs or lib/scope.mjs. lib/evaluate.mjs re-exports both names so nothing
// that already imports POLICY/policyDigest from lib/evaluate.mjs needed to change.
// Verified with `node --input-type=module -e "import('./lib/wake.mjs')"` (the coordinator's own
// check) and the same for lib/scope.mjs, lib/adr.mjs, lib/evaluate.mjs and lib/escalate.mjs: all
// five still load cleanly after this change.
// DRAFT_KEYS is deliberately not part of this POLICY object: policyDigest below never uses it (the
// canonical draft's field names are not part of the evaluator's policy), and it belongs to
// lib/escalate.mjs's own canonical draft, which this file must not statically depend on (that
// would be settings.mjs -> escalate.mjs -> settings.mjs, a cycle, since escalate.mjs already
// statically imports loadSettings from here). lib/evaluate.mjs's own re-exported POLICY composes
// this object with escalate.mjs's DRAFT_KEYS instead.
export const POLICY = Object.freeze({
  RULE: 'Cairn code rule: a Consequential draft stays the agent\'s decision only when every option gate passes and the owner answer is agent at or above route_confidence. Data, contract, agreement, reserved or settings writes, a fourth attempt, a scope ruling, a missing recommendation and an incomplete authority projection are the developer\'s without a call.',
  ENVELOPE: 'protected->developer; oversize->developer; call fails->developer; invalid answer->developer; sufficient<t->developer; outside_n>=t->capture n; contradicts_n>=c->developer; reversible_n<f->developer; observed<f->developer; owner=agent and confidence>=r->agent; otherwise->developer',
  CONSTRUCTION: 1, ROUTER: 1,
  LIMITS: Object.freeze({ requestTokens: 64000, stateTokens: 32000, bytesPerToken: 3, factor: 0.75 }),
  QUESTIONS: Object.freeze([
    { id: 'sufficient', type: 'noul', call: 'option', text: 'Does the state suffice for every option gate?' },
    { id: 'reversible_n', type: 'noul', call: 'option', text: 'Can option n be reverted without migration, data repair or caller change?' },
    { id: 'contradicts_n', type: 'noul', call: 'option', text: 'Does option n contradict the frozen contract or a cited decision?' },
    { id: 'outside_n', type: 'noul', call: 'option', text: 'Is option n outside the frozen requirement set?' },
    { id: 'observed', type: 'noul', call: 'option', text: 'Does because cite an observed command, path or output?' },
    { id: 'owner', type: 'choice', call: 'owner', text: 'Do closed facts assign this to agent or developer?',
      criteria: { agent: 'The closed facts and contract let the agent decide and queue this for later review', developer: 'The decision is the developer\'s' } },
  ]),
});

export function policyDigest(settings) {
  const t = settings.typesafeai;
  return sha256(canonicalize({
    model: t.model, questions: POLICY.QUESTIONS, construction: POLICY.CONSTRUCTION, rule: POLICY.RULE,
    envelope: POLICY.ENVELOPE, router: POLICY.ROUTER,
    thresholds: Object.fromEntries(THRESHOLDS.map((k) => [k, t[k]])),
    caps: { request_cap_bytes: t.request_cap_bytes, ...POLICY.LIMITS },
    egress: { network_exclude: [...settings.network_exclude], credential: [...CREDENTIAL_PATTERNS] },
  }));
}

// The one place that checks whether a passing calibration exists for a settings object's exact
// current policy digest. Never throws: a malformed settings object (missing network_exclude,
// non-object typesafeai, ...) makes this resolve to false rather than crash loadSettings below --
// validateSettings reports the real, specific reason on its own terms right afterward.
export async function hasPassingCalibration(cwd, settings) {
  try {
    const policy = policyDigest(settings);
    const log = await readLog(cwd);
    return log.some((r) => r.kind === 'calibration' && r.payload.policy_digest === policy && r.payload.result === 'pass');
  } catch { return false; }
}

// Fix round 3 (plan 11 review): loadSettings itself is now calibration-aware, so every one of its
// ~34 call sites across the kernel (lib/wake.mjs's readState, lib/snapshots.mjs's
// writeWorkspaceSnapshot, lib/auth.mjs's protectedDigests, and everywhere else) reads a route-mode
// project correctly without needing its own copy of this check, or even knowing route mode exists.
// Fix rounds 1-2's loadSettingsFull (a second, parallel function every caller had to remember to
// call instead of loadSettings) is gone; callers that used it now call loadSettings(cwd) plain.
// `opts.calibration`, if a caller passes it explicitly (a test, typically), is still honored
// unchanged and skips this computation entirely -- this is the one remaining hook for injecting a
// calibration result without a real calibration record on the log.
export async function loadSettings(cwd, opts = {}) {
  let text;
  try { text = await readFile(join(cwd, SETTINGS_PATH), 'utf8'); }
  catch (e) {
    if (e.code === 'ENOENT') throw new SettingsError([`no ${SETTINGS_PATH}; run cairn init`]);
    throw new SettingsError([`${SETTINGS_PATH} is not readable: ${e.code}`]);
  }
  let settings;
  try { settings = JSON.parse(text); } catch (e) { throw new SettingsError([`${SETTINGS_PATH} is not valid JSON: ${e.message}`]); }
  let calibration = opts.calibration;
  if (calibration === undefined && isObj(settings) && isObj(settings.typesafeai) && settings.typesafeai.mode === 'route') {
    calibration = { pass: await hasPassingCalibration(cwd, settings) };
  }
  const remotes = (await git(['remote'], { cwd })).stdout.split('\n').filter(Boolean);
  const reasons = validateSettings(settings, { remotes, ...opts, calibration });
  if (reasons.length) throw new SettingsError(reasons);
  return { settings, digest: sha256(canonicalize(settings)) };
}
