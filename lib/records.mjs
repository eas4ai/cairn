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
const storeIdentity = obj({ store: str, identity: str });
const verdict = obj({ resolution: ref, reason: str });
const question = oneOf('Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6');
const route = oneOf('agent', 'developer', 'capture');
export const SCHEMAS = {
  'init': { settings_digest: digest, authority_remote: nullable(str), auth_mode: oneOf('signed', 'unsigned-local') },
  // `intent` deviation: the plan's Task 1 record-shapes note lists `intent: string|null` on the
  // authorization payload (set by plan 04's transaction wrapper), but the schema entry already
  // committed on this branch (plan 01/02) omitted it. Added here since Task 4's authorize() writes it.
  'authorization': { spec_digest: digest, agreement_digest: digest, settings_digest: digest, evidence, decision: nullable(ulid), intent: nullable(ref) },
  // `command-intent`/`command-abort` deviation: plan 01's schema entries (input_identity,
  // pre_identities: list(storeIdentity), planned_writes: list({store,digest}); restored:
  // list(storeIdentity)) were a provisional guess never exercised by any committed code or test.
  // Plan 04's actual record-shapes note (this plan's Task 1 section) and its Tasks 2-5 tests fix a
  // different, already-settled shape: command-intent carries {tx, command, identity, pre, writes}
  // (tx is the transaction's own ULID-shaped id but also appears as plain test fixture strings like
  // 'TXCRASH', so it is a token, not a strict ulid); command-abort's `restored` is the single object
  // {refs, head, files} the spec text `restored:{refs:{...}, files:{...}, head}` describes, not a
  // list. Both use `json` for the free-shaped nested fields since their key sets are open-ended
  // (writes vary by store kind; pre/restored carry a fixed but not enum-shaped ref/file map).
  // Updated here, at first use, rather than left to fail Task 3's appendRecord calls.
  'command-intent': { tx: token, command: oneOf('start', 'promote', 'supersede', 'authorize'), identity: json, pre: json, writes: list(json) },
  'command-abort': { intent: ref, failure_class: token, restored: json },
  'start': { slug: token, snapshot: ws, requirements: list(reqDigest), from_superseded: nullable(ref) },
  'receipt': { mechanism: token, definition_digest: digest, snapshot: input, outcome: oneOf('ran', 'error'), environment: list(obj({ name: str, value: str })), results: list(obj({ requirement: token, text_digest: digest, result: oneOf('pass', 'fail', 'unverified') })), output_digest: digest, exit_code: nullable(int), signal: nullable(str) },
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
  'promotion': { item: ref, decision: ulid },
  'fix': { item: ref, snapshot: ws },
  'scope-breach': { path: str, snapshot: ws, base: ws, declarations_digest: digest },
  'scope': { breach: ref, disposition: oneOf('keep', 'restore'), snapshot: ws, escalation: nullable(ref), answer: nullable(ref) },
  'done': { slug: token, snapshot: ws },
  'superseded': { slug: token, start: ref, decision: ulid, transition: ulid, successor: token, carried: list(ref) },
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
