import { git, readRef, updateRefCAS, commitTree, catCommit, writeTreeFromPaths } from './gitx.mjs';
import { check, obj, oneOf, str, token, list, SCHEMA, verifyEnvelope } from './records.mjs';
import { canonicalize, sha256 } from './canon.mjs';
import { globToRegExp, matchGlob, CREDENTIAL_PATTERNS } from './paths.mjs';
export { globToRegExp, CREDENTIAL_PATTERNS };

export class SnapshotError extends Error { constructor(m) { super(m); this.name = 'SnapshotError'; } }
export class KindError extends SnapshotError { constructor(m) { super(m); this.name = 'KindError'; } }
export const SNAPSHOTS_REF = 'refs/cairn/snapshots';
export const ALWAYS_EXCLUDED = ['.git', '.cairn/output'];
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
export async function writeSnapshot(cwd, payload, paths) {
  const reasons = []; check(obj(SNAPSHOT_SCHEMAS[payload.kind] ?? {}), payload, 'snapshot', reasons);
  if (reasons.length) throw new SnapshotError(reasons.join('; '));
  const tree = await writeTreeFromPaths(cwd, { paths, exclude: ALWAYS_EXCLUDED });
  const body = canonicalize(payload), head = await readRef(cwd, SNAPSHOTS_REF);
  const sha = await commitTree(cwd, { tree, parents: head ? [head] : [], subject: `cairn: snapshot ${payload.kind}`, body, trailers: [['Cairn-Schema', SCHEMA], ['Cairn-Digest', sha256(body)]] });
  await updateRefCAS(cwd, SNAPSHOTS_REF, sha, head);
  return sha;
}
export async function writeWorkspaceSnapshot(cwd, { exclude = [] } = {}) {
  const { tracked, untracked } = await listPaths(cwd);
  refuseSensitive(untracked, exclude);
  return writeSnapshot(cwd, { kind: 'workspace' }, [...tracked, ...untracked]);
}
export async function readSnapshot(cwd, sha, expectedKind) {
  const c = await catCommit(cwd, sha);
  const m = /^cairn: snapshot (workspace|input)$/.exec(c.subject);
  if (!m) throw new KindError(`${sha} is not a snapshot commit`);
  let payload; try { payload = verifyEnvelope(c); } catch (e) { throw new SnapshotError(`${sha}: ${e.message}`); }
  const reasons = []; check(obj(SNAPSHOT_SCHEMAS[m[1]]), payload, 'snapshot', reasons);
  if (reasons.length) throw new SnapshotError(`${sha}: ${reasons.join('; ')}`);
  if (payload.kind !== expectedKind) throw new KindError(`expected a ${expectedKind} snapshot, ${sha} is ${payload.kind}`);
  return { kind: payload.kind, tree: c.tree, parent: c.parents[0] ?? null, payload };
}

export async function writeInputSnapshot(cwd, { mechanism, inputs, exclude = [] }) {
  if (!Array.isArray(inputs) || inputs.length === 0) throw new SnapshotError('an input snapshot needs at least one declared input');
  const { tracked, untracked } = await listPaths(cwd, inputs);
  refuseSensitive(untracked, exclude);
  return writeSnapshot(cwd, { kind: 'input', mechanism, inputs: [...inputs] }, [...tracked, ...untracked]);
}
export const ALLOWED_BASE_FIELDS = { start: 'snapshot', scope: 'snapshot' };
export async function allowedBase(cwd, log) {
  for (let i = log.length - 1; i >= 0; i--) {
    const field = ALLOWED_BASE_FIELDS[log[i].kind];
    if (!field) continue;
    const sha = log[i].payload[field];
    await readSnapshot(cwd, sha, 'workspace');
    return sha;
  }
  return null;
}
