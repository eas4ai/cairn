import { test } from 'node:test';
import assert from 'node:assert/strict';
import { post, ENDPOINT, TransportError } from '../bin/typesafeai.mjs';

const req = { state: 's', model: 'jev-1.13.0', questions: { q: { type: 'noul', instructions: 'x?' } } };
const fake = (status, text, capture = {}) => async (url, init) => {
  capture.url = url; capture.init = init;
  return { status, text: async () => text };
};

test('posts bearer header and JSON body to the endpoint', async () => {
  const cap = {};
  const r = await post(req, { key: 'k-123', fetchImpl: fake(200, '{"model":"jev-1.13.0","answers":{},"usage":{"input_tokens":1,"output_tokens":1}}', cap) });
  assert.equal(cap.url, ENDPOINT);
  assert.equal(cap.init.method, 'POST');
  assert.equal(cap.init.headers.Authorization, 'Bearer k-123');
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

test('classifies failures', async () => {
  const cases = [
    [401, '{"error":"bad key"}', 'auth'], [429, '{}', 'overloaded'], [529, '{}', 'overloaded'],
    [422, '{"error":"state exceeds context length"}', 'context'], [422, '{"error":"missing field"}', 'http'],
    [500, 'oops', 'http'],
  ];
  for (const [status, text, klass] of cases) {
    await assert.rejects(post(req, { key: 'k', fetchImpl: fake(status, text) }),
      (e) => e.klass === klass && e.status === status, `${status} ${text}`);
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
