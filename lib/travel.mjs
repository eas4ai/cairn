// lib/travel.mjs
import { git, readRef } from './gitx.mjs';
import { loadSettings } from './settings.mjs';
import { readLog, refFieldsOf, range } from './records.mjs';
import { readAdr } from './adr.mjs';
import { parseRoadmap } from './spec.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { layoutOf, SUDUS, CAIRN } from './layout.mjs';

export class TravelError extends Error { constructor(m) { super(m); this.name = 'TravelError'; } }

export const DURABLE_REFS = Object.freeze(['refs/sudus/log', 'refs/sudus/snapshots']);
export const LOCAL_REFS = Object.freeze(['refs/sudus/in-progress']);

export function refspecsFor(layout = SUDUS) {
  const specs = [layout.log, layout.snapshots].map((r) => `${r}:${r}`);
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
  if (!remotes.includes(remote)) throw new TravelError(`sudus: remote ${remote} does not exist; add it or set authority_remote to null`);
  const { fetch, push } = refspecsFor(layoutOf(cwd));
  for (const [key, wanted] of [[`remote.${remote}.fetch`, fetch], [`remote.${remote}.push`, push]]) {
    const have = await configAll(cwd, key);
    for (const spec of wanted) if (!have.includes(spec)) await git(['config', '--add', key, spec], { cwd });
  }
}

// The exact two-line command from spec section 4, byte for byte, with <authority> replaced by the
// remote name.
export function fetchCommand(authority, layout = SUDUS) {
  return `git fetch ${authority} '${layout.log}:${layout.log}' \\\n  '${layout.snapshots}:${layout.snapshots}'`;
}

// null when both durable refs exist; otherwise the exact command or skill that continues, named
// once here so wake's missing-refs branch and travel's own tests never drift.
export async function missingRefsLine(cwd) {
  const L = layoutOf(cwd);
  const missing = [];
  for (const ref of [L.log, L.snapshots]) if (!(await readRef(cwd, ref))) missing.push(ref);
  if (!missing.length) return null;
  // A clone whose branch already carries .sudus/ (another clone ran `sudus migrate` and pushed)
  // still holds the former refs; migrate moves them, init would start a second log.
  if (L === SUDUS && await readRef(cwd, CAIRN.log)) return `sudus migrate  (this clone still holds ${CAIRN.log}; migrate moves it, or names the fetch when the authority remote already holds the moved refs)`;
  const loaded = await loadSettings(cwd).catch(() => null);
  const remote = loaded?.settings.authority_remote ?? null;
  if (remote === null) return `sudus init  (durable refs ${missing.join(', ')} are missing and no authority remote is configured)`;
  // Settings written but never committed, with no log, is a `sudus init` that did not finish (the
  // signed flow's first invocation writes them and waits for the signature), not a clone of an
  // initialized project, whose settings arrive committed. A fetch here could never succeed, and
  // wake used to name it forever.
  const uncommitted = (await git(['status', '--porcelain', '--', L.settings], { cwd })).stdout.trim();
  if (uncommitted) return `sudus init --adopt ${loaded.digest}  (${L.settings} is written but not committed and no init record exists; finish init with the flags it was given, and with a signing key --nonce and --signature)`;
  return fetchCommand(remote, L);
}

export const PUSH_COMMAND = 'sudus push';

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

// Fix round 1 item 1 (Critical, review-1.md finding 1): the exact text Git prints when the
// remote's receive-pack does not support --atomic, captured against a real bare repository
// configured with `receive.advertiseAtomic false` (git 2.55.0), and matched exactly. A genuine
// rejection on an atomic-capable remote -- a pre-receive hook declining one ref, or a stale
// --force-with-lease losing a race -- can print "atomic push failed" and "failed to push some
// refs" for the SAME reasons an unsupported remote does; the previous broader regex mistook both
// for missing atomic support and silently fell back to an ordered per-ref push, defeating the one
// case atomicity exists for (rule 7: such a rejection is thrown as is, with no ordered fallback).
// Exported so a test can confirm a real rejection's stderr does not match it.
export const ATOMIC_UNSUPPORTED = /the receiving end does not support --atomic push/;

