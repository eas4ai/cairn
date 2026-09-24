import { test } from 'node:test'
import assert from 'node:assert/strict'
import { figureAt } from '../mod/figure.ts'
import { base64Of, rasterOf } from '../mod/raster.ts'

test('the raster is opaque where the squircle is and the body is green in the middle', () => {
  const r = rasterOf(figureAt('sudus', 'idle', 0, 0, true), 48)
  assert.equal(r.width, 48)
  const bytes = Uint8Array.from(atob(r.rgba), c => c.charCodeAt(0))
  assert.equal(bytes.length, 48 * 48 * 4)
  const at = (x: number, y: number) => Array.from(bytes.subarray((y * 48 + x) * 4, (y * 48 + x) * 4 + 4))
  assert.deepEqual(at(24, 36), [0x9f, 0xe3, 0xbe, 255])
  assert.equal(at(0, 0)[3], 0)
})

test('base64 matches the platform encoder', () => {
  const bytes = Uint8Array.from([0, 1, 2, 250, 251, 252, 253])
  assert.equal(base64Of(bytes), btoa(String.fromCharCode(...bytes)))
})
