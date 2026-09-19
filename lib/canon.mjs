import { createHash, randomBytes } from 'node:crypto';

export class CanonError extends Error { constructor(m) { super(m); this.name = 'CanonError'; } }

export function canonicalize(value) {
  if (value === null) return 'null';
  const t = typeof value;
  if (t === 'boolean') return value ? 'true' : 'false';
  if (t === 'number') { if (!Number.isFinite(value)) throw new CanonError('non-finite number'); return JSON.stringify(value); }
  if (t === 'string') { if (!value.isWellFormed()) throw new CanonError('lone surrogate in string'); return JSON.stringify(value); }
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
  if (t === 'object') {
    const keys = Object.keys(value).sort(); // default sort is UTF-16 code unit order, as RFC 8785 requires
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalize(value[k])).join(',') + '}';
  }
  throw new CanonError(`cannot canonicalize ${t}`);
}

const fatal = new TextDecoder('utf-8', { fatal: true });
export function parseStrict(input) {
  let text = input;
  if (input instanceof Uint8Array) { try { text = fatal.decode(input); } catch { throw new CanonError('invalid UTF-8'); } }
  let value;
  try { value = JSON.parse(text); } catch (e) { throw new CanonError(`invalid JSON: ${e.message}`); }
  if (canonicalize(value) !== text) throw new CanonError('noncanonical JSON');
  return value;
}

export function sha256(data) {
  return 'sha256:' + createHash('sha256').update(typeof data === 'string' ? Buffer.from(data, 'utf8') : data).digest('hex');
}
export function b64url(bytes) { return Buffer.from(bytes).toString('base64url'); }
export function unb64url(s) {
  if (typeof s !== 'string' || !/^[A-Za-z0-9_-]*$/.test(s)) throw new CanonError('invalid base64url');
  const out = Buffer.from(s, 'base64url');
  if (out.toString('base64url') !== s) throw new CanonError('invalid base64url');
  return new Uint8Array(out);
}

const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
let lastTime = -1, lastRand = 0n;
function enc(n, chars) { let s = ''; for (let i = 0; i < chars; i++) { s = B32[Number(n & 31n)] + s; n >>= 5n; } return s; }
export function ulid(now = Date.now()) {
  if (now <= lastTime) { now = lastTime; lastRand += 1n; }
  else lastRand = BigInt('0x' + randomBytes(10).toString('hex'));
  lastTime = now;
  return enc(BigInt(now), 10) + enc(lastRand, 16);
}
