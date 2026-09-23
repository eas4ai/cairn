import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SUDUS_SVG, EXPRESSIONS } from '../mod/faces.ts'
import { base64Of, polygonsOfPath, rasterOf, shapesOf } from '../mod/raster.ts'

test('a path with M, C and Z becomes one closed polygon', () => {
  const polys = polygonsOfPath('M10 10C20 10 20 20 10 20Z')
  assert.equal(polys.length, 1)
  assert.ok(polys[0]!.length > 4)
})

test('the six faces each hold the background, the body, two blobs and two eyes', () => {
  for (const x of EXPRESSIONS) {
    const { shapes, size } = shapesOf(SUDUS_SVG[x])
    assert.equal(size, 100, x)
    assert.ok(shapes.length >= 5, x)
    assert.deepEqual(shapes[0]!.fill, [0xee, 0xf6, 0xf1], x)
  }
})

test('the raster is opaque where the squircle is and the body is green in the middle', () => {
  const r = rasterOf(SUDUS_SVG.idle, 48)
  assert.equal(r.width, 48)
  const bytes = Uint8Array.from(atob(r.rgba), c => c.charCodeAt(0))
  assert.equal(bytes.length, 48 * 48 * 4)
  const at = (x: number, y: number) => Array.from(bytes.subarray((y * 48 + x) * 4, (y * 48 + x) * 4 + 4))
  assert.deepEqual(at(24, 24), [0x9f, 0xe3, 0xbe, 255])
  assert.equal(at(0, 0)[3], 0)
})

test('base64 matches the platform encoder', () => {
  const bytes = Uint8Array.from([0, 1, 2, 250, 251, 252, 253])
  assert.equal(base64Of(bytes), btoa(String.fromCharCode(...bytes)))
})
