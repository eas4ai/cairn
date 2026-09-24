// The figure (mod/figure.ts) in braille, for a terminal that shows no pictures: each cell holds
// 2 dots across and 4 down, about square on a terminal, so `rows` rows take `2 * rows` columns. A
// dot is raised on the body's outline and inside an eye, so the eyes, the blink and every pose
// read the way they do in the picture; 5 rows keep each eye inside one row of cells. The braille
// block starts at U+2800, and bit k raises dot k + 1. Pure: no engine.

import type { Point, Shape } from './figure.ts'

// The square of the figure's 100 units the face is cut from: the body and its two blobs.
const CROP = { x: 12, y: 12, size: 76 }
const SAMPLES = 3
// The dot bit for [column][row] within one cell.
const BITS = [[0x01, 0x02, 0x04, 0x40], [0x08, 0x10, 0x20, 0x80]]
const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1]]

function inside(points: Point[], x: number, y: number): boolean {
  let hit = false
  for (let a = 0, b = points.length - 1; a < points.length; b = a++) {
    const [xa, ya] = points[a]!, [xb, yb] = points[b]!
    if ((ya > y) !== (yb > y) && x < ((xb - xa) * (y - ya)) / (yb - ya) + xa) hit = !hit
  }
  return hit
}

// `rows` lines of braille, each `2 * rows` characters, and the body's colour as #rrggbb.
export function brailleOf(shapes: Shape[], rows: number): { lines: string[]; color: string } {
  const w = rows * 4, h = rows * 4
  const drawn = shapes.filter(s => s.part !== 'plate')
  // What covers each dot: an eye where it covers a third of the dot, else the body where it
  // covers half, else nothing.
  const grid: ('body' | 'eye' | null)[][] = []
  for (let dy = 0; dy < h; dy++) {
    const row: ('body' | 'eye' | null)[] = []
    for (let dx = 0; dx < w; dx++) {
      let body = 0, eye = 0
      for (let sy = 0; sy < SAMPLES; sy++) for (let sx = 0; sx < SAMPLES; sx++) {
        const x = CROP.x + ((dx + (sx + 0.5) / SAMPLES) / w) * CROP.size
        const y = CROP.y + ((dy + (sy + 0.5) / SAMPLES) / h) * CROP.size
        for (let k = drawn.length - 1; k >= 0; k--) {
          if (!inside(drawn[k]!.points, x, y)) continue
          if (drawn[k]!.part === 'eye') eye++
          else body++
          break
        }
      }
      const n = SAMPLES * SAMPLES
      row.push(eye * 3 >= n ? 'eye' : body * 2 >= n ? 'body' : null)
    }
    grid.push(row)
  }
  const at = (x: number, y: number) => grid[y]?.[x] ?? null
  const raised = (x: number, y: number) => at(x, y) === 'eye' || (at(x, y) === 'body' && NEIGHBOURS.some(([a, b]) => at(x + a!, y + b!) === null))
  const lines: string[] = []
  for (let r = 0; r < rows; r++) {
    let line = ''
    for (let c = 0; c < rows * 2; c++) {
      let bits = 0
      for (let i = 0; i < 2; i++) for (let j = 0; j < 4; j++) if (raised(c * 2 + i, r * 4 + j)) bits |= BITS[i]![j]!
      line += String.fromCodePoint(0x2800 + bits)
    }
    lines.push(line)
  }
  const body = drawn.find(s => s.part === 'body')
  const color = body ? `#${body.fill.map(v => v.toString(16).padStart(2, '0')).join('')}` : '#9fe3be'
  return { lines, color }
}
