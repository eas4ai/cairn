// lib/escalate.mjs
import { canonicalize, sha256 } from './canon.mjs';
import { appendRecord, readLog, range } from './records.mjs';
import { layoutOf } from './layout.mjs';
import { loadSettings } from './settings.mjs';
import { decide, readAdr } from './adr.mjs';
import { authenticateDeveloper, verifyEvidence, evidenceSettings } from './auth.mjs';
import { appendDecision } from './adr.mjs';
import { CasError } from './gitx.mjs';

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
  if (typeof v !== 'string' || v.trim() === '' || BAD_CHARS.test(v)) throw new DraftError(`sudus: draft field ${name} must be one non-empty line`);
  return v;
}

export function parseConcern(token) {
  if (typeof token !== 'string' || token === '' || /\s/.test(token)) throw new DraftError(`sudus: concern token ${JSON.stringify(token)} is malformed`);
  if (token === 'cycle') return { kind: 'cycle', ref: null, n: null };
  if (REQ.test(token)) return { kind: 'requirement', ref: token, n: null };
  const m = /^(finding|item|breach|transaction|contract|decision):(.+?)(?:#([1-9][0-9]*))?$/.exec(token);
  if (!m) throw new DraftError(`sudus: concern token ${token} is malformed`);
  const [, kind, ref, n] = m;
  if (kind === 'decision' && !/^[0-9A-HJKMNP-TV-Z]{26}$/.test(ref)) throw new DraftError(`sudus: concern token ${token} needs a decision id`);
  if (kind !== 'contract' && kind !== 'decision' && !SHA.test(ref)) throw new DraftError(`sudus: concern token ${token} needs a log SHA`);
  if ((kind === 'finding') !== (n !== undefined)) throw new DraftError(`sudus: concern token ${token}: only finding takes #n`);
  return { kind, ref, n: n === undefined ? null : Number(n) };
}

export function validateDraft(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) throw new DraftError('sudus: draft must be an object');
  for (const k of Object.keys(d)) if (!DRAFT_KEYS.includes(k) && k !== 'evaluation') throw new DraftError(`sudus: draft has unknown field ${k}`);
  for (const k of DRAFT_KEYS) if (!(k in d)) throw new DraftError(`sudus: draft is missing ${k}`);
  if (typeof d.commitment !== 'string' || !SLUG.test(d.commitment)) throw new DraftError('sudus: draft commitment must be a slug');
  for (const f of FIELDS) oneLine(f, d[f]);
  if (!Array.isArray(d.concerns) || d.concerns.length === 0) throw new DraftError('sudus: draft needs at least one concern');
  d.concerns.forEach(parseConcern);
  for (const k of ['options', 'named_paths', 'cited_decisions']) {
    if (!Array.isArray(d[k]) || !d[k].every((s) => typeof s === 'string')) throw new DraftError(`sudus: draft ${k} must be a list of strings`);
  }
  if ('evaluation' in d && d.evaluation !== null && !SHA.test(d.evaluation)) throw new DraftError('sudus: draft evaluation must be a log SHA');
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
  if (!r.start || r.closed || r.start.payload.slug !== slug) throw new DraftError(`sudus: no open commitment ${slug}`);
  return r;
}

