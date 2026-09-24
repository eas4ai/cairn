import { test } from 'node:test'
import assert from 'node:assert/strict'
import { blinkOf, EXPRESSIONS, figureAt, matrixOf, multiply, polygonsOfPath, svgOf, type Shape } from '../mod/figure.ts'

const near = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]!) < 1e-9)
const eyes = (shapes: Shape[]) => shapes.filter(s => s.part === 'eye')
const height = (s: Shape) => Math.max(...s.points.map(p => p[1])) - Math.min(...s.points.map(p => p[1]))

test('a transform list composes left to right, as SVG applies it to a point right to left', () => {
  assert.ok(near(matrixOf('translate(10 20) scale(2)'), [2, 0, 0, 2, 10, 20]))
  assert.ok(near(matrixOf('translate(50 50) scale(1.1 0.9) translate(-50 -50)'), multiply(multiply([1, 0, 0, 1, 50, 50], [1.1, 0, 0, 0.9, 0, 0]), [1, 0, 0, 1, -50, -50])))
  const r = matrixOf('rotate(90)')
  assert.ok(near(r, [Math.cos(Math.PI / 2), 1, -1, Math.cos(Math.PI / 2), 0, 0]))
  assert.ok(near(matrixOf(''), [1, 0, 0, 1, 0, 0]))
})

test('a path with M, C and Z becomes one closed polygon', () => {
  const polys = polygonsOfPath('M10 10C20 10 20 20 10 20Z')
  assert.equal(polys.length, 1)
  assert.ok(polys[0]!.length > 4)
})

test('every expression draws the plate, the body and two eyes, in that order', () => {
  for (const x of EXPRESSIONS) {
    const shapes = figureAt('sudus', x, 0, 0, true)
    assert.equal(shapes[0]!.part, 'plate', x)
    assert.deepEqual(shapes[0]!.fill, [0xee, 0xf6, 0xf1], x)
    assert.equal(eyes(shapes).length, 2, x)
    assert.ok(shapes.some(s => s.part === 'body'), x)
    assert.equal(figureAt('sudus', x, 0, 0, false).some(s => s.part === 'plate'), false, x)
  }
  assert.deepEqual(figureAt('sudus', 'idle', 0, 0, false).find(s => s.part === 'body')!.fill, [0x9f, 0xe3, 0xbe])
  assert.notDeepEqual(figureAt('sudus', 'mad', 0, 0, false).find(s => s.part === 'body')!.fill, [0x9f, 0xe3, 0xbe])
})

test('with no motion the figure stands still; with motion it blinks when blobatar blinks', () => {
  const { periodMs, shutAt } = blinkOf('sudus')
  assert.ok(periodMs > 1000 && shutAt >= 0 && shutAt < periodMs)
  assert.deepEqual(figureAt('sudus', 'idle', 0, 0, false), figureAt('sudus', 'idle', shutAt, 0, false))
  const open = eyes(figureAt('sudus', 'idle', 0, 0, false)), shut = eyes(figureAt('sudus', 'idle', shutAt, 1, false))
  for (let i = 0; i < 2; i++) assert.ok(height(shut[i]!) < height(open[i]!) * 0.3, `eye ${i}`)
})

test('another name draws another creature, and the SVG form holds every shape', () => {
  assert.notDeepEqual(figureAt('sudus', 'idle', 0, 0, true), figureAt('someone else', 'idle', 0, 0, true))
  const shapes = figureAt('sudus', 'happy', 0, 0, true)
  const svg = svgOf(shapes)
  assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'))
  assert.equal(svg.match(/<path /g)?.length, shapes.length)
})
