import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

export class GitError extends Error { constructor(m, info = {}) { super(m); this.name = 'GitError'; Object.assign(this, info); } }
export class CasError extends GitError { constructor(m, info) { super(m, info); this.name = 'CasError'; } }
export const ZERO = '0'.repeat(40);

export function git(args, { cwd, input, env, expect = [0] } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('git', args, { cwd, env: env ?? process.env, stdio: ['pipe', 'pipe', 'pipe'] });
    const out = [], err = [];
    child.stdout.on('data', (d) => out.push(d));
    child.stderr.on('data', (d) => err.push(d));
    child.on('error', reject);
    child.on('close', (code) => {
      const raw = Buffer.concat(out), stderr = Buffer.concat(err).toString('utf8');
      if (!expect.includes(code)) reject(new GitError(`git ${args[0]} exited ${code}: ${stderr.trim()}`, { args, stderr, code }));
      else resolvePromise({ stdout: raw.toString('utf8'), raw, stderr, code });
    });
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
