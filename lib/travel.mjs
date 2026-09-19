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
