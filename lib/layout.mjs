// lib/layout.mjs: the two storage layouts. A project initialized by Sudus keeps its state under
// .sudus/ and refs/sudus/*, and its records carry the subject prefix `sudus:` and the trailers
// Sudus-Schema and Sudus-Digest. A project initialized under the tool's former name keeps .cairn/,
// refs/cairn/* and the `cairn:` records until `sudus migrate` moves it between commitments; every
// command works on either. Readers accept both record envelopes regardless of layout, so a
// migrated log, whose older records keep their original envelope, reads as one log.
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const make = (name, Name) => Object.freeze({
  name, dir: `.${name}`, settings: `.${name}/settings.json`, mechanisms: `.${name}/mechanisms`, output: `.${name}/output`,
  log: `refs/${name}/log`, snapshots: `refs/${name}/snapshots`, lease: `refs/${name}/in-progress`,
  schemaTrailer: `${Name}-Schema`, digestTrailer: `${Name}-Digest`,
});
export const SUDUS = make('sudus', 'Sudus');
export const CAIRN = make('cairn', 'Cairn');
export const LAYOUTS = Object.freeze([SUDUS, CAIRN]);
export const SUBJECT_RE = /^(sudus|cairn): (.*)$/;

// The layout is read from the settings file that exists, once per process per project: a project
// with neither (before init) is a Sudus project, and is not cached so the file init writes
// decides. The settings file, not the directory, is the sign: a 1.x project leaves a .cairn/
// directory of old records behind that the existing-project skill removes, and it must not turn
// a fresh init into a former-layout project. `sudus migrate` forgets the entry it changes.
const cache = new Map();
export function layoutOf(cwd) {
  const hit = cache.get(cwd);
  if (hit) return hit;
  if (existsSync(join(cwd, SUDUS.settings))) { cache.set(cwd, SUDUS); return SUDUS; }
  if (existsSync(join(cwd, CAIRN.settings))) { cache.set(cwd, CAIRN); return CAIRN; }
  return SUDUS;
}
export function forgetLayout(cwd) { cache.delete(cwd); }
// A store name a record wrote under the other layout, read as this layout's ref: a transaction
// recorded before `sudus migrate` names refs/cairn/log, and after the move that is refs/sudus/log.
export function resolveRef(cwd, ref) {
  const L = layoutOf(cwd);
  for (const other of LAYOUTS) {
    if (other === L) continue;
    for (const k of ['log', 'snapshots', 'lease']) if (ref === other[k]) return L[k];
  }
  return ref;
}
// The envelope a commit's two trailers name, or null when they are neither layout's pair.
export function envelopeOf(trailers) {
  return LAYOUTS.find((l) => trailers[0]?.[0] === l.schemaTrailer && trailers[1]?.[0] === l.digestTrailer) ?? null;
}
// Paths every layout treats as its own, used where a path is classified without a project.
export const STATE_DIRS = LAYOUTS.map((l) => l.dir);
export const SETTINGS_PATHS = LAYOUTS.map((l) => l.settings);
export const isOutputPath = (p) => LAYOUTS.some((l) => p.startsWith(`${l.output}/`));
export const isMechanismDefinition = (p) => LAYOUTS.some((l) => p.startsWith(`${l.mechanisms}/`)) && p.endsWith('.json');
