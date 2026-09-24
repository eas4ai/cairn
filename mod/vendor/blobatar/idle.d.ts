// The part of blobatar's `blobatar/idle` entry mod/figure.ts uses.
import type { Pose } from './expression.js'
import type { EyeFrame } from './internal.js'

export type IdleSeeds = {
  phase: number; bob: number; blink: number; blinkPhase: number; saccade: number; saccadePhase: number
  lookX: number; lookY: number; lookMX: number; lookMY: number
}
export type IdleFrame = {
  shake: [number, number]; breathe: [number, number]; bob: number; saccade: [number, number]; rockp: number; blink: number
  wrap: { mx: number; side: number; sy: number; rot: number }
}

export function idleSeeds(name: string): IdleSeeds
export function idleAt(s: IdleSeeds, t: number, amp: number, shake?: number): IdleFrame
export function idleTransforms(l: { eyes: EyeFrame[] }, p: Pose, f: IdleFrame): {
  root: string; breathe: string; bob: string; eyes: string; eye: string[]; glance: string[]
}
