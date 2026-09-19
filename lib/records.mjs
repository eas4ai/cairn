import { canonicalize, parseStrict, sha256 } from './canon.mjs';
import { git, readRef, updateRefCAS, commitTree, catCommit, emptyTree } from './gitx.mjs';

export class RecordError extends Error { constructor(m, reasons = []) { super(reasons.length ? `${m}: ${reasons.join('; ')}` : m); this.name = 'RecordError'; this.reasons = reasons; } }
export const SCHEMA = '1';
export const TARGET_RE = /^(-|[A-Za-z0-9][A-Za-z0-9._-]{0,127})$/;

const T = (t) => ({ t });
export const ws = T('ws'), input = T('input'), ref = T('ref'), sha = T('sha'), digest = T('digest'), str = T('str'), token = T('token'),
  int = T('int'), unit = T('unit'), bool = T('bool'), ulid = T('ulid'), b64 = T('b64'), json = T('json');
export const nullable = (of) => ({ t: 'nullable', of }), list = (of) => ({ t: 'list', of }),
  oneOf = (...values) => ({ t: 'enum', values }), obj = (shape) => ({ t: 'obj', shape }),
  // A discriminated union: the shape checked is chosen by the value's own `key` field. Added for
  // lib/auth.mjs's evidence object, whose signed and unsigned-local variants carry different closed
  // key sets (deviation recorded in the plan 03 report: the plan's original `evidence` schema entry
  // did not account for this).
  variant = (key, shapes) => ({ t: 'variant', key, shapes });

const SHA = /^[0-9a-f]{40}$/, DIGEST = /^sha256:[0-9a-f]{64}$/, ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/, B64 = /^[A-Za-z0-9_-]*$/;
export function check(desc, v, path, out) {
  const ok = (cond, what) => { if (!cond) out.push(`${path}: ${what}`); };
  const s = typeof v === 'string';
  switch (desc.t) {
    case 'ws': case 'input': case 'ref': case 'sha': return ok(s && SHA.test(v), 'expected 40 lowercase hex');
    case 'digest': return ok(s && DIGEST.test(v), 'expected sha256:<64 hex>');
    case 'str': return ok(s, 'expected string');
    case 'token': return ok(s && TARGET_RE.test(v), 'expected token');
    case 'int': return ok(Number.isSafeInteger(v) && v >= 0, 'expected non-negative integer');
    case 'unit': return ok(typeof v === 'number' && v >= 0 && v <= 1, 'expected number in [0,1]');
    case 'bool': return ok(typeof v === 'boolean', 'expected boolean');
    case 'ulid': return ok(s && ULID.test(v), 'expected ULID');
    case 'b64': return ok(s && B64.test(v), 'expected unpadded base64url');
    case 'json': return ok(v !== undefined, 'expected JSON value');
    case 'enum': return ok(desc.values.includes(v), `expected one of ${desc.values.join('|')}`);
    case 'nullable': return v === null ? undefined : check(desc.of, v, path, out);
    case 'list': if (!Array.isArray(v)) return ok(false, 'expected array'); return v.forEach((x, i) => check(desc.of, x, `${path}[${i}]`, out));
    case 'obj': {
      if (v === null || typeof v !== 'object' || Array.isArray(v)) return ok(false, 'expected object');
      const keys = Object.keys(v), want = Object.keys(desc.shape);
      for (const k of want) ok(Object.hasOwn(v, k), `missing ${k}`);
      for (const k of keys) ok(Object.hasOwn(desc.shape, k), `unknown key ${k}`);
      ok(keys.length === want.length, `expected ${want.length} fields, found ${keys.length}`);
      for (const k of want) if (k in v) check(desc.shape[k], v[k], `${path}.${k}`, out);
      return;
    }
    case 'variant': {
      if (v === null || typeof v !== 'object' || Array.isArray(v)) return ok(false, 'expected object');
      const tag = v[desc.key];
      if (!Object.hasOwn(desc.shapes, tag)) return ok(false, `unknown ${desc.key} ${JSON.stringify(tag)}`);
      return check(obj(desc.shapes[tag]), v, path, out);
    }
    default: throw new Error(`bad descriptor ${desc.t}`);
  }
}

