// lib/travel.mjs
import { git, readRef } from './gitx.mjs';
import { loadSettings } from './settings.mjs';
import { readLog } from './records.mjs';
import { readAdr } from './adr.mjs';
import { parseRoadmap } from './spec.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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

// Fields naming a snapshot commit (refs/cairn/snapshots) and fields naming another log record
// (refs/cairn/log), across every record schema (lib/records.mjs SCHEMAS). A field name not
// present on a given kind's payload is simply absent; scanning the same fixed name list against
// every record's payload is safe because decodeRecord's closed-key check means no other field can
// smuggle a look-alike 40-character value onto an unrelated key that this list happens to name.
const SNAPSHOT_REFS = ['snapshot', 'input', 'base'];
const RECORD_REFS = ['intent', 'escalation', 'item', 'breach', 'report', 'review', 'source', 'from_superseded', 'option_call', 'owner_call', 'answer'];
const SHA_RE = /^[0-9a-f]{40}$/;

async function chain(cwd, ref) {
  const tip = await readRef(cwd, ref);
  if (!tip) return new Set();
  return new Set((await git(['rev-list', tip], { cwd })).stdout.split('\n').filter(Boolean));
}

function repairFor(remote, ref, localTip, remoteTip, missing, from) {
  if (remote !== null && remoteTip && remoteTip !== localTip) {
    return { kind: 'fetch', ref, missing, from, command: `git fetch ${remote} ${ref}:${ref}` };
  }
  return { kind: 'push', ref, missing, from, command: `${PUSH_COMMAND}  (in the clone that wrote ${from})` };
}

// Walks every cross-reference the kernel can check after a fetch -- a log record's snapshot and
// record fields, the roadmap's Current: line against a start record, and an ADR answered/read
// line's record reference -- and names, for each gap, the exact fetch or push that repairs it.
// Section 4: "After fetch, wake validates all cross-references and names the exact fetch or push
// repair; it never guesses." Whether the repair is a fetch or a push is decided by comparing the
// remote's own ref tip with the local one: when they differ, the remote is ahead and has the
// object; when they are equal, the object cannot be on the remote either (a bypassing ordinary
// push never created it there), so the repair names a push from the clone that wrote the record.
export async function validateAfterFetch(cwd) {
  const { settings } = await loadSettings(cwd);
  const remote = settings.authority_remote;
  const log = await readLog(cwd);
  const logSet = new Set(log.map((r) => r.sha));
  const snapSet = await chain(cwd, 'refs/cairn/snapshots');
  const tips = { 'refs/cairn/log': await readRef(cwd, 'refs/cairn/log'), 'refs/cairn/snapshots': await readRef(cwd, 'refs/cairn/snapshots') };
  const remoteTips = remote === null ? {} : await remoteOids(cwd, remote, DURABLE_REFS);
  const repairs = [];
  const seen = new Set();
  const add = (ref, missing, from) => {
    const key = `${ref} ${missing}`;
    if (seen.has(key)) return;
    seen.add(key);
    repairs.push(repairFor(remote, ref, tips[ref], remoteTips[ref] ?? null, missing, from));
  };
  for (const r of log) {
    for (const k of SNAPSHOT_REFS) {
      const v = r.payload[k];
      if (typeof v === 'string' && SHA_RE.test(v) && !snapSet.has(v)) add('refs/cairn/snapshots', v, `record ${r.sha}`);
    }
    for (const k of RECORD_REFS) {
      const v = r.payload[k];
      if (typeof v === 'string' && SHA_RE.test(v) && !logSet.has(v)) add('refs/cairn/log', v, `record ${r.sha}`);
    }
  }
  let roadmap = '';
  try { roadmap = readFileSync(join(cwd, 'docs/spec/roadmap.md'), 'utf8'); } catch { roadmap = ''; }
  const current = roadmap ? parseRoadmap(roadmap).current : null;
  if (current && !log.some((r) => r.kind === 'start' && r.payload.slug === current)) {
    add('refs/cairn/log', `start ${current}`, `the start record for ${current}`);
  }
  let adr = [];
  try { adr = await readAdr(cwd); } catch { adr = []; }
  for (const line of adr) {
    for (const k of ['answer', 'escalation', 'record']) {
      const v = line[k];
      if (typeof v === 'string' && SHA_RE.test(v) && !logSet.has(v)) add('refs/cairn/log', v, `ADR line ${line.id}`);
    }
  }
  return repairs;
}

// The working agreement's own push paragraph, carried here as a kernel constant so
// skills/new-project's AGENTS.md template (plan 13) and this module cannot drift.
export const AGREEMENT_PUSH_TEXT = [
  'Push with `cairn push`. It pushes the branch, `refs/cairn/log` and',
  '`refs/cairn/snapshots` to the authority remote in one atomic push where the',
  'remote supports it; otherwise snapshots first, log second and branch last,',
  'and a failure stops the sequence. Each ref carries the expected remote OID',
  'as a lease, so a clone that is behind is refused and told what to fetch.',
  'Never push `refs/cairn/*` with plain `git push`; after any fetch, `cairn',
  'wake` checks the records against the code and names the exact repair.',
].join('\n');
