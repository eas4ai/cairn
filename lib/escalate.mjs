// lib/escalate.mjs
import { canonicalize, sha256 } from './canon.mjs';

export class DraftError extends Error {}
export const FIELDS = ['question', 'recommendation', 'because', 'if_wrong', 'instead'];
export const DRAFT_KEYS = ['commitment', 'concerns', ...FIELDS, 'options', 'named_paths', 'cited_decisions'];
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SHA = /^[0-9a-f]{40}$/;
const REQ = /^[A-Z][A-Z0-9]*-[0-9]{3,}$/;
// Deviation from the plan text: the plan's BAD_CHARS (/[\x00-\x1f\x7f]/) blocks every C0 control
// character, including a horizontal tab (0x09). Task 8's own test puts a literal tab inside the
// `because` field and asserts it survives to the terminal byte for byte, so a tab must validate.
// Narrowed to exclude 0x09 while still refusing newline, carriage return and other controls --
// a tab is a character within one line, not a line separator, so "one non-empty line" still holds.
const BAD_CHARS = /[\x00-\x08\x0a-\x1f\x7f]/;

function oneLine(name, v) {
  if (typeof v !== 'string' || v.trim() === '' || BAD_CHARS.test(v)) throw new DraftError(`cairn: draft field ${name} must be one non-empty line`);
  return v;
}

export function parseConcern(token) {
  if (typeof token !== 'string' || token === '' || /\s/.test(token)) throw new DraftError(`cairn: concern token ${JSON.stringify(token)} is malformed`);
  if (token === 'cycle') return { kind: 'cycle', ref: null, n: null };
  if (REQ.test(token)) return { kind: 'requirement', ref: token, n: null };
  const m = /^(finding|item|breach|transaction|contract):(.+?)(?:#([1-9][0-9]*))?$/.exec(token);
  if (!m) throw new DraftError(`cairn: concern token ${token} is malformed`);
  const [, kind, ref, n] = m;
  if (kind !== 'contract' && !SHA.test(ref)) throw new DraftError(`cairn: concern token ${token} needs a log SHA`);
  if ((kind === 'finding') !== (n !== undefined)) throw new DraftError(`cairn: concern token ${token}: only finding takes #n`);
  return { kind, ref, n: n === undefined ? null : Number(n) };
}

export function validateDraft(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) throw new DraftError('cairn: draft must be an object');
  for (const k of Object.keys(d)) if (!DRAFT_KEYS.includes(k) && k !== 'evaluation') throw new DraftError(`cairn: draft has unknown field ${k}`);
  for (const k of DRAFT_KEYS) if (!(k in d)) throw new DraftError(`cairn: draft is missing ${k}`);
  if (typeof d.commitment !== 'string' || !SLUG.test(d.commitment)) throw new DraftError('cairn: draft commitment must be a slug');
  for (const f of FIELDS) oneLine(f, d[f]);
  if (!Array.isArray(d.concerns) || d.concerns.length === 0) throw new DraftError('cairn: draft needs at least one concern');
  d.concerns.forEach(parseConcern);
  for (const k of ['options', 'named_paths', 'cited_decisions']) {
    if (!Array.isArray(d[k]) || !d[k].every((s) => typeof s === 'string')) throw new DraftError(`cairn: draft ${k} must be a list of strings`);
  }
  if ('evaluation' in d && d.evaluation !== null && !SHA.test(d.evaluation)) throw new DraftError('cairn: draft evaluation must be a log SHA');
  return d;
}

export function draftDigest(d) {
  const { evaluation, ...ten } = validateDraft(d);
  return sha256(canonicalize(ten));
}
