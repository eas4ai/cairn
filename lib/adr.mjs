// lib/adr.mjs
import { readFile, appendFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { canonicalize, parseStrict, sha256, ulid } from './canon.mjs';
import { readLog } from './records.mjs';
import { readSnapshot, writeWorkspaceSnapshot } from './snapshots.mjs';
import { classify } from './paths.mjs';
import { loadSettings } from './settings.mjs';

export const ADR_PATH = 'docs/decisions.jsonl';
export class AdrError extends Error { constructor(m) { super(m); this.name = 'AdrError'; } }
export const CAUSES = ['the stated condition occurred', 'an unforeseen condition occurred', 'it was wrong when it was made', 'the premise was false'];
export const ASSIGNED = {
  decision: ['decide', 'escalate', 'supersede', 'promote'], realized: ['realize'], superseded: ['decide'],
  answered: ['answer'], read: ['decisions --read'],
};
const KEYS = {
  decision: ['kind', 'id', 'ts', 'level', 'by', 'title', 'rests_on', 'wrong_if', 'body', 'base_snap', 'evaluation', 'interfaces'],
  realized: ['kind', 'id', 'ts', 'of', 'base_snap', 'snap', 'subject', 'interfaces'],
  superseded: ['kind', 'id', 'ts', 'of', 'by', 'cause'],
  answered: ['kind', 'id', 'ts', 'escalation', 'answer'],
  read: ['kind', 'id', 'ts', 'of', 'record'],
};
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const SHA = /^[0-9a-f]{40}$/;
const breach = (n, m) => { throw new AdrError(`breach: line ${n} ${m}`); };
const isStr = (v) => typeof v === 'string';
const strList = (v) => Array.isArray(v) && v.every(isStr);

async function validateLine(cwd, obj, n, ids, logShas) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) breach(n, 'is not an object');
  const keys = KEYS[obj.kind];
  if (!keys) breach(n, `has unknown kind ${JSON.stringify(obj.kind)}`);
  for (const k of Object.keys(obj)) if (!keys.includes(k)) breach(n, `has unknown key ${k}`);
  for (const k of keys) if (!Object.hasOwn(obj, k)) breach(n, `lacks ${k}`);
  if (!isStr(obj.id) || !ULID.test(obj.id)) breach(n, 'has a malformed id');
  if (ids.has(obj.id)) breach(n, `is a duplicate id ${obj.id}`);
  if (!isStr(obj.ts) || Number.isNaN(Date.parse(obj.ts))) breach(n, 'has a malformed ts');
  const ref = (id, field, kind) => {
    const t = ids.get(id);
    if (!t) breach(n, `${field} names missing ${id}`);
    if (kind && t.kind !== kind) breach(n, `${field} names a ${t.kind}, not a ${kind}`);
    return t;
  };
  const sha = (s, field) => { if (!isStr(s) || !SHA.test(s) || !logShas.has(s)) breach(n, `${field} names a missing record`); };
  const ws = async (s, field) => {
    if (!isStr(s) || !SHA.test(s)) breach(n, `${field} is not a workspace snapshot`);
    try { await readSnapshot(cwd, s, 'workspace'); } catch { breach(n, `${field} is not a workspace snapshot`); }
  };
  switch (obj.kind) {
    case 'decision':
      if (obj.level !== 'Consequential') breach(n, 'has a level other than Consequential');
      if (!['agent', 'developer', 'joint'].includes(obj.by)) breach(n, 'has an unknown by');
      if (!isStr(obj.title) || !isStr(obj.wrong_if) || !isStr(obj.body) || !strList(obj.rests_on) || !strList(obj.interfaces)) breach(n, 'has a wrongly typed field');
      await ws(obj.base_snap, 'base_snap');
      if (obj.evaluation !== null) sha(obj.evaluation, 'evaluation');
      break;
    case 'realized': {
      const d = ref(obj.of, 'of', 'decision');
      if (obj.base_snap !== d.base_snap) breach(n, 'base_snap differs from the decision base');
      if (!isStr(obj.subject) || !strList(obj.interfaces)) breach(n, 'has a wrongly typed field');
      await ws(obj.snap, 'snap');
      break;
    }
    case 'superseded':
      ref(obj.of, 'of', 'decision'); ref(obj.by, 'by', 'decision');
      if (!CAUSES.includes(obj.cause)) breach(n, 'names an unknown cause');
      break;
    case 'answered': sha(obj.escalation, 'escalation'); sha(obj.answer, 'answer'); break;
    case 'read': ref(obj.of, 'of', 'decision'); sha(obj.record, 'record'); break;
  }
}

async function readRaw(cwd) {
  try { return await readFile(join(cwd, ADR_PATH), 'utf8'); } catch (e) { if (e.code === 'ENOENT') return ''; throw e; }
}

export async function readAdr(cwd) {
  const text = await readRaw(cwd);
  if (text !== '' && !text.endsWith('\n')) throw new AdrError('breach: the last line is not newline-terminated');
  const lines = text === '' ? [] : text.slice(0, -1).split('\n');
  const logShas = new Set((await readLog(cwd)).map((r) => r.sha));
  const ids = new Map();
  const out = [];
  for (const [i, raw] of lines.entries()) {
    let obj;
    try { obj = parseStrict(raw); } catch { breach(i + 1, 'is not canonical JSON'); }
    if (canonicalize(obj) !== raw) breach(i + 1, 'is not canonical JSON');
    await validateLine(cwd, obj, i + 1, ids, logShas);
    ids.set(obj.id, obj);
    out.push(obj);
  }
  return out;
}

export async function appendDecision(cwd, line, { command }) {
  const writers = ASSIGNED[line.kind];
  if (!writers) throw new AdrError(`unknown ADR kind ${JSON.stringify(line.kind)}`);
  if (!writers.includes(command)) {
    const list = writers.length > 1 ? writers.slice(0, -1).join(', ') + ' or ' + writers.at(-1) : writers[0];
    throw new AdrError(`${line.kind} lines are written only by ${list}, not ${command}`);
  }
  const existing = await readAdr(cwd);
  const obj = { ...line, id: line.id ?? ulid(), ts: line.ts ?? new Date().toISOString() };
  const ids = new Map(existing.map((l) => [l.id, l]));
  const logShas = new Set((await readLog(cwd)).map((r) => r.sha));
  await validateLine(cwd, obj, existing.length + 1, ids, logShas);
  await mkdir(dirname(join(cwd, ADR_PATH)), { recursive: true });
  await appendFile(join(cwd, ADR_PATH), canonicalize(obj) + '\n');
  return obj.id;
}

export async function queue(cwd) {
  const lines = await readAdr(cwd);
  const read = new Set(lines.filter((l) => l.kind === 'read').map((l) => l.of));
  return lines.filter((l) => l.kind === 'decision' && !read.has(l.id)).map((l) => l.id);
}

export async function adrDigest(cwd) { return sha256(await readRaw(cwd)); }

export async function decide(cwd, { title, rests_on, wrong_if, body, by = 'agent', evaluation = null, named_paths = [] }, command = 'decide') {
  const { settings } = await loadSettings(cwd);
  const interfaces = named_paths.filter((p) => classify(p, settings) === 'interface').sort();
  const base_snap = await writeWorkspaceSnapshot(cwd);
  return appendDecision(cwd, { kind: 'decision', level: 'Consequential', by, title, rests_on, wrong_if, body, base_snap, evaluation, interfaces }, { command });
}

export async function supersedeDecision(cwd, of, by, cause) {
  return appendDecision(cwd, { kind: 'superseded', of, by, cause }, { command: 'decide' });
}
