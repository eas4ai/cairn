import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalize, parseStrict, CanonError } from '../lib/canon.mjs';

test('canonicalize sorts keys, drops whitespace, escapes minimally', () => {
  assert.equal(canonicalize({ b: 1, a: [true, null, 'x'] }), '{"a":[true,null,"x"],"b":1}');
  assert.equal(canonicalize({ s: 'tab\t\u001bé' }), '{"s":"tab\\t\\u001bé"}');
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
  assert.deepEqual(parseStrict(Buffer.from('{"k":"é"}', 'utf8')), { k: 'é' });
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
