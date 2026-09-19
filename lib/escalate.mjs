// lib/escalate.mjs
import { canonicalize, sha256 } from './canon.mjs';
import { appendRecord, readLog, range } from './records.mjs';
import { loadSettings } from './settings.mjs';
import { decide } from './adr.mjs';
import { item, outside } from './commitment.mjs';
import { authenticateDeveloper, verifyEvidence } from './auth.mjs';
import { appendDecision } from './adr.mjs';

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
// Fix round 1 finding 8: \x7f-\x9f (DEL plus the whole C1 control block, which includes U+0085
// NEL) and U+2028/U+2029 (LINE SEPARATOR, PARAGRAPH SEPARATOR) added -- without them a "one
// non-empty line" field could carry a Unicode line terminator the terminal renders as a line
// break, which the C0-only check never caught. An ordinary Unicode character that is not a line
// terminator, such as U+00A0 (non-breaking space), is unaffected.
const BAD_CHARS = /[\x00-\x08\x0a-\x1f\x7f-\x9f\u2028\u2029]/;

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

const FINDING_KINDS = new Set(['review', 'report', 'acceptance']);
const RECORD_KIND = { item: 'item', breach: 'scope-breach', transaction: 'command-intent' };

export function escalationsFor(log, slug) { return log.filter((r) => r.kind === 'escalation' && r.payload.slug === slug); }

export function openRange(log, slug) {
  const r = range(log);
  if (!r.start || r.closed || r.start.payload.slug !== slug) throw new DraftError(`cairn: no open commitment ${slug}`);
  return r;
}

export function checkConcerns(d, log, r) {
  for (const token of d.concerns) {
    const c = parseConcern(token);
    if (c.kind === 'requirement' && !r.start.payload.requirements.some((q) => q.requirement === c.ref)) throw new DraftError(`cairn: ${c.ref} is not in the frozen set`);
    if (c.kind === 'finding') {
      const src = r.records.find((x) => x.sha === c.ref);
      if (!src) throw new DraftError(`cairn: no record ${c.ref} in the open range`);
      if (!FINDING_KINDS.has(src.kind) || !src.payload.findings.some((f) => f.n === c.n)) throw new DraftError(`cairn: ${c.ref} has no finding ${c.n}`);
    }
    if (RECORD_KIND[c.kind] && !log.some((x) => x.sha === c.ref && x.kind === RECORD_KIND[c.kind])) throw new DraftError(`cairn: no ${RECORD_KIND[c.kind]} record ${c.ref}`);
  }
}

// The escalation record's payload shape, in one place: escalate() (validated, concern-checked)
// and lib/cycle.mjs's writeCycleEscalation (a cycle escalation, which targets no open commitment
// when none is open and carries no concern token to check) both write through this, so neither
// duplicates the field list or the 'escalation' kind name.
export function writeEscalation(cwd, target, fields) {
  const payload = { slug: target, concerns: Array.isArray(fields.concerns) ? fields.concerns.join(' ') : fields.concerns, evaluation: fields.evaluation ?? null };
  for (const f of FIELDS) payload[f] = fields[f];
  return appendRecord(cwd, 'escalation', target, payload);
}

export async function escalate(cwd, draft) {
  const d = validateDraft(draft);
  const log = await readLog(cwd);
  checkConcerns(d, log, openRange(log, d.commitment));
  return writeEscalation(cwd, d.commitment, d);
}

export function decisionFields(d) {
  return { title: d.question, rests_on: [d.because], wrong_if: d.if_wrong, body: `${d.recommendation} Instead: ${d.instead}`, named_paths: d.named_paths };
}

export async function decideConsequential(cwd, draft) {
  const d = validateDraft(draft);
  const log = await readLog(cwd);
  checkConcerns(d, log, openRange(log, d.commitment));
  return decide(cwd, { ...decisionFields(d), by: 'agent', evaluation: d.evaluation ?? null }, 'decide');
}

