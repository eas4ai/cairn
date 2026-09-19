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
const MAX_BODY_BYTES = 2000;

// A server response can echo the request back, including the bearer key, and can run
// to any length. This is the one place response text is ever attached to an error
// (TransportError.body, and by extension anything derived from it, such as
// JSON.stringify(error) or a logged error message), so it is the one place that needs
// to strip the key and cap the length -- every occurrence of `key` is replaced before
// truncating to MAX_BODY_BYTES, so a key that straddles the truncation point is still
// fully redacted rather than half-visible.
function sanitize(text, key) {
  if (typeof text !== 'string') return text;
  const redacted = key ? text.split(key).join('[redacted]') : text;
  const buf = Buffer.from(redacted, 'utf8');
  return buf.length > MAX_BODY_BYTES ? buf.subarray(0, MAX_BODY_BYTES).toString('utf8') : redacted;
}

export class TransportError extends Error {
  // `key` is never stored: it is used once, here, to redact `body`, and only the
  // redacted, truncated result becomes part of the error (message never carries
  // response text at all, so it needs no separate redaction).
  constructor(klass, status, body, key) {
    super(`typesafeai: ${klass}${status ? ' ' + status : ''}`);
    this.klass = klass; this.status = status ?? null;
    this.body = body == null ? null : sanitize(body, key);
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
export function retryDelayMs(res, attempt, randomImpl) {
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
    // The timeout covers the whole exchange, not just the connection: res stays
    // undefined until fetchImpl itself resolves, so a rejection with res still
    // undefined is the connection failing, and a rejection after that is the body
    // read failing -- both are 'timeout' when the abort fired, and an unclassified
    // body-read failure otherwise propagates unchanged, as it always has.
    let res, text;
    try {
      res = await fetchImpl(ENDPOINT, { method: 'POST', headers, body, signal: controller.signal });
      text = await res.text();
    } catch (e) {
      if (timedOut) throw new TransportError('timeout');
      if (res === undefined) throw new TransportError('network');
      throw e;
    } finally {
      clearTimeout(timer);
    }

    if (res.status !== 200) {
      if (isRetryableStatus(res.status) && attempt < MAX_RETRIES) {
        const delay = retryDelayMs(res, attempt, randomImpl);
        attempt += 1;
        await sleepImpl(delay);
        continue;
      }
      throw new TransportError(classify(res.status, text), res.status, text, k);
    }

    let parsed;
    try { parsed = JSON.parse(text); } catch { throw new TransportError('malformed', 200, text, k); }
    if (!parsed || typeof parsed !== 'object' || typeof parsed.model !== 'string') throw new TransportError('malformed', 200, text, k);
    return { status: 200, body: text, model: parsed.model };
  }
}
