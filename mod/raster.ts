// The figure's shapes (mod/figure.ts) as RGBA pixels for the terminal's Image: filled in drawing
// order, supersampled, transparent where nothing is drawn. Pure: no engine.

import type { Point, Rgb, Shape } from './figure.ts'

const SUPERSAMPLE = 2
const UNITS = 100

export type Raster = { rgba: string; width: number; height: number }

function fillPolygon(buf: Uint8Array, w: number, h: number, points: Point[], scale: number, fill: Rgb): void {
  const n = points.length
  if (n < 3) return
  const xs: number[] = []
  for (let y = 0; y < h; y++) {
    const sy = (y + 0.5) / scale
    xs.length = 0
    for (let a = 0; a < n; a++) {
      const [x0, y0] = points[a]!, [x1, y1] = points[(a + 1) % n]!
      if ((y0 <= sy) !== (y1 <= sy)) xs.push(x0 + ((sy - y0) * (x1 - x0)) / (y1 - y0))
    }
    xs.sort((p, q) => p - q)
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(0, Math.round(xs[k]! * scale)), to = Math.min(w, Math.round(xs[k + 1]! * scale))
      for (let x = from; x < to; x++) { const o = (y * w + x) * 4; buf[o] = fill[0]; buf[o + 1] = fill[1]; buf[o + 2] = fill[2]; buf[o + 3] = 255 }
    }
  }
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export function base64Of(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!, b = bytes[i + 1], c = bytes[i + 2]
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0)
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + (b === undefined ? '=' : B64[(n >> 6) & 63]!) + (c === undefined ? '=' : B64[n & 63]!)
  }
  return out
}

// The shapes of a 100-unit square drawn `px` pixels square.
export function rasterOf(shapes: Shape[], px: number): Raster {
  const big = px * SUPERSAMPLE
  const buf = new Uint8Array(big * big * 4)
  for (const s of shapes) fillPolygon(buf, big, big, s.points, big / UNITS, s.fill)
  const out = new Uint8Array(px * px * 4)
  for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) {
    let r = 0, g = 0, b = 0, a = 0
    for (let sy = 0; sy < SUPERSAMPLE; sy++) for (let sx = 0; sx < SUPERSAMPLE; sx++) {
      const o = ((y * SUPERSAMPLE + sy) * big + x * SUPERSAMPLE + sx) * 4
      r += buf[o]!; g += buf[o + 1]!; b += buf[o + 2]!; a += buf[o + 3]!
    }
    const k = SUPERSAMPLE * SUPERSAMPLE, o = (y * px + x) * 4
    out[o] = Math.round(r / k); out[o + 1] = Math.round(g / k); out[o + 2] = Math.round(b / k); out[o + 3] = Math.round(a / k)
  }
  return { rgba: base64Of(out), width: px, height: px }
}
