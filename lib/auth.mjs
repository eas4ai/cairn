// lib/auth.mjs
import { readFileSync, readdirSync, lstatSync, existsSync, openSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { verify as cryptoVerify, createPublicKey, randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline';
import { ReadStream, WriteStream } from 'node:tty';
import { sha256, canonicalize, b64url, unb64url } from './canon.mjs';
import { loadSettings } from './settings.mjs';
import { git } from './gitx.mjs';
import { appendRecord, readLog } from './records.mjs';
import { matchGlob, PROTECTED_EXCEPT } from './paths.mjs';

// Deviation from the plan text: the plan's Task 1 code (`export class AuthError extends Error {}`)
// leaves Error.prototype.name = 'Error', but every test in this plan asserts the stringified
// rejection starts with 'AuthError: ...' (the pattern every other lib/*.mjs error class in this
// codebase follows). Set the name explicitly so String(err) matches.
export class AuthError extends Error { constructor(m) { super(m); this.name = 'AuthError'; } }

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
  // The roadmap is kernel-edited at start and promote (section 2, protected paths); it is bound structurally, not by digest.
  const kept = files.filter((f) => f !== 'docs/spec/roadmap.md');
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

export function verifyEvidence(settings, ev) {
  if (!ev || typeof ev !== 'object') return false;
  if (settings.signing_key === null || settings.signing_key === undefined) {
    return ev.mode === 'unsigned-local' && ev.confirmed === true
      && typeof ev.author?.name === 'string' && typeof ev.author?.email === 'string';
  }
  return ev.mode === 'signed' && typeof ev.signature === 'string' && verifySigned(settings.signing_key, ev);
}

export function describeEvidence(ev) {
  return ev.mode === 'signed' ? 'signed by the developer key'
    : `unsigned-local: terminal confirmation by ${ev.author.name} <${ev.author.email}>; evidence, not authentication`;
}

export async function ttyConfirm(prompt) {
  let fd;
  try { fd = openSync('/dev/tty', 'r+'); }
  catch { throw new AuthError('cairn: no controlling terminal; unsigned-local confirmation needs a TTY'); }
  const input = new ReadStream(fd); const output = new WriteStream(fd);
  const rl = createInterface({ input, output });
  try {
    const answer = await new Promise((res) => rl.question(`${prompt}\nType yes to confirm: `, res));
    return answer.trim() === 'yes';
  } finally { rl.close(); input.destroy(); output.destroy(); closeSync(fd); }
}

async function gitAuthor(cwd) {
  // git var honours GIT_AUTHOR_NAME and GIT_AUTHOR_EMAIL as well as user.name and user.email.
  const r = await git(['var', 'GIT_AUTHOR_IDENT'], { cwd });
  const m = /^(.*?) <([^>]*)> \d+ [-+]\d{4}$/.exec(r.stdout.trim());
  if (r.code !== 0 || !m || !m[1] || !m[2]) throw new AuthError('cairn: unsigned-local evidence needs a Git author (user.name and user.email)');
  return { name: m[1], email: m[2] };
}

async function unsignedLocal(cwd, { purpose, subject, nonce, confirm = ttyConfirm }) {
  const author = await gitAuthor(cwd);
  const ok = await confirm(`cairn ${purpose} ${subject}: confirm as ${author.name} <${author.email}> (unsigned-local; evidence, not authentication)`);
  if (!ok) throw new AuthError(`cairn: the developer did not confirm ${purpose} ${subject}`);
  return { mode: 'unsigned-local', purpose, subject, nonce, author, confirmed: true };
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

export async function authorize(cwd, { sign, confirm, decision = null } = {}) {
  const log = await readLog(cwd);
  if (!log.some((r) => r.kind === 'init')) throw new AuthError('cairn: run cairn init first');
  if (!existsSync(join(cwd, 'AGENTS.md'))) throw new AuthError('cairn: AGENTS.md is missing; authorize binds the working agreement');
  if (!existsSync(join(cwd, 'docs/spec'))) throw new AuthError('cairn: docs/spec is missing; authorize binds the specification');
  const { settings } = await loadSettings(cwd);
  const d = await protectedDigests(cwd);
  const subject = canonicalize({ spec: d.spec, agreement: d.agreement, settings: d.settings });
  const evidence = await authenticateDeveloper(cwd, settings, { purpose: 'authorize', subject, sign, confirm });
  if (!verifyEvidence(settings, evidence)) throw new AuthError('cairn: developer evidence does not verify');
  return appendRecord(cwd, 'authorization', 'protected',
    { spec_digest: d.spec, agreement_digest: d.agreement, settings_digest: d.settings, evidence, decision, intent: null });
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

export async function isAuthorized(cwd, path, beforeDigest, afterDigest) {
  const cls = protectedClass(path);
  if (!cls) return true;
  const chain = authorizations(await readLog(cwd));
  for (let i = 0; i < chain.length; i++) {
    if (boundDigest(chain[i], cls) !== afterDigest) continue;
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
  if (!bound) throw new AuthError('cairn: run cairn init first');
  const now = await protectedDigests(cwd);
  const names = { spec: 'docs/spec', agreement: 'AGENTS.md', settings: '.cairn/settings.json' };
  for (const cls of ['settings', 'agreement', 'spec']) {
    if (now[cls] !== bound[cls]) {
      throw new AuthError(`cairn: ${names[cls]} changed to ${now[cls]} without a developer authorization; run cairn authorize`);
    }
  }
}

const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;

// Deviation from the plan text: readDecision's own code block in the plan destructures only
// { sign, confirm }, dropping nonce; the plan's prose immediately after that block instructs
// adding the nonce parameter and passing it through, so it is implemented that way directly.
export async function readDecision(cwd, id, { sign, confirm, nonce } = {}) {
  if (!ULID.test(id)) throw new AuthError('cairn: decision id must be a 26-character ULID');
  const { settings } = await loadSettings(cwd);
  const evidence = await authenticateDeveloper(cwd, settings, { purpose: 'read', subject: id, sign, confirm, nonce });
  if (!verifyEvidence(settings, evidence)) throw new AuthError('cairn: developer evidence does not verify');
  return appendRecord(cwd, 'read', id, { decision: id, evidence });
}

export function cliSigner(argv, io, payloadPreview) {
  const i = argv.indexOf('--signature');
  const given = i >= 0 ? argv[i + 1] : io.env.CAIRN_SIGNATURE;
  if (!given) {
    return async (bytes) => {
      io.stdout(`cairn: sign this payload: ${Buffer.from(bytes).toString()}`);
      io.stdout('cairn: e.g. openssl pkeyutl -sign -rawin -inkey dev.pem | base64url');
      throw new AuthError('cairn: signing_key is set; pass --signature or CAIRN_SIGNATURE');
    };
  }
  return async () => unb64url(given);
}

async function refusing(io, fn) {
  try { return await fn(); }
  catch (e) { io.stderr(e.message.startsWith('cairn: ') ? e.message : `cairn: ${e.message}`); return 1; }
}

export function runDecisionsRead(argv, io) {
  return refusing(io, async () => {
    const id = argv[argv.indexOf('--read') + 1];
    const nonce = b64url(randomBytes(16));
    const sha = await readDecision(io.cwd, id, { sign: cliSigner(argv, io), confirm: ttyConfirm, nonce });
    io.stdout(`cairn: read ${id} recorded as ${sha}`);
    return 0;
  });
}

export function runAuthorize(argv, io) {
  return refusing(io, async () => {
    const sha = await authorize(io.cwd, { sign: cliSigner(argv, io), confirm: ttyConfirm });
    io.stdout(`cairn: authorization ${sha}`);
    return 0;
  });
}

export async function authenticateDeveloper(cwd, settings, { purpose, subject, sign, confirm, nonce } = {}) {
  nonce = nonce ?? b64url(randomBytes(16));
  if (settings.signing_key !== null && settings.signing_key !== undefined) {
    if (typeof sign !== 'function') throw new AuthError('cairn: signing_key is set; pass --signature or CAIRN_SIGNATURE');
    const signature = b64url(await sign(signingPayload({ purpose, subject, nonce })));
    const ev = { mode: 'signed', purpose, subject, nonce, signature };
    if (!verifySigned(settings.signing_key, ev)) throw new AuthError('cairn: the signature does not verify against signing_key');
    return ev;
  }
  return unsignedLocal(cwd, { purpose, subject, nonce, confirm }); // Task 3
}
