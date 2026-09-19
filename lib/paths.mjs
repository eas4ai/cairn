import { realpath } from 'node:fs/promises';
import { join, dirname, sep } from 'node:path';

export class PathError extends Error { constructor(m) { super(m); this.name = 'PathError'; } }
export const RESERVED = ['.cairn/**', 'docs/spec/**', 'docs/decisions.jsonl', 'AGENTS.md'];
export const PROTECTED = ['.cairn/settings.json', 'docs/spec/**', 'AGENTS.md'];
export const PROTECTED_EXCEPT = ['docs/spec/roadmap.md']; // edited by the kernel at start and promote; bound structurally, not by digest
export const KERNEL_MANAGED = ['.cairn/mechanisms', '.cairn/mechanisms/**', 'docs/decisions.jsonl'];
export const OUTPUT = '.cairn/output/**';
// id_ecdsa_sk and id_ed25519_sk (FIDO/U2F resident SSH keys) are included alongside the plan's
// list: plan 01's review (commit 8782ea60) added them to lib/snapshots.mjs's CREDENTIAL_PATTERNS,
// and this module now supplies that constant, so dropping them here would be a regression.
export const CREDENTIAL_PATTERNS = ['**/.env', '**/.env.*', '**/*.pem', '**/*.p12', '**/*.pfx', '**/*.key', '**/id_rsa', '**/id_dsa', '**/id_ecdsa', '**/id_ed25519', '**/id_ecdsa_sk', '**/id_ed25519_sk'];

export function validatePath(p) {
  if (typeof p !== 'string' || p === '') throw new PathError('empty path');
  if (p.includes('\0')) throw new PathError(`NUL in path ${JSON.stringify(p)}`);
  if (p.includes('\\')) throw new PathError(`backslash in path ${p}`);
  if (p.startsWith('/')) throw new PathError(`absolute path ${p}`);
  if (!p.isWellFormed()) throw new PathError('path is not valid Unicode');
  for (const c of p.split('/')) {
    if (c === '') throw new PathError(`empty component in ${p}`);
    if (c === '.' || c === '..') throw new PathError(`${c} component in ${p}`);
    if (c === '.git') throw new PathError(`.git component in ${p}`);
  }
  return p;
}
export function validateGlob(g) {
  validatePath(g);
  for (const seg of g.split('/')) {
    if (seg === '**') continue;
    if (seg.includes('**')) throw new PathError(`** must be a whole segment in ${g}`);
  }
  return g;
}
export async function assertInside(cwd, p) {
  validatePath(p);
  const root = await realpath(cwd);
  let probe = join(cwd, p);
  while (probe.length >= cwd.length) {
    try {
      const real = await realpath(probe);
      if (real !== root && !real.startsWith(root + sep)) throw new PathError(`${p} escapes the worktree after resolution`);
      return p;
    } catch (e) {
      if (e instanceof PathError) throw e;
      probe = dirname(probe);
    }
  }
  return p;
}

const compiled = new Map();
export function globToRegExp(pattern) {
  if (compiled.has(pattern)) return compiled.get(pattern);
  const segs = pattern.split('/');
  const re = segs.map((seg, i) => {
    const last = i === segs.length - 1;
    if (seg === '**') return last ? '.*' : '(?:[^/]+/)*';
    const lit = seg.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]');
    return last ? lit : lit + '/';
  }).join('');
  const out = new RegExp('^' + re + '$');
  compiled.set(pattern, out);
  return out;
}
export function matchGlob(pattern, p) { return globToRegExp(pattern).test(p); }

export function classify(p, settings) {
  validatePath(p);
  const any = (patterns) => patterns.some((g) => matchGlob(g, p));
  if (any(PROTECTED) && !PROTECTED_EXCEPT.includes(p)) return 'protected';
  if (any(KERNEL_MANAGED)) return 'kernel-managed';
  if (matchGlob(OUTPUT, p)) return 'output';
  if (any(RESERVED)) return 'reserved';
  if (any(settings.outside ?? [])) return 'outside';
  if (any(settings.data ?? [])) return 'data';
  if (any(settings.interfaces ?? [])) return 'interface';
  if (any(settings.source ?? [])) return 'source';
  return 'plain';
}
