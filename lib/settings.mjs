import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { validateGlob, matchGlob, RESERVED, PathError } from './paths.mjs';
import { canonicalize, sha256 } from './canon.mjs';
import { git } from './gitx.mjs';

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
