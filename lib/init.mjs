// lib/init.mjs
import { existsSync, mkdirSync, writeFileSync, openSync, closeSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { ReadStream, WriteStream } from 'node:tty';
import { git, readRef } from './gitx.mjs';
import { appendRecord, readLog } from './records.mjs';
import { writeWorkspaceSnapshot } from './snapshots.mjs';
import { loadSettings, SETTINGS_SCHEMA } from './settings.mjs';
import { authenticateDeveloper, verifyEvidence, ttyConfirm, cliSigner } from './auth.mjs';

export class InitError extends Error { constructor(m) { super(m); this.name = 'InitError'; } }

// Deviation from the plan text: lib/settings.mjs's validateSettings (plan 02, already committed)
// requires every typesafeai.* threshold key to be present (a closed object schema), so the plan's
// smaller `{ enabled, mode, model }` typesafeai stub fails loadSettings. Filled in with the same
// defaults the spec's own settings example (section 2) shows, with no model chosen yet.
export function DEFAULT_SETTINGS(remote, key) {
  return { schema: SETTINGS_SCHEMA, authority_remote: remote, outside: [], source: [], interfaces: [],
    data: [], network_exclude: [], signing_key: key, attribution: 'forbidden', harness: {},
    typesafeai: { enabled: false, mode: 'shadow', model: null,
      route_confidence: 0.8, sufficient_threshold: 0.7, outside_threshold: 0.8, contradicts_ceiling: 0.3,
      reversible_floor: 0.7, observed_floor: 0.6, max_false_downgrade: 0.05,
      min_calibration_agent_predictions: 60, request_cap_bytes: 48000 } };
}

async function remotes(cwd) {
  return (await git(['remote'], { cwd })).stdout.split('\n').filter(Boolean);
}

export async function init(cwd, { confirmRemote, chooseKey, confirm, confirmDigest, sign } = {}) {
  if (!existsSync(join(cwd, '.git'))) await git(['init', '-q'], { cwd });
  const settingsPath = join(cwd, '.cairn/settings.json');
  const hadSettings = existsSync(settingsPath);
  const logHead = await readRef(cwd, 'refs/cairn/log');
  if (logHead && !hadSettings) {
    const rec = (await readLog(cwd)).find((r) => r.kind === 'init');
    throw new InitError(`cairn: refs/cairn/log exists but .cairn/settings.json is missing; restore the file whose digest is ${rec.payload.settings_digest} (git checkout -- .cairn/settings.json) or run cairn authorize after writing a new one`);
  }
  const names = await remotes(cwd);
  if (!hadSettings) {
    const remote = await confirmRemote(names);
    if (remote !== null && !names.includes(remote)) throw new InitError(`cairn: authority_remote ${remote} is not a configured remote`);
    const key = await chooseKey();
    mkdirSync(join(cwd, '.cairn'), { recursive: true });
    writeFileSync(settingsPath, JSON.stringify(DEFAULT_SETTINGS(remote, key), null, 2) + '\n');
  }
  const { settings, digest } = await loadSettings(cwd); // throws SettingsError listing every refusal
  if (settings.authority_remote !== null && !names.includes(settings.authority_remote)) {
    throw new InitError(`cairn: authority_remote ${settings.authority_remote} is not a configured remote`);
  }
  if (logHead) {
    const rec = (await readLog(cwd)).find((r) => r.kind === 'init');
    if (rec.payload.settings_digest === digest) return { sha: rec.sha, created: false };
    throw new InitError(`cairn: settings digest ${digest} differs from the init record's ${rec.payload.settings_digest}; a settings change is a new authorization: run cairn authorize`);
  }
  if (hadSettings && !(await confirmDigest(digest))) throw new InitError(`cairn: existing settings not confirmed at digest ${digest}`);
  const evidence = await authenticateDeveloper(cwd, settings, { purpose: 'init', subject: digest, sign, confirm });
  if (!verifyEvidence(settings, evidence)) throw new InitError('cairn: developer evidence does not verify');
  const auth_mode = settings.signing_key === null ? 'unsigned-local' : 'signed';
  const sha = await appendRecord(cwd, 'init', 'project', { settings_digest: digest, authority_remote: settings.authority_remote, auth_mode });
  if (!(await readRef(cwd, 'refs/cairn/snapshots'))) await writeWorkspaceSnapshot(cwd);
  return { sha, created: true };
}

async function ask(prompt) {
  let fd;
  try { fd = openSync('/dev/tty', 'r+'); } catch { throw new InitError('cairn: init needs a controlling terminal for its questions'); }
  const input = new ReadStream(fd); const output = new WriteStream(fd);
  const rl = createInterface({ input, output });
  try { return (await new Promise((res) => rl.question(prompt, res))).trim(); }
  finally { rl.close(); input.destroy(); output.destroy(); closeSync(fd); }
}

export function runInit(argv, io) {
  return (async () => {
    try {
      const r = await init(io.cwd, {
        confirmRemote: async (names) => { const a = await ask(`authority remote [${names.join(', ')}] or local-only: `); return a === 'local-only' ? null : a; },
        chooseKey: async () => { const a = await ask('signing key PEM path or unsigned-local: '); return a === 'unsigned-local' ? null : readFileSync(a, 'utf8'); },
        confirmDigest: async (d) => (await ask(`adopt existing settings at ${d}? (yes/no) `)) === 'yes',
        confirm: ttyConfirm, sign: cliSigner(argv, io) });
      io.stdout(r.created ? `cairn: initialized; init record ${r.sha}` : `cairn: already initialized at ${r.sha}`);
      return 0;
    } catch (e) { io.stderr(e.message.startsWith('cairn: ') ? e.message : `cairn: ${e.message}`); return 1; }
  })();
}
