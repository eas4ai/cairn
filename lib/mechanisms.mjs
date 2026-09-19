// lib/mechanisms.mjs
import { readFile, writeFile, mkdir, readdir, rename } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { canonicalize, parseStrict, sha256 } from './canon.mjs';
import { validatePath, classify, matchGlob } from './paths.mjs';
import { loadSettings } from './settings.mjs';
import { parseDomainFile } from './spec.mjs';

export const MECHANISMS_DIR = '.cairn/mechanisms';
export class MechanismError extends Error {}
const NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;
const REQ_ID = /^[A-Z][A-Z0-9]*-[0-9]{3,}$/;
const SECRET = /(KEY|TOKEN|SECRET|PASSW|CREDENTIAL)/i;
const DEF_KEYS = ['command', 'cwd', 'inputs', 'documents', 'requirements', 'results', 'identity'];
const ID_KEYS = ['tools', 'env', 'image'];
// classify() subdivides the single "reserved paths" set the spec defines (section 2:
// ".cairn/**, docs/spec/**, docs/decisions.jsonl, AGENTS.md") into finer, mutually exclusive
// labels ('protected' for developer-owned paths like .cairn/settings.json, 'kernel-managed' for
// .cairn/mechanisms and docs/decisions.jsonl, 'output' for .cairn/output/**) with only the
// residual matched by RESERVED and none of the others left labelled 'reserved'. A mechanism input
// must be refused across the whole reserved set, not just the residual bucket, so every one of
// these four classify() outcomes counts here.
const KERNEL_OWNED = new Set(['reserved', 'protected', 'kernel-managed', 'output']);

export const definitionDigest = (def) => sha256(canonicalize(def));
export const reviewDigest = (review) => sha256(canonicalize(review));
const uniqSorted = (xs) => [...new Set(xs)].sort();
const fail = (m) => { throw new MechanismError(m); };
const path = (p) => { try { return validatePath(p); } catch (e) { fail(`invalid path ${JSON.stringify(p)}: ${e.message}`); } };

export function normalizeDefinition(raw, settings) {
  if (raw === null || typeof raw !== 'object') fail('definition must be an object');
  for (const k of Object.keys(raw)) if (!DEF_KEYS.includes(k)) fail(`unknown definition key ${k}`);
  if (typeof raw.command !== 'string' || raw.command.trim() === '') fail('command must be a non-empty string');
  const cwd = raw.cwd == null ? null : path(raw.cwd);
  const inputs = uniqSorted((raw.inputs ?? []).map(path));
  if (inputs.length === 0) fail('inputs must name at least one path');
  const documents = uniqSorted((raw.documents ?? []).map(path));
  for (const p of inputs) {
    if (KERNEL_OWNED.has(classify(p, settings))) fail(`reserved path ${p} cannot be an input`);
    if (settings.outside.some((g) => matchGlob(g, p))) fail(`outside path ${p} cannot be an input`);
  }
  for (const d of documents) {
    if (!inputs.includes(d)) fail(`document ${d} must also be an input`);
    if (settings.source.some((g) => matchGlob(g, d))) fail(`document ${d} lies below a source root`);
  }
  const requirements = uniqSorted(raw.requirements ?? []);
  if (requirements.length === 0) fail('requirements must name at least one requirement');
  for (const r of requirements) if (!REQ_ID.test(r)) fail(`${r} is not a requirement identifier`);
  const results = raw.results ?? null;
  if (results !== null && results !== 'per-requirement') fail('results is "per-requirement" or absent');
  const id = raw.identity ?? { tools: {}, env: [], image: null };
  for (const k of Object.keys(id)) if (!ID_KEYS.includes(k)) fail(`unknown identity key ${k}`);
  const tools = {};
  for (const [n, c] of Object.entries(id.tools ?? {})) {
    if (typeof c !== 'string' || !c) fail(`tool ${n} needs a version command`);
    if (SECRET.test(n)) fail(`secret-shaped tool name ${n}`);
    tools[n] = c;
  }
  const env = uniqSorted(id.env ?? []);
  for (const n of env) { if (typeof n !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(n)) fail(`bad env name ${n}`); if (SECRET.test(n)) fail(`secret-shaped env name ${n}`); }
  const image = id.image ?? null;
  if (image !== null && typeof image !== 'string') fail('image is a string or null');
  return { command: raw.command, cwd, inputs, documents, requirements, results, identity: { tools, env, image } };
}

async function writeEntry(cwd, name, entry) {
  const dir = join(cwd, MECHANISMS_DIR);
  await mkdir(dir, { recursive: true });
  const tmp = join(dir, `.${name}.json.tmp`);
  await writeFile(tmp, canonicalize(entry));
  await rename(tmp, join(dir, `${name}.json`));
}

export async function readMechanisms(cwd) {
  let files;
  try { files = await readdir(join(cwd, MECHANISMS_DIR)); } catch (e) { if (e.code === 'ENOENT') return {}; throw e; }
  const out = {};
  for (const f of files.filter((f) => f.endsWith('.json') && !f.startsWith('.')).sort()) {
    const name = basename(f, '.json');
    let obj;
    try { obj = parseStrict(await readFile(join(cwd, MECHANISMS_DIR, f), 'utf8')); } catch (e) { fail(`${MECHANISMS_DIR}/${f} is not canonical JSON: ${e.message}`); }
    if (!NAME.test(name) || obj.schema !== 1 || !obj.definition || !obj.review || Object.keys(obj).length !== 3) fail(`${MECHANISMS_DIR}/${f} is not a mechanism entry`);
    out[name] = { definition: obj.definition, definitionDigest: definitionDigest(obj.definition), review: obj.review, reviewDigest: reviewDigest(obj.review) };
  }
  return out;
}

