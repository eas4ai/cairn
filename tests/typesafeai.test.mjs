import { test } from 'node:test';
import assert from 'node:assert/strict';
import { post, ENDPOINT, TransportError, retryDelayMs } from '../bin/typesafeai.mjs';

const req = { state: 's', model: 'jev-1.13.0', questions: { q: { type: 'noul', instructions: 'x?' } } };

// A minimal Headers-like object: only .get(), case-insensitive, matching what a real
// fetch Response exposes and what bin/typesafeai.mjs reads.
function headers(map = {}) {
  const lower = new Map(Object.entries(map).map(([k, v]) => [k.toLowerCase(), v]));
  return { get: (name) => (lower.has(name.toLowerCase()) ? lower.get(name.toLowerCase()) : null) };
}

const fake = (status, text, capture = {}, headerMap) => async (url, init) => {
  capture.url = url; capture.init = init;
  return { status, text: async () => text, headers: headers(headerMap) };
};

// Yields one entry from `responses` per call (holding on the last entry once
// exhausted) and records every call's init, so a test can check the request body
// stays byte-identical across retries.
function series(responses, calls = []) {
  let i = 0;
  return async (url, init) => {
    calls.push(init);
    const r = responses[Math.min(i, responses.length - 1)];
    i += 1;
    if (r instanceof Error) throw r;
    return { status: r.status, text: async () => r.text ?? '{}', headers: headers(r.headers) };
  };
}

const noSleep = async () => {};
const noJitter = () => 0;

test('posts bearer, accept and JSON headers and body to the endpoint', async () => {
  const cap = {};
  const r = await post(req, { key: 'k-123', fetchImpl: fake(200, '{"model":"jev-1.13.0","answers":{},"usage":{"input_tokens":1,"output_tokens":1}}', cap) });
  assert.equal(cap.url, ENDPOINT);
  assert.equal(cap.init.method, 'POST');
  assert.equal(cap.init.headers.Authorization, 'Bearer k-123');
  assert.equal(cap.init.headers.Accept, 'application/json');
  assert.equal(cap.init.headers['Content-Type'], 'application/json');
  assert.equal(cap.init.body, JSON.stringify(req));
  assert.equal(r.status, 200);
  assert.equal(r.model, 'jev-1.13.0');
  assert.equal(typeof r.body, 'string');
  assert.ok(!JSON.stringify(r).includes('k-123'));
});

test('reads TYPESAFEAI_API_KEY when key is absent and never stores it', async () => {
  process.env.TYPESAFEAI_API_KEY = 'env-key';
  const cap = {};
  const r = await post(req, { fetchImpl: fake(200, '{"model":"jev-1.13.0","answers":{},"usage":{}}', cap) });
  assert.equal(cap.init.headers.Authorization, 'Bearer env-key');
  assert.ok(!Object.values(r).some((v) => String(v).includes('env-key')));
  delete process.env.TYPESAFEAI_API_KEY;
});

test('missing key is class nokey and nothing is fetched', async () => {
  delete process.env.TYPESAFEAI_API_KEY;
  let called = false;
  await assert.rejects(post(req, { fetchImpl: async () => { called = true; } }),
    (e) => e instanceof TransportError && e.klass === 'nokey');
  assert.equal(called, false);
});

test('non-retryable failures are classified on the first response, no retry', async () => {
  const cases = [
    [401, '{"error":"bad key"}', 'auth'],
    [422, '{"error":"state exceeds context length"}', 'context'],
    [422, '{"error":"missing field"}', 'http'],
    [400, '{"error":"bad request"}', 'http'],
  ];
  for (const [status, text, klass] of cases) {
    const calls = [];
    await assert.rejects(
      post(req, { key: 'k', fetchImpl: series([{ status, text }], calls), sleepImpl: noSleep, randomImpl: noJitter }),
      (e) => e.klass === klass && e.status === status, `${status} ${text}`);
    assert.equal(calls.length, 1, `${status} must not retry`);
  }
  await assert.rejects(post(req, { key: 'k', fetchImpl: async () => { throw new Error('ECONNRESET'); } }),
    (e) => e.klass === 'network');
  await assert.rejects(post(req, { key: 'k', fetchImpl: fake(200, 'not json') }),
    (e) => e.klass === 'malformed' && e.body === 'not json');
});

test('error text never carries the key', async () => {
  await assert.rejects(post(req, { key: 'secret-xyz', fetchImpl: fake(401, 'denied') }),
    (e) => !e.message.includes('secret-xyz') && !String(e.stack).includes('secret-xyz'));
});

