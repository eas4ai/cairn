import { git, readRef, updateRefCAS, commitTree, catCommit, writeTreeFromPaths } from './gitx.mjs';
import { check, obj, oneOf, str, token, list, SCHEMA } from './records.mjs';
import { canonicalize, parseStrict, sha256 } from './canon.mjs';

export class SnapshotError extends Error { constructor(m) { super(m); this.name = 'SnapshotError'; } }
export class KindError extends SnapshotError { constructor(m) { super(m); this.name = 'KindError'; } }
export const SNAPSHOTS_REF = 'refs/cairn/snapshots';
export const ALWAYS_EXCLUDED = ['.git', '.cairn/output'];
export const CREDENTIAL_PATTERNS = ['**/.env', '**/.env.*', '**/*.pem', '**/*.p12', '**/*.pfx', '**/*.key', '**/id_rsa', '**/id_dsa', '**/id_ecdsa', '**/id_ed25519'];
export const SNAPSHOT_SCHEMAS = { workspace: { kind: oneOf('workspace') }, input: { kind: oneOf('input'), mechanism: token, inputs: list(str) } };

export function globToRegExp(pattern) {
  const segs = pattern.split('/');
  const re = segs.map((seg, i) => {
    const last = i === segs.length - 1;
    if (seg === '**') return last ? '.*' : '(?:[^/]+/)*';
    const lit = seg.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]');
    return last ? lit : lit + '/';
  }).join('');
  return new RegExp('^' + re + '$');
}
export async function listPaths(cwd, pathspec = []) {
  const ls = async (flags) => (await git(['ls-files', '-z', ...flags, '--', ...pathspec], { cwd })).stdout.split('\0').filter(Boolean);
  return { tracked: await ls(['--cached']), untracked: await ls(['--others', '--exclude-standard']) };
}
export function refuseSensitive(untracked, exclude) {
  const patterns = [...CREDENTIAL_PATTERNS, ...exclude].map((p) => [p, globToRegExp(p)]);
  const hits = untracked.flatMap((p) => patterns.filter(([, re]) => re.test(p)).map(([pat]) => `${p} (matches ${pat})`));
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
  const tr = c.trailers;
  if (tr.length !== 2 || tr[0][0] !== 'Cairn-Schema' || tr[0][1] !== SCHEMA || tr[1][0] !== 'Cairn-Digest' || tr[1][1] !== sha256(c.bodyBytes)) throw new SnapshotError(`${sha}: snapshot trailers or digest invalid`);
  let payload; try { payload = parseStrict(c.bodyBytes); } catch (e) { throw new SnapshotError(`${sha}: ${e.message}`); }
  const reasons = []; check(obj(SNAPSHOT_SCHEMAS[m[1]]), payload, 'snapshot', reasons);
  if (reasons.length) throw new SnapshotError(`${sha}: ${reasons.join('; ')}`);
  if (payload.kind !== expectedKind) throw new KindError(`expected a ${expectedKind} snapshot, ${sha} is ${payload.kind}`);
  return { kind: payload.kind, tree: c.tree, parent: c.parents[0] ?? null, payload };
}
