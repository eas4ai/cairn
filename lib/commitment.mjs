// lib/commitment.mjs
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { appendRecord, readLog } from './records.mjs';
import { writeWorkspaceSnapshot, readSnapshot } from './snapshots.mjs';
import { listTree } from './gitx.mjs';
import { parseDomainFile } from './spec.mjs';
import { classify } from './paths.mjs';
import { loadSettings } from './settings.mjs';

export class CommitmentError extends Error { constructor(m) { super(m); this.name = 'CommitmentError'; } }
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const KINDS = ['backlog', 'next-feature', 'defect'];
const refuse = (m) => { throw new CommitmentError(m); };

// Task 3 stub: `start` is implemented in Task 3. Present here (Task 2 checkpoint) only so the ES
// module's static `import { start }` in tests/commitment.test.mjs resolves; the two `fix` tests
// that call it fail at runtime until Task 3 replaces this, matching the plan's own stated Task 2
// checkpoint ("until then the two fix tests from Task 2 fail"). A CommonJS-style partial import
// (undefined export, not a load error) was what the plan's prose assumed; ES modules refuse a
// missing named export at parse time instead, so a stub is needed for the file to load at all.
export async function start() { throw new CommitmentError('start is not implemented until Task 3'); }

export function openCommitment(log) {
  let open = null, pending = null;
  for (const r of log) {
    if (r.kind === 'start') { open = r; pending = null; }
    else if (r.kind === 'done' && open) open = null;
    else if (r.kind === 'superseded' && open) { pending = r; open = null; }
  }
  return { open, pending };
}

// Deviation from the plan text: parseDomainFile's block.status (lib/spec.mjs, already committed)
// is an object { kind, date } produced by parseStatus, not a plain "Agreed 2026-09-19" string --
// the plan's own specBlocks/item/frozenSet code assumed a string and called .startsWith('Agreed').
// Every status check below reads b.status.kind instead; the plan's literal error text is kept
// unchanged since b.status.kind already holds the bare word ('Agreed', 'Draft', ...).
export async function specBlocks(cwd) {
  const dir = join(cwd, 'docs/spec');
  const blocks = new Map();
  for (const f of (await readdir(dir)).filter((f) => f.endsWith('.md')).sort()) {
    const text = await readFile(join(dir, f), 'utf8');
    if (!/^Prefix:/m.test(text)) continue;
    const parsed = parseDomainFile(text);
    for (const b of parsed.blocks) blocks.set(b.id, { ...b, scopeEvery: parsed.header.scopeEvery === true });
  }
  return blocks;
}

export async function treeDelta(cwd, treeA, treeB) {
  const a = new Map((await listTree(cwd, treeA)).map((e) => [e.path, e.sha]));
  const b = new Map((await listTree(cwd, treeB)).map((e) => [e.path, e.sha]));
  const out = [];
  for (const p of [...new Set([...a.keys(), ...b.keys()])].sort()) {
    if (a.get(p) !== b.get(p)) out.push({ path: p, before: a.get(p) ?? null, after: b.get(p) ?? null });
  }
  return out;
}

async function findItem(log, sha) {
  const it = log.find((r) => r.sha === sha && r.kind === 'item');
  if (!it) refuse(`${sha} is not an item record`);
  return it;
}

export async function item(cwd, { kind, slug, source, body }) {
  if (!KINDS.includes(kind)) refuse(`item kind is one of ${KINDS.join(', ')}`);
  if (typeof slug !== 'string' || !SLUG.test(slug)) refuse(`invalid item slug ${slug}`);
  if (typeof body !== 'string' || body.trim() === '') refuse('an item needs a body');
  if (typeof source !== 'string' || source.trim() === '') refuse('an item names its source requirement or the contract it changes');
  if (kind !== 'next-feature') {
    const b = (await specBlocks(cwd)).get(source);
    if (!b || b.status?.kind !== 'Agreed') refuse(`${source} is not an Agreed requirement`);
  }
  const log = await readLog(cwd);
  if (log.some((r) => r.kind === 'item' && r.payload.slug === slug)) refuse(`item slug ${slug} is taken`);
  return appendRecord(cwd, 'item', slug, { kind, slug, source, body });
}

export async function outside(cwd, itemSha, reason, { evaluation = null } = {}) {
  const it = await findItem(await readLog(cwd), itemSha);
  if (typeof reason !== 'string' || reason.trim() === '') refuse('outside needs a reason');
  return appendRecord(cwd, 'outside', it.payload.slug, { item: itemSha, reason, evaluation });
}

export async function protectedDelta(cwd, snapA, snapB) {
  const { settings } = await loadSettings(cwd);
  const a = await readSnapshot(cwd, snapA, 'workspace');
  const b = await readSnapshot(cwd, snapB, 'workspace');
  return (await treeDelta(cwd, a.tree, b.tree)).map((d) => d.path).filter((p) => classify(p, settings) === 'protected');
}

export async function fix(cwd, itemSha) {
  const log = await readLog(cwd);
  const it = await findItem(log, itemSha);
  if (it.payload.kind !== 'defect') refuse('only a defect item is fixed');
  const { open } = openCommitment(log);
  if (!open) refuse('a fix is recorded under an open commitment');
  const snapshot = await writeWorkspaceSnapshot(cwd);
  const changed = await protectedDelta(cwd, open.payload.snapshot, snapshot);
  if (changed.length) refuse(`fix changes protected contract ${changed[0]}`);
  return appendRecord(cwd, 'fix', it.payload.slug, { item: itemSha, snapshot });
}
