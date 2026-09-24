// lib/init.mjs
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { git, readRef } from './gitx.mjs';
import { layoutOf } from './layout.mjs';
import { appendRecord, readLog } from './records.mjs';
import { writeWorkspaceSnapshot } from './snapshots.mjs';
import { loadSettings, validateSettings, SETTINGS_SCHEMA } from './settings.mjs';
import { authenticateDeveloper, verifyEvidence, cliSigner, cliNonce, describeEvidence } from './auth.mjs';
import { b64url } from './canon.mjs';

export class InitError extends Error { constructor(m) { super(m); this.name = 'InitError'; } }

// Deviation from the plan text: lib/settings.mjs's validateSettings (plan 02, already committed)
// requires every typesafeai.* field to be present (a closed object schema), so the plan's
// smaller `{ enabled, mode, model }` typesafeai stub fails loadSettings. Filled in with the same
// defaults the spec's own settings example (section 2) shows, with no model chosen yet.
//
// Plan 15: mode and the seven route thresholds are gone (decision 55); weights/agent_ceiling/
// confidence_floors replace them. 0.35 matches .superpowers/bench/composite-design.md's and
// results.md's Round 3 best cell (agent_ceiling: 0.35, confidence floor 0, 89.5% overall / 90.0%
// agent-expected / 88.9% developer-expected accuracy on the 19 usable scenarios); the default
// confidence_floors of 0 for every dimension matches that same best cell, so a fresh project's
// out-of-the-box behavior is the measured-best configuration, not an arbitrary placeholder.
export function DEFAULT_SETTINGS(remote, key) {
  const dims = { evidence: 0.2, reach: 0.2, contract: 0.2, surface: 0.2, ambiguity: 0.2 };
  const zeroFloors = { evidence: 0, reach: 0, contract: 0, surface: 0, ambiguity: 0 };
  return { schema: SETTINGS_SCHEMA, authority_remote: remote, outside: [], source: [], interfaces: [],
    data: [], network_exclude: [], signing_key: key, attribution: 'forbidden', developer: 'present', harness: {},
    typesafeai: { enabled: false, model: null, weights: dims, agent_ceiling: 0.35, confidence_floors: zeroFloors,
      min_calibration_agent_predictions: 60, request_cap_bytes: 48000 } };
}

async function remotes(cwd) {
  return (await git(['remote'], { cwd })).stdout.split('\n').filter(Boolean);
}

// Fix round 1, item 9: refs/sudus/log can exist (a non-empty ref) with no record of kind 'init' in
// it, either because it is not really a Sudus log or because it was corrupted. Reading rec.payload
// without checking rec exists threw a raw TypeError instead of a sudus: refusal.
//
// Fix round 2: the fix round 1 version searched the whole log with .find(), which happened to still
// pick the earliest 'init' record when one legitimately existed first, but would wrongly accept a
// later record of kind 'init' (for example a forged one appended directly, bypassing this module) as
// THE init record when the log's real first record was something else, or none at all. The one
// legitimate init record is refs/sudus/log's first record and nothing else (sections 3 and 4); read
// log[0] directly and refuse unless it is of kind init, rather than searching. Both call sites below
// go through this helper.
function findInitRecord(log, L) {
  const first = log[0];
  if (!first || first.kind !== 'init') throw new InitError(`sudus: ${L.log} exists but has no init record; the ref is not a Sudus log or was corrupted; restore or delete ${L.log} before running sudus init`);
  return first;
}

// Fix round 1, item 3: a re-run of init that hits the idempotent early return (created: false) must
// still create the snapshot root if it is missing. Previously the root was created only on the
// created: true path, so a project that had lost refs/sudus/snapshots had no way to repair it with a
// plain re-run of init.
async function ensureSnapshotRoot(cwd) {
  if (!(await readRef(cwd, layoutOf(cwd).snapshots))) await writeWorkspaceSnapshot(cwd);
}