// lib/auth.mjs's authenticateDeveloper produces one of two differently-shaped evidence objects
// (section 2 Settings: "With a key ... with null, ... records the Git author"); see the `variant`
// deviation note above.
const evidence = variant('mode', {
  signed: { mode: oneOf('signed'), purpose: str, subject: str, nonce: str, signature: b64 },
  'unsigned-local': { mode: oneOf('unsigned-local'), purpose: str, subject: str, nonce: str, author: obj({ name: str, email: str }), confirmed: bool },
});
const finding = obj({ n: int, text: str });
const reqDigest = obj({ requirement: token, text_digest: digest });
// Fix round 1 finding 9: `identity` is nullable -- HEAD before any commit, or a file that does
// not exist, is a real, representable identity, not an encoding error.
const storeIdentity = obj({ store: str, identity: nullable(str) });
const verdict = obj({ resolution: ref, reason: str });
const question = oneOf('Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6');
const route = oneOf('agent', 'developer', 'capture');
// Fix round 1 finding 4/9: every planned write now carries a digest (file: its bytes; branch: its
// planned paths and message; snapshot: a fixed marker, since a snapshot's content is only known at
// apply time; log: its planned kind, target and payload), and the shape is chosen by `store`, the
// same discriminated-union pattern `evidence` already uses. `payload` on a log write is `json`
// since a record payload's own shape depends on its kind, checked separately when the write
// actually runs (lib/tx.mjs's applyWrites calls appendRecord, which re-validates it against
// SCHEMAS[kind] on its own terms).
const writeEntry = variant('store', {
  file: { store: oneOf('file'), path: str, digest },
  branch: { store: oneOf('branch'), paths: list(str), message: str, digest },
  snapshot: { store: oneOf('snapshot'), digest },
  log: { store: oneOf('log'), kind: token, target: token, payload: json, digest },
});
// Fix round 1 finding 9: the two durable refs are a fixed, known key set (never an open map), so
// `pre`'s `refs` field is an obj descriptor; `files` stays `json` because its keys are the plan's
// own declared file paths, which are open-ended by nature (a plan can touch any number of files).
const refPair = obj({ 'refs/cairn/log': nullable(sha), 'refs/cairn/snapshots': nullable(sha) });
const preShape = obj({ refs: refPair, head: nullable(sha), files: json });
export const SCHEMAS = {
  'init': { settings_digest: digest, authority_remote: nullable(str), auth_mode: oneOf('signed', 'unsigned-local') },
  // `intent` deviation: the plan's Task 1 record-shapes note lists `intent: string|null` on the
  // authorization payload (set by plan 04's transaction wrapper), but the schema entry already
  // committed on this branch (plan 01/02) omitted it. Added here since Task 4's authorize() writes it.
  // Fix round 1 finding 3: `results: list(storeIdentity)` added -- withTransaction's `finish` now
  // injects it into every terminal payload the same way it injects `intent`, naming each planned
  // write's actual resulting identity so a later drift can be detected by comparing against it.
  'authorization': { spec_digest: digest, agreement_digest: digest, settings_digest: digest, evidence, decision: nullable(ulid), intent: nullable(ref), results: list(storeIdentity) },
  // `command-intent`/`command-abort` deviation: plan 01's schema entries (input_identity,
  // pre_identities: list(storeIdentity), planned_writes: list({store,digest}); restored:
  // list(storeIdentity)) were a provisional guess never exercised by any committed code or test.
  // Plan 04's actual record-shapes note (this plan's Task 1 section) and its Tasks 2-5 tests fix a
  // different, already-settled shape: command-intent carries {tx, command, identity, pre, writes}.
  // Fix round 1 finding 9: `tx` stays `token`, not `ulid` -- reverting it would mean every test
  // fixture that stages or recovers a transaction with a readable name like 'TXCRASH' would have to
  // become an opaque ulid() everywhere that name is threaded through (recover, stagingDir, repair
  // messages), a wide, purely cosmetic rewrite for a Minor finding with no correctness stake
  // (`token` already refuses anything TARGET_RE does, matching every real `tx = ulid()` this
  // module itself generates); `writes` is now the `writeEntry` variant above (finding 4), and
  // `pre` is the mostly-obj `preShape` above; `identity` stays `json` because it is genuinely
  // different per command -- authorize's is {spec,agreement,settings,head}, and start/promote/
  // supersede (plan 06) will each define their own, unknowable from this plan.
  'command-intent': { tx: token, command: oneOf('start', 'promote', 'supersede', 'authorize'), identity: json, pre: preShape, writes: list(writeEntry) },
  // Fix round 1 finding 2/3: `restored` is `list(storeIdentity)`, one entry per re-read store
  // (refs/cairn/log, refs/cairn/snapshots, HEAD, each planned file), not a copy of the pre-capture
  // taken before the intent, which the log ref can never truthfully equal again (it is append-only
  // and the intent's own record already advanced it); `results` mirrors the terminal payload's own
  // field so recoverPredicate/pendingTransaction can read one field name off either kind of closing
  // record. An abort's own writes never landed, so its `results` is always the empty list.
  'command-abort': { intent: ref, failure_class: token, restored: list(storeIdentity), results: list(storeIdentity) },
  // Fix round 1 finding 8, scoped: 'promotion' and 'superseded' below get intent/results now (no
  // other file constructs either kind). 'start' does NOT -- tests/snapshots.test.mjs constructs raw
  // 'start' payloads without them, and that file is outside this fix round's authorized scope
  // (lib/tx.mjs, lib/lease.mjs, lib/auth.mjs, lib/records.mjs, lib/cli.mjs and tests
  // tx/lease/auth/records/cli only). Closing 'start' here would refuse that file's fixtures with no
  // way to fix them in-scope. Left as plan 01 defined it; plan 06, which actually builds `start`,
  // must add intent/results (and update tests/snapshots.test.mjs's fixtures) when it runs `start`
  // through withTransaction, the same way this report closes 'promotion' and 'superseded' now.
  // Carried obligation from plan 04 (this branch's Task 1 note): 'start' was left open pending
  // plan 06, which writes it through withTransaction. Closed here with intent/results the same way
  // 'promotion' and 'superseded' already were (Fix round 1 finding 8) -- a transaction-written
  // terminal record always names its intent.
  'start': { slug: token, snapshot: ws, requirements: list(reqDigest), from_superseded: nullable(ref), intent: nullable(ref), results: list(storeIdentity) },
  // Deviation from the plan text: this entry was plan 01's provisional guess (field names
  // snapshot/outcome/environment/output_digest/exit_code/signal), never exercised by any
  // committed code or test (confirmed by grep: no other file referenced those field names).
  // Plan 05's Task 3 payload (lib/check.mjs's check()) uses a different, now-settled shape, and
  // its own Step 4 anticipates exactly this: "align plan 01's table to this list (it is the
  // writer's list)". Updated here, at first use, the same way plan 04's report already updated
  // command-intent/command-abort. `identity` and the nested `exit` object use `json`/`obj` since
  // their key sets are open (tool/env names) or free-shaped, the same pattern already used for
  // command-intent's `identity`, `pre` and `writes` fields above.
  'receipt': { mechanism: token, definition_digest: digest, input: input, product_digest: digest, status: oneOf('ran', 'error'), identity: json, results: list(obj({ requirement: token, text_digest: digest, result: oneOf('pass', 'fail', 'unverified') })), output: digest, exit: obj({ code: nullable(int), signal: nullable(str) }) },
  'review': { slug: token, snapshot: ws, examined: list(str), answers: list(obj({ question, target: str, status: oneOf('observed', 'not-checked'), text: str })), findings: list(finding) },
  'brief': { slug: token, review: ref, projection_digest: digest, payload_digest: digest, exclusions_digest: digest },
  'report': { slug: token, snapshot: ws, brief: ref, model: str, transport: oneOf('local', 'remote'), boundary: oneOf('enforced', 'unenforced'), builder_model: nullable(str), projection_digest: digest, attempts: list(obj({ question, target: str, text: str })), findings: list(finding), interface_attempts: list(obj({ path: str, text: str })) },
  'resolution': { source: ref, finding: int, snapshot: ws, explanation: str },
  'acceptance': { slug: token, report: ref, snapshot: ws, delta_digest: digest, accepted: list(verdict), rejected: list(verdict), findings: list(finding) },
  'escalation': { slug: token, question: str, recommendation: str, because: str, if_wrong: str, instead: str, concerns: str, evaluation: nullable(ref) },
  'answer': { escalation: ref, kind: oneOf('ok', 'instead', 'ask'), text: str, owner: nullable(str), evidence },
  'reply': { escalation: ref, text: str },
  'read': { decision: ulid, evidence },
  'evaluation-intent': { draft_digest: digest, snapshot: ws, log_head: ref, adr_digest: digest, settings_digest: digest, policy_digest: digest, owner_request: nullable(digest), option_request: nullable(digest) },
  'evaluation-call': { intent: ref, call: oneOf('owner', 'option'), request_digest: digest, outcome: oneOf('not_sent', 'response', 'failure', 'indeterminate'), model: nullable(str), raw: nullable(b64), failure_class: nullable(str), answers: nullable(list(obj({ id: str, value: json }))), usage: nullable(obj({ input_tokens: int, output_tokens: int })) },
  'evaluation': { intent: ref, gates: list(obj({ gate: str, value: json, passed: bool })), route, would_route: nullable(route), reason: str, owner_call: nullable(ref), option_call: nullable(ref) },
  'calibration': { policy_digest: digest, log_head: ref, predicted_agent: int, false_downgrades: int, bound: unit, criterion: str, result: oneOf('pass', 'fail') },
  'item': { kind: oneOf('backlog', 'next-feature', 'defect'), slug: token, source: str, body: str },
  'outside': { item: ref, reason: str, evaluation: nullable(ref) },
  // Fix round 1 finding 8: `intent`/`results` added, the same reason as 'start' above -- promote
  // is one of the four MULTI_STORE commands, so its terminal record goes through the same
  // withTransaction `finish` step.
  'promotion': { item: ref, decision: ulid, intent: nullable(ref), results: list(storeIdentity) },
  'fix': { item: ref, snapshot: ws },
  'scope-breach': { path: str, snapshot: ws, base: ws, declarations_digest: digest },
  'scope': { breach: ref, disposition: oneOf('keep', 'restore'), snapshot: ws, escalation: nullable(ref), answer: nullable(ref) },
  'done': { slug: token, snapshot: ws },
  // Fix round 1 finding 8: `intent`/`results` added, the same reason as 'start' above -- supersede
  // is one of the four MULTI_STORE commands.
  'superseded': { slug: token, start: ref, decision: ulid, transition: ulid, successor: token, carried: list(ref), intent: nullable(ref), results: list(storeIdentity) },
};
export const KINDS = new Set(Object.keys(SCHEMAS));

