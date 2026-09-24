// The blobatar as filled polygons at one moment of its idle motion, for the terminal's Image and
// for the braille face a terminal without pictures shows. The geometry, the poses and the motion
// (breathe, bob, glance, blink, and the tremor and seesaw some poses ride) are blobatar's own
// (mod/vendor/blobatar, MIT): the loops its React Native adapter runs, as arithmetic over a clock,
// composed on the same six levels of group its stylesheet decorates. Pure: no engine.

import { _posed } from './vendor/blobatar/internal.js'
import { idleAt, idleSeeds, idleTransforms, type IdleSeeds } from './vendor/blobatar/idle.js'
import * as POSES from './vendor/blobatar/expression.js'

export type Expression = 'idle' | 'happy' | 'unsure' | 'mad' | 'sick' | 'thinking' | 'sleepy'

export const EXPRESSIONS: readonly Expression[] = ['idle', 'happy', 'unsure', 'mad', 'sick', 'thinking', 'sleepy']

export type Rgb = [number, number, number]
export type Point = [number, number]
// `part` says what a shape is: the plate behind the creature, its body, or an eye.
export type Shape = { points: Point[]; fill: Rgb; part: 'plate' | 'body' | 'eye' }
// A 2D affine matrix [a, b, c, d, e, f], as SVG's matrix(): x' = a x + c y + e, y' = b x + d y + f.
export type Matrix = [number, number, number, number, number, number]

const CURVE_STEPS = 12
const CIRCLE_STEPS = 48
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0]

export function colorOf(hex: string): Rgb {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return [0, 0, 0]
  let h = m[1]!
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

export function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
  ]
}

// An SVG transform list (translate, rotate, scale, matrix) as one matrix, applied right to left.
export function matrixOf(transform: string): Matrix {
  let m = IDENTITY
  for (const [, op, args] of transform.matchAll(/(translate|rotate|scale|matrix)\(([^)]*)\)/g)) {
    const v = args!.split(/[\s,]+/).filter(Boolean).map(Number)
    if (op === 'translate') m = multiply(m, [1, 0, 0, 1, v[0] ?? 0, v[1] ?? 0])
    else if (op === 'scale') m = multiply(m, [v[0] ?? 1, 0, 0, v[1] ?? v[0] ?? 1, 0, 0])
    else if (op === 'matrix' && v.length === 6) m = multiply(m, v as Matrix)
    else if (op === 'rotate') {
      const a = ((v[0] ?? 0) * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a)
      const [cx, cy] = [v[1] ?? 0, v[2] ?? 0]
      m = multiply(m, [1, 0, 0, 1, cx, cy])
      m = multiply(m, [cos, sin, -sin, cos, 0, 0])
      m = multiply(m, [1, 0, 0, 1, -cx, -cy])
    }
  }
  return m
}

const apply = (m: Matrix, [x, y]: Point): Point => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]

function cubic(p0: Point, p1: Point, p2: Point, p3: Point, into: Point[]): void {
  for (let i = 1; i <= CURVE_STEPS; i++) {
    const t = i / CURVE_STEPS, u = 1 - t
    into.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ])
  }
}