// Spec revision 6, "Project initialization": init takes the developer's answers as flags and asks
// nothing itself -- the agent asks the questions in conversation first (docs/spec/sudus-v2.md). The
// old ask()-based terminal callbacks (one prompt for the remote, one for the signing key, one to
// adopt an existing settings file) are gone; every choice arrives as an option on this function,
// read off argv by runInit below.
//
// Creating settings (no .sudus/settings.json yet) needs exactly one of remote/localOnly. Developer
// evidence is attested unless signingKeyPem is given (revision 11): init no longer needs an answer
// for it, `attested` names the default, and the two together refuse. A project that wants signed
// decisions later sets signing_key in its settings and authorizes that change. Existing settings with no refs yet are adopted only with an
// `adopt` digest equal to the settings currently on disk -- an explicit, deliberate acknowledgement
// that the file already there is the one to bind, replacing the old adopt-digest question. Once
// `adopt` matches, remote/localOnly/signingKeyPem/attested (which only mean something when
// settings are being created) are not consulted again; supplying them alongside a correct `adopt`
// is harmless, not refused, since a real two-invocation signed flow re-sends the same flags on its
// second call after the first call's own write already put settings.json on disk (see runInit's
// own comment and tests/cli.test.mjs's two-step signed flow test). Existing settings with a wrong
// or missing `adopt`, alongside one of the four creation-only flags, gets the more specific "these
// flags don't apply" refusal instead of the generic "needs --adopt" one.
export async function init(cwd, { remote, localOnly = false, signingKeyPem = null, attested = false, adopt = null, quote, sign, nonce, env } = {}) {
  if (!existsSync(join(cwd, '.git'))) await git(['init', '-q'], { cwd });
  const L = layoutOf(cwd);
  const settingsPath = join(cwd, L.settings);
  const hadSettings = existsSync(settingsPath);
  const logHead = await readRef(cwd, L.log);
  if (logHead && !hadSettings) {
    const rec = findInitRecord(await readLog(cwd), L);
    throw new InitError(`sudus: ${L.log} exists but ${L.settings} is missing; restore the file whose digest is ${rec.payload.settings_digest} (git checkout -- ${L.settings}) or write a new one and ask the developer and record the answer with sudus authorize --quote <words>`);
  }
  const names = await remotes(cwd);
  if (!hadSettings) {
    const remoteGiven = remote !== undefined;
    if (remoteGiven === localOnly) throw new InitError('sudus: init needs --remote <name> or --local-only');
    const authorityRemote = remoteGiven ? remote : null;
    if (authorityRemote !== null && !names.includes(authorityRemote)) throw new InitError(`sudus: authority_remote ${authorityRemote} is not a configured remote`);
    const signingKeyGiven = signingKeyPem !== null;
    if (signingKeyGiven && attested) throw new InitError('sudus: init takes --signing-key <path> or --attested, not both');
    // Fix round 1, item 4: validate the candidate settings object in memory before writing anything.
    // A developer whose signing key path points at the wrong file (for example a private key) must
    // never have that content land on disk; previously it was written first and only refused a
    // moment later by loadSettings, by which point the secret was already sitting in
    // .sudus/settings.json.
    const candidate = DEFAULT_SETTINGS(authorityRemote, signingKeyGiven ? signingKeyPem : null);
    const reasons = validateSettings(candidate, { remotes: names });
    if (reasons.length) throw new InitError(`sudus: refusing to write ${L.settings}: ${reasons.join('; ')}`);
    mkdirSync(join(cwd, L.dir), { recursive: true });
    writeFileSync(settingsPath, JSON.stringify(candidate, null, 2) + '\n');
  }
  const { settings, digest } = await loadSettings(cwd); // throws SettingsError listing every refusal
  if (settings.authority_remote !== null && !names.includes(settings.authority_remote)) {
    throw new InitError(`sudus: authority_remote ${settings.authority_remote} is not a configured remote`);
  }
  if (logHead) {
    const rec = findInitRecord(await readLog(cwd), L);
    if (rec.payload.settings_digest === digest) {
      await ensureSnapshotRoot(cwd);
      return { sha: rec.sha, created: false };
    }
    throw new InitError(`sudus: settings digest ${digest} differs from the init record's ${rec.payload.settings_digest}; a settings change is a new authorization: ask the developer and record the answer with sudus authorize --quote <words>`);
  }
  if (hadSettings && adopt !== digest) {
    const creationFlagGiven = remote !== undefined || localOnly || signingKeyPem !== null || attested;
    if (creationFlagGiven) throw new InitError('sudus: settings exist; --remote, --local-only, --signing-key and --attested apply only when creating them');
    throw new InitError(`sudus: init needs --adopt <digest> to adopt existing settings at ${digest}`);
  }
  const evidence = await authenticateDeveloper(cwd, settings, { purpose: 'init', subject: digest, sign, quote, nonce, env });
  if (!verifyEvidence(settings, evidence, { purpose: 'init', subject: digest })) throw new InitError('sudus: developer evidence does not verify');
  const auth_mode = settings.signing_key === null ? 'attested' : 'signed';
  const sha = await appendRecord(cwd, 'init', 'project', { settings_digest: digest, authority_remote: settings.authority_remote, auth_mode });
  await ensureSnapshotRoot(cwd);
  return { sha, created: true, evidence };
}

// Local flagValue, not lib/cli.mjs's (would be a circular import: lib/cli.mjs imports runInit from
// here).
function flagValue(argv, name) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

// `init --remote <name>|--local-only [--signing-key <path>] [--adopt <digest>] --quote <words>`.
// --attested is accepted and is the default. --signing-key names a PEM file's path, read here (init() itself takes the key's own
// text as signingKeyPem); --signature/--nonce work exactly as they do for authorize/decisions
// --read/answer/supersede (cliSigner/cliNonce, lib/auth.mjs).
export function runInit(argv, io) {
  return (async () => {
    try {
      const remote = flagValue(argv, '--remote');
      const localOnly = argv.includes('--local-only');
      const signingKeyPath = flagValue(argv, '--signing-key');
      const attested = argv.includes('--attested');
      const adopt = flagValue(argv, '--adopt');
      const quote = flagValue(argv, '--quote');
      // Fix round 1, item 1: thread a fixed nonce (see cliNonce's note in lib/auth.mjs) so a signed
      // two-invocation flow authenticates the same payload both times.
      const nonce = cliNonce(argv) ?? b64url(randomBytes(16));
      const signingKeyPem = signingKeyPath !== undefined ? readFileSync(signingKeyPath, 'utf8') : null;
      const r = await init(io.cwd, { remote, localOnly, signingKeyPem, attested, adopt, quote,
        sign: cliSigner(argv, io), nonce, env: io.env });
      // Fix round 1, item 7: describe the evidence on the created line (spec section 8: "Sudus says
      // so wherever it reports the decision"). The idempotent already-initialized line reports no
      // fresh decision, since init() performs no authentication on that path, so it names none.
      const suffix = r.evidence ? ` (${describeEvidence(r.evidence)})` : '';
      io.stdout(r.created ? `sudus: initialized; init record ${r.sha}${suffix}` : `sudus: already initialized at ${r.sha}`);
      return 0;
    } catch (e) { io.stderr(e.message.startsWith('sudus: ') ? e.message : `sudus: ${e.message}`); return 1; }
  })();
}
