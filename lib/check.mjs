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

export function runCommand(cwd, command) {
  return new Promise((resolve) => {
    const chunks = [];
    let child;
    try {
      child = spawn('sh', ['-c', command], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) { return resolve({ spawned: false, out: Buffer.alloc(0), code: null, signal: null }); }
    child.stdout.on('data', (c) => chunks.push(c));
    child.stderr.on('data', (c) => chunks.push(c));
    child.on('error', () => resolve({ spawned: false, out: Buffer.concat(chunks), code: null, signal: null }));
    child.on('close', (code, signal) => resolve({ spawned: true, out: Buffer.concat(chunks), code, signal }));
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
import { appendRecord } from './records.mjs';

export const OUTPUT_DIR = '.cairn/output';
const LINE = /^cairn: ([A-Z][A-Z0-9]*-[0-9]{3,}): (pass|fail)$/;

export async function productDigest(cwd, tree, documents) {
  const under = (p) => documents.some((d) => p === d || p.startsWith(d + '/'));
  const entries = (await listTree(cwd, tree)).filter((e) => !under(e.path)).map((e) => [e.path, e.mode, e.sha]);
  return sha256(canonicalize(entries));
}

export const outputPath = (cwd, digest) => join(cwd, OUTPUT_DIR, digest.slice('sha256:'.length));

async function writeOutput(cwd, bytes) {
  const digest = sha256(bytes);
  await mkdir(join(cwd, OUTPUT_DIR), { recursive: true });
  await writeFile(join(cwd, OUTPUT_DIR, '.gitignore'), '*\n');
  const tmp = join(cwd, OUTPUT_DIR, `.tmp-${process.pid}-${Date.now()}`);
  await writeFile(tmp, bytes);
  await rename(tmp, outputPath(cwd, digest));
  return digest;
}

export async function outputPresent(cwd, receipt) {
  try { await access(outputPath(cwd, receipt.payload.output)); return true; } catch { return false; }
}

function resultFor(def, run, id) {
  if (!run.spawned) return 'unverified';
  if (def.results === 'per-requirement') {
    const mine = run.out.toString('utf8').split('\n').map((l) => LINE.exec(l)).filter((m) => m && m[1] === id);
    if (mine.length === 0) return 'unverified';
    return mine.some((m) => m[2] === 'fail') ? 'fail' : 'pass';
  }
  return run.code === 0 ? 'pass' : 'fail';
}

export async function check(cwd, REQ) {
  const target = await requirementDigest(cwd, REQ);
  if (!target.agreed) throw new CheckError(`${REQ} is not Agreed; only Agreed requirements are checked`);
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
    const results = [];
    for (const id of def.requirements) {
      const { textDigest, agreed } = await requirementDigest(cwd, id);
      results.push({ requirement: id, text_digest: textDigest, result: agreed ? resultFor(def, run, id) : 'unverified' });
    }
    const payload = {
      mechanism: name, definition_digest: entry.definitionDigest, input, product_digest: product,
      status: run.spawned ? 'ran' : 'error', identity, results, output,
      exit: { code: run.spawned ? run.code : null, signal: run.spawned ? run.signal : null },
    };
    return appendRecord(cwd, 'receipt', name, payload);
  });
}

import { writeTreeFromPaths, catCommit } from './gitx.mjs';

export async function identitiesNow(cwd, REQ) {
  const { name, entry } = await selectMechanism(cwd, REQ);
  const { textDigest } = await requirementDigest(cwd, REQ);
  const tree = await writeTreeFromPaths(cwd, { paths: entry.definition.inputs });
  const identity = await observeIdentity(cwd, entry.definition.identity);
  return { mechanism: name, definitionDigest: entry.definitionDigest, textDigest, tree, identity };
}

export async function isCurrent(cwd, receipt, REQ, now) {
  try { now = now ?? await identitiesNow(cwd, REQ); } catch { return false; }
  let commit;
  try { commit = await catCommit(cwd, receipt.sha); } catch { return false; }
  const trailers = Object.fromEntries(commit.trailers);
  if (trailers['Cairn-Schema'] !== '1' || trailers['Cairn-Digest'] !== sha256(commit.body)) return false;
  const p = receipt.payload;
  if (p.mechanism !== now.mechanism || p.definition_digest !== now.definitionDigest) return false;
  const r = p.results.find((x) => x.requirement === REQ);
  if (!r || r.text_digest !== now.textDigest) return false;
  if (canonicalize(p.identity) !== canonicalize(now.identity)) return false;
  let snap;
  try { snap = await readSnapshot(cwd, p.input, 'input'); } catch { return false; }
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

export function attempts(log, REQ) {
  const seen = new Set();
  for (const rec of log) {
    if (rec.kind !== 'receipt' || rec.payload.status !== 'ran') continue;
    const r = rec.payload.results.find((x) => x.requirement === REQ);
    if (!r) continue;
    if (r.result === 'pass') seen.clear();
    else if (r.result === 'fail') seen.add(rec.payload.product_digest);
  }
  return seen.size;
}
