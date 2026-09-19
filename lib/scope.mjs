// lib/scope.mjs
import { lstat, readFile, readlink } from 'node:fs/promises';
import { join } from 'node:path';
import { git, listTree } from './gitx.mjs';
import { canonicalize, parseStrict, sha256 } from './canon.mjs';
import { readMechanisms } from './mechanisms.mjs';
import { readAdr } from './adr.mjs';
import { loadSettings } from './settings.mjs';

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

// Deviation from the plan text: the plan's protectedDigests hashes the raw bytes of
// .cairn/settings.json, but lib/auth.mjs's own protectedDigests (plan 03, already committed) and
// every settings_digest already written into 'init'/'authorization' records use
// sha256(canonicalize(parsed settings)) via lib/settings.mjs's loadSettings -- the digest of the
// *value*, not the file's literal bytes. tests/helpers/repo.mjs's makeProject writes settings.json
// pretty-printed (JSON.stringify(..., null, 2) + '\n'), so a raw-byte digest would never equal a
// real authorization record's settings_digest and Task 6's "authorized" comparison could never
// pass. loadSettings's own .digest is used here so this module's settings digest always agrees
// with the one the rest of the kernel writes and compares.
export async function protectedDigests(cwd) {
  const bytes = (p) => readFile(join(cwd, p));
  const specPaths = [...await workspacePaths(cwd)].filter((p) => p.startsWith('docs/spec/')).sort();
  const spec = [];
  for (const p of specPaths) spec.push([p, sha256(await bytes(p))]);
  return { spec: sha256(canonicalize(spec)), agreement: sha256(await bytes('AGENTS.md')), settings: (await loadSettings(cwd)).digest };
}

async function baseBytes(cwd, treeSha, path) {
  const e = (await listTree(cwd, treeSha)).find((x) => x.path === path);
  if (!e) return Buffer.alloc(0);
  return Buffer.from((await git(['cat-file', 'blob', e.sha], { cwd })).stdout, 'utf8');
}

// Deviation from the plan text: on this branch .cairn/mechanisms (lib/mechanisms.mjs's
// MECHANISMS_DIR) is a directory of one canonical-JSON file per mechanism name
// (.cairn/mechanisms/<name>.json, written whole by declare()/reviewMechanism(), never appended
// to), not the single file the plan's literal `path === '.cairn/mechanisms'` branch assumed --
// reading that bare path as a file throws EISDIR. The mechanisms branch below matches any path
// under the directory instead, and validates it the same way the plan intended: the file's own
// bytes must be exactly one canonical JSON document (parseStrict, the same exactness test plan 05
// writeEntry produces), and the whole directory must still read cleanly through readMechanisms
// (which refuses an unknown top-level key, a malformed definition shape, or review metadata left
// bound to a stale definition digest).
export async function kernelManagedValid(cwd, path, baseTree) {
  const now = await readFile(join(cwd, path)).catch(() => null);
  if (now === null) return false;                                   // deletion
  if (path === 'docs/decisions.jsonl') {
    const base = await baseBytes(cwd, baseTree, path);
    // Deviation from the plan text: a bare prefix-equality check (`now`'s first base.length bytes
    // equal base) is trivially satisfied whenever now.length === base.length -- including the
    // degenerate case this file starts in, base.length === 0 (docs/decisions.jsonl does not yet
    // exist at the allowed base), where truncating an appended line back to an empty file has an
    // empty prefix that "equals" the empty base again. That made the plan's own third assertion
    // (truncating the file back to '' after a valid append) come back true instead of false.
    // Every genuine appendDecision() mutation strictly grows the file, so requiring now.length >
    // base.length closes the gap without narrowing any legitimate append.
    if (now.length <= base.length || !now.subarray(0, base.length).equals(base)) return false;    // not append-only: edit, reorder, deletion or no growth
    try { await readAdr(cwd); } catch { return false; }             // readAdr throws on any breach of the line rules
    for (const line of now.subarray(base.length).toString('utf8').split('\n').filter(Boolean)) {
      try { parseStrict(line); } catch { return false; }
    }
    return true;
  }
  if (path.startsWith('.cairn/mechanisms/') && path.endsWith('.json')) {
    try { parseStrict(now.toString('utf8')); await readMechanisms(cwd); } catch { return false; }
    return true;
  }
  return false;
}
