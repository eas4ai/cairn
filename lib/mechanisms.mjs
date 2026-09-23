// lib/mechanisms.mjs
import { readFile, writeFile, mkdir, readdir, rename } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { canonicalize, parseStrict, sha256 } from './canon.mjs';
import { validatePath, classify, matchGlob } from './paths.mjs';
import { loadSettings } from './settings.mjs';
import { parseDomainFile } from './spec.mjs';
import { recordManagedWrite } from './scope.mjs';
import { guardKernelWrite } from './cycle.mjs';

export const MECHANISMS_DIR = '.sudus/mechanisms';
export class MechanismError extends Error {}
const NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;
const REQ_ID = /^[A-Z][A-Z0-9]*-[0-9]{3,}$/;
const SECRET = /(KEY|TOKEN|SECRET|PASSW|CREDENTIAL)/i;
const DEF_KEYS = ['command', 'cwd', 'inputs', 'documents', 'requirements', 'results', 'identity'];
const ID_KEYS = ['tools', 'env', 'image'];
// classify() subdivides the single "reserved paths" set the spec defines (section 2:
// ".sudus/**, docs/spec/**, docs/decisions.jsonl, AGENTS.md") into finer, mutually exclusive
// labels ('protected' for developer-owned paths like .sudus/settings.json, 'kernel-managed' for
// .sudus/mechanisms and docs/decisions.jsonl, 'output' for .sudus/output/**) with only the
// residual matched by RESERVED and none of the others left labelled 'reserved'. A mechanism input
// must be refused across the whole reserved set, not just the residual bucket, so every one of
// these four classify() outcomes counts here.
const KERNEL_OWNED = new Set(['reserved', 'protected', 'kernel-managed', 'output']);

