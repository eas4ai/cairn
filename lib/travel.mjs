// lib/travel.mjs
import { git } from './gitx.mjs';

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
