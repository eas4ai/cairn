import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { git, readRef, updateRefCAS, commitTree, catCommit, writeTreeFromPaths } from './gitx.mjs';
import { check, obj, oneOf, str, token, list, SCHEMA, verifyEnvelope } from './records.mjs';
import { canonicalize, sha256 } from './canon.mjs';
import { globToRegExp, matchGlob, validatePath, CREDENTIAL_PATTERNS } from './paths.mjs';
import { loadSettings, SETTINGS_PATH } from './settings.mjs';
export { globToRegExp, CREDENTIAL_PATTERNS };

export class SnapshotError extends Error { constructor(m) { super(m); this.name = 'SnapshotError'; } }
export class KindError extends SnapshotError { constructor(m) { super(m); this.name = 'KindError'; } }
export const SNAPSHOTS_REF = 'refs/sudus/snapshots';
export const ALWAYS_EXCLUDED = ['.git', '.sudus/output'];
export const SNAPSHOT_SCHEMAS = { workspace: { kind: oneOf('workspace') }, input: { kind: oneOf('input'), mechanism: token, inputs: list(str) } };

export async function listPaths(cwd, pathspec = []) {
  const ls = async (flags) => (await git(['ls-files', '-z', ...flags, '--', ...pathspec], { cwd })).stdout.split('\0').filter(Boolean);
  return { tracked: await ls(['--cached']), untracked: await ls(['--others', '--exclude-standard']) };
}
export function refuseSensitive(untracked, exclude) {
  const patterns = [...CREDENTIAL_PATTERNS, ...exclude];
  const hits = untracked.flatMap((p) => patterns.filter((pat) => matchGlob(pat, p)).map((pat) => `${p} (matches ${pat})`));
  if (hits.length) throw new SnapshotError(`refusing to snapshot untracked sensitive paths: ${hits.join(', ')}`);
}
// Fix round 2 finding 3 (Minor, lib/commitment.mjs's realizationDelta): a caller that already has
// its own tree (built, for example, from an uncommitted writeTreeFromPaths call it also needs for
// some other comparison) can commit exactly that tree as a snapshot instead of writeSnapshot
// re-reading the working tree a second time -- two reads of a live working tree are never
// guaranteed to see the same state. Shared by both so the schema/kind check and the commit+ref
// logic exist in exactly one place.
async function commitSnapshotFromTree(cwd, payload, tree) {
  const reasons = []; check(obj(SNAPSHOT_SCHEMAS[payload.kind] ?? {}), payload, 'snapshot', reasons);
  if (reasons.length) throw new SnapshotError(reasons.join('; '));
  const body = canonicalize(payload), head = await readRef(cwd, SNAPSHOTS_REF);
  const sha = await commitTree(cwd, { tree, parents: head ? [head] : [], subject: `sudus: snapshot ${payload.kind}`, body, trailers: [['Sudus-Schema', SCHEMA], ['Sudus-Digest', sha256(body)]] });
  await updateRefCAS(cwd, SNAPSHOTS_REF, sha, head);
  return sha;
}
export async function writeSnapshot(cwd, payload, paths) {
  const tree = await writeTreeFromPaths(cwd, { paths, exclude: ALWAYS_EXCLUDED });
  return commitSnapshotFromTree(cwd, payload, tree);
}
// Fix round 2 finding 3: commits a workspace snapshot from a tree the caller already built,
// keeping the same 'workspace' kind check writeSnapshot itself applies, instead of building
// (and by implication, re-reading the working tree for) a fresh one.
export async function writeWorkspaceSnapshotFromTree(cwd, tree) {
  return commitSnapshotFromTree(cwd, { kind: 'workspace' }, tree);
}
async function resolveExclude(cwd, exclude) {
  if (exclude !== undefined) return exclude;
  try { await access(join(cwd, SETTINGS_PATH)); } catch { return []; }
  return (await loadSettings(cwd)).settings.network_exclude;
}
export async function writeWorkspaceSnapshot(cwd, { exclude } = {}) {
  const { tracked, untracked } = await listPaths(cwd);
  refuseSensitive(untracked, await resolveExclude(cwd, exclude));
  return writeSnapshot(cwd, { kind: 'workspace' }, [...tracked, ...untracked]);
}
export async function readSnapshot(cwd, sha, expectedKind) {
  const c = await catCommit(cwd, sha);
  const m = /^sudus: snapshot (workspace|input)$/.exec(c.subject);
  if (!m) throw new KindError(`${sha} is not a snapshot commit`);
  let payload; try { payload = verifyEnvelope(c); } catch (e) { throw new SnapshotError(`${sha}: ${e.message}`); }
  const reasons = []; check(obj(SNAPSHOT_SCHEMAS[m[1]]), payload, 'snapshot', reasons);
  if (reasons.length) throw new SnapshotError(`${sha}: ${reasons.join('; ')}`);
  if (payload.kind !== expectedKind) throw new KindError(`expected a ${expectedKind} snapshot, ${sha} is ${payload.kind}`);
  return { kind: payload.kind, tree: c.tree, parent: c.parents[0] ?? null, payload };
}