export function checkConcerns(d, log, r) {
  for (const token of d.concerns) {
    const c = parseConcern(token);
    if (c.kind === 'requirement' && !r.start.payload.requirements.some((q) => q.requirement === c.ref)) throw new DraftError(`sudus: ${c.ref} is not in the frozen set`);
    if (c.kind === 'finding') {
      // Issue #22: a finding a supersession carried in sits before the range. Wake names its
      // resolution "or an escalation disputes it", so an escalation may concern it too.
      const carried = log.some((x) => x.kind === 'superseded' && x.payload.carried.includes(c.ref));
      const src = r.records.find((x) => x.sha === c.ref) ?? (carried ? log.find((x) => x.sha === c.ref) : undefined);
      if (!src) throw new DraftError(`sudus: no record ${c.ref} in the open range or carried into it`);
      if (!FINDING_KINDS.has(src.kind) || !src.payload.findings.some((f) => f.n === c.n)) throw new DraftError(`sudus: ${c.ref} has no finding ${c.n}`);
    }
    if (RECORD_KIND[c.kind] && !log.some((x) => x.sha === c.ref && x.kind === RECORD_KIND[c.kind])) throw new DraftError(`sudus: no ${RECORD_KIND[c.kind]} record ${c.ref}`);
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

// Task 3 (plan 16): a Consequential decide() is the agent's own judgment call, and section 5's
// floor-and-veto carve-out ("nothing routes a floor-caught or vetoed draft to the agent") means
// that judgment is only ever reached past a current, composite-outcome measurement --
// currentMeasurement (lib/evaluate.mjs) is the sole source of truth for which measurement (if
// any) covers this exact draft; floor, veto, unavailable and indeterminate all mean code, not the
// agent, already decided the draft is the developer's. `suggested` is advisory only (section 10:
// "The suggestion is advisory, not a route") and is never checked here -- the agent may decide on
// a `suggested: developer` composite measurement too.
//
// lib/evaluate.mjs imports validateDraft/draftDigest/parseConcern/DraftError/DRAFT_KEYS from this
// file (its own re-export of normalizeDraft etc., plan 15 task 3), so a static top-level import of
// lib/evaluate.mjs here would be a real circular import, not merely one that looks circular.
// Dynamic, function-body import avoids it -- the same pattern lib/cli.mjs's escalateCommand/
// calibrateCommand already use to reach into these two modules, and the pattern this function's
// own superseded evaluate()-based version used before design decisions 55/56 replaced it (the old
// version, and the equally superseded escalateWithRoute alongside it, are gone outright -- plan
// 16 Task 4 fix round 1 -- not carried forward or stubbed).
export async function decideConsequential(cwd, draft) {
  const d = validateDraft(draft);
  const log = await readLog(cwd);
  checkConcerns(d, log, openRange(log, d.commitment));
  const { currentMeasurement } = await import('./evaluate.mjs');
  const m = await currentMeasurement(cwd, d);
  if (m.payload.outcome !== 'composite') {
    throw new DraftError(`sudus: measurement ${m.sha} routes to the developer (${m.payload.outcome}); sudus escalate --consequential instead of deciding`);
  }
  return decide(cwd, { ...decisionFields(d), by: 'agent', evaluation: m.sha }, 'decide');
}

// Task 4 (plan 16): escalateConsequential is the other half of the measured work-loop draft
// pair alongside decideConsequential, above -- but where decideConsequential requires a current,
// composite-outcome measurement (only the agent's own judgment call reaches it), escalate takes
// any current measurement regardless of outcome: a floor-caught or vetoed draft has nowhere else
// to go but the developer (section 5's floor-and-veto carve-out), and the agent may also choose
// to escalate past a `suggested: agent` composite on its own judgment (section 10: "The
// suggestion is advisory, not a route"). currentMeasurement (lib/evaluate.mjs) still refuses a
// missing, unfinished, stale or digest-mismatched measurement -- the same four MeasurementError
// conditions decideConsequential already surfaces -- so this function never writes an escalation
// for a draft nothing was measured against; it just never inspects the outcome once a current one
// exists. Same dynamic-import reasoning as decideConsequential above: a static top-level import of
// lib/evaluate.mjs here would be a real circular import (evaluate.mjs imports from this file).
export async function escalateConsequential(cwd, draft) {
  const d = validateDraft(draft);
  const log = await readLog(cwd);
  checkConcerns(d, log, openRange(log, d.commitment));
  const { currentMeasurement } = await import('./evaluate.mjs');
  const m = await currentMeasurement(cwd, d);
  return writeEscalation(cwd, d.commitment, { ...d, evaluation: m.sha });
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
  if (open.length === 0) throw new DraftError(`sudus: no unanswered escalation for ${slug}${wanted ? ` at ${wanted}` : ''}`);
  return open[0];
}

// Fix round 1 finding 2: an answer's two writes -- the log record, then the answered ADR line --
// are not one atomic transaction (lib/tx.mjs's withTransaction is closed to 'answer': it is not
// in MULTI_STORE, and its finish() step unconditionally injects intent/results into the terminal
// payload, which the 'answer' schema, lib/records.mjs, does not carry; adding it there is outside
// this fix round's footprint, lib/records.mjs being another agent's file). A crash between the
// two writes -- the log record lands, the ADR line does not -- leaves the escalation reading as
// answered with no way to write the missing line, since answer() itself would refuse "no
// unanswered escalation" and lib/adr.mjs's prepareLine refuses an answered line from any command
// but answer. Detected and completed here instead: the very next sudus answer for that slug (of
// any kind or text -- there is nothing left to decide, only the missing line to write) finishes
// it and returns the existing answer's sha, rather than writing a duplicate or refusing.
async function danglingAnswer(cwd, log, slug) {
  const candidates = log.filter((r) => r.kind === 'answer' && r.target === slug && r.payload.kind !== 'ask');
  if (candidates.length === 0) return null;
  const answered = new Set((await readAdr(cwd)).filter((l) => l.kind === 'answered').map((l) => l.answer));
  return candidates.find((r) => !answered.has(r.sha)) ?? null;
}

// Spec revision 6: the developer is never asked to run a command. The agent asks in conversation
// and records the developer's quoted words with `--quote`; that same quote is both the answer's
// stored text and the developer evidence authenticateDeveloper builds from it (attested mode), so
// there is no separate `text` parameter any more -- every kind, every mode, needs it.
export async function answer(cwd, slug, kind, opts = {}) {
  if (!ANSWER_KINDS.includes(kind)) throw new DraftError('sudus: answer kind must be ok, instead or ask');
  await loadSettings(cwd);
  const log = await readLog(cwd);
  // Revision 11: the answer is checked against the key in force, not the settings file on disk.
  const settings = await evidenceSettings(cwd, log);
  const dangling = await danglingAnswer(cwd, log, slug);
  if (dangling) {
    // Fix round 2 finding 14: the completion is still a developer-only write (it writes the
    // 'answered' ADR line), so it authenticates and verifies first, exactly as the normal path
    // below does -- an unsigned completion attempt in a signed project is refused, not silently
    // allowed through with no evidence at all. The completion writes no text of its own (the
    // dangling record already carries it), so it does not run the --quote-required check below.
    const completionEvidence = await authenticateDeveloper(cwd, settings, { purpose: 'answer', subject: dangling.payload.escalation, quote: opts.quote, sign: opts.sign, nonce: opts.nonce, env: opts.env });
    if (!verifyEvidence(settings, completionEvidence, { purpose: 'answer', subject: dangling.payload.escalation })) throw new DraftError('sudus: developer evidence does not verify');
    await appendDecision(cwd, { kind: 'answered', escalation: dangling.payload.escalation, answer: dangling.sha }, { command: 'answer' });
    // Fix round 2 finding 13 (ruling): report the completion and refuse the caller's own answer,
    // rather than silently returning the completed sha as if it were success for THIS call --
    // that dropped the developer's own kind/text with no sign anything was skipped.
    throw new DraftError(`sudus: completed the dangling answer ${dangling.sha} for ${slug}; run the command again`);
  }
  const esc = pickOpen(log, slug, opts.escalation);
  if (esc.awaiting === 'reply') throw new DraftError(`sudus: ${slug} awaits the agent's reply to your question`);
  if (typeof opts.quote !== 'string' || opts.quote.trim() === '') throw new DraftError("sudus: answer needs --quote <the developer's words>: quote what the developer said in the conversation, such as their ok");
  // Deviation from the plan text: the plan's own snippet reshaped authenticateDeveloper's result
  // into {mode, author: ev.author ?? '', signature: ev.signature ?? null} before storing it. That
  // shape fails the answer record's real evidence schema (lib/records.mjs's discriminated-union
  // `evidence`, shared with 'authorization' and 'read'): the attested branch has no `signature`
  // key and requires `purpose`/`subject`/`nonce`/`quote`/`harness`/`author: {name, email}`; the
  // 'signed' branch has no bare `author` key. authenticateDeveloper's return value already
  // matches that schema exactly, so it is stored as-is.
  // Fix round 1 finding 1: `opts.nonce` is now forwarded, the same as authorize() and
  // readDecision() already do. Without it, a signed project's two-round CLI flow (run 1 prints
  // the payload with a fresh nonce; run 2 signs that exact payload and passes --nonce back) never
  // verifies: authenticateDeveloper generated a NEW random nonce on every call, so the signature
  // from run 1's payload never matched run 2's freshly-baked one.
  const evidence = await authenticateDeveloper(cwd, settings, { purpose: 'answer', subject: esc.sha, quote: opts.quote, sign: opts.sign, nonce: opts.nonce, env: opts.env });
  // Fix round 1 finding 7: re-check the evidence with verifyEvidence right after
  // authenticateDeveloper, the same defence-in-depth authorize() and readDecision() already apply
  // (lib/auth.mjs). No live hole today -- authenticateDeveloper itself already verifies a
  // signature and always returns a non-empty quote for attested evidence -- but this closes the
  // same seam consistently across every developer-only write.
  if (!verifyEvidence(settings, evidence, { purpose: 'answer', subject: esc.sha })) throw new DraftError('sudus: developer evidence does not verify');
  // Fix round 1 finding 2: the ADR line is "preparable" -- readAdr(cwd) parses and structurally
  // validates the existing file -- checked before the log append, not just before the ADR append
  // that follows it. Catches the review's exact reproduction (a malformed docs/decisions.jsonl)
  // before anything is committed, instead of after the log record already landed with no way to
  // add its answered line. Skipped for 'ask', which never writes an ADR line.
  if (kind !== 'ask') await readAdr(cwd);
  const sha = await appendRecord(cwd, 'answer', slug, { escalation: esc.sha, kind, text: opts.quote, owner: opts.owner ?? null, evidence });
  if (kind !== 'ask') await appendDecision(cwd, { kind: 'answered', escalation: esc.sha, answer: sha }, { command: 'answer' });
  return sha;
}

export async function reply(cwd, slug, text, opts = {}) {
  if (typeof text !== 'string' || text.trim() === '') throw new DraftError('sudus: reply needs text');
  const log = await readLog(cwd);
  const asked = unanswered(log).filter((u) => u.payload.slug === slug && u.awaiting === 'reply' && (!opts.escalation || u.sha === opts.escalation));
  if (asked.length === 0) throw new DraftError(`sudus: ${slug} has no open ask to reply to`);
  return appendRecord(cwd, 'reply', slug, { escalation: asked[0].sha, text });
}

export async function dispute(cwd, { commitment, record, n, question, recommendation, because, if_wrong, instead }) {
  return escalate(cwd, { commitment, concerns: [`finding:${record}#${n}`], question, recommendation, because, if_wrong, instead, options: [], named_paths: [], cited_decisions: [] });
}

// Fix round 1 finding 5 (plan 09 review, ruling): settled only by the developer's ok answer, not
// by any non-ask final answer. An `instead` answer directs different work; it does not settle
// the dispute. Any caller of this function (plan 10's ledger among them) gets the correction for
// free without re-parsing the log itself.
//
// Issue #23: a dispute is "an escalation naming the finding" (section 2), so an escalation whose
// concerns name several findings disputes each of them, and one ok closes them all.
export function disputes(log, record, n) {
  const e = concerns(log, `finding:${record}#${n}`).find((x) => {
    const st = escalationState(log, x.sha);
    return st.status === 'answered' && st.final.payload.kind === 'ok';
  });
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
    if (val === undefined) throw new DraftError(`sudus: ${flag} needs a value`);
    if (FLAG_TO_FIELD[flag]) d[FLAG_TO_FIELD[flag]] = val;
    else if (LIST_FLAGS[flag]) d[LIST_FLAGS[flag]].push(val);
    else throw new DraftError(`sudus: unknown flag ${flag}`);
  }
  for (const [flag, f] of Object.entries(FLAG_TO_FIELD)) if (!(f in d)) throw new DraftError(`sudus: missing ${flag}`);
  return validateDraft(d);
}

function splitFlags(argv) {
  const pos = [], named = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) { named[argv[i].slice(2).replace(/-/g, '_')] = argv[i + 1]; i++; } else pos.push(argv[i]);
  }
  return { pos, named };
}