// Atomic where the remote allows it, safely ordered (snapshots, log, branch) otherwise. Section 4:
// "Without remote atomicity, Sudus pushes snapshots first, log second and branch last. A failure
// stops the sequence." Each ref carries the expected remote OID as a compare-and-swap lease
// (--force-with-lease); a ref the remote lacks leases against the empty string, so a concurrent
// clone that created it first still refuses this push rather than silently winning.
export async function push(cwd, { branch } = {}) {
  const { settings } = await loadSettings(cwd);
  const remote = settings.authority_remote;
  if (remote === null) throw new TravelError('sudus: no authority remote; the durable refs stay local');
  if (!branch) {
    const r = await git(['symbolic-ref', '--short', 'HEAD'], { cwd, expect: [0, 128] });
    if (r.code !== 0) throw new TravelError('sudus: HEAD is detached; check out the branch to push');
    branch = r.stdout.trim();
  }
  const branchRef = `refs/heads/${branch}`;
  const L = layoutOf(cwd);
  const order = [L.snapshots, L.log, branchRef];
  const oids = await remoteOids(cwd, remote, order);
  for (const ref of order) {
    const local = await readRef(cwd, ref);
    if (!local) throw new TravelError(`sudus: ${ref} does not exist locally`);
    if (oids[ref] && !(await isAncestor(cwd, oids[ref], local))) {
      const repair = ref === branchRef ? 'git pull --ff-only' : `git fetch ${remote} ${ref}:${ref}`;
      throw new TravelError(`sudus: ${ref} on ${remote} is ahead of this clone; run: ${repair}`);
    }
  }
  const specs = order.map((r) => `${r}:${r}`);
  const atomic = await git(['push', '--atomic', ...leases(oids, order), remote, ...specs], { cwd, expect: [0, 1, 128] });
  if (atomic.code === 0) return afterPush({ mode: 'atomic', pushed: order, remote }, cwd);
  const err = String(atomic.stderr ?? '');
  // Rule 7: any rejection other than the remote genuinely lacking --atomic -- a lease mismatch, a
  // hook declining one ref -- is thrown as is. The ordered fallback below is never used to work
  // around a rejection of a single ref: a true atomic transaction already refused every ref
  // together, so nothing landed.
  if (!ATOMIC_UNSUPPORTED.test(err)) throw new TravelError(`sudus: push to ${remote} refused: ${err.trim().split('\n').filter(Boolean).pop()}`);
  // Rule 6: the remote genuinely does not support --atomic.
  const pushed = [];
  for (const ref of order) {
    const one = await git(['push', ...leases(oids, [ref]), remote, `${ref}:${ref}`], { cwd, expect: [0, 1, 128] });
    if (one.code !== 0) throw new TravelError(`sudus: push of ${ref} failed after ${pushed.join(', ') || 'nothing'}; retry with: ${PUSH_COMMAND}`);
    pushed.push(ref);
  }
  return afterPush({ mode: 'ordered', pushed, remote }, cwd);
}

// Kernel fix round (plan 14 fixture, defect 1, ruling A): section 4's after-fetch cross-reference
// validation belongs here, at sudus push's own post-push check, not on wake's ordinary path (see
// lib/wake.mjs's wake() for the removed call and its own comment). A successful push means this
// clone's own state reached the remote; if validateAfterFetch still finds a gap afterward -- a
// dangling reference this push did not and could not supply -- that is worth surfacing
// immediately rather than waiting for the next unrelated command to trip over it.
async function afterPush(result, cwd) {
  const repairs = await validateAfterFetch(cwd);
  if (repairs.length) throw new TravelError(`sudus: pushed, but a cross-reference is still unresolved; ${repairs[0].command}`);
  return result;
}

