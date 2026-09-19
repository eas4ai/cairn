import { spawn } from 'node:child_process';
import { resolve, join } from 'node:path';
import { lstat, readlink, readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

export class GitError extends Error { constructor(m, info = {}) { super(m); this.name = 'GitError'; Object.assign(this, info); } }
export class CasError extends GitError { constructor(m, info) { super(m, info); this.name = 'CasError'; } }
export const ZERO = '0'.repeat(40);

export function git(args, { cwd, input, env, expect = [0] } = {}) {
  return new Promise((resolvePromise, reject) => {
    // LC_ALL=C keeps git's stderr in English regardless of the caller's locale, so CAS_STDERR below matches reliably.
    const child = spawn('git', args, { cwd, env: { ...(env ?? process.env), LC_ALL: 'C' }, stdio: ['pipe', 'pipe', 'pipe'] });
    const out = [], err = [];
    child.stdout.on('data', (d) => out.push(d));
    child.stderr.on('data', (d) => err.push(d));
    child.on('error', reject);
    child.on('close', (code) => {
      const raw = Buffer.concat(out), stderr = Buffer.concat(err).toString('utf8');
      if (!expect.includes(code)) reject(new GitError(`git ${args[0]} exited ${code}: ${stderr.trim()}`, { args, stderr, code }));
      else resolvePromise({ stdout: raw.toString('utf8'), raw, stderr, code });
    });
    child.stdin.on('error', () => {}); // a child that exits before draining stdin (e.g. EPIPE on a large write) is reported by the close handler, not here
    child.stdin.end(input ?? '');
  });
}
export async function gitPath(cwd, name) {
  return resolve(cwd, (await git(['rev-parse', '--git-path', name], { cwd })).stdout.trim());
}
export async function readRef(cwd, ref) {
  const r = await git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { cwd, expect: [0, 1] });
  return r.code === 0 ? r.stdout.trim() : null;
}
const CAS_STDERR = /cannot lock ref|reference already exists|but expected|unable to resolve reference/;
async function updateRef(cwd, args, info) {
  const r = await git(['update-ref', ...args], { cwd, expect: [0, 1, 128] });
  if (r.code === 0) return;
  if (CAS_STDERR.test(r.stderr)) throw new CasError(`refusing ${info.ref}: expected ${info.old ?? 'absent'}`, { ...info, stderr: r.stderr });
  throw new GitError(`git update-ref failed: ${r.stderr.trim()}`, { ...info, stderr: r.stderr });
}
export function updateRefCAS(cwd, ref, newSha, oldShaOrNull) {
  return updateRef(cwd, [ref, newSha, oldShaOrNull ?? ZERO], { ref, newSha, old: oldShaOrNull });
}
export function deleteRefCAS(cwd, ref, oldSha) {
  return updateRef(cwd, ['-d', ref, oldSha], { ref, old: oldSha });
}

export async function emptyTree(cwd) { return (await git(['mktree'], { cwd, input: '' })).stdout.trim(); }

export async function commitTree(cwd, { tree, parents = [], subject, body = '', trailers = [] }) {
  const trailerBlock = trailers.map(([k, v]) => `${k}: ${v}`).join('\n');
  const message = [subject, body, trailerBlock].filter((s) => s !== '').join('\n\n') + '\n';
  const args = ['commit-tree', tree];
  for (const p of parents) args.push('-p', p);
  return (await git(args, { cwd, input: message })).stdout.trim();
}

function splitBytes(buf, sep) {
  const parts = []; let from = 0, at;
  while ((at = buf.indexOf(sep, from)) !== -1) { parts.push(buf.subarray(from, at)); from = at + sep.length; }
  parts.push(buf.subarray(from)); return parts;
}
const TRAILER = /^([A-Za-z][A-Za-z0-9-]*): (.*)$/;
export async function catCommit(cwd, sha) {
  const { raw } = await git(['cat-file', 'commit', sha], { cwd });
  const cut = raw.indexOf('\n\n');
  const header = raw.subarray(0, cut).toString('utf8');
  let msg = raw.subarray(cut + 2);
  if (msg.at(-1) === 10) msg = msg.subarray(0, -1);
  const tree = /^tree ([0-9a-f]{40})$/m.exec(header)[1];
  const parents = [...header.matchAll(/^parent ([0-9a-f]{40})$/gm)].map((m) => m[1]);
  const parts = splitBytes(msg, '\n\n');
  const subject = parts[0].toString('utf8');
  let trailers = [], bodyParts = parts.slice(1);
  if (parts.length >= 2) {
    const parsed = parts.at(-1).toString('utf8').split('\n').map((l) => TRAILER.exec(l));
    if (parsed.every(Boolean)) { trailers = parsed.map((m) => [m[1], m[2]]); bodyParts = parts.slice(1, -1); }
  }
  const bodyBytes = Buffer.concat(bodyParts.flatMap((b, i) => (i ? [Buffer.from('\n\n'), b] : [b])));
  return { tree, parents, subject, body: bodyBytes.toString('utf8'), bodyBytes, trailers };
}

