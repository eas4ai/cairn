// lib/init.mjs
import { existsSync, mkdirSync, writeFileSync, openSync, closeSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline';
import { ReadStream, WriteStream } from 'node:tty';
import { git, readRef } from './gitx.mjs';
import { appendRecord, readLog } from './records.mjs';
import { writeWorkspaceSnapshot } from './snapshots.mjs';
import { loadSettings, validateSettings, SETTINGS_SCHEMA } from './settings.mjs';
import { authenticateDeveloper, verifyEvidence, ttyConfirm, cliSigner, cliNonce, describeEvidence } from './auth.mjs';
import { b64url } from './canon.mjs';

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

// Fix round 1, item 9: refs/cairn/log can exist (a non-empty ref) with no record of kind 'init' in
// it, either because it is not really a Cairn log or because it was corrupted. Reading rec.payload
// without checking rec exists threw a raw TypeError instead of a cairn: refusal.
//
// Fix round 2: the fix round 1 version searched the whole log with .find(), which happened to still
// pick the earliest 'init' record when one legitimately existed first, but would wrongly accept a
// later record of kind 'init' (for example a forged one appended directly, bypassing this module) as
// THE init record when the log's real first record was something else, or none at all. The one
// legitimate init record is refs/cairn/log's first record and nothing else (sections 3 and 4); read
// log[0] directly and refuse unless it is of kind init, rather than searching. Both call sites below
// go through this helper.
function findInitRecord(log) {
  const first = log[0];
  if (!first || first.kind !== 'init') throw new InitError('cairn: refs/cairn/log exists but has no init record; the ref is not a Cairn log or was corrupted; restore or delete refs/cairn/log before running cairn init');
  return first;
}

// Fix round 1, item 3: a re-run of init that hits the idempotent early return (created: false) must
// still create the snapshot root if it is missing. Previously the root was created only on the
// created: true path, so a project that had lost refs/cairn/snapshots had no way to repair it with a
// plain re-run of init.
async function ensureSnapshotRoot(cwd) {
  if (!(await readRef(cwd, 'refs/cairn/snapshots'))) await writeWorkspaceSnapshot(cwd);
}

export async function init(cwd, { confirmRemote, chooseKey, confirm, confirmDigest, sign, nonce } = {}) {
  if (!existsSync(join(cwd, '.git'))) await git(['init', '-q'], { cwd });
  const settingsPath = join(cwd, '.cairn/settings.json');
  const hadSettings = existsSync(settingsPath);
  const logHead = await readRef(cwd, 'refs/cairn/log');
  if (logHead && !hadSettings) {
    const rec = findInitRecord(await readLog(cwd));
    throw new InitError(`cairn: refs/cairn/log exists but .cairn/settings.json is missing; restore the file whose digest is ${rec.payload.settings_digest} (git checkout -- .cairn/settings.json) or run cairn authorize after writing a new one`);
  }
  const names = await remotes(cwd);
  if (!hadSettings) {
    const remote = await confirmRemote(names);
    if (remote !== null && !names.includes(remote)) throw new InitError(`cairn: authority_remote ${remote} is not a configured remote`);
    const key = await chooseKey();
    // Fix round 1, item 4: validate the candidate settings object in memory before writing anything.
    // A developer who points chooseKey at the wrong file (for example a private key) must never have
    // that content land on disk; previously it was written first and only refused a moment later by
    // loadSettings, by which point the secret was already sitting in .cairn/settings.json.
    const candidate = DEFAULT_SETTINGS(remote, key);
    const reasons = validateSettings(candidate, { remotes: names });
    if (reasons.length) throw new InitError(`cairn: refusing to write .cairn/settings.json: ${reasons.join('; ')}`);
    mkdirSync(join(cwd, '.cairn'), { recursive: true });
    writeFileSync(settingsPath, JSON.stringify(candidate, null, 2) + '\n');
  }
  const { settings, digest } = await loadSettings(cwd); // throws SettingsError listing every refusal
  if (settings.authority_remote !== null && !names.includes(settings.authority_remote)) {
    throw new InitError(`cairn: authority_remote ${settings.authority_remote} is not a configured remote`);
  }
  if (logHead) {
    const rec = findInitRecord(await readLog(cwd));
    if (rec.payload.settings_digest === digest) {
      await ensureSnapshotRoot(cwd);
      return { sha: rec.sha, created: false };
    }
    throw new InitError(`cairn: settings digest ${digest} differs from the init record's ${rec.payload.settings_digest}; a settings change is a new authorization: run cairn authorize`);
  }
  if (hadSettings && !(await confirmDigest(digest))) throw new InitError(`cairn: existing settings not confirmed at digest ${digest}`);
  const evidence = await authenticateDeveloper(cwd, settings, { purpose: 'init', subject: digest, sign, confirm, nonce });
  if (!verifyEvidence(settings, evidence, { purpose: 'init', subject: digest })) throw new InitError('cairn: developer evidence does not verify');
  const auth_mode = settings.signing_key === null ? 'unsigned-local' : 'signed';
  const sha = await appendRecord(cwd, 'init', 'project', { settings_digest: digest, authority_remote: settings.authority_remote, auth_mode });
  await ensureSnapshotRoot(cwd);
  return { sha, created: true, evidence };
}

async function ask(prompt) {
  let fd;
  try { fd = openSync('/dev/tty', 'r+'); } catch { throw new InitError('cairn: init needs a controlling terminal for its questions'); }
  const input = new ReadStream(fd); const output = new WriteStream(fd);
  const rl = createInterface({ input, output });
  try { return (await new Promise((res) => rl.question(prompt, res))).trim(); }
  finally { rl.close(); input.destroy(); output.destroy(); closeSync(fd); }
}

// Fix round 1, item 5: confirmRemote/chooseKey/confirmDigest/confirm all take an io override
// (falling back to the terminal-backed default), so tests can drive cairn init's success and
// refusal paths through main() without a controlling terminal.
export function runInit(argv, io) {
  return (async () => {
    try {
      // Fix round 1, item 1: thread a fixed nonce (see cliNonce's note in lib/auth.mjs) so a signed
      // two-invocation flow authenticates the same payload both times.
      const nonce = cliNonce(argv) ?? b64url(randomBytes(16));
      const r = await init(io.cwd, {
        confirmRemote: io.confirmRemote ?? (async (names) => { const a = await ask(`authority remote [${names.join(', ')}] or local-only: `); return a === 'local-only' ? null : a; }),
        chooseKey: io.chooseKey ?? (async () => { const a = await ask('signing key PEM path or unsigned-local: '); return a === 'unsigned-local' ? null : readFileSync(a, 'utf8'); }),
        confirmDigest: io.confirmDigest ?? (async (d) => (await ask(`adopt existing settings at ${d}? (yes/no) `)) === 'yes'),
        confirm: io.confirm ?? ttyConfirm, sign: cliSigner(argv, io), nonce });
      // Fix round 1, item 7: describe the evidence on the created line (spec section 8: "Cairn says
      // so wherever it reports the decision"). The idempotent already-initialized line reports no
      // fresh decision, since init() performs no authentication on that path, so it names none.
      const suffix = r.evidence ? ` (${describeEvidence(r.evidence)})` : '';
      io.stdout(r.created ? `cairn: initialized; init record ${r.sha}${suffix}` : `cairn: already initialized at ${r.sha}`);
      return 0;
    } catch (e) { io.stderr(e.message.startsWith('cairn: ') ? e.message : `cairn: ${e.message}`); return 1; }
  })();
}
