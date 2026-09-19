// lib/cycle.mjs
import { readFile, writeFile, rename } from 'node:fs/promises';
import { gitPath } from './gitx.mjs';
import { canonicalize, parseStrict } from './canon.mjs';

export const BOUNDS = Object.freeze({ sameTarget: 4, total: 28, acceptanceRounds: 3 });
export const ADMIN = new Set(['repair', 'recover', 'reconcile', 'scope', 'record', 'commit', 'declare', 'review mechanism', 'capture']);
const EMPTY = () => ({ counts: {}, total: 0, last: null, progress: null });

const counterFile = (cwd) => gitPath(cwd, 'cairn-cycle.json');

export async function readCounter(cwd) {
  try { return parseStrict(await readFile(await counterFile(cwd), 'utf8')); } catch { return EMPTY(); }
}

export async function writeCounter(cwd, counter) {
  const file = await counterFile(cwd);
  await writeFile(file + '.tmp', canonicalize(counter));
  await rename(file + '.tmp', file);
}

export async function bump(cwd, actionClass, target) {
  const c = await readCounter(cwd);
  const key = `${actionClass}\t${target}`;
  c.counts[key] = (c.counts[key] || 0) + 1;
  c.total += 1;
  await writeCounter(cwd, c);
  const bound = c.counts[key] >= BOUNDS.sameTarget ? 'sameTarget' : c.total >= BOUNDS.total ? 'total' : null;
  return { sameTarget: c.counts[key], total: c.total, bound };
}

export async function resetOnProgress(cwd) {
  const c = await readCounter(cwd);
  await writeCounter(cwd, { ...c, counts: {}, total: 0 });
}
