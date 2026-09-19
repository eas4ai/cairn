// lib/travel.mjs
import { git, readRef } from './gitx.mjs';
import { loadSettings } from './settings.mjs';

export class TravelError extends Error { constructor(m) { super(m); this.name = 'TravelError'; } }

export const DURABLE_REFS = Object.freeze(['refs/cairn/log', 'refs/cairn/snapshots']);
export const LOCAL_REFS = Object.freeze(['refs/cairn/in-progress']);

export function refspecsFor() {
  const specs = DURABLE_REFS.map((r) => `${r}:${r}`);
  return { fetch: [...specs], push: [...specs] };
}

async function configAll(cwd, key) {
  const r = await git(['config', '--get-all', key], { cwd, expect: [0, 1] });
  return r.code === 0 ? r.stdout.split('\n').filter(Boolean) : [];
}

// installRefspecs edits the remote's fetch and push config idempotently: it never removes an
// existing entry (including the remote's own default '+refs/heads/*:...' fetch refspec) and never
// adds a duplicate. `remote === null` (an explicit local-only project, section 2's Settings:
// authority_remote) is a no-op; any other remote must already be a configured Git remote.
export async function installRefspecs(cwd, remote) {
  if (remote === null || remote === undefined) return;
  const remotes = (await git(['remote'], { cwd })).stdout.split('\n').filter(Boolean);
  if (!remotes.includes(remote)) throw new TravelError(`cairn: remote ${remote} does not exist; add it or set authority_remote to null`);
  const { fetch, push } = refspecsFor();
  for (const [key, wanted] of [[`remote.${remote}.fetch`, fetch], [`remote.${remote}.push`, push]]) {
    const have = await configAll(cwd, key);
    for (const spec of wanted) if (!have.includes(spec)) await git(['config', '--add', key, spec], { cwd });
  }
}

// The exact two-line command from spec section 4, byte for byte, with <authority> replaced by the
// remote name.
export function fetchCommand(authority) {
  return `git fetch ${authority} 'refs/cairn/log:refs/cairn/log' \\\n  'refs/cairn/snapshots:refs/cairn/snapshots'`;
}

// null when both durable refs exist; otherwise the exact command or skill that continues, named
// once here so wake's missing-refs branch and travel's own tests never drift.
export async function missingRefsLine(cwd) {
  const missing = [];
  for (const ref of DURABLE_REFS) if (!(await readRef(cwd, ref))) missing.push(ref);
  if (!missing.length) return null;
  const remote = (await loadSettings(cwd).catch(() => null))?.settings.authority_remote ?? null;
  if (remote === null) return `cairn init  (durable refs ${missing.join(', ')} are missing and no authority remote is configured)`;
  return fetchCommand(remote);
}

export const PUSH_COMMAND = 'cairn push';

// The remote's current OIDs for exactly the named refs (git ls-remote), null for a ref the remote
// does not have.
export async function remoteOids(cwd, remote, refs) {
  const out = (await git(['ls-remote', '--refs', remote, ...refs], { cwd })).stdout;
  const map = Object.fromEntries(refs.map((r) => [r, null]));
  for (const line of out.split('\n').filter(Boolean)) {
    const [sha, ref] = line.split('\t');
    if (ref in map) map[ref] = sha;
  }
  return map;
}

// exit 128 ("not a valid commit name") happens when the remote's OID is an object this clone has
// never fetched; that clone is certainly not behind an object it does not have, so it is treated
// the same as exit 1 (not an ancestor) rather than as an error.
async function isAncestor(cwd, maybeAncestor, sha) {
  const r = await git(['merge-base', '--is-ancestor', maybeAncestor, sha], { cwd, expect: [0, 1, 128] });
  return r.code === 0;
}

function leases(oids, refs) {
  return refs.map((ref) => `--force-with-lease=${ref}:${oids[ref] ?? ''}`);
}

const ATOMIC_UNSUPPORTED = /does not support --atomic|atomic push failed|one ref at a time|failed to push some refs/i;

// Atomic where the remote allows it, safely ordered (snapshots, log, branch) otherwise. Section 4:
// "Without remote atomicity, Cairn pushes snapshots first, log second and branch last. A failure
// stops the sequence." Each ref carries the expected remote OID as a compare-and-swap lease
// (--force-with-lease); a ref the remote lacks leases against the empty string, so a concurrent
// clone that created it first still refuses this push rather than silently winning.
export async function push(cwd, { branch } = {}) {
  const { settings } = await loadSettings(cwd);
  const remote = settings.authority_remote;
  if (remote === null) throw new TravelError('cairn: no authority remote; the durable refs stay local');
  if (!branch) {
    const r = await git(['symbolic-ref', '--short', 'HEAD'], { cwd, expect: [0, 128] });
    if (r.code !== 0) throw new TravelError('cairn: HEAD is detached; check out the branch to push');
    branch = r.stdout.trim();
  }
  const branchRef = `refs/heads/${branch}`;
  const order = ['refs/cairn/snapshots', 'refs/cairn/log', branchRef];
  const oids = await remoteOids(cwd, remote, order);
  for (const ref of order) {
    const local = await readRef(cwd, ref);
    if (!local) throw new TravelError(`cairn: ${ref} does not exist locally`);
    if (oids[ref] && !(await isAncestor(cwd, oids[ref], local))) {
      const repair = ref === branchRef ? 'git pull --ff-only' : `git fetch ${remote} ${ref}:${ref}`;
      throw new TravelError(`cairn: ${ref} on ${remote} is ahead of this clone; run: ${repair}`);
    }
  }
  const specs = order.map((r) => `${r}:${r}`);
  const atomic = await git(['push', '--atomic', ...leases(oids, order), remote, ...specs], { cwd, expect: [0, 1, 128] });
  if (atomic.code === 0) return { mode: 'atomic', pushed: order, remote };
  const err = String(atomic.stderr ?? '');
  if (!ATOMIC_UNSUPPORTED.test(err)) throw new TravelError(`cairn: push to ${remote} refused: ${err.trim().split('\n').filter(Boolean).pop()}`);
  const pushed = [];
  for (const ref of order) {
    const one = await git(['push', ...leases(oids, [ref]), remote, `${ref}:${ref}`], { cwd, expect: [0, 1, 128] });
    if (one.code !== 0) throw new TravelError(`cairn: push of ${ref} failed after ${pushed.join(', ') || 'nothing'}; retry with: ${PUSH_COMMAND}`);
    pushed.push(ref);
  }
  return { mode: 'ordered', pushed, remote };
}