// Fix round 1 finding 1 (Critical): this is the one place a declared mechanism input (a literal
// path or a directory) is turned into the concrete file list it names -- through `git ls-files`
// with a `:(literal)` pathspec, so a directory input expands to its tracked and non-ignored
// untracked files the same way `writeWorkspaceSnapshot` expands the whole tree. Exported so
// lib/check.mjs's identitiesNow can recompute identity 1 (the input tree) with the exact same
// resolution writeInputSnapshot used to build the recorded snapshot, instead of calling
// writeTreeFromPaths directly on the raw declared paths, which lstat-s each one and throws on a
// directory (it only accepts files and symlinks). That mismatch made a receipt with a directory
// input never current: check() (via this function) built its snapshot tree by expanding the
// directory, but isCurrent's old identitiesNow tried to lstat the directory itself, threw a
// GitError, and isCurrent's blanket catch swallowed it as "not current" even with nothing changed.
export async function resolveInputPaths(cwd, inputs, exclude) {
  if (!Array.isArray(inputs) || inputs.length === 0) throw new SnapshotError('an input snapshot needs at least one declared input');
  // Every input is handed straight to `git ls-files` as a pathspec below, so validatePath must run
  // first: it refuses a leading colon (pathspec magic such as ':(exclude)' or ':!') along with the
  // ordinary path rules. Carried from plan 01's review.
  for (const i of inputs) validatePath(i);
  // validatePath accepts ordinary glob metacharacters (an input path is not a glob field), so an
  // input such as 'src/*.js' must still reach git as an exact literal path, not a wildcard
  // pathspec that could expand to match files never declared. The :(literal) magic signature
  // disables wildcard expansion while keeping the usual directory-prefix matching.
  const { tracked, untracked } = await listPaths(cwd, inputs.map((i) => `:(literal)${i}`));
  refuseSensitive(untracked, await resolveExclude(cwd, exclude));
  return [...tracked, ...untracked];
}

export async function writeInputSnapshot(cwd, { mechanism, inputs, exclude }) {
  const paths = await resolveInputPaths(cwd, inputs, exclude);
  return writeSnapshot(cwd, { kind: 'input', mechanism, inputs: [...inputs] }, paths);
}
// allowedBase(cwd, []) === null before any start record exists (plan 01's original contract;
// preflight() never calls this before confirming a start record exists, so the null path never
// affects it).
//
// Fix round 1 item 7: a 'scope' record used to set the base unconditionally, even while another
// scope-breach was still open (reproduced: disposing one of two concurrent breaches advanced the
// base while the second stayed undisposed); it now advances only once open.size reaches zero,
// same as the generic snapshot-bearing-record rule below it. A candidate also used to overwrite
// the base outright, so any later record naming an older snapshot (e.g. a resolution written
// against a stale snapshot) could move the base backward; a candidate now replaces the base only
// when it is not older than the current one, checked via the snapshot ref's own ancestry.
async function isNewer(cwd, candidate, current) {
  if (candidate === current) return false;
  const r = await git(['merge-base', '--is-ancestor', current, candidate], { cwd, expect: [0, 1] });
  return r.code === 0;
}
export async function allowedBase(cwd, log) {
  let base = null;
  const open = new Set();
  const advance = async (candidate) => { if (base === null || await isNewer(cwd, candidate, base)) base = candidate; };
  for (const r of log) {
    if (r.kind === 'scope-breach') { open.add(r.sha); continue; }
    if (r.kind === 'scope') { open.delete(r.payload.breach); if (open.size === 0) await advance(r.payload.snapshot); continue; }
    if (r.kind === 'start') { open.clear(); await advance(r.payload.snapshot); continue; }   // a start closes every breach recorded in the gap before it
    if (r.payload && typeof r.payload.snapshot === 'string' && open.size === 0) await advance(r.payload.snapshot);
  }
  if (base === null) return null;
  await readSnapshot(cwd, base, 'workspace');
  return base;
}