export async function escalateWithRoute(cwd, draft, opts = {}) {
  const d = validateDraft(draft);
  const { settings } = await loadSettings(cwd);
  const log = await readLog(cwd);
  checkConcerns(d, log, openRange(log, d.commitment));
  if (!(settings.typesafeai && settings.typesafeai.enabled === true)) return { route: 'developer', sha: await escalate(cwd, d) };
  const evaluate = opts.evaluate ?? (await import('./evaluate.mjs')).evaluate;
  const { route, evaluationSha } = await evaluate(cwd, d, { transport: opts.transport });
  if (route === 'developer') return { route, sha: await escalate(cwd, { ...d, evaluation: evaluationSha }) };
  if (route === 'agent') {
    await decide(cwd, { ...decisionFields(d), by: 'agent', evaluation: evaluationSha }, 'escalate');
    return { route, sha: evaluationSha };
  }
  if (route === 'capture') {
    const itemSha = await item(cwd, { kind: 'backlog', slug: d.commitment, source: d.concerns[0], body: d.recommendation });
    return { route, sha: await outside(cwd, itemSha, 'the evaluator recommended capture', { evaluation: evaluationSha }) };
  }
  throw new DraftError(`cairn: evaluation ${evaluationSha} named an unknown route ${route}`);
}

const ANSWER_KINDS = ['ok', 'instead', 'ask'];

export function escalationState(log, escalationSha) {
  const i = log.findIndex((r) => r.sha === escalationSha);
  const after = log.slice(i + 1).filter((r) => (r.kind === 'answer' || r.kind === 'reply') && r.payload.escalation === escalationSha);
  const answers = after.filter((r) => r.kind === 'answer');
  const final = answers.find((a) => a.payload.kind !== 'ask') ?? null;
  if (final) return { status: 'answered', answers, final, lastAsk: null };
  const last = after.at(-1) ?? null;
  const lastAsk = last && last.kind === 'answer' ? last : null;
  return { status: lastAsk ? 'asked' : 'open', answers, final: null, lastAsk };
}

export function unanswered(log) {
  return log.filter((r) => r.kind === 'escalation').flatMap((e) => {
    const st = escalationState(log, e.sha);
    return st.status === 'answered' ? [] : [{ sha: e.sha, target: e.target, payload: e.payload, awaiting: st.status === 'asked' ? 'reply' : 'answer' }];
  });
}

function pickOpen(log, slug, wanted) {
  const open = unanswered(log).filter((u) => u.payload.slug === slug && (!wanted || u.sha === wanted));
  if (open.length === 0) throw new DraftError(`cairn: no unanswered escalation for ${slug}${wanted ? ` at ${wanted}` : ''}`);
  return open[0];
}

export async function answer(cwd, slug, kind, text = '', opts = {}) {
  if (!ANSWER_KINDS.includes(kind)) throw new DraftError('cairn: answer kind must be ok, instead or ask');
  if (typeof text !== 'string') throw new DraftError('cairn: answer text must be a string');
  if (kind !== 'ok' && text.trim() === '') throw new DraftError(`cairn: answer ${kind} needs text`);
  const { settings } = await loadSettings(cwd);
  const log = await readLog(cwd);
  const esc = pickOpen(log, slug, opts.escalation);
  if (esc.awaiting === 'reply') throw new DraftError(`cairn: ${slug} awaits the agent's reply to your question`);
  // Deviation from the plan text: the plan's own snippet reshaped authenticateDeveloper's result
  // into {mode, author: ev.author ?? '', signature: ev.signature ?? null} before storing it. That
  // shape fails the answer record's real evidence schema (lib/records.mjs's discriminated-union
  // `evidence`, shared with 'authorization' and 'read'): the 'unsigned-local' branch has no
  // `signature` key and requires `purpose`/`subject`/`nonce`/`author: {name, email}`/`confirmed`;
  // the 'signed' branch has no bare `author` key. authenticateDeveloper's return value already
  // matches that schema exactly, so it is stored as-is.
  // Fix round 1 finding 1: `opts.nonce` is now forwarded, the same as authorize() and
  // readDecision() already do. Without it, a signed project's two-round CLI flow (run 1 prints
  // the payload with a fresh nonce; run 2 signs that exact payload and passes --nonce back) never
  // verifies: authenticateDeveloper generated a NEW random nonce on every call, so the signature
  // from run 1's payload never matched run 2's freshly-baked one.
  const evidence = await authenticateDeveloper(cwd, settings, { purpose: 'answer', subject: esc.sha, confirm: opts.confirm, sign: opts.sign, nonce: opts.nonce });
  // Fix round 1 finding 7: re-check the evidence with verifyEvidence right after
  // authenticateDeveloper, the same defence-in-depth authorize() and readDecision() already apply
  // (lib/auth.mjs:164, 277). No live hole today -- authenticateDeveloper itself already verifies a
  // signature and always returns confirmed: true for unsigned-local -- but this closes the same
  // seam consistently across every developer-only write.
  if (!verifyEvidence(settings, evidence, { purpose: 'answer', subject: esc.sha })) throw new DraftError('cairn: developer evidence does not verify');
  const sha = await appendRecord(cwd, 'answer', slug, { escalation: esc.sha, kind, text, owner: opts.owner ?? null, evidence });
  if (kind !== 'ask') await appendDecision(cwd, { kind: 'answered', escalation: esc.sha, answer: sha }, { command: 'answer' });
  return sha;
}