export function encodeRecord(kind, target, payload) {
  if (!KINDS.has(kind)) throw new RecordError(`unknown record kind ${kind}`);
  if (typeof target !== 'string' || !TARGET_RE.test(target)) throw new RecordError(`invalid target token ${JSON.stringify(target)}`);
  const reasons = []; check(obj(SCHEMAS[kind]), payload, kind, reasons);
  if (reasons.length) throw new RecordError(`invalid ${kind} record`, reasons);
  const body = canonicalize(payload);
  return { subject: `cairn: ${kind} ${target}`, body, trailers: [['Cairn-Schema', SCHEMA], ['Cairn-Digest', sha256(body)]] };
}
// The integrity envelope every kernel-written commit shares: exactly the two trailers, a
// readable schema version, a body digest that matches Cairn-Digest, and canonical JSON.
// decodeRecord and lib/snapshots.mjs's readSnapshot both call this so the rule is checked once.
export function verifyEnvelope(commit) {
  const tr = commit.trailers;
  if (tr.length !== 2 || tr[0][0] !== 'Cairn-Schema' || tr[1][0] !== 'Cairn-Digest') throw new RecordError('expected exactly the two trailers Cairn-Schema and Cairn-Digest');
  if (tr[0][1] !== SCHEMA) throw new RecordError(`unreadable schema ${tr[0][1]}`);
  const bytes = commit.bodyBytes ?? Buffer.from(commit.body, 'utf8');
  if (tr[1][1] !== sha256(bytes)) throw new RecordError('body digest does not match Cairn-Digest');
  try { return parseStrict(bytes); } catch (e) { throw new RecordError(`body: ${e.message}`); }
}
export function decodeRecord(commit) {
  const m = /^cairn: (\S+) (\S+)$/.exec(commit.subject);
  if (!m) throw new RecordError(`not a record subject: ${commit.subject}`);
  const [, kind, target] = m;
  if (!KINDS.has(kind)) throw new RecordError(`unknown record kind ${kind}`);
  if (!TARGET_RE.test(target)) throw new RecordError(`invalid target token ${target}`);
  const payload = verifyEnvelope(commit);
  const reasons = []; check(obj(SCHEMAS[kind]), payload, kind, reasons);
  if (reasons.length) throw new RecordError(`invalid ${kind} record`, reasons);
  return { kind, target, payload };
}

