// lib/scope.mjs
import { lstat, readFile, readlink } from 'node:fs/promises';
import { join } from 'node:path';
import { git, listTree } from './gitx.mjs';
import { canonicalize, sha256 } from './canon.mjs';

export class ScopeError extends Error { constructor(m) { super(m); this.name = 'ScopeError'; } }

async function workspacePaths(cwd) {
  const tracked = (await git(['ls-files', '-z'], { cwd })).stdout.split('\0').filter(Boolean);
  const untracked = (await git(['ls-files', '-z', '--others', '--exclude-standard'], { cwd })).stdout.split('\0').filter(Boolean);
  return new Set([...tracked, ...untracked].filter((p) => !p.startsWith('.cairn/output/')));
}

async function entryOf(cwd, p) {
  const st = await lstat(join(cwd, p));
  const bytes = st.isSymbolicLink() ? Buffer.from(await readlink(join(cwd, p))) : await readFile(join(cwd, p));
  const mode = st.isSymbolicLink() ? '120000' : (st.mode & 0o111) ? '100755' : '100644';
  const sha = (await git(['hash-object', '--stdin'], { cwd, input: bytes })).stdout.trim();
  return { mode, sha };
}

// Deviation from the plan text: `git ls-files` (tracked) lists a path regardless of whether it
// still exists on disk -- a tracked file removed from the worktree without `git rm` is still
// listed. The plan's original loop called entryOf() (an unguarded lstat) on every workspacePaths()
// entry, which threw a raw ENOENT for exactly that case (reproduced: removing a tracked file and
// diffing against a snapshot crashed instead of reporting a deletion). lib/gitx.mjs's own
// writeTreeFromPaths already treats a missing tracked path as absent from the tree (`try { st =
// await lstat(...) } catch { continue; }`); workspaceDelta now applies the same rule; a path whose
// bytes cannot be read is simply not "present," so it falls through to the deleted-paths loop
// below along with any path git never listed at all.
export async function workspaceDelta(cwd, treeSha) {
  const entries = new Map((await listTree(cwd, treeSha)).map((e) => [e.path, e]));
  const candidates = await workspacePaths(cwd);
  const present = new Set();
  const out = [];
  for (const p of candidates) {
    let cur;
    try { cur = await entryOf(cwd, p); } catch (e) { if (e.code === 'ENOENT') continue; throw e; }
    present.add(p);
    const e = entries.get(p);
    if (!e) out.push({ path: p, change: 'added' });
    else if (e.sha !== cur.sha || e.mode !== cur.mode) out.push({ path: p, change: 'modified' });
  }
  for (const p of entries.keys()) if (!present.has(p)) out.push({ path: p, change: 'deleted' });
  return out.sort((a, b) => (a.path < b.path ? -1 : 1));
}

export function declaredPaths(mechanisms, lease) {
  const out = new Set();
  for (const m of Object.values(mechanisms)) for (const p of [...m.definition.inputs, ...(m.definition.documents || [])]) out.add(p);
  for (const p of lease?.touch || []) out.add(p);
  return out;
}

export function isDeclared(path, declared) {
  for (const d of declared) if (path === d || path.startsWith(d + '/')) return true;
  return false;
}

export function leaseCovers(lease, mechanisms, path) {
  if (!lease) return false;
  if ((lease.touch || []).includes(path)) return true;
  const owning = Object.fromEntries(Object.entries(mechanisms).filter(([, m]) => m.definition.requirements.includes(lease.target)));
  return isDeclared(path, declaredPaths(owning, null));
}

export function declarationSetDigest(mechanisms) {
  const set = Object.fromEntries(Object.keys(mechanisms).sort().map((n) => [n, mechanisms[n].definitionDigest]));
  return sha256(canonicalize(set));
}