export const definitionDigest = (def) => sha256(canonicalize(def));
export const reviewDigest = (review) => sha256(canonicalize(review));
const uniqSorted = (xs) => [...new Set(xs)].sort();
const fail = (m) => { throw new MechanismError(m); };
const path = (p) => { try { return validatePath(p); } catch (e) { fail(`invalid path ${JSON.stringify(p)}: ${e.message}`); } };
// Fix round 1 finding 3 (Important), and the carried obligation from plan 02's review the original
// Task 1 implementation missed: an inputs or documents entry names a literal path or a directory,
// never a glob. Without this, 'src/*.mjs' was silently accepted as a literal (nonexistent) path
// name, so the input snapshot it named covered nothing -- the declared "input" never actually
// matched the source files the developer meant.
const GLOB_CHARS = /[*?[]/;
const noGlob = (p) => { if (GLOB_CHARS.test(p)) fail(`glob metacharacter in path ${JSON.stringify(p)}: inputs and documents are literal paths, not globs`); return p; };

export function normalizeDefinition(raw, settings) {
  if (raw === null || typeof raw !== 'object') fail('definition must be an object');
  for (const k of Object.keys(raw)) if (!DEF_KEYS.includes(k)) fail(`unknown definition key ${k}`);
  if (typeof raw.command !== 'string' || raw.command.trim() === '') fail('command must be a non-empty string');
  const cwd = raw.cwd == null ? null : path(raw.cwd);
  const inputs = uniqSorted((raw.inputs ?? []).map(path).map(noGlob));
  if (inputs.length === 0) fail('inputs must name at least one path');
  const documents = uniqSorted((raw.documents ?? []).map(path).map(noGlob));
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

// Fix round 1 item 2: records the exact bytes this write produced in the managed-write ledger,
// the one hook shared by declare() and reviewMechanism() (both call writeEntry as their only file
// write) and, transitively, by applyTouch (which writes only by calling declare()).
//
// Plan 08 task 24: guardKernelWrite runs before the write lands, so a mutation whose own
// bookkeeping would create a Sudus violation of equal or higher precedence than declare's is
// refused (the liveness invariant) instead of written. Both writeEntry callers (declare and
// reviewMechanism) are checked as action 'declare', per the plan's own single insertion text for
// this module -- both are the one kernel-managed write this module makes.
async function writeEntry(cwd, name, entry) {
  const dir = join(cwd, MECHANISMS_DIR);
  await mkdir(dir, { recursive: true });
  const tmp = join(dir, `.${name}.json.tmp`);
  const bytes = canonicalize(entry);
  await guardKernelWrite(cwd, `${MECHANISMS_DIR}/${name}.json`, bytes, { action: 'declare' });
  await writeFile(tmp, bytes);
  await rename(tmp, join(dir, `${name}.json`));
  await recordManagedWrite(cwd, `${MECHANISMS_DIR}/${name}.json`, bytes);
}

// Fix round 1 finding 9 (Minor): readMechanisms used to trust the JSON structurally (right top
// keys, `definition` and `review` present) without ever checking the definition's own closed
// shape, so a hand-edited or corrupted `.sudus/mechanisms/*.json` (a kernel-managed path: only
// `declare`/`reviewMechanism` may write it) with e.g. `"definition": {}` would flow straight into
// callers like check()/identitiesNow that assume a valid shape, and fail somewhere downstream with
// an unrelated error instead of the actual problem: this file breaches its own schema. This is a
// structural check only (closed key sets, basic types); it does not repeat normalizeDefinition's
// settings-dependent semantic checks (reserved/outside/source), which need a settings object this
// read-only function does not have.
function validDefinitionShape(def) {
  if (def === null || typeof def !== 'object' || Array.isArray(def)) return false;
  if (Object.keys(def).length !== DEF_KEYS.length || DEF_KEYS.some((k) => !Object.hasOwn(def, k))) return false;
  if (typeof def.command !== 'string' || def.command.trim() === '') return false;
  if (def.cwd !== null && typeof def.cwd !== 'string') return false;
  if (!Array.isArray(def.inputs) || def.inputs.length === 0 || !def.inputs.every((p) => typeof p === 'string')) return false;
  if (!Array.isArray(def.documents) || !def.documents.every((p) => typeof p === 'string')) return false;
  if (!Array.isArray(def.requirements) || def.requirements.length === 0 || !def.requirements.every((r) => typeof r === 'string' && REQ_ID.test(r))) return false;
  if (def.results !== null && def.results !== 'per-requirement') return false;
  const id = def.identity;
  if (id === null || typeof id !== 'object' || Array.isArray(id)) return false;
  if (Object.keys(id).length !== ID_KEYS.length || ID_KEYS.some((k) => !Object.hasOwn(id, k))) return false;
  if (id.tools === null || typeof id.tools !== 'object' || Array.isArray(id.tools) || !Object.values(id.tools).every((c) => typeof c === 'string')) return false;
  if (!Array.isArray(id.env) || !id.env.every((n) => typeof n === 'string')) return false;
  if (id.image !== null && typeof id.image !== 'string') return false;
  return true;
}

export async function readMechanisms(cwd) {
  let files;
  try { files = await readdir(join(cwd, MECHANISMS_DIR)); } catch (e) { if (e.code === 'ENOENT') return {}; throw e; }
  const out = {};
  for (const f of files.filter((f) => f.endsWith('.json') && !f.startsWith('.')).sort()) {
    const name = basename(f, '.json');
    let obj;
    try { obj = parseStrict(await readFile(join(cwd, MECHANISMS_DIR, f), 'utf8')); } catch (e) { fail(`${MECHANISMS_DIR}/${f} is not canonical JSON: ${e.message}`); }
    // Fix round 2 finding 2 (Minor): this message used to start with the literal word "sudus:"
    // itself; lib/cli.mjs's main() always prepends its own "sudus: " to whatever a command throws,
    // so a caller that let this MechanismError reach main() unwrapped printed a doubled "sudus:
    // sudus: ..." line. Every other refusal in this module (and the parallel fix in lib/cli.mjs's
    // decisionsCommand from plan 04's own Fix round 1 finding 10) is plain for the same reason.
    if (!NAME.test(name) || obj.schema !== 1 || !obj.definition || !obj.review || Object.keys(obj).length !== 3 || !validDefinitionShape(obj.definition)) {
      fail(`${MECHANISMS_DIR}/${f} is not a valid mechanism entry (kernel-managed path breach)`);
    }
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
  if (!log.some((r) => r.sha === failReceiptSha)) fail(`${failReceiptSha} is not a record on refs/sudus/log`);
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

// Fix round 1 findings 2, 4 and 7 (all on this function; 12 corrects a wrong claim my Task 7
// report made about it):
//
// Finding 2 (Critical): a module-level `onEnd(applyTouch)` call registered this function as a
// hook on lib/lease.mjs's own end() -- but bin/sudus.mjs's actual command wiring (lib/cli.mjs)
// never imports lib/mechanisms.mjs at all, only lib/lease.mjs's runEnd, so that side effect never
// ran in the shipped binary and `sudus end` never wrote a touched path into any definition. The
// registration is gone; lib/cli.mjs's endCommand (the smallest edit that could wire this in
// without touching lib/lease.mjs, which is plan 04's fix round's file right now) now calls
// applyTouch explicitly after the lease is gone.
//
// Finding 7 (Important): applyTouch used to recompute "changed" itself, comparing tree entries
// under each touched path between the lease's start snapshot and a fresh writeTreeFromPaths --
// a second, different rule for the same question lib/lease.mjs's touchOutcome (a single blob's
// git-hash-object, before vs. now) already answers. applyTouch now takes that outcome as a
// parameter and only classifies each of lease.touch by it; it computes nothing of its own.
//
// Finding 12 (Minor): my Task 7 report justified the old design by claiming it, unlike
// touchOutcome, supported a directory-shaped touch entry. That was wrong on inspection:
// writeTreeFromPaths lstat-s each path itself and throws on a directory (the exact defect finding
// 1 named for mechanism inputs), so the old applyTouch would have thrown a GitError for a
// directory touch path, not resolved it. Neither function ever supported one; the claim in the
// report is corrected in the "Fix round 1" section rather than edited in place, since the
// original text is the record of what was actually built and reviewed.
//
// Finding 4 (Important): when lease.target names no mechanism, or more than one, applyTouch used
// to throw, which -- now that end() removes the lease ref before running hooks -- would lose the
// change silently: the lease is already gone, so a caller catching the throw has nothing left to
// retry against. It now reports every such path as `unclaimed: [{path, reason}]` instead, and
// still writes the definition for whatever it *can* claim; the caller (lib/cli.mjs's endCommand)
// prints one `sudus: touch <path> not written: <reason>` line per unclaimed path and lets the
// command finish. `declare REQ`'s own predicate (plan 08) names the still-undeclared path later.
export async function applyTouch(cwd, lease, outcome) {
  if (!lease || !Array.isArray(lease.touch) || lease.touch.length === 0) return { added: [], dropped: [], unclaimed: [] };
  const dropped = [...outcome.unchanged];
  const changed = [...outcome.changed];
  if (changed.length === 0) return { added: [], dropped, unclaimed: [] };
  const all = await readMechanisms(cwd);
  const names = Object.keys(all).filter((n) => all[n].definition.requirements.includes(lease.target)).sort();
  if (names.length !== 1) {
    const reason = names.length === 0 ? `no mechanism declares ${lease.target}` : `${names.length} mechanisms declare ${lease.target}: ${names.join(', ')}`;
    return { added: [], dropped, unclaimed: changed.map((path) => ({ path, reason })) };
  }
  const name = names[0];
  await declare(cwd, name, { ...all[name].definition, inputs: [...all[name].definition.inputs, ...changed] });
  return { added: changed, dropped, unclaimed: [] };
}