export async function reply(cwd, slug, text, opts = {}) {
  if (typeof text !== 'string' || text.trim() === '') throw new DraftError('cairn: reply needs text');
  const log = await readLog(cwd);
  const asked = unanswered(log).filter((u) => u.payload.slug === slug && u.awaiting === 'reply' && (!opts.escalation || u.sha === opts.escalation));
  if (asked.length === 0) throw new DraftError(`cairn: ${slug} has no open ask to reply to`);
  return appendRecord(cwd, 'reply', slug, { escalation: asked[0].sha, text });
}

export async function dispute(cwd, { commitment, record, n, question, recommendation, because, if_wrong, instead }) {
  return escalate(cwd, { commitment, concerns: [`finding:${record}#${n}`], question, recommendation, because, if_wrong, instead, options: [], named_paths: [], cited_decisions: [] });
}

export function disputes(log, record, n) {
  const e = log.find((x) => x.kind === 'escalation' && x.payload.concerns === `finding:${record}#${n}` && escalationState(log, x.sha).status === 'answered');
  return e ? e.sha : null;
}

export function concerns(log, token) {
  return log.filter((e) => e.kind === 'escalation' && e.payload.concerns.split(' ').includes(token));
}
export function escalatedRequirement(log, req) { return concerns(log, req).length > 0; }

const FLAG_TO_FIELD = { '--commitment': 'commitment', '--question': 'question', '--recommendation': 'recommendation', '--because': 'because', '--if-wrong': 'if_wrong', '--instead': 'instead' };
const LIST_FLAGS = { '--concern': 'concerns', '--option': 'options', '--path': 'named_paths', '--decision': 'cited_decisions' };

export function parseEscalateArgs(argv) {
  const d = { concerns: [], options: [], named_paths: [], cited_decisions: [] };
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i], val = argv[i + 1];
    if (val === undefined) throw new DraftError(`cairn: ${flag} needs a value`);
    if (FLAG_TO_FIELD[flag]) d[FLAG_TO_FIELD[flag]] = val;
    else if (LIST_FLAGS[flag]) d[LIST_FLAGS[flag]].push(val);
    else throw new DraftError(`cairn: unknown flag ${flag}`);
  }
  for (const [flag, f] of Object.entries(FLAG_TO_FIELD)) if (!(f in d)) throw new DraftError(`cairn: missing ${flag}`);
  return validateDraft(d);
}

function splitFlags(argv) {
  const pos = [], named = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) { named[argv[i].slice(2).replace(/-/g, '_')] = argv[i + 1]; i++; } else pos.push(argv[i]);
  }
  return { pos, named };
}

const asCli = (fn) => async (cwd, argv, opts = {}) => {
  try { return { code: 0, out: await fn(cwd, argv, opts) }; }
  catch (e) { return { code: 1, out: (e.message.startsWith('cairn: ') ? e.message : `cairn: ${e.message}`) + '\n' }; }
};

export const cliEscalate = asCli(async (cwd, argv) => `cairn: escalation ${parseEscalateArgs(argv).commitment} ${await escalate(cwd, parseEscalateArgs(argv))}\n`);
export const cliAnswer = asCli(async (cwd, argv, opts) => {
  const { pos: [slug, kind, ...text], named } = splitFlags(argv);
  return `cairn: answer ${slug} ${await answer(cwd, slug, kind, text.join(' '), { ...opts, escalation: named.escalation })}\n`;
});
export const cliReply = asCli(async (cwd, argv) => {
  const { pos: [slug, ...text], named } = splitFlags(argv);
  return `cairn: reply ${slug} ${await reply(cwd, slug, text.join(' '), { escalation: named.escalation })}\n`;
});
export const cliDispute = asCli(async (cwd, argv) => {
  const { named } = splitFlags(argv);
  return `cairn: escalation ${named.commitment} ${await dispute(cwd, { ...named, n: Number(named.n) })}\n`;
});