// One path's `d` (M, C, L, Z, absolute or relative) as closed polygons, in user units.
export function polygonsOfPath(d: string): Point[][] {
  const tokens = d.match(/[MCLZmclz]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? []
  const polys: Point[][] = []
  let cur: Point[] = []
  let pos: Point = [0, 0]
  let i = 0
  let cmd = ''
  const num = () => Number(tokens[i++])
  while (i < tokens.length) {
    const t = tokens[i]!
    if (/[MCLZmclz]/.test(t)) { cmd = t; i++; if (cmd === 'Z' || cmd === 'z') { if (cur.length) polys.push(cur); cur = [] } continue }
    if (cmd === 'M' || cmd === 'm') {
      const x = num(), y = num()
      pos = cmd === 'm' ? [pos[0] + x, pos[1] + y] : [x, y]
      if (cur.length) polys.push(cur)
      cur = [pos]
      cmd = cmd === 'm' ? 'l' : 'L'
    } else if (cmd === 'L' || cmd === 'l') {
      const x = num(), y = num()
      pos = cmd === 'l' ? [pos[0] + x, pos[1] + y] : [x, y]
      cur.push(pos)
    } else if (cmd === 'C' || cmd === 'c') {
      const o: Point = cmd === 'c' ? pos : [0, 0]
      const p1: Point = [o[0] + num(), o[1] + num()]
      const p2: Point = [o[0] + num(), o[1] + num()]
      const p3: Point = [o[0] + num(), o[1] + num()]
      cubic(pos, p1, p2, p3, cur)
      pos = p3
    } else { i++ }
  }
  if (cur.length) polys.push(cur)
  return polys
}

function circle(cx: number, cy: number, r: number): Point[] {
  const points: Point[] = []
  for (let k = 0; k < CIRCLE_STEPS; k++) { const a = (k / CIRCLE_STEPS) * Math.PI * 2; points.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]) }
  return points
}

const seeds = new Map<string, IdleSeeds>()
const figures = new Map<string, ReturnType<typeof _posed>>()

function seedsOf(name: string): IdleSeeds {
  let s = seeds.get(name)
  if (!s) { s = idleSeeds(name); seeds.set(name, s) }
  return s
}

// The creature drawn from `name` in `expression` at `t` milliseconds on any clock, in a 100-unit
// square. `amp` is the idle motion's amplitude, 0 (still) to 1; the pose's own tremor and seesaw
// ride the pose, not the amplitude, as in blobatar. `plate` draws the squircle behind it.
export function figureAt(name: string, expression: Expression, t: number, amp: number, plate: boolean): Shape[] {
  const key = `${name}\0${expression}`
  let f = figures.get(key)
  if (!f) { f = _posed(name, { expression: POSES[expression], background: 'squircle' }); figures.set(key, f) }
  const pose = f.pose ?? POSES.idle.p
  const frame = idleAt(seedsOf(name), t, amp, pose.shake)
  const tr = idleTransforms({ eyes: f.eyeFrames }, pose, frame)
  const color = f.hot ?? f.fill
  const shapes: Shape[] = []
  if (plate && f.bg) for (const poly of polygonsOfPath(f.bg.d)) shapes.push({ points: poly, fill: colorOf(f.bg.fill), part: 'plate' })
  const body = [tr.root, tr.breathe, tr.bob].map(matrixOf).reduce(multiply)
  for (const mark of f.marks) {
    const polys = mark.kind === 'circle' ? [circle(mark.cx, mark.cy, mark.r)] : polygonsOfPath(mark.d)
    for (const poly of polys) shapes.push({ points: poly.map(p => apply(body, p)), fill: colorOf(color.head), part: 'body' })
  }
  const pair = multiply(body, matrixOf(tr.eyes))
  f.eyes.forEach((eye, i) => {
    const m = multiply(multiply(pair, matrixOf(tr.eye[i] ?? '')), matrixOf(tr.glance[i] ?? ''))
    for (const poly of polygonsOfPath(eye.d)) shapes.push({ points: poly.map(p => apply(m, p)), fill: colorOf(color.eye), part: 'eye' })
  })
  return shapes
}

// When this creature blinks: its period, and a moment in the cycle with the eyes shut.
export function blinkOf(name: string): { periodMs: number; shutAt: number } {
  const s = seedsOf(name)
  return { periodMs: s.blink, shutAt: ((0.986 * s.blink - s.blinkPhase) % s.blink + s.blink) % s.blink }
}

// The shapes as SVG markup, for a surface that draws SVG rather than terminal pixels.
export function svgOf(shapes: Shape[]): string {
  const hex = (c: Rgb) => `#${c.map(v => v.toString(16).padStart(2, '0')).join('')}`
  const d = (points: Point[]) => `M${points.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join('L')}Z`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${shapes.map(s => `<path d="${d(s.points)}" fill="${hex(s.fill)}"/>`).join('')}</svg>`
}
