// lib/check.mjs
import { spawn } from 'node:child_process';
import { readMechanisms, MechanismError } from './mechanisms.mjs';

export class CheckError extends Error {}

export async function selectMechanism(cwd, REQ) {
  const all = await readMechanisms(cwd);
  // Deviation from the plan text: readMechanisms (Task 1) orders its object by sorting the
  // .json filenames, which is not the same order as sorting the plain mechanism names ('-' sorts
  // before '.', so 'greeter-two.json' < 'greeter.json' but 'greeter' < 'greeter-two'). Sort the
  // selected names themselves so a multi-mechanism refusal always lists them alphabetically.
  const names = Object.keys(all).filter((n) => all[n].definition.requirements.includes(REQ)).sort();
  if (names.length === 0) throw new CheckError(`no mechanism declares ${REQ}`);
  if (names.length > 1) throw new CheckError(`${names.length === 2 ? 'two' : names.length} mechanisms declare ${REQ}: ${names.join(', ')}`);
  return { name: names[0], entry: all[names[0]] };
}

// Fix round 1 finding 5 (Important): the command's combined stdout/stderr used to accumulate in
// an ever-growing `chunks` array with no bound, so a command that prints without limit could
// exhaust memory before the receipt was even written. `push` below caps what is ever held (and
// later written to `.sudus/output/` by writeOutput) at OUTPUT_CAP bytes, appending one marker line
// -- itself the "recorded truncation flag" -- the first time a chunk would cross the cap; every
// following chunk is dropped without allocating anything for it. The child's stdout/stderr streams
// stay subscribed either way, so a truncated run still drains them instead of stalling the child
// on a full pipe.
export const OUTPUT_CAP = 8 * 1024 * 1024;
export function runCommand(cwd, command, { cap = OUTPUT_CAP } = {}) {
  return new Promise((resolve) => {
    const chunks = [];
    let written = 0, truncated = false;
    const push = (c) => {
      if (truncated) return;
      const room = cap - written;
      if (c.length <= room) { chunks.push(c); written += c.length; return; }
      if (room > 0) chunks.push(c.subarray(0, room));
      chunks.push(Buffer.from(`sudus: output truncated at ${cap} bytes\n`));
      truncated = true;
    };
    let child;
    try {
      child = spawn('sh', ['-c', command], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) { return resolve({ spawned: false, out: Buffer.alloc(0), code: null, signal: null, truncated: false }); }
    child.stdout.on('data', push);
    child.stderr.on('data', push);
    child.on('error', () => resolve({ spawned: false, out: Buffer.concat(chunks), code: null, signal: null, truncated }));
    child.on('close', (code, signal) => resolve({ spawned: true, out: Buffer.concat(chunks), code, signal, truncated }));
  });
}

export async function observeIdentity(cwd, identity) {
  const tools = {};
  for (const name of Object.keys(identity.tools).sort()) {
    const r = await runCommand(cwd, identity.tools[name]);
    tools[name] = r.spawned && r.code === 0 ? r.out.toString('utf8').trim() : null;
  }
  const env = {};
  for (const name of identity.env) env[name] = Object.hasOwn(process.env, name) ? process.env[name] : null;
  return { tools, env, image: identity.image };
}

export { MechanismError };

import { access, mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { canonicalize, sha256 } from './canon.mjs';
import { requirementDigest } from './mechanisms.mjs';
import { withCheckLock } from './lease.mjs';
import { writeInputSnapshot, readSnapshot } from './snapshots.mjs';
import { listTree } from './gitx.mjs';
import { layoutOf, LAYOUTS } from './layout.mjs';
import { appendRecord, readLog, range } from './records.mjs';

export const OUTPUT_DIR = '.sudus/output';
// A mechanism written under the former name still prints `cairn: REQ: pass`; both prefixes count.
const LINE = /^(?:sudus|cairn): ([A-Z][A-Z0-9]*-[0-9]{3,}): (pass|fail)$/;

export async function productDigest(cwd, tree, documents) {
  const under = (p) => documents.some((d) => p === d || p.startsWith(d + '/'));
  const entries = (await listTree(cwd, tree)).filter((e) => !under(e.path)).map((e) => [e.path, e.mode, e.sha]);
  return sha256(canonicalize(entries));
}

export const outputPath = (cwd, digest) => join(cwd, layoutOf(cwd).output, digest.slice('sha256:'.length));

async function writeOutput(cwd, bytes) {
  const digest = sha256(bytes);
  const outputDir = join(cwd, layoutOf(cwd).output);
  await mkdir(outputDir, { recursive: true });
  // Fix round 1 finding 11 (Minor): write .gitignore only when it is not already there, instead
  // of on every check, so a developer's own edits to it (or its mtime) are not silently clobbered
  // by the next check.
  const gitignore = join(outputDir, '.gitignore');
  try { await access(gitignore); } catch { await writeFile(gitignore, '*\n'); }
  const tmp = join(outputDir, `.tmp-${process.pid}-${Date.now()}`);
  await writeFile(tmp, bytes);
  await rename(tmp, outputPath(cwd, digest));
  return digest;
}

export async function outputPresent(cwd, receipt) {
  try { await access(outputPath(cwd, receipt.payload.output)); return true; } catch { return false; }
}

// Fix round 1 finding 10 (Minor): a line is matched after stripping one trailing CR, so a command
// that ends its lines \r\n (e.g. run through a Windows-style tool, or plain `printf '...\r\n'`)
// still matches instead of silently landing on 'unverified' because the CR sat between "pass"/"fail"
// and the regex's end-of-line anchor.
function resultFor(def, run, id) {
  if (!run.spawned) return 'unverified';
  if (def.results === 'per-requirement') {
    const mine = run.out.toString('utf8').split('\n').map((l) => LINE.exec(l.endsWith('\r') ? l.slice(0, -1) : l)).filter((m) => m && m[1] === id);
    if (mine.length === 0) return 'unverified';
    return mine.some((m) => m[2] === 'fail') ? 'fail' : 'pass';
  }
  return run.code === 0 ? 'pass' : 'fail';
}

// "After three distinct failing attempts without a pass, a fourth implementation attempt requires
// an escalation first" (spec, Deferral and attempts). Wake's run predicate names `escalate` from
// this; check refuses from it too, since the receipt is what an attempt leaves and it used to be
// written without limit while wake already said escalate.
export function attemptState(log, REQ) {
  const r = range(log);
  if (!r.start || r.closed) return { tried: 0, escalated: false, needed: false };
  const set = r.start.payload.requirements.map((x) => x.requirement);
  const tried = attempts(log, REQ, { since: r.start.sha, siblings: set });
  const lastPass = log.findLastIndex((x) => x.kind === 'receipt' && x.payload.status === 'ran' && x.payload.results.some((y) => y.requirement === REQ && y.result === 'pass'));
  const escalated = log.slice(lastPass + 1).some((x) => x.kind === 'escalation' && x.payload.concerns.split(' ').includes(REQ));
  return { tried, escalated, needed: tried >= 3 && !escalated };
}

export async function check(cwd, REQ) {
  const target = await requirementDigest(cwd, REQ);
  if (!target.agreed) throw new CheckError(`${REQ} is not Agreed; only Agreed requirements are checked`);
  const before = attemptState(await readLog(cwd), REQ);
  if (before.needed) throw new CheckError(`${before.tried} distinct failing attempts at ${REQ} without a pass; a fourth attempt needs an escalation first: sudus escalate --commitment <slug> --concern ${REQ} ...`);
  const { name, entry } = await selectMechanism(cwd, REQ);
  const def = entry.definition;
  return withCheckLock(cwd, async () => {
    const input = await writeInputSnapshot(cwd, { mechanism: name, inputs: def.inputs });
    const { tree } = await readSnapshot(cwd, input, 'input');
    const product = await productDigest(cwd, tree, def.documents);
    const identity = await observeIdentity(cwd, def.identity);
    const runCwd = def.cwd ? join(cwd, def.cwd) : cwd;
    let run = { spawned: false, out: Buffer.alloc(0), code: null, signal: null };
    try { await access(runCwd); run = await runCommand(runCwd, def.command); } catch { /* status error */ }
    const output = await writeOutput(cwd, run.out);
    // Fix round 1 finding 8 (Minor): "Only Agreed blocks are digested and checked" (spec section
    // 2) -- a non-Agreed declared requirement (e.g. Draft) is omitted from the receipt entirely,
    // not recorded with result 'unverified'. Its text is never even digested.
    const results = [];
    for (const id of def.requirements) {
      const { textDigest, agreed } = await requirementDigest(cwd, id);
      if (!agreed) continue;
      results.push({ requirement: id, text_digest: textDigest, result: resultFor(def, run, id) });
    }
    const payload = {
      mechanism: name, definition_digest: entry.definitionDigest, input, product_digest: product,
      status: run.spawned ? 'ran' : 'error', identity, results, output,
      exit: { code: run.spawned ? run.code : null, signal: run.spawned ? run.signal : null },
    };
    return appendRecord(cwd, 'receipt', name, payload);
  });
}

import { treeIdentityReadOnly, catCommit, GitError } from './gitx.mjs';
import { resolveInputPaths, ALWAYS_EXCLUDED, SnapshotError } from './snapshots.mjs';

// Fix round 1 finding 1 (Critical): identity 1 (the input snapshot tree) is now recomputed with
// the same resolution writeInputSnapshot used to build the recorded snapshot -- resolveInputPaths
// expands a directory input through `git ls-files`, dropping ignored untracked files, the same way
// writeWorkspaceSnapshot and writeInputSnapshot already do -- instead of calling writeTreeFromPaths
// directly on the raw declared paths, which lstat-s each entry and throws on a directory. `exclude:
// ALWAYS_EXCLUDED` matches writeSnapshot's own call so the two trees are built the same way and can
// be compared by tree SHA.
//
// Fix round 1, item 1 (Critical, this branch's own review): identitiesNow's only production
// caller is isCurrent (below), a currency *check* -- it has no business writing anything, but
// writeTreeFromPaths writes every blob and the tree itself to the object database (`hash-object
// -w`, `write-tree`) as a side effect. Reproduced: one wake() call after a pass receipt and one
// edit to a declared input added three loose objects, breaking wake's read-only contract (wake
// reaches this through readState -> currentReceipt -> isCurrent). Switched to
// lib/gitx.mjs's treeIdentityReadOnly, which resolves and hashes the exact same entries
// (byte-identical tree sha, verified against writeTreeFromPaths/write-tree for a multi-level
// path set) without writing anything. The real writer path (lib/snapshots.mjs's
// writeInputSnapshot, used by check()) is untouched and still writes durably, as it must.
//
// `memo`, a Map one read-only pass owns (wake's readState), holds one reading of each mechanism
// definition's input tree and tool identities: the requirements it declares share it. Without it a
// consumer project spent 30 s in one wake, re-hashing inputs and re-running tool version probes
// for every stale receipt of every requirement.
export async function identitiesNow(cwd, REQ, memo = null) {
  const { name, entry } = await selectMechanism(cwd, REQ);
  const { textDigest } = await requirementDigest(cwd, REQ);
  const key = `${name}\0${entry.definitionDigest}`;
  let reading = memo?.get(key);
  if (!reading) {
    reading = (async () => {
      const paths = await resolveInputPaths(cwd, entry.definition.inputs);
      const tree = await treeIdentityReadOnly(cwd, { paths, exclude: ALWAYS_EXCLUDED });
      return { tree, identity: await observeIdentity(cwd, entry.definition.identity) };
    })();
    memo?.set(key, reading);
  }
  const { tree, identity } = await reading;
  return { mechanism: name, definitionDigest: entry.definitionDigest, textDigest, tree, identity };
}

// The identities a receipt for REQ must carry now, or null when REQ has no mechanism, text or
// input tree to read (the reasons isCurrent reports as not current).
export async function currentIdentities(cwd, REQ, memo = null) {
  try { return await identitiesNow(cwd, REQ, memo); } catch (e) { if (expected(e)) return null; throw e; }
}

// Fix round 1 finding 6 (Important): each of the three try/catch blocks below used to catch
// *any* thrown error and report "not current". That is right for the specific ways a receipt or
// its referents can legitimately be gone or mismatched (no mechanism still declares REQ, the
// requirement left docs/spec, the receipt's sha or its input snapshot no longer resolves, the
// snapshot's kind or envelope is wrong) -- but it also hid a real bug (finding 1's GitError from a
// directory input) as ordinary staleness. `expected` names exactly the error classes each call can
// throw for a legitimate "not current" reason; anything else -- a TypeError from a real defect,
// for instance -- now propagates instead of being swallowed.
const expected = (e) => e instanceof CheckError || e instanceof MechanismError || e instanceof SnapshotError || e instanceof GitError;

export async function isCurrent(cwd, receipt, REQ, now) {
  now = now ?? await currentIdentities(cwd, REQ);
  if (!now) return false;
  // The payload's own fields first: a receipt for another definition, text or tool set is not
  // current, and saying so reads nothing from Git.
  const p = receipt.payload;
  if (p.mechanism !== now.mechanism || p.definition_digest !== now.definitionDigest) return false;
  const r = p.results.find((x) => x.requirement === REQ);
  if (!r || r.text_digest !== now.textDigest) return false;
  if (canonicalize(p.identity) !== canonicalize(now.identity)) return false;
  let commit;
  try { commit = await catCommit(cwd, receipt.sha); } catch (e) { if (expected(e)) return false; throw e; }
  const trailers = Object.fromEntries(commit.trailers);
  if (!LAYOUTS.some((l) => trailers[l.schemaTrailer] === '1' && trailers[l.digestTrailer] === sha256(commit.body))) return false;
  let snap;
  try { snap = await readSnapshot(cwd, p.input, 'input'); } catch (e) { if (expected(e)) return false; throw e; }
  return snap.tree === now.tree;
}

export function latestReceipt(log, REQ) {
  return log.filter((r) => r.kind === 'receipt' && r.payload.results.some((x) => x.requirement === REQ)).at(-1) ?? null;
}

export async function evidence(cwd, log, REQ) {
  const receipt = latestReceipt(log, REQ);
  if (!receipt) return { receipt: null, current: false, result: null, outputPresent: false };
  const result = receipt.payload.results.find((x) => x.requirement === REQ).result;
  return { receipt, current: await isCurrent(cwd, receipt, REQ), result, outputPresent: await outputPresent(cwd, receipt) };
}

// `since`: a record SHA (the open commitment's start); receipts before it are not attempts.
// The deliberate fail receipts that bind mechanisms during the spec phase precede start and
// used to count, so a requirement could escalate on its first real attempt.
// `siblings`: the commitment's other requirement ids. A fail receipt in which one of them also
// failed is not an attempt at REQ: a requirement whose gate includes other requirements'
// falsifiers cannot pass until they do, and counting those runs escalated it for nothing.
export function attempts(log, REQ, { since = null, siblings = [] } = {}) {
  const seen = new Set();
  let counting = since === null;
  for (const rec of log) {
    if (!counting) { if (rec.sha === since) counting = true; continue; }
    if (rec.kind !== 'receipt' || rec.payload.status !== 'ran') continue;
    const r = rec.payload.results.find((x) => x.requirement === REQ);
    if (!r) continue;
    if (r.result === 'pass') seen.clear();
    else if (r.result === 'fail') {
      if (rec.payload.results.some((x) => x.requirement !== REQ && siblings.includes(x.requirement) && x.result === 'fail')) continue;
      seen.add(rec.payload.product_digest);
    }
  }
  return seen.size;
}
