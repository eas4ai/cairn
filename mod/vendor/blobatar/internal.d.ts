// The part of blobatar's `blobatar/internal` entry mod/figure.ts uses.
import type { Expression, Pose } from './expression.js'

export type Mark =
  | { kind: 'path'; d: string; fill: string }
  | { kind: 'circle'; cx: number; cy: number; r: number; fill: string }

export type EyeFrame = { cx: number; cy: number; rx: number; ry: number; rot: number }

export function _posed(name: string, opts?: { expression?: Expression; background?: 'none' | 'squircle' | 'circle' | 'square' }): {
  bg: { d: string; fill: string } | null
  marks: Mark[]
  eyes: { kind: 'path'; d: string; fill: string }[]
  eyeFrames: EyeFrame[]
  pose: Pose | undefined
  expr: boolean
  fill: { head: string; eye: string }
  hot: { head: string; eye: string } | null
}