// Shared by writeTreeFromPaths (below) and treeIdentityReadOnly: resolves a set of repository
// paths to the tree entries (mode, path, raw bytes) a tree of them would contain, reading the
// worktree directly. Neither the read nor this resolution touches the object database; only the
// caller's own blob-hashing step (writeTreeFromPaths's `-w`, or treeIdentityReadOnly's plain
// hash-object) differs.
async function resolveTreeEntries(cwd, paths, exclude) {
  const skip = (p) => exclude.some((x) => p === x || p.startsWith(x.endsWith('/') ? x : x + '/'));
  const entries = [];
  for (const p of [...new Set(paths)].sort()) {
    if (skip(p)) continue;
    let st; try { st = await lstat(join(cwd, p)); } catch { continue; } // deleted in the worktree: absent from the tree
    if (st.isSymbolicLink()) entries.push({ mode: '120000', path: p, bytes: Buffer.from(await readlink(join(cwd, p))) });
    else if (st.isFile()) entries.push({ mode: st.mode & 0o111 ? '100755' : '100644', path: p, bytes: await readFile(join(cwd, p)) });
    else throw new GitError(`refusing special file ${p}`);
  }
  return entries;
}

export async function writeTreeFromPaths(cwd, { paths, exclude = [] }) {
  const entries = await resolveTreeEntries(cwd, paths, exclude);
  for (const e of entries) e.sha = (await git(['hash-object', '-w', '--stdin'], { cwd, input: e.bytes })).stdout.trim();
  const dir = await mkdtemp(join(tmpdir(), 'cairn-index-'));
  try {
    const env = { ...process.env, GIT_INDEX_FILE: join(dir, 'index') };
    const info = entries.map((e) => `${e.mode} ${e.sha}\t${e.path}\n`).join('');
    await git(['update-index', '--add', '--index-info'], { cwd, input: info, env });
    return (await git(['write-tree'], { cwd, env })).stdout.trim();
  } finally { await rm(dir, { recursive: true, force: true }); }
}

// Sorts as a real git tree object does: a directory's own name is compared with a trailing '/'
// appended, so e.g. the blob 'foo.txt' sorts before the tree 'foo' ('.' is 0x2e, '/' is 0x2f) --
// verified by hand against `git write-tree`'s own output for that exact collision.
const treeEntryKey = (name, isTree) => (isTree ? name + '/' : name);

// The sha a `git write-tree` of these exact (path, mode, blob-sha) entries would produce,
// computed entirely in memory: nothing is read from or written to the object database here.
// Recursively groups entries by directory and hashes each level's canonical tree object bytes
// bottom-up with the same "tree <len>\0<mode> <name>\0<20 raw sha bytes>..." encoding git itself
// uses for a tree object's payload. Cross-checked against real `git write-tree` output for a
// multi-level path set, including the file/directory name-prefix sorting case above.
export function treeShaFromEntries(entries) {
  const root = {};
  for (const e of entries) {
    const parts = e.path.split('/');
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) { node.dirs ??= {}; node.dirs[parts[i]] ??= {}; node = node.dirs[parts[i]]; }
    node.files ??= {};
    node.files[parts.at(-1)] = { mode: e.mode, sha: e.sha };
  }
  const hashNode = (node) => {
    const items = [];
    for (const [name, sub] of Object.entries(node.dirs ?? {})) items.push({ name, mode: '40000', sha: hashNode(sub), isTree: true });
    for (const [name, f] of Object.entries(node.files ?? {})) items.push({ name, mode: f.mode, sha: f.sha, isTree: false });
    items.sort((a, b) => { const an = treeEntryKey(a.name, a.isTree), bn = treeEntryKey(b.name, b.isTree); return an < bn ? -1 : an > bn ? 1 : 0; });
    const content = Buffer.concat(items.map((it) => Buffer.concat([Buffer.from(`${it.mode} ${it.name}\0`), Buffer.from(it.sha, 'hex')])));
    return createHash('sha1').update(Buffer.concat([Buffer.from(`tree ${content.length}\0`), content])).digest('hex');
  };
  return hashNode(root);
}

// A read-only counterpart to writeTreeFromPaths, for a caller that must never write a Git object
// as a side effect of computing an identity (lib/check.mjs's identitiesNow, which wake's own
// currency check reaches through isCurrent). Blob shas come from `git hash-object --stdin` with
// no `-w`: git computes and returns the hash without storing anything. The tree sha comes from
// treeShaFromEntries above instead of `git write-tree`, which always writes. Given the same
// paths, this produces byte-identical results to writeTreeFromPaths: the same entries, the same
// blob-hashing input (raw bytes read here in Node, the same source writeTreeFromPaths hashes),
// the same tree encoding.
export async function treeIdentityReadOnly(cwd, { paths, exclude = [] }) {
  const entries = await resolveTreeEntries(cwd, paths, exclude);
  for (const e of entries) e.sha = (await git(['hash-object', '--stdin'], { cwd, input: e.bytes })).stdout.trim();
  return treeShaFromEntries(entries);
}
export async function listTree(cwd, treeSha) {
  const { stdout } = await git(['ls-tree', '-r', '-z', treeSha], { cwd });
  return stdout.split('\0').filter(Boolean).map((line) => {
    const [meta, path] = line.split('\t'); const [mode, , sha] = meta.split(' ');
    return { path, mode, sha };
  });
}
