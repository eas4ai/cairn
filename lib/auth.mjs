// lib/auth.mjs
import { readFileSync, readdirSync, lstatSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { sha256, canonicalize } from './canon.mjs';
import { loadSettings } from './settings.mjs';

export class AuthError extends Error {}

function walk(root, rel, out) {
  const abs = rel ? join(root, rel) : root;
  for (const name of readdirSync(abs)) {
    const p = rel ? `${rel}/${name}` : name;
    const st = lstatSync(join(root, p));
    if (st.isDirectory()) walk(root, p, out);
    else if (st.isFile()) out.push(p);
  }
}

export function specDigest(cwd) {
  const files = [];
  if (existsSync(join(cwd, 'docs/spec'))) walk(cwd, 'docs/spec', files);
  // The roadmap is kernel-edited at start and promote (section 2, protected paths); it is bound structurally, not by digest.
  const kept = files.filter((f) => f !== 'docs/spec/roadmap.md');
  kept.sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
  return sha256(canonicalize(kept.map((p) => [p, sha256(readFileSync(join(cwd, p)))])));
}

export function agreementDigest(cwd) {
  const p = join(cwd, 'AGENTS.md');
  return existsSync(p) ? sha256(readFileSync(p)) : null;
}

// Deviation from the plan text: lib/settings.mjs's loadSettings(cwd) is async on this branch
// (plan 02, already committed), so protectedDigests must be async too and await it.
export async function protectedDigests(cwd) {
  return { spec: specDigest(cwd), agreement: agreementDigest(cwd), settings: (await loadSettings(cwd)).digest };
}