export const LOG_REF = 'refs/cairn/log';

export async function appendRecord(cwd, kind, target, payload) {
  const { subject, body, trailers } = encodeRecord(kind, target, payload);
  const head = await readRef(cwd, LOG_REF);
  const sha = await commitTree(cwd, { tree: await emptyTree(cwd), parents: head ? [head] : [], subject, body, trailers });
  await updateRefCAS(cwd, LOG_REF, sha, head);
  return sha;
}
export async function readLog(cwd) {
  const head = await readRef(cwd, LOG_REF);
  if (!head) return [];
  const shas = (await git(['rev-list', '--first-parent', '--reverse', head], { cwd })).stdout.trim().split('\n');
  const out = [];
  for (const sha of shas) {
    const c = await catCommit(cwd, sha);
    const { kind, target, payload } = decodeRecord(c);
    out.push({ sha, kind, target, payload, parent: c.parents[0] ?? null });
  }
  return out;
}
export function range(log) {
  let i = log.length - 1;
  while (i >= 0 && log[i].kind !== 'start') i--;
  const start = i >= 0 ? log[i] : null, records = log.slice(i + 1);
  const closed = start !== null && records.some((r) => (r.kind === 'done' || r.kind === 'superseded') && r.payload.slug === start.payload.slug);
  return { start, records, closed };
}
