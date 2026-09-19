import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalize, parseStrict, CanonError } from '../lib/canon.mjs';

test('canonicalize sorts keys, drops whitespace, escapes minimally', () => {
  assert.equal(canonicalize({ b: 1, a: [true, null, 'x'] }), '{"a":[true,null,"x"],"b":1}');
  assert.equal(canonicalize({ s: 'tab\t\u001b\u00e9' }), '{"s":"tab\\t\\u001b\u00e9"}');
  assert.equal(canonicalize(-0), '0');
  assert.equal(canonicalize(1e21), '1e+21');
});
test('canonicalize rejects non-finite numbers and lone surrogates', () => {
  assert.throws(() => canonicalize(Infinity), CanonError);
  assert.throws(() => canonicalize({ x: NaN }), CanonError);
  assert.throws(() => canonicalize('\ud800'), CanonError);
  assert.throws(() => canonicalize({ f() {} }), CanonError);
});
test('parseStrict accepts exactly the canonical form', () => {
  assert.deepEqual(parseStrict('{"a":1,"b":[2]}'), { a: 1, b: [2] });
  assert.deepEqual(parseStrict(Buffer.from('{"k":"\u00e9"}', 'utf8')), { k: '\u00e9' });
});
test('parseStrict rejects noncanonical JSON: whitespace, order, number form, escapes', () => {
  for (const bad of ['{"a": 1}', '{"b":1,"a":2}', '{"a":1.0}', '{"a":"\\u00e9"}', '{"a":"\\u001B"}', '{"a":1}\n'])
    assert.throws(() => parseStrict(bad), /noncanonical/);
});
test('parseStrict rejects duplicate keys', () => {
  assert.throws(() => parseStrict('{"a":1,"a":2}'), /noncanonical/);
});
test('parseStrict rejects out-of-range numbers', () => {
  assert.throws(() => parseStrict('{"a":1e400}'), CanonError);
});
test('parseStrict rejects control characters outside JSON escapes', () => {
  assert.throws(() => parseStrict('{"a":"x\u0001y"}'), /invalid JSON/);
});
test('parseStrict rejects invalid UTF-8', () => {
  assert.throws(() => parseStrict(Buffer.from([0x7b, 0x22, 0x61, 0x22, 0x3a, 0x22, 0xff, 0x22, 0x7d])), /invalid UTF-8/);
});

import { sha256, b64url, unb64url, ulid } from '../lib/canon.mjs';

test('sha256 hashes strings as UTF-8 and bytes as given', () => {
  assert.equal(sha256('abc'), 'sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(sha256(Buffer.from('abc')), sha256('abc'));
});
test('base64url is unpadded and round-trips; padding and stray chars are refused', () => {
  const bytes = new Uint8Array([0, 255, 16, 3]);
  assert.equal(b64url(bytes), 'AP8QAw');
  assert.deepEqual(unb64url('AP8QAw'), bytes);
  assert.throws(() => unb64url('AP8QAw=='), CanonError);
  assert.throws(() => unb64url('AP8Q+w'), CanonError);
});
test('ulid is 26 Crockford chars and monotonic within a millisecond', () => {
  const a = ulid(1700000000000), b = ulid(1700000000000), c = ulid(1700000000001);
  for (const u of [a, b, c]) assert.match(u, /^[0-9A-HJKMNP-TV-Z]{26}$/);
  assert.ok(a < b && b < c);
  assert.equal(a.slice(0, 10), b.slice(0, 10));
});
