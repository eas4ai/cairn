// lib/auth.mjs
import { readFileSync, readdirSync, lstatSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { verify as cryptoVerify, createPublicKey, randomBytes } from 'node:crypto';
import { sha256, canonicalize, b64url, unb64url } from './canon.mjs';
import { loadSettings } from './settings.mjs';

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

// unsignedLocal is a stub until Task 3 replaces it with the controlling-terminal implementation.
async function unsignedLocal() { throw new AuthError('cairn: unsigned-local not built'); }

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