test('429 then 200 succeeds after one retry with the documented backoff delay', async () => {
  const calls = [];
  const delays = [];
  const r = await post(req, {
    key: 'k',
    fetchImpl: series([{ status: 429, text: '{}' }, { status: 200, text: '{"model":"jev-1.13.0","answers":{},"usage":{}}' }], calls),
    sleepImpl: async (ms) => { delays.push(ms); },
    randomImpl: () => 0.5,
  });
  assert.equal(calls.length, 2);
  assert.equal(r.model, 'jev-1.13.0');
  // exponential = min(500 * 2**0, 5000) = 500; delay = round(500 * (1 - 0.5*0.25)) = 438
  assert.deepEqual(delays, [438]);
  assert.equal(calls[0].body, calls[1].body);
});

test('529 three times exhausts retries and classifies overloaded', async () => {
  const calls = [];
  const delays = [];
  await assert.rejects(
    post(req, {
      key: 'k',
      fetchImpl: series([{ status: 529, text: '{}' }, { status: 529, text: '{}' }, { status: 529, text: '{}' }], calls),
      sleepImpl: async (ms) => { delays.push(ms); },
      randomImpl: noJitter,
    }),
    (e) => e instanceof TransportError && e.klass === 'overloaded' && e.status === 529);
  assert.equal(calls.length, 3);
  // no jitter: exponential backoff is 500 then 1000 (500 * 2**0, 500 * 2**1)
  assert.deepEqual(delays, [500, 1000]);
  assert.equal(calls[0].body, calls[1].body);
  assert.equal(calls[1].body, calls[2].body);
});

test('generic 5xx is retried, then classified http once exhausted', async () => {
  const calls = [];
  await assert.rejects(
    post(req, {
      key: 'k',
      fetchImpl: series([{ status: 500, text: 'oops' }, { status: 500, text: 'oops' }, { status: 500, text: 'oops' }], calls),
      sleepImpl: noSleep,
      randomImpl: noJitter,
    }),
    (e) => e instanceof TransportError && e.klass === 'http' && e.status === 500 && e.body === 'oops');
  assert.equal(calls.length, 3);
});

test('408 and 503 are retried and succeed on the second attempt', async () => {
  for (const status of [408, 503]) {
    const calls = [];
    const r = await post(req, {
      key: 'k',
      fetchImpl: series([{ status, text: '{}' }, { status: 200, text: '{"model":"jev-1.13.0","answers":{},"usage":{}}' }], calls),
      sleepImpl: noSleep,
      randomImpl: noJitter,
    });
    assert.equal(calls.length, 2, `${status} must retry once before succeeding`);
    assert.equal(r.model, 'jev-1.13.0');
  }
});

test('retry-after-ms wins over Retry-After, and either is capped at 60000ms', async () => {
  const delays = [];
  await post(req, {
    key: 'k',
    fetchImpl: series([
      { status: 429, text: '{}', headers: { 'retry-after-ms': '250', 'retry-after': '120' } },
      { status: 200, text: '{"model":"jev-1.13.0","answers":{},"usage":{}}' },
    ]),
    sleepImpl: async (ms) => { delays.push(ms); },
    randomImpl: noJitter,
  });
  assert.deepEqual(delays, [250]);

  const delays2 = [];
  await post(req, {
    key: 'k',
    fetchImpl: series([
      { status: 429, text: '{}', headers: { 'retry-after': '9999' } },
      { status: 200, text: '{"model":"jev-1.13.0","answers":{},"usage":{}}' },
    ]),
    sleepImpl: async (ms) => { delays2.push(ms); },
    randomImpl: noJitter,
  });
  assert.deepEqual(delays2, [60000]);
});

test('a response slower than the timeout is classified timeout, not network', async () => {
  const fetchImpl = async (url, init) => new Promise((resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')));
  });
  await assert.rejects(
    post(req, { key: 'k', fetchImpl, timeoutMs: 5 }),
    (e) => e instanceof TransportError && e.klass === 'timeout');
});

test('a fetch rejection with no timeout in flight is still classified network', async () => {
  await assert.rejects(
    post(req, { key: 'k', fetchImpl: async () => { throw new Error('ECONNRESET'); }, timeoutMs: 1000 }),
    (e) => e instanceof TransportError && e.klass === 'network');
});

test('a body read slower than the timeout is classified timeout, not left hanging', async () => {
  // Headers arrive immediately (fetchImpl resolves), but text() only settles once the
  // signal is aborted -- proving the timeout covers the whole exchange, not just the
  // connection.
  const fetchImpl = async (url, init) => ({
    status: 200,
    headers: headers({}),
    text: () => new Promise((resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')));
    }),
  });
  await assert.rejects(
    post(req, { key: 'k', fetchImpl, timeoutMs: 5 }),
    (e) => e instanceof TransportError && e.klass === 'timeout');
});

test('retryDelayMs caps exponential backoff at 5000ms', () => {
  const res = { headers: headers({}) }; // no retry-after headers, so backoff applies
  // 500 * 2**4 = 8000, capped to BACKOFF_MAX_MS
  assert.equal(retryDelayMs(res, 4, noJitter), 5000);
  // 500 * 2**1 = 1000, under the cap
  assert.equal(retryDelayMs(res, 1, noJitter), 1000);
});
