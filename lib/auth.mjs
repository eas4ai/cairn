// lib/auth.mjs
import { readFileSync, readdirSync, lstatSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { verify as cryptoVerify, createPublicKey, randomBytes } from 'node:crypto';
import { sha256, canonicalize, b64url, unb64url } from './canon.mjs';
import { loadSettings } from './settings.mjs';
import { git } from './gitx.mjs';
import { appendRecord, readLog } from './records.mjs';
import { matchGlob, PROTECTED_EXCEPT } from './paths.mjs';
import { withTransaction } from './tx.mjs';

// Deviation from the plan text: the plan's Task 1 code (`export class AuthError extends Error {}`)
// leaves Error.prototype.name = 'Error', but every test in this plan asserts the stringified
// rejection starts with 'AuthError: ...' (the pattern every other lib/*.mjs error class in this
// codebase follows). Set the name explicitly so String(err) matches.
// Fix round 2 finding 6 (Minor): `code` (optional, null by default) lets a caller classify an
// AuthError without parsing its message text. Set only at the four throw sites inside
// refuseUnauthorizedProtected, below -- the ones lib/commitment.mjs's currentAuthorization needs
// to tell apart; every other AuthError throw in this file is unaffected and keeps code: null.
export class AuthError extends Error { constructor(m, code = null) { super(m); this.name = 'AuthError'; this.code = code; } }

function walk(root, rel, out) {
  const abs = rel ? join(root, rel) : root;
  for (const name of readdirSync(abs)) {
    const p = rel ? `${rel}/${name}` : name;
    const st = lstatSync(join(root, p));
    if (st.isDirectory()) walk(root, p, out);
    else if (st.isFile()) out.push(p);
  }
}

export function specDigest(cwd) {
  const files = [];
  if (existsSync(join(cwd, 'docs/spec'))) walk(cwd, 'docs/spec', files);
  // Fix round 1, item 8: filter on the same PROTECTED_EXCEPT list protectedClass uses below,
  // rather than a second, independently maintained 'docs/spec/roadmap.md' literal. The roadmap is
  // kernel-edited at start and promote (section 2, protected paths); it is bound structurally, not
  // by digest.
  const kept = files.filter((f) => !PROTECTED_EXCEPT.includes(f));
  kept.sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
  return sha256(canonicalize(kept.map((p) => [p, sha256(readFileSync(join(cwd, p)))])));
}

export function agreementDigest(cwd) {
  const p = join(cwd, 'AGENTS.md');
  return existsSync(p) ? sha256(readFileSync(p)) : null;
}

// Deviation from the plan text: lib/settings.mjs's loadSettings(cwd) is async on this branch
// (plan 02, already committed), so protectedDigests must be async too and await it.
export async function protectedDigests(cwd) {
  return { spec: specDigest(cwd), agreement: agreementDigest(cwd), settings: (await loadSettings(cwd)).digest };
}

export function signingPayload({ purpose, subject, nonce }) {
  return new TextEncoder().encode(canonicalize({ purpose, subject, nonce }));
}

function verifySigned(pem, ev) {
  try {
    const key = createPublicKey(pem);
    return cryptoVerify(null, signingPayload(ev), key, unb64url(ev.signature));
  } catch { return false; }
}

// Spec revision 6: the developer is never asked to run a command. The agent asks in conversation
// and records the developer's quoted words; the kernel never opens /dev/tty or reads stdin for
// this. HARNESS_ENV/harnessName moved here from lib/review.mjs (re-exported from there) since
// attested evidence now needs the same harness-detection logic detectHarness already used.
export const HARNESS_ENV = [['CLAUDECODE', 'claude_code'], ['CODEX_HOME', 'codex'], ['MUSE_SESSION', 'muse']];

export function harnessName(env = process.env) {
  if (env.CAIRN_HARNESS) return env.CAIRN_HARNESS;
  const hit = HARNESS_ENV.find(([v]) => env[v]);
  return hit ? hit[1] : 'none';
}

// Fix round 1, item 11: verifyEvidence now takes the purpose and subject the caller expects, so
// evidence copied or lifted from a different record (right shape, wrong subject) is refused rather
// than silently accepted; and a settings object that omits the signing_key field entirely (as
// opposed to explicitly carrying signing_key: null) is refused rather than falling open to
// attested. Every existing call site passes a settings object that always has the key
// (loadSettings' schema requires it), so this is additive for them.
export function verifyEvidence(settings, ev, { purpose, subject } = {}) {
  if (!ev || typeof ev !== 'object') return false;
  if (!settings || typeof settings !== 'object' || !('signing_key' in settings)) return false;
  if (purpose !== undefined && ev.purpose !== purpose) return false;
  if (subject !== undefined && ev.subject !== subject) return false;
  if (settings.signing_key === null) {
    return ev.mode === 'attested' && typeof ev.quote === 'string' && ev.quote.trim() !== ''
      && typeof ev.author?.name === 'string' && ev.author.name !== ''
      && typeof ev.author?.email === 'string' && ev.author.email !== '';
  }
  return ev.mode === 'signed' && typeof ev.signature === 'string' && verifySigned(settings.signing_key, ev);
}

export function describeEvidence(ev) {
  if (ev.mode === 'signed') return 'signed by the developer key';
  if (ev.mode === 'attested') return `attested: "${ev.quote}" through ${ev.harness} by ${ev.author.name} <${ev.author.email}>; evidence, not authentication`;
  return `unsigned-local: terminal confirmation by ${ev.author.name} <${ev.author.email}>; evidence, not authentication`;
}

async function gitAuthor(cwd) {
  // git var honours GIT_AUTHOR_NAME and GIT_AUTHOR_EMAIL as well as user.name and user.email.
  const r = await git(['var', 'GIT_AUTHOR_IDENT'], { cwd });
  const m = /^(.*?) <([^>]*)> \d+ [-+]\d{4}$/.exec(r.stdout.trim());
  if (r.code !== 0 || !m || !m[1] || !m[2]) throw new AuthError('cairn: attested evidence needs a Git author (user.name and user.email)');
  return { name: m[1], email: m[2] };
}

// The exact refusal message authenticateDeveloper uses for a missing or blank quote (attested
// mode only); direction() below reuses it verbatim for the same reason, over the 'authorize'
// purpose.
function requireQuote(purpose, quote) {
  if (typeof quote !== 'string' || quote.trim() === '') {
    throw new AuthError(`cairn: ${purpose} needs --quote <the developer's words>: quote what the developer said in the conversation, such as their ok`);
  }
}

async function attested(cwd, { purpose, subject, nonce, quote, env }) {
  requireQuote(purpose, quote);
  const author = await gitAuthor(cwd);
  return { mode: 'attested', purpose, subject, nonce, quote, harness: harnessName(env), author };
}

export function authorizations(log) {
  return log.filter((r) => r.kind === 'init' || r.kind === 'authorization');
}

export function latestProtected(log) {
  const recs = authorizations(log);
  const last = recs.at(-1);
  if (!last) return null;
  if (last.kind === 'init') return { spec: null, agreement: null, settings: last.payload.settings_digest };
  return { spec: last.payload.spec_digest, agreement: last.payload.agreement_digest, settings: last.payload.settings_digest };
}

// Fix round 1 finding 6: `git status --porcelain` (v1, newline-separated) quotes any path with a
// space, control character or non-ASCII byte in C-style double quotes, and a rename or copy is
// rendered "R  new -> old", neither of which the previous `l.slice(3)` parser accounted for --
// it either truncated a quoted path or kept the literal " -> " arrow as part of the path. `-z`
// turns both off: an ordinary entry is "XY path\0", and a rename or copy is "XY newpath\0oldpath\0",
// one extra NUL-terminated field carrying the origin path, read here too so a renamed protected
// path's old name is committed as removed rather than left orphaned in the tree.
async function dirtyPaths(cwd, pathspecs) {
  // `--ignored -uall`: a new protected file under a gitignored directory (a developer who ignores
  // docs/) is still a protected write and must be committed; the branch write force-adds it.
  const out = (await git(['status', '--porcelain=v1', '-z', '-uall', '--ignored', '--', ...pathspecs], { cwd })).stdout;
  const fields = out.split('\0');
  fields.pop(); // the trailing NUL leaves one empty field after the last record
  const paths = [];
  for (let i = 0; i < fields.length; i++) {
    const rec = fields[i];
    paths.push(rec.slice(3));
    if ('RC'.includes(rec[0]) || 'RC'.includes(rec[1])) paths.push(fields[++i]);
  }
  return paths;
}

// Task 6 (plan 04): authorize() now runs as a transaction. Deviations from the plan's Task 6 code
// block, both already established by earlier tasks in this file and kept here: the signature keeps
// the `nonce` parameter (dropped in the plan's own snippet, but threaded through by every caller and
// by readDecision's identical pattern above), and verifyEvidence is called with the stricter
// {purpose, subject} options this branch already uses everywhere else, not the plan's bare call.
export async function authorize(cwd, { sign, quote, decision = null, nonce, env } = {}) {
  const log = await readLog(cwd);
  if (!log.some((r) => r.kind === 'init')) throw new AuthError('cairn: run cairn init first');
  if (!existsSync(join(cwd, 'AGENTS.md'))) throw new AuthError('cairn: AGENTS.md is missing; authorize binds the working agreement');
  if (!existsSync(join(cwd, 'docs/spec'))) throw new AuthError('cairn: docs/spec is missing; authorize binds the specification');
  const { settings } = await loadSettings(cwd);
  const d = await protectedDigests(cwd);
  const subject = canonicalize({ spec: d.spec, agreement: d.agreement, settings: d.settings });
  const evidence = await authenticateDeveloper(cwd, settings, { purpose: 'authorize', subject, sign, quote, nonce, env });
  if (!verifyEvidence(settings, evidence, { purpose: 'authorize', subject })) throw new AuthError('cairn: developer evidence does not verify');
  const dirty = await dirtyPaths(cwd, ['.cairn/settings.json', 'AGENTS.md', 'docs/spec']);
  const writes = dirty.length ? [{ store: 'branch', paths: dirty, message: 'Authorize the specification, working agreement and settings' }] : [];
  const payload = { spec_digest: d.spec, agreement_digest: d.agreement, settings_digest: d.settings, evidence, decision };
  const r = await withTransaction(cwd, { command: 'authorize', plan: { identity: { spec: d.spec, agreement: d.agreement, settings: d.settings, head: null },
    writes, terminal: { kind: 'authorization', target: 'protected', payload } } }, null);
  return r.terminalSha;
}

// Spec revision 6, "Direction": `cairn authorize instead|ask` writes a direction record instead of
// binding the three protected digests -- the developer's own words, redirecting or questioning the
// agent's recommendation, without changing what's authorized. Unlike authorize()'s own evidence,
// a direction carries no nonce or subject to verify against later (nothing protected changes), so
// its payload is the plain {purpose, kind, text, harness, author} shape the 'direction' schema
// (lib/records.mjs) names, not the authenticateDeveloper evidence variant.
export async function direction(cwd, { kind, quote, env } = {}) {
  if (kind !== 'instead' && kind !== 'ask') throw new AuthError('cairn: authorize takes ok, instead or ask');
  requireQuote('authorize', quote);
  const author = await gitAuthor(cwd);
  return appendRecord(cwd, 'direction', 'protected', { purpose: 'authorize', kind, text: quote, harness: harnessName(env), author });
}

// Pre-review fix: docs/spec/roadmap.md is excepted from the protected-by-digest spec class
// (section 2: kernel-edited at start and promote, bound structurally rather than by digest).
// specDigest already excludes it (Task 1); protectedClass now uses the same PROTECTED_EXCEPT
// list lib/paths.mjs exports (plan 02) so the two stay consistent by construction rather than
// by two independently maintained exception lists.
export function protectedClass(p) {
  if (p === '.cairn/settings.json') return 'settings';
  if (p === 'AGENTS.md') return 'agreement';
  if (matchGlob('docs/spec/**', p) && !PROTECTED_EXCEPT.includes(p)) return 'spec';
  return null;
}

const FIELD = { spec: 'spec_digest', agreement: 'agreement_digest', settings: 'settings_digest' };

function boundDigest(rec, cls) {
  if (rec.kind === 'init') return cls === 'settings' ? rec.payload.settings_digest : null;
  return rec.payload[FIELD[cls]];
}

// Fix round 1, item 2: the enforcement path previously trusted authorization records straight from
// the log, verifying evidence only at write time. A forged record (appended directly, bypassing
// authorize()) with a syntactically valid but never-actually-verified evidence object would pass.
// chainRecordVerifies re-checks a chain record's evidence against the CURRENT settings.signing_key
// (spec section 8: "With a signing key their records must verify"), and independently recomputes
// the subject the record's own digests imply, rather than trusting the evidence's own subject
// field, closing the "evidence lifted from another record" gap too.
//
// Fix round 2: the fix round 1 version of this function trusted ANY record of kind 'init' in the
// chain, not just the log's actual first record. The re-reviewer reproduced this: appending a
// second, forged 'init' record via appendRecord (an attacker-chosen settings_digest, no evidence at
// all since the init schema carries none) made isAuthorized('.cairn/settings.json', before, after)
// return true, because that forged record was accepted as a second chain root. The one legitimate
// init record is refs/cairn/log's first record and nothing else (sections 3 and 4); a later record
// of kind 'init', however it got there, is a breach, not a second root. chainRecordVerifies now
// takes the log's actual root sha (rootInitSha below) and only trusts a kind:'init' record when it
// IS that record.
function rootInitSha(log) {
  return log[0]?.kind === 'init' ? log[0].sha : null;
}

function chainRecordVerifies(settings, rec, rootSha) {
  if (rec.kind === 'init') return rec.sha === rootSha;
  const subject = canonicalize({ spec: rec.payload.spec_digest, agreement: rec.payload.agreement_digest, settings: rec.payload.settings_digest });
  return verifyEvidence(settings, rec.payload.evidence, { purpose: 'authorize', subject });
}

export async function isAuthorized(cwd, path, beforeDigest, afterDigest) {
  const cls = protectedClass(path);
  if (!cls) return true;
  const log = await readLog(cwd);
  const rootSha = rootInitSha(log);
  const chain = authorizations(log);
  const { settings } = await loadSettings(cwd);
  for (let i = 0; i < chain.length; i++) {
    if (boundDigest(chain[i], cls) !== afterDigest) continue;
    if (!chainRecordVerifies(settings, chain[i], rootSha)) continue;
    const prev = i === 0 ? null : boundDigest(chain[i - 1], cls);
    if (prev === beforeDigest) return true;
  }
  return false;
}

// Deviation from the plan text: protectedDigests is async on this branch (see the Task 1 note
// above), so this must await it too; the plan's own Interfaces line already marks this "-> void"
// with no Promise noted, matching the codebase's convention of not annotating async in prose.
// Pre-review fix: this compares whole-class digests from protectedDigests(), whose spec digest
// (specDigest, Task 1) already excludes docs/spec/roadmap.md; a roadmap-only change leaves
// now.spec === bound.spec, so it is already consistent with protectedClass's exception above
// without a separate check here.
export async function refuseUnauthorizedProtected(cwd, log) {
  const bound = latestProtected(log);
  if (!bound) throw new AuthError('cairn: run cairn init first', 'no-authorization');
  // Fix round 1, item 2: re-verify the record that bound the current state before trusting its
  // digests at all; a forged newest record refuses regardless of whether now/bound happen to agree.
  const last = authorizations(log).at(-1);
  const { settings } = await loadSettings(cwd);
  const rootSha = rootInitSha(log);
  // Fix round 2: a later record of kind 'init' (this one is not the log's first record) is a
  // structural breach, not an evidence-verification failure; name it distinctly so the refusal is
  // diagnosable rather than folding it into the generic "does not verify" message below.
  if (last.kind === 'init' && last.sha !== rootSha) {
    throw new AuthError(`cairn: ${last.sha} is a second record of kind init on refs/cairn/log; the init record is the log's first record and nothing else; this is a breach`, 'breach');
  }
  if (!chainRecordVerifies(settings, last, rootSha)) {
    throw new AuthError("cairn: the latest authorization record's evidence does not verify against the current signing_key; ask the developer and record the answer with cairn authorize --quote <words>", 'unverified');
  }
  const now = await protectedDigests(cwd);
  const names = { spec: 'docs/spec', agreement: 'AGENTS.md', settings: '.cairn/settings.json' };
  for (const cls of ['settings', 'agreement', 'spec']) {
    if (now[cls] !== bound[cls]) {
      throw new AuthError(`cairn: ${names[cls]} changed to ${now[cls]} without a developer authorization; ask the developer and record the answer with cairn authorize --quote <words>`, 'no-authorization');
    }
  }
}

const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;

// Deviation from the plan text: readDecision's own code block in the plan destructures only
// { sign, quote }, dropping nonce; the plan's prose immediately after that block instructs
// adding the nonce parameter and passing it through, so it is implemented that way directly.
export async function readDecision(cwd, id, { sign, quote, nonce, env } = {}) {
  if (!ULID.test(id)) throw new AuthError('cairn: decision id must be a 26-character ULID');
  const { settings } = await loadSettings(cwd);
  const evidence = await authenticateDeveloper(cwd, settings, { purpose: 'read', subject: id, sign, quote, nonce, env });
  if (!verifyEvidence(settings, evidence, { purpose: 'read', subject: id })) throw new AuthError('cairn: developer evidence does not verify');
  return appendRecord(cwd, 'read', id, { decision: id, evidence });
}

// Fix round 1, item 1: the CLI signed flow is two invocations of the same command. Run 1 (no
// --signature) prints the payload and its nonce, then refuses; the developer signs that payload
// externally and re-runs with --nonce <n> --signature <b64url>. Both invocations must authenticate
// over byte-identical payloads, which means the SAME nonce must be used both times; previously the
// nonce was generated fresh inside authenticateDeveloper on every call (run 2 always got a nonce the
// signature was never computed over, so a real signed round trip could never verify). cliNonce reads
// --nonce from argv; the caller passes that value through as authenticateDeveloper's nonce so run 2
// reconstructs exactly what run 1 printed.
export function cliNonce(argv) {
  const i = argv.indexOf('--nonce');
  return i >= 0 ? argv[i + 1] : null;
}

export function cliSigner(argv, io) {
  const i = argv.indexOf('--signature');
  const given = i >= 0 ? argv[i + 1] : io.env.CAIRN_SIGNATURE;
  const nonce = cliNonce(argv);
  if (!given) {
    return async (bytes) => {
      io.stdout(`cairn: sign this payload: ${Buffer.from(bytes).toString()}`);
      io.stdout('cairn: e.g. openssl pkeyutl -sign -rawin -inkey dev.pem | base64url');
      throw new AuthError("cairn: signing_key is set; pass --signature or CAIRN_SIGNATURE, with --nonce <n> matching the payload's nonce printed above");
    };
  }
  // Fix round 1, item 1: assert the bytes this signature is being applied to are the bytes that
  // were printed, reconstructed from --nonce, rather than returning the supplied signature for
  // whatever bytes authenticateDeveloper happens to hand this function.
  return async (bytes) => {
    let payload;
    try { payload = JSON.parse(Buffer.from(bytes).toString()); } catch { payload = null; }
    if (nonce === null || !payload || payload.nonce !== nonce) {
      throw new AuthError('cairn: --nonce must match the nonce in the payload being signed; pass --nonce <n> together with --signature');
    }
    return unb64url(given);
  };
}

async function refusing(io, fn) {
  try { return await fn(); }
  catch (e) { io.stderr(e.message.startsWith('cairn: ') ? e.message : `cairn: ${e.message}`); return 1; }
}

function flagValue(argv, name) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

export function runDecisionsRead(argv, io) {
  return refusing(io, async () => {
    const id = argv[argv.indexOf('--read') + 1];
    const nonce = cliNonce(argv) ?? b64url(randomBytes(16));
    const quote = flagValue(argv, '--quote');
    const sha = await readDecision(io.cwd, id, { sign: cliSigner(argv, io), quote, nonce, env: io.env });
    const rec = (await readLog(io.cwd)).find((r) => r.sha === sha);
    io.stdout(`cairn: read ${id} recorded as ${sha} (${describeEvidence(rec.payload.evidence)})`);
    return 0;
  });
}

// `authorize [ok|instead|ask] --quote <words>`: a bare word or 'ok' authorizes (unchanged shape);
// 'instead'/'ask' writes a direction record instead (spec revision 6, "Direction"). direction()
// itself refuses any other word with the exact "authorize takes ok, instead or ask" message, so
// that validation lives in one place rather than being duplicated here.
export function runAuthorize(argv, io) {
  return refusing(io, async () => {
    const word = argv[0] && !argv[0].startsWith('--') ? argv[0] : undefined;
    const quote = flagValue(argv, '--quote');
    if (word === undefined || word === 'ok') {
      const nonce = cliNonce(argv) ?? b64url(randomBytes(16));
      const sha = await authorize(io.cwd, { sign: cliSigner(argv, io), quote, nonce, env: io.env });
      const rec = (await readLog(io.cwd)).find((r) => r.sha === sha);
      io.stdout(`cairn: authorization ${sha} (${describeEvidence(rec.payload.evidence)})`);
      return 0;
    }
    const sha = await direction(io.cwd, { kind: word, quote, env: io.env });
    io.stdout(`cairn: direction ${sha} (${word}: "${quote}")`);
    return 0;
  });
}

export async function authenticateDeveloper(cwd, settings, { purpose, subject, sign, quote, nonce, env } = {}) {
  nonce = nonce ?? b64url(randomBytes(16));
  if (settings.signing_key !== null && settings.signing_key !== undefined) {
    if (typeof sign !== 'function') throw new AuthError('cairn: signing_key is set; pass --signature or CAIRN_SIGNATURE');
    const signature = b64url(await sign(signingPayload({ purpose, subject, nonce })));
    const ev = { mode: 'signed', purpose, subject, nonce, signature };
    if (!verifySigned(settings.signing_key, ev)) throw new AuthError('cairn: the signature does not verify against signing_key');
    return ev;
  }
  return attested(cwd, { purpose, subject, nonce, quote, env });
}