// Fix round 1 finding 12: a CAS refusal on refs/sudus/log (two writers racing to extend the same
// log; appendRecord's updateRefCAS throws lib/gitx.mjs's CasError) used to reach the CLI as a
// bare "sudus: refusing refs/sudus/log: expected <sha>", with no guidance and nothing retrying
// automatically. One line, naming the fix in words rather than retrying on the caller's behalf.
// Exported for its test: the hint follows the project's layout, so a race on refs/cairn/log in a
// former-layout project is told to run the command again too.
export function cliMessage(cwd, e) {
  let msg = e.message.startsWith('sudus: ') ? e.message : `sudus: ${e.message}`;
  if (e instanceof CasError && e.ref === layoutOf(cwd).log) msg += '; run the command again';
  return msg;
}
const asCli = (fn) => async (cwd, argv, opts = {}) => {
  try { return { code: 0, out: await fn(cwd, argv, opts) }; }
  catch (e) { return { code: 1, out: cliMessage(cwd, e) + '\n' }; }
};

// Fix round 1 finding 9: parseEscalateArgs(argv) used to be called twice, parsing and
// validating the whole draft a second time only to read .commitment -- two independent draft
// objects where one was meant. Parsed once and reused for both the printed slug and the write.
export const cliEscalate = asCli(async (cwd, argv) => {
  const d = parseEscalateArgs(argv);
  return `sudus: escalation ${d.commitment} ${await escalate(cwd, d)}\n`;
});
// usage: answer <slug> ok|instead|ask --quote <words> [--escalation <sha>]; positional text is
// gone (spec revision 6) -- the developer's quoted words are the --quote flag, both the record's
// text and the attested evidence.
export const cliAnswer = asCli(async (cwd, argv, opts) => {
  const { pos: [slug, kind], named } = splitFlags(argv);
  return `sudus: answer ${slug} ${await answer(cwd, slug, kind, { ...opts, quote: named.quote, escalation: named.escalation })}\n`;
});
export const cliReply = asCli(async (cwd, argv) => {
  const { pos: [slug, ...text], named } = splitFlags(argv);
  return `sudus: reply ${slug} ${await reply(cwd, slug, text.join(' '), { escalation: named.escalation })}\n`;
});
export const cliDispute = asCli(async (cwd, argv) => {
  const { named } = splitFlags(argv);
  // Fix round 1 finding 10: bare Number(named.n) let a missing or malformed --n flow straight
  // into the concern token as NaN or 0, so the refusal named the record ("concern token
  // finding:<sha>#NaN needs a log SHA") instead of the actual problem. Checked here, before
  // dispute() or escalate() ever runs, with a message naming the finding number itself.
  const n = Number(named.n);
  if (named.n === undefined || !Number.isInteger(n) || n < 1) throw new DraftError(`sudus: --n must be a positive integer naming the finding number, not ${JSON.stringify(named.n ?? null)}`);
  return `sudus: escalation ${named.commitment} ${await dispute(cwd, { ...named, n })}\n`;
});
