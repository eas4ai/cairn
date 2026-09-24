// The part of blobatar's `blobatar/expression` entry mod/figure.ts uses.
export type Pose = {
  esx: number; esy: number; tilt: number; edy: number; edx: number; esx2: number; esy2: number; tilt2: number
  edy2: number; lock: number; heat: number; shake: number; rock: number; bdy: number
}
export type Expression = { readonly p: Pose }

export const idle: Expression
export const happy: Expression
export const sad: Expression
export const mad: Expression
export const sick: Expression
export const thinking: Expression
export const unsure: Expression
export const sleepy: Expression
export const surprised: Expression
