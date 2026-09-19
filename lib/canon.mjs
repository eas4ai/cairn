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
