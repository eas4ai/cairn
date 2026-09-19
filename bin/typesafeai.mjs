// bin/typesafeai.mjs
// The only file in Cairn that performs network I/O. It never stores or logs the key.
export const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';

// Retry policy mirrors typesafe-sdk-js v0.6.0 (src/retry.ts): retry 408, 429 and every
// 5xx, up to two extra attempts, with exponential backoff from a 500ms base, doubling
// per attempt, capped at 5s, plus 25% jitter. A retry-after-ms or Retry-After response
// header overrides the computed delay, capped at 60s. Every other error class (auth,
// context, malformed, network, nokey, and overloaded once retries are exhausted) is
// unchanged from before retries existed.
const MAX_RETRIES = 2;
const BACKOFF_INITIAL_MS = 500;
const BACKOFF_MAX_MS = 5000;
const JITTER = 0.25;
const RETRY_AFTER_CAP_MS = 60000;
const DEFAULT_TIMEOUT_MS = 60000;

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

function isRetryableStatus(status) {
  return status === 408 || status === 429 || (status >= 500 && status < 600);
}

function retryAfterHeader(res, name) {
  const h = res?.headers;
  if (!h || typeof h.get !== 'function') return null;
  return h.get(name);
}

// Delay before the next attempt: an explicit retry-after-ms or Retry-After response
// header wins (capped at 60s); otherwise exponential backoff from BACKOFF_INITIAL_MS,
// doubling per attempt and capped at BACKOFF_MAX_MS, with 25% jitter applied as
// round(exponential * (1 - random() * JITTER)). `attempt` is the number of retries
// already made (0 for the delay before the first retry).
function retryDelayMs(res, attempt, randomImpl) {
  const msHeader = retryAfterHeader(res, 'retry-after-ms');
  if (msHeader != null) {
    const ms = Number.parseFloat(msHeader);
    if (Number.isFinite(ms) && ms >= 0) return Math.min(ms, RETRY_AFTER_CAP_MS);
  }
  const secHeader = retryAfterHeader(res, 'retry-after');
  if (secHeader != null) {
    const seconds = Number.parseFloat(secHeader);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, RETRY_AFTER_CAP_MS);
  }
  const exponential = Math.min(BACKOFF_INITIAL_MS * (2 ** attempt), BACKOFF_MAX_MS);
  return Math.round(exponential * (1 - randomImpl() * JITTER));
}

export async function post(request, opts = {}) {
  const {
    key,
    fetchImpl = globalThis.fetch,
    sleepImpl = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    randomImpl = Math.random,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = opts;
  const k = key ?? process.env.TYPESAFEAI_API_KEY;
  if (!k) throw new TransportError('nokey');
  // Computed once and reused verbatim on every attempt, so a retried request is
  // byte-identical to the one that preceded it.
  const body = JSON.stringify(request);
  const headers = { Authorization: `Bearer ${k}`, Accept: 'application/json', 'Content-Type': 'application/json' };

  let attempt = 0;
  for (;;) {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    let res;
    try {
      res = await fetchImpl(ENDPOINT, { method: 'POST', headers, body, signal: controller.signal });
    } catch {
      throw new TransportError(timedOut ? 'timeout' : 'network');
    } finally {
      clearTimeout(timer);
    }

    if (res.status !== 200) {
      const text = await res.text();
      if (isRetryableStatus(res.status) && attempt < MAX_RETRIES) {
        const delay = retryDelayMs(res, attempt, randomImpl);
        attempt += 1;
        await sleepImpl(delay);
        continue;
      }
      throw new TransportError(classify(res.status, text), res.status, text);
    }

    const text = await res.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch { throw new TransportError('malformed', 200, text); }
    if (!parsed || typeof parsed !== 'object' || typeof parsed.model !== 'string') throw new TransportError('malformed', 200, text);
    return { status: 200, body: text, model: parsed.model };
  }
}