export async function declare(cwd, name, rawDefinition) {
  if (!NAME.test(name)) fail(`invalid mechanism name ${name}`);
  const { settings } = await loadSettings(cwd);
  const definition = normalizeDefinition(rawDefinition, settings);
  const existing = (await readMechanisms(cwd))[name];
  const digest = definitionDigest(definition);
  const review = existing && existing.definitionDigest === digest ? existing.review : {};
  await writeEntry(cwd, name, { schema: 1, definition, review });
  return { definitionDigest: digest };
}

export async function requirementDigest(cwd, REQ) {
  const dir = join(cwd, 'docs/spec');
  for (const f of (await readdir(dir)).filter((f) => f.endsWith('.md')).sort()) {
    const text = await readFile(join(dir, f), 'utf8');
    if (!/^Prefix:/m.test(text)) continue;
    const block = parseDomainFile(text).blocks.find((b) => b.id === REQ);
    // Deviation from the plan text: lib/spec.mjs's parseDomainFile gives each block a
    // status object ({kind, date}, from parseStatus), not a string, so `.startsWith('Agreed')`
    // would throw. Read the kind field the way lib/spec.mjs's own lint() does.
    if (block) return { textDigest: block.textDigest, agreed: block.status?.kind === 'Agreed' };
  }
  fail(`${REQ} is not in docs/spec`);
}

import { catCommit } from './gitx.mjs';
import { decodeRecord, readLog } from './records.mjs';

export function reviewBinds(entry, REQ, textDigest) {
  const m = entry.review[REQ];
  return !!m && m.definitionDigest === entry.definitionDigest && m.textDigest === textDigest;
}

export async function reviewMechanism(cwd, name, REQ, failReceiptSha) {
  const entry = (await readMechanisms(cwd))[name];
  if (!entry) fail(`no mechanism named ${name}`);
  if (!entry.definition.requirements.includes(REQ)) fail(`${name} does not declare ${REQ}`);
  const log = await readLog(cwd);
  if (!log.some((r) => r.sha === failReceiptSha)) fail(`${failReceiptSha} is not a record on refs/cairn/log`);
  const rec = decodeRecord(await catCommit(cwd, failReceiptSha));
  if (rec.kind !== 'receipt') fail(`${failReceiptSha} is a ${rec.kind} record, not a receipt`);
  const p = rec.payload;
  if (p.mechanism !== name) fail(`receipt names mechanism ${p.mechanism}, not ${name}`);
  if (p.status !== 'ran') fail('an error receipt never counts as the violating example');
  if (p.definition_digest !== entry.definitionDigest) fail(`receipt definition digest ${p.definition_digest} is not the current ${entry.definitionDigest}`);
  const r = p.results.find((x) => x.requirement === REQ);
  if (!r || r.result !== 'fail') fail(`receipt does not record fail for ${REQ}`);
  const { textDigest } = await requirementDigest(cwd, REQ);
  if (r.text_digest !== textDigest) fail(`receipt text digest ${r.text_digest} is not the current ${textDigest} for ${REQ}`);
  const review = { ...entry.review, [REQ]: { definitionDigest: entry.definitionDigest, textDigest, failReceipt: failReceiptSha } };
  await writeEntry(cwd, name, { schema: 1, definition: entry.definition, review });
}

import { readSnapshot } from './snapshots.mjs';
import { listTree, writeTreeFromPaths } from './gitx.mjs';
// Deviation from the plan text: lib/lease.mjs's end() (plan 04, already committed) does not call
// applyTouch directly; it already exports onEnd(fn) and calls every registered hook as
// fn(cwd, lease, outcome) before removing the lease, and touchOutcome(cwd, lease) is its own
// changed/unchanged computation used for that same hook call. Editing end() itself would
// duplicate a mechanism it already provides. Registering applyTouch as an onEnd hook here gets
// the same effect without touching lib/lease.mjs; the hook is called with a third `outcome`
// argument applyTouch's two-parameter signature simply ignores.
import { onEnd } from './lease.mjs';

export async function applyTouch(cwd, lease) {
  if (!lease || !Array.isArray(lease.touch) || lease.touch.length === 0) return { added: [], dropped: [] };
  const all = await readMechanisms(cwd);
  const names = Object.keys(all).filter((n) => all[n].definition.requirements.includes(lease.target));
  if (names.length !== 1) fail(`lease target ${lease.target} has ${names.length} mechanisms; declare exactly one before end`);
  const name = names[0];
  const base = await readSnapshot(cwd, lease.snapshot, 'workspace');
  const baseEntries = await listTree(cwd, base.tree);
  const added = [], dropped = [];
  for (const p of lease.touch) {
    const under = (e) => e.path === p || e.path.startsWith(p + '/');
    const was = baseEntries.filter(under).map((e) => [e.path, e.mode, e.sha]);
    const now = (await listTree(cwd, await writeTreeFromPaths(cwd, { paths: [p] }))).filter(under).map((e) => [e.path, e.mode, e.sha]);
    (canonicalize(was) !== canonicalize(now) ? added : dropped).push(p);
  }
  if (added.length) await declare(cwd, name, { ...all[name].definition, inputs: [...all[name].definition.inputs, ...added] });
  return { added, dropped };
}

onEnd(applyTouch);
