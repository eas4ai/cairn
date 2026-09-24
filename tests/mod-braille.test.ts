import { test } from 'node:test'
import assert from 'node:assert/strict'
import { blinkOf, EXPRESSIONS, figureAt } from '../mod/figure.ts'
import { brailleOf } from '../mod/braille.ts'

const BRAILLE = /^[\u2800-\u28ff]+$/u
const dots = (lines: string[]) => lines.join('').split('').reduce((n, c) => n + (c.codePointAt(0)! - 0x2800).toString(2).replace(/0/g, '').length, 0)

test('five rows of ten braille cells, in the body colour, with the plate left out', () => {
  const { lines, color } = brailleOf(figureAt('sudus', 'idle', 0, 0, true), 5)
  assert.equal(lines.length, 5)
  for (const l of lines) { assert.equal(Array.from(l).length, 10); assert.match(l, BRAILLE) }
  assert.equal(color, '#9fe3be')
  assert.deepEqual(brailleOf(figureAt('sudus', 'idle', 0, 0, false), 5).lines, lines)
})

test('each expression and the blink draw differently', () => {
  const faces = EXPRESSIONS.map(x => brailleOf(figureAt('sudus', x, 0, 0, false), 5).lines.join('\n'))
  const idle = faces[EXPRESSIONS.indexOf('idle')]!
  for (const x of ['happy', 'unsure', 'mad', 'thinking', 'sleepy'] as const) assert.notEqual(faces[EXPRESSIONS.indexOf(x)], idle, x)
  const shut = brailleOf(figureAt('sudus', 'idle', blinkOf('sudus').shutAt, 1, false), 5).lines
  assert.notEqual(shut.join('\n'), idle)
  assert.ok(dots(shut) < dots(idle.split('\n')), 'shut eyes raise fewer dots')
})
