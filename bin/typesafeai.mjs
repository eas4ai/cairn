// bin/typesafeai.mjs
// The only file in Cairn that performs network I/O. It never stores or logs the key.
export const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';

export class TransportError extends Error {
  constructor(klass, status, body) {
    super(`typesafeai: ${klass}${status ? ' ' + status : ''}`);
    this.klass = klass; this.status = status ?? null; this.body = body ?? null;
  }
}

function classify(status, text) {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429 || status === 529) return 'overloaded';
  if (status === 422 && /context|token/i.test(text)) return 'context';
  return 'http';
}

export async function post(request, { key, fetchImpl = globalThis.fetch } = {}) {
  const k = key ?? process.env.TYPESAFEAI_API_KEY;
  if (!k) throw new TransportError('nokey');
  let res;
  try {
    res = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
  } catch {
    throw new TransportError('network');
  }
  const text = await res.text();
  if (res.status !== 200) throw new TransportError(classify(res.status, text), res.status, text);
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new TransportError('malformed', 200, text); }
  if (!parsed || typeof parsed !== 'object' || typeof parsed.model !== 'string') throw new TransportError('malformed', 200, text);
  return { status: 200, body: text, model: parsed.model };
}