// Fix round 1 item 2 (Important, review-1.md finding 2): the snapshot-typed and ref-typed fields
// a log record's payload can carry are no longer a hand-maintained name list -- one that omitted
// report.brief, escalation.evaluation, outside.evaluation, evaluation-intent/calibration's
// log_head, and superseded.start, and could never see a list(ref) field (superseded.carried)
// regardless of the list, since the scan only ever tested `typeof v === 'string'`. Both are
// derived per record kind from lib/records.mjs's refFieldsOf, which reads the field types
// straight out of SCHEMAS, so this can never again silently drift as a kind's payload changes.
const SHA_RE = /^[0-9a-f]{40}$/;
function refValues(payload, fields) {
  return fields.flatMap(({ name, list }) => (list ? (payload[name] ?? []) : [payload[name]]));
}

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
  // Kernel fix round (plan 14 fixture): a durable ref can exist with no readable
  // .sudus/settings.json (a raw fixture, or a repository whose settings were never written) --
  // missingRefsLine already tolerates this the same way; unreadable settings mean no known
  // authority remote, not a crash.
  const remote = (await loadSettings(cwd).catch(() => null))?.settings.authority_remote ?? null;
  const log = await readLog(cwd);
  const logSet = new Set(log.map((r) => r.sha));
  const L = layoutOf(cwd);
  const snapSet = await chain(cwd, L.snapshots);
  const tips = { [L.log]: await readRef(cwd, L.log), [L.snapshots]: await readRef(cwd, L.snapshots) };
  const gaps = [];
  const seen = new Set();
  const add = (ref, missing, from) => {
    const key = `${ref} ${missing}`;
    if (seen.has(key)) return;
    seen.add(key);
    gaps.push({ ref, missing, from });
  };
  for (const r of log) {
    const { snapshotFields, recordFields } = refFieldsOf(r.kind);
    for (const v of refValues(r.payload, snapshotFields)) {
      if (typeof v === 'string' && SHA_RE.test(v) && !snapSet.has(v)) add(L.snapshots, v, `record ${r.sha}`);
    }
    for (const v of refValues(r.payload, recordFields)) {
      if (typeof v === 'string' && SHA_RE.test(v) && !logSet.has(v)) add(L.log, v, `record ${r.sha}`);
    }
  }
  // Kernel fix round (plan 14 fixture, defect 1, ruling B): a roadmap Current: line naming a
  // slug with no matching start record is the ordinary spec-phase state between `sudus init` and
  // the project's first `sudus start` -- the spec-phase tail writes Current: by hand before that
  // start ever runs -- not a dangling reference. It only becomes a genuine gap once the project
  // has started at least once (a start record exists somewhere in the log): Current: naming a
  // later, not-yet-started slug then means either a supersession successor pending locally, or a
  // start record the remote has and this clone does not.
  let roadmap = '';
  try { roadmap = readFileSync(join(cwd, 'docs/spec/roadmap.md'), 'utf8'); } catch { roadmap = ''; }
  const current = roadmap ? parseRoadmap(roadmap).current : null;
  // Only while a commitment is open: between commitments the developer writes Current: by hand
  // before sudus start (the spec-phase tail, and again after every Done), which used to read as
  // a start record the remote had and this clone did not, with a push repair that recommended
  // itself forever.
  const rangeNow = range(log);
  const commitmentOpen = Boolean(rangeNow.start) && !rangeNow.closed;
  if (current && commitmentOpen && !log.some((r) => r.kind === 'start' && r.payload.slug === current)) {
    add(L.log, `start ${current}`, `the start record for ${current}`);
  }
  let adr = [];
  try { adr = await readAdr(cwd); } catch { adr = []; }
  for (const line of adr) {
    for (const k of ['answer', 'escalation', 'record']) {
      const v = line[k];
      if (typeof v === 'string' && SHA_RE.test(v) && !logSet.has(v)) add(L.log, v, `ADR line ${line.id}`);
    }
  }
  // The authority remote is asked for its tips only when a repair has to name a fetch or a push:
  // a consistent clone, which is every ordinary wake and so every hook turn, never contacts the
  // network here.
  if (!gaps.length) return [];
  const remoteTips = remote === null ? {} : await remoteOids(cwd, remote, [L.log, L.snapshots]);
  return gaps.map((g) => repairFor(remote, g.ref, tips[g.ref], remoteTips[g.ref] ?? null, g.missing, g.from));
}

// The working agreement's own push paragraph, carried here as a kernel constant so
// skills/new-project's AGENTS.md template (plan 13) and this module cannot drift.
export const AGREEMENT_PUSH_TEXT = [
  'Push with `sudus push`. It pushes the branch, `refs/sudus/log` and',
  '`refs/sudus/snapshots` to the authority remote in one atomic push where the',
  'remote supports it; otherwise snapshots first, log second and branch last,',
  'and a failure stops the sequence. Each ref carries the expected remote OID',
  'as a lease, so a clone that is behind is refused and told what to fetch.',
  'Never push `refs/sudus/*` with plain `git push`; after any fetch, `sudus',
  'wake` checks the records against the code and names the exact repair.',
].join('\n');
