import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve as resolvePath } from 'node:path';
import { pathToFileURL } from 'node:url';
import { git, catCommit, listTree } from './gitx.mjs';
import { decodeRecord, SCHEMAS, obj, readLog } from './records.mjs';
import { readSnapshot, snapshotKind } from './snapshots.mjs';
import { lint, SPEC_DIR } from './spec.mjs';
import { runInit } from './init.mjs';
import { runMigrate } from './migrate.mjs';
import { runAuthorize, runDecisionsRead, cliSigner, cliNonce } from './auth.mjs';
import { runRecover } from './tx.mjs';
import { runBegin, runEnd, readLease, touchOutcome } from './lease.mjs';
import { declare, applyTouch, reviewMechanism, readMechanisms } from './mechanisms.mjs';
import { check, outputPath } from './check.mjs';
import { cmdScope, STATE_CHANGING } from './scope.mjs';
// Fix round 2 finding 2 (Important): lib/cli.mjs never imported lib/commitment.mjs, so start,
// done, supersede, promote, item, outside, fix, and lib/adr.mjs's decide/realize/readAdr were
// unreachable from the binary -- every one of them existed only as a library function no command
// ever called.
import { start, done, supersede, promote, item, outside, fix, realize } from './commitment.mjs';
import { decide, readAdr } from './adr.mjs';
import { b64url } from './canon.mjs';
import { cmdWake } from './wake.mjs';
import { missingRefsLine, validateAfterFetch, push } from './travel.mjs';
import { withLoop } from './cycle.mjs';
import { parseEscalateArgs, cliAnswer, cliReply, cliDispute, retiredBy } from './escalate.mjs';
import { cliReview, cliBrief, cliReport, cliResolve, cliAccept } from './review.mjs';

export class Refusal extends Error { constructor(m) { super(m); this.name = 'Refusal'; } }
export class NoVerdict extends Error { constructor(m) { super(m); this.name = 'NoVerdict'; } }

// Fix round 1 item 3 (Minor, review-1.md finding 3): this used to carry its own, second copy of
// the missing-refs logic -- a literal, unsubstituted "<authority>" placeholder for the
// no-remote-configured case, not a runnable command, and disagreeing with what `sudus wake` prints
// for the identical condition. lib/travel.mjs's missingRefsLine is the one place that decides this
// line (used by wake for the same purpose); requireRefs now calls it directly so the two paths can
// never again say something different for the same state, including when settings cannot be read
// at all (missingRefsLine's own loadSettings(cwd).catch(() => null) already covers that case).
// Kernel fix round (plan 14 fixture, defect 1, ruling A): section 4's after-fetch cross-reference
// validation belongs here, not on wake's ordinary path (see lib/wake.mjs's wake() for the removed
// call and its own comment). `sudus show` is exactly the command an operator reaches for to
// inspect a record's own cross-references, so this is where a partial fetch's dangling reference
// is caught and named cleanly, instead of a raw failure from resolving the missing object below.
export async function requireRefs(cwd) {
  const inside = await git(['rev-parse', '--is-inside-work-tree'], { cwd, expect: [0, 128] });
  if (inside.code !== 0) throw new NoVerdict('not inside a Git repository; run /new-project or /existing-project');
  const missing = await missingRefsLine(cwd);
  if (missing) throw new NoVerdict(`durable refs missing; run: ${missing}`);
  const repairs = await validateAfterFetch(cwd);
  if (repairs.length) throw new NoVerdict(`a cross-reference is unresolved; run: ${repairs[0].command}`);
}
function collectRefs(desc, v, path, out) {
  switch (desc.t) {
    case 'ws': case 'input': case 'ref': out.push([path, desc.t, v]); return;
    case 'nullable': if (v !== null) collectRefs(desc.of, v, path, out); return;
    case 'list': v.forEach((x, i) => collectRefs(desc.of, x, `${path}[${i}]`, out)); return;
    case 'obj': for (const k of Object.keys(desc.shape)) collectRefs(desc.shape[k], v[k], `${path}.${k}`, out); return;
    default: return;
  }
}
async function describe(cwd, type, sha) {
  if (type === 'ref') return `record ${sha}: ${decodeRecord(await catCommit(cwd, sha)).kind}`;
  const s = await readSnapshot(cwd, sha, type === 'ws' ? 'workspace' : 'input');
  return `${s.kind} snapshot ${sha}, tree ${s.tree}`;
}
// `sudus show items`: one line per item record, oldest first, with its sha (what `sudus promote`
// takes), kind, slug, source and body, and whether a promotion or a fix already names it. The
// next-feature skill reads the backlog this way; an item's slug is not a record sha.
async function showItems(cwd, stdout) {
  await requireRefs(cwd);
  const log = await readLog(cwd);
  for (const r of log) {
    if (r.kind !== 'item') continue;
    const promoted = log.find((p) => p.kind === 'promotion' && p.payload.item === r.sha);
    const fixed = log.find((f) => f.kind === 'fix' && f.payload.item === r.sha);
    const retired = retiredBy(log, r.sha);
    const state = promoted ? ' promoted' : fixed ? ' fix recorded' : retired ? ` retired by ${retired}` : '';
    stdout.write(`${r.sha} ${r.payload.kind} ${r.payload.slug} from ${r.payload.source}${state}: ${r.payload.body.split('\n')[0]}\n`);
  }
}
async function show([sha], { cwd, stdout }) {
  if (sha === 'items') return showItems(cwd, stdout);
  if (!sha || !/^[0-9a-f]{4,40}$/.test(sha)) throw new Refusal('show needs a record SHA, or items');
  await requireRefs(cwd);
  const full = await git(['rev-parse', '--verify', '--quiet', `${sha}^{commit}`], { cwd, expect: [0, 1] });
  if (full.code !== 0) throw new Refusal(`no commit ${sha}`);
  const commit = await catCommit(cwd, full.stdout.trim());
  // Issue #15: records and reasons name snapshot commits too; they are not log records.
  const snap = snapshotKind(commit.subject);
  if (snap) {
    const s = await readSnapshot(cwd, full.stdout.trim(), snap);
    const paths = await listTree(cwd, s.tree);
    stdout.write([commit.subject, `sha: ${full.stdout.trim()}`, `parent: ${s.parent ?? 'none'}`,
      `a ${snap} snapshot of ${paths.length} paths, tree ${s.tree}; git ls-tree -r ${s.tree} lists them`,
      JSON.stringify(s.payload, null, 2)].join('\n') + '\n');
    return;
  }
  if (/^(?:sudus|cairn): snapshot\b/.test(commit.subject)) throw new Refusal(`${sha} is named a snapshot but is neither a workspace nor an input snapshot: ${commit.subject}`);
  const { kind, payload } = decodeRecord(commit);
  const lines = [commit.subject, `sha: ${full.stdout.trim()}`, `parent: ${commit.parents[0] ?? 'none'}`, JSON.stringify(payload, null, 2)];
  const refs = []; collectRefs(obj(SCHEMAS[kind]), payload, kind, refs);
  if (refs.length) lines.push('references:');
  for (const [path, type, value] of refs) lines.push(`  ${path}: ${await describe(cwd, type, value)}`);
  stdout.write(lines.join('\n') + '\n');
}
async function lintCommand([target], { cwd, stdout }) {
  if (target !== SPEC_DIR) throw new Refusal(`lint takes ${SPEC_DIR} and nothing else`);
  const findings = await lint(cwd);
  for (const f of findings) stdout.write(`${f.file}:${f.line}: ${f.reason}\n`);
  if (findings.length) throw new Refusal(`lint found ${findings.length} problems`);
}
// lib/auth.mjs and lib/init.mjs's command handlers (runInit, runAuthorize, runDecisionsRead) take
// an injected io whose stdout/stderr are line-taking functions (io.stdout(line)), because their own
// tests (plan 03, Task 7) construct that io directly. This command table's io instead carries
// Node-stream-shaped stdout/stderr (stdout.write(text)), the shape plan 01 already committed and
// tests/cli.test.mjs already exercises. toLineIo adapts one to the other; deviation recorded in the
// plan 03 report since the plan's wiring instruction did not name an io shape to reconcile.
// Spec revision 6: the developer is never asked to run a command, so the terminal-backed
// overrides this used to pass through are gone; every developer-only command instead reads
// --quote off argv (lib/auth.mjs's own flagValue-style readers) and takes `env` here, defaulting
// to process.env, threaded through to authenticateDeveloper for harness detection (attested
// evidence). Task 2 gave lib/init.mjs's own remote/key/adopt questions the same treatment: they
// are `sudus init`'s own flags (--remote/--local-only/--signing-key/--attested/--adopt), read off
// argv by runInit itself, not threaded through ctx at all.
function toLineIo({ cwd, stdout, stderr, env }) {
  return { cwd, env: env ?? process.env, stdout: (l) => stdout.write(`${l}\n`), stderr: (l) => stderr.write(`${l}\n`) };
}
async function initCommand(args, ctx) { return runInit(args, toLineIo(ctx)); }
async function authorizeCommand(args, ctx) { return runAuthorize(args, toLineIo(ctx)); }
async function recoverCommand(args, ctx) { return runRecover(args, toLineIo(ctx)); }
async function beginCommand(args, ctx) { return runBegin(args, toLineIo(ctx)); }
// Fix round 1 finding 2 (Critical): applyTouch used to be wired in as a module-level
// `onEnd(applyTouch)` side effect in lib/mechanisms.mjs, but this command table is the actual
// shipped path (bin/sudus.mjs -> main -> endCommand -> runEnd) and it never imported
// lib/mechanisms.mjs, so that hook never registered and `sudus end` never wrote a touched path
// into any definition. The lease is read here, before runEnd removes it, because there is nothing
// left to read from after a successful end. lib/lease.mjs's own touchOutcome computes the single
// changed/unchanged answer applyTouch now consumes (finding 7) instead of recomputing its own.
// Fix round 2 finding 1b (Important): applyTouch's own declare() call can still refuse (settings
// changed between begin and end so a touched path now matches settings.outside or was never
// declarable at all, readMechanisms' shape refusal on a mechanism file corrupted after begin, or
// touchOutcome itself failing) from this unguarded block -- after the lease ref is already gone,
// so that throw reached main()'s catch, printed a bare refusal, exited 1, and split the "lease
// ended" line already written from the actual failure. Every touched path is now reported
// unclaimed with the caught error's message as its reason, and the command still exits 0: the
// lease removal and its report are never split by an unrelated write-back failure.
//
// Review-1 fix, item 4: `sudus end --abandon` releases the lease (lib/lease.mjs's end() records
// the abandonment in the terminal commit it writes) but must not also claim the touched paths as
// real mechanism-definition changes -- applyTouch's declare() call is exactly that claim. Abandon
// skips touchOutcome/applyTouch entirely and reports each touched path as not written because the
// action was abandoned, the same one-line-per-path shape the unclaimed-touch case already uses.
async function endCommand(args, ctx) {
  const io = toLineIo(ctx);
  const lease = await readLease(ctx.cwd);
  const abandon = args.includes('--abandon');
  const code = await runEnd(args, io);
  if (code === 0 && lease && abandon) {
    for (const p of lease.touch) io.stdout(`sudus: touch ${p} not written: action abandoned`);
  } else if (code === 0 && lease) {
    try {
      const outcome = await touchOutcome(ctx.cwd, lease);
      const result = await applyTouch(ctx.cwd, lease, outcome);
      for (const u of result.unclaimed) io.stdout(`sudus: touch ${u.path} not written: ${u.reason}`);
      for (const c of result.covered) io.stdout(`sudus: touch ${c.path} not written: the input ${c.by} already covers it`);
    } catch (e) {
      const reason = e.message.split('\n')[0];
      for (const p of lease.touch) io.stdout(`sudus: touch ${p} not written: ${reason}`);
    }
  }
  return code;
}
// Fix round 2 finding 2: bare `sudus decisions` (no --read) renders the ADR file, per section 4
// ("sudus decisions renders the file"); previously this command only ever supported --read.
async function decisionsCommand(args, ctx) {
  if (args.includes('--read')) return runDecisionsRead(args, toLineIo(ctx));
  const lines = await readAdr(ctx.cwd);
  for (const l of lines) ctx.stdout.write(`${JSON.stringify(l)}\n`);
  return 0;
}

function flagValue(argv, name) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}
async function startCommand([slug], { cwd, stdout }) {
  if (!slug) throw new Refusal('start needs a slug');
  const sha = await start(cwd, slug);
  stdout.write(`start ${sha} ${slug}\n`);
}
async function doneCommand([slug], { cwd, stdout }) {
  if (!slug) throw new Refusal('done needs a slug');
  const sha = await done(cwd, slug);
  stdout.write(`done ${sha} ${slug}\n`);
}
// supersede needs the developer's own authentication (lib/commitment.mjs's supersede writes a
// developer-quoted decision); wired the same way authorize and decisions --read already are, with
// cliSigner reading --signature/--nonce for a signed project and the same --quote both the record's
// text and, in attested mode, the developer evidence.
async function supersedeCommand(argv, ctx) {
  const [successor] = argv;
  if (!successor) throw new Refusal('supersede needs a successor slug');
  const quote = flagValue(argv, '--quote');
  const io = toLineIo(ctx);
  const nonce = cliNonce(argv) ?? b64url(randomBytes(16));
  const sha = await supersede(ctx.cwd, successor, { quote, sign: cliSigner(argv, io), nonce, env: io.env });
  ctx.stdout.write(`supersede ${sha} ${successor}\n`);
}
async function promoteCommand([itemSha], { cwd, stdout }) {
  if (!itemSha) throw new Refusal('promote needs an item SHA');
  const sha = await promote(cwd, itemSha);
  stdout.write(`promote ${sha} ${itemSha}\n`);
}
const ITEM_KIND_FLAGS = { '--backlog': 'backlog', '--next-feature': 'next-feature', '--defect': 'defect' };
async function itemCommand(argv, { cwd, stdout }) {
  const kindFlag = Object.keys(ITEM_KIND_FLAGS).find((f) => argv.includes(f));
  if (!kindFlag) throw new Refusal('item needs one of --backlog, --next-feature or --defect');
  const slug = flagValue(argv, '--slug');
  const source = flagValue(argv, '--from');
  const body = flagValue(argv, '--body');
  if (!slug || !source || !body) throw new Refusal('item needs --slug <s> --from <REQ or contract> --body <text>');
  const sha = await item(cwd, { kind: ITEM_KIND_FLAGS[kindFlag], slug, source, body });
  stdout.write(`item ${sha} ${slug}\n`);
}
async function outsideCommand(argv, { cwd, stdout }) {
  const [itemSha] = argv;
  const reason = flagValue(argv, '--reason');
  if (!itemSha || !reason) throw new Refusal('outside needs <item-sha> --reason <text>');
  const sha = await outside(cwd, itemSha, reason);
  stdout.write(`outside ${sha} ${itemSha}\n`);
}
async function fixCommand([itemSha], { cwd, stdout }) {
  if (!itemSha) throw new Refusal('fix needs an item SHA');
  const sha = await fix(cwd, itemSha);
  stdout.write(`fix ${sha} ${itemSha}\n`);
}
// A plain Consequential decide entry: plan 09's escalate module, not yet built, owns the Blocking
// path (an escalation is a different record kind entirely). rests_on is comma-separated on the
// command line; lib/adr.mjs's decide() itself takes the real array.
//
// Plan 16, Task 4 (correction to plan on record, brief's own text): `sudus decide --consequential`
// is not one flow but two, sharing the same mandatory `--consequential` confirmation flag. The
// shape above (--title/--rests-on/--wrong-if/--body) is the spec-phase deference decision the
// skills already call, written with lib/adr.mjs's bare decide() before any commitment is open --
// unaffected by this task, still reachable the exact same way. `--commitment` marks the other
// shape: the measured work-loop draft (--commitment/--concern/--question/--recommendation/
// --because/--if-wrong/--instead/...), which routes to lib/escalate.mjs's decideConsequential
// (Task 3) instead. Dispatched on which flag set is present, not by assuming the two flag sets
// never collide.
async function decideCommand(argv, { cwd, stdout }) {
  if (!argv.includes('--consequential')) throw new Refusal('decide needs --consequential (a Blocking decision is an escalation, not this command)');
  if (argv.includes('--commitment')) {
    const { decideConsequential } = await import('./escalate.mjs');
    const draft = parseEscalateArgs(argv.filter((a) => a !== '--consequential'));
    const id = await decideConsequential(cwd, draft);
    stdout.write(`sudus: decide ${draft.commitment} ${id}\n`);
    return 0;
  }
  const title = flagValue(argv, '--title');
  const restsOnRaw = flagValue(argv, '--rests-on');
  const wrongIf = flagValue(argv, '--wrong-if');
  const body = flagValue(argv, '--body');
  if (!title || !restsOnRaw || !wrongIf || !body) throw new Refusal('decide needs --title, --rests-on, --wrong-if and --body (or the work-loop draft shape: --commitment, --concern, --question, --recommendation, --because, --if-wrong, --instead)');
  const rests_on = restsOnRaw.split(',').map((s) => s.trim()).filter(Boolean);
  const id = await decide(cwd, { title, rests_on, wrong_if: wrongIf, body });
  stdout.write(`decide ${id}\n`);
}
async function realizeCommand(argv, { cwd, stdout }) {
  const [id] = argv;
  const subject = flagValue(argv, '--subject');
  if (!id || !subject) throw new Refusal('realize needs <decision-id> --subject <text>');
  const rid = await realize(cwd, id, { subject });
  stdout.write(`realize ${rid} ${id}\n`);
}
// Deviation from the plan text: this command table's real entries are {usage, run: async (argv,
// ctx) => code}, writing straight to ctx.stdout/ctx.stderr (see toLineIo's own comment above for
// why), not the plan's `name: async (cwd, argv) => {code, out}` shape. lib/escalate.mjs's own
// cliAnswer/cliReply/cliDispute keep that {code, out} contract, since their own tests call them
// directly; those adapters translate one shape into the other, out on 0 and stderr on 1.
//
// Plan 11: escalateCommand originally routed through lib/escalate.mjs's escalateWithRoute. Plan
// 15, task 3 (ruling 1) reduced escalateWithRoute to an unconditional plain escalation (the router
// design decisions 55 and 56 superseded). Plan 16, Task 4 fix round 1: escalateWithRoute is
// deleted outright (it had no remaining caller once this command was rewritten below, and no other
// module imported it -- lib/escalate.mjs is one of this task's own files). `sudus escalate`
// without `--consequential` now calls lib/escalate.mjs's plain escalate() directly -- exactly the
// pre-plan-11 behavior escalateWithRoute's own 'developer' route always produced, just with no
// `route:` word in the printed line, since there is no route left to report. `sudus escalate
// --consequential` is new: it calls escalateConsequential (Task 4, this plan), the only path a
// floor-caught or vetoed draft -- or an agent's own choice to escalate past a `suggested: agent`
// composite -- can take. `sudus decide --consequential` (decideCommand, above) dispatches on its
// own flag set (--title vs --commitment) rather than being affected by this change.
//
// `--transport-module <path>` no longer exists on escalate: neither escalate() nor
// escalateConsequential makes a model call of their own. Plan 16 (Task 5) gives `sudus measure`
// its own test-only transport flag -- the only place a transport is ever invoked.
async function escalateCommand(argv, { cwd, stdout }) {
  const consequential = argv.includes('--consequential');
  const draft = parseEscalateArgs(argv.filter((a) => a !== '--consequential'));
  if (consequential) {
    const { escalateConsequential } = await import('./escalate.mjs');
    const sha = await escalateConsequential(cwd, draft);
    stdout.write(`sudus: escalate ${draft.commitment} ${sha}\n`);
    return 0;
  }
  const { escalate } = await import('./escalate.mjs');
  const sha = await escalate(cwd, draft);
  stdout.write(`sudus: escalate ${draft.commitment} ${sha}\n`);
  return 0;
}
// Plan 11: `sudus calibrate` records a calibration record over labelled suggested-agent
// measurements (lib/evaluate.mjs's calibrate()) -- advisory only, it never gates agent
// authority, and there is no route mode. Exit 0 on a passing calibration, 1 on a failing one --
// the same pass/fail-as-exit-code convention `sudus lint` already uses.
//
// Fix (Minor, final-review.md): `calibrate` takes no CLI arguments, so the first parameter is
// unused -- kept (named `_args`, not read) only for positional signature parity with every other
// command's own `run(args, ctx)` shape (lib/cli.mjs's shared COMMANDS dispatch, `cmd.run(args,
// {...})`), the same reason completeReviewMeasurement keeps an unread `env` and recoverMeasurement
// keeps an unread `transport`.
async function calibrateCommand(_args, { cwd, stdout }) {
  const { calibrate } = await import('./evaluate.mjs');
  const c = await calibrate(cwd);
  stdout.write(`sudus: calibration ${c.pass ? 'pass' : 'fail'}: ${c.sample} predicted-agent cases, ${c.errors} false downgrades, bound ${c.bound.toFixed(4)}\n`);
  return c.pass ? 0 : 1;
}
// Plan 16, Task 5: `sudus measure` -- runs `measure()` (lib/evaluate.mjs) on the exact draft.
// `splitFlag` pulls one named flag (and, for the three that take one, its value) out of argv
// before the remainder is handed to parseEscalateArgs, which parses strictly in flag/value pairs
// and refuses any flag it does not recognize -- --file/--brief/--transport-module would otherwise
// fail that parse. `--transport-module <path>` is test only (plan 15 Ruling 6 removed it from
// escalate; measure is the only place a transport is ever invoked): the named module's default
// export replaces `post` (bin/typesafeai.mjs) so tests never touch the network.
function splitFlag(argv, name) {
  const i = argv.indexOf(name);
  if (i < 0) return { rest: argv, present: false, value: undefined };
  const takesValue = name === '--transport-module' || name === '--file' || name === '--harness';
  return { rest: takesValue ? [...argv.slice(0, i), ...argv.slice(i + 2)] : [...argv.slice(0, i), ...argv.slice(i + 1)], present: true, value: takesValue ? argv[i + 1] : true };
}
async function measureCommand(argv, { cwd, stdout, stderr, env }) {
  let rest = argv;
  const file = splitFlag(rest, '--file'); rest = file.rest;
  if (rest[0] && !rest[0].startsWith('--')) {
    // sudus measure <slug> --file <path>: complete a pending review measurement. Built by Task 6
    // (completeReviewMeasurement, lib/evaluate.mjs) -- this wiring is pre-built for it per that
    // task's own Files note ("the measureCommand wiring from Task 5 already calls this").
    const [slug] = rest;
    if (!file.present) { stderr.write('sudus: measure <slug> --file <path> completes a pending review measurement\n'); return 1; }
    const { completeReviewMeasurement } = await import('./evaluate.mjs');
    const body = JSON.parse(await readFile(file.value, 'utf8'));
    const r = await completeReviewMeasurement(cwd, slug, body);
    stdout.write(`sudus: measure ${slug} ${r.measurementSha} ${r.outcome}${r.suggested ? ' suggested:' + r.suggested : ''}\n`);
    return 0;
  }
  const brief = splitFlag(rest, '--brief'); rest = brief.rest;
  const tm = splitFlag(rest, '--transport-module'); rest = tm.rest;
  // Fix (Important I3, final-review.md): `sudus brief` accepts `[--harness <name>]` (lib/review.mjs's
  // cliBrief, reading named.harness) and section 10 says the review source starts the adversary
  // "exactly as sudus brief" does -- but measureCommand never read one off argv, leaving
  // measure()'s own `harness` option (which detectHarness already honours as an override) with no
  // way in from the CLI. `splitFlag` already lists '--harness' in its takesValue set; this was the
  // dead branch the review found. Applies to both the --brief launch path and the jev path below
  // (detectHarness is only ever consulted for the review source, so an explicit --harness is
  // inert -- but harmless -- when typesafeai.enabled is true).
  const harnessFlag = splitFlag(rest, '--harness'); rest = harnessFlag.rest;
  const draft = parseEscalateArgs(rest);
  const transport = tm.value ? (await import(pathToFileURL(resolvePath(tm.value)).href)).default : undefined;
  const { measure } = await import('./evaluate.mjs');
  const r = await measure(cwd, draft, { transport, session: process.env.SUDUS_SESSION ?? null, harness: harnessFlag.value, env: env ?? process.env });
  if (r.pending === 'review') {
    if (!brief.present) { stderr.write('sudus: measure: this project\'s review source needs --brief to print the launch block\n'); return 1; }
    // Fix round 1 (Important I1, review of commit c9a69370): the brief file's write and the launch
    // block's assembly used to live here, inline -- duplicating exactly the category of work
    // brief() (lib/review.mjs) already owns for sudus brief, split across two files for parallel
    // functionality. writeMeasureBrief (lib/evaluate.mjs, beside renderMeasureBrief) now owns both,
    // the same way brief() builds its own launchText and does its own mkdir/writeFile; this handler
    // is thin over measure() plus that function, matching briefCommand's own shape.
    const { writeMeasureBrief } = await import('./evaluate.mjs');
    const { text, launch } = await writeMeasureBrief(cwd, r, draft.commitment);
    stdout.write(`${launch}\n${text}\n`);
    return 0;
  }
  // Deviation from the brief text: reworded from "this project's typesafeai.enabled is true" --
  // that reason is only true when the measurement actually took the jev path. A review-source
  // draft that hit the floor or an egress exclusion also finishes with `pending` unset (section
  // 10: the floor and the exclusion check both run before the jev/review fork), so --brief has
  // nothing to show there too, for a different reason. Fix round 1 (review of commit c9a69370,
  // Part 1 open item 2 / Part 2 I2): names `r.reason` -- for an egress exclusion this already
  // reads `unavailable excluded: <class> <path>` (EgressError's own message, above), so a
  // credential-path draft's refusal names the excluded path, not just a generic "already
  // finished."
  if (brief.present) { stderr.write(`sudus: measure: --brief has nothing to show; ${r.reason}\n`); return 1; }
  // Global Constraints (task dispatch): prints the measurement as numbers and reasons the agent
  // can read -- outcome, the five levels with confidences, the composite, the veto if any,
  // suggested, the reason, and the measurement SHA. `r.levels` is the same per-dimension list just
  // written to the record (finalizeMeasurement, this task's own addition to its return value);
  // empty for a floor/unavailable/indeterminate outcome, which never reached a call.
  const levels = r.levels.length ? r.levels.map((l) => `${l.dimension}=${l.level} (confidence ${l.confidence})`).join(', ') : 'none';
  stdout.write([
    `sudus: measure ${draft.commitment} ${r.measurementSha} ${r.outcome}${r.suggested ? ` suggested:${r.suggested}` : ''}`,
    `levels: ${levels}`,
    `composite: ${r.composite === null ? 'none' : r.composite}`,
    `veto: ${r.veto ?? 'none'}`,
    `reason: ${r.reason}${r.detail ? `: ${r.detail}` : ''}`,
    '',
  ].join('\n'));
  return 0;
}
// answer is developer-only (lib/escalate.mjs's answer() authenticates through authenticateDeveloper);
// wired the same way authorize, decisions --read and supersede already are: cliSigner(argv, io)
// reads --signature/SUDUS_SIGNATURE and prints the payload to sign when neither is present;
// cliNonce(argv) reads --nonce back for run 2 of the two-step signed flow, falling back to a fresh
// nonce for run 1 or an attested project. cliAnswer itself reads --quote off argv.
async function answerCommand(argv, ctx) {
  const io = toLineIo(ctx);
  const nonce = cliNonce(argv) ?? b64url(randomBytes(16));
  const { code, out } = await cliAnswer(ctx.cwd, argv, { sign: cliSigner(argv, io), nonce, env: io.env });
  (code === 0 ? ctx.stdout : ctx.stderr).write(out);
  return code;
}
async function replyCommand(argv, { cwd, stdout, stderr }) {
  const { code, out } = await cliReply(cwd, argv);
  (code === 0 ? stdout : stderr).write(out);
  return code;
}
async function disputeCommand(argv, { cwd, stdout, stderr }) {
  const { code, out } = await cliDispute(cwd, argv);
  (code === 0 ? stdout : stderr).write(out);
  return code;
}
// Fix round 1 item 6 addendum: `sudus declare` and `sudus check` were never wired into this table
// by any plan (confirmed: neither appeared in `sudus --help`, though lib/scope.mjs's
// STATE_CHANGING already named both, and lib/mechanisms.mjs's declare(cwd, name, rawDefinition)
// and lib/check.mjs's check(cwd, REQ) were both already fully built and tested at the library
// level). The spec names no CLI argument syntax for declare anywhere (section 2 only says
// mechanisms are "written only by sudus declare"; the "Commands and crash recovery" section lists
// check but not declare at all) -- `<name> --file <path>`, reading the definition as JSON, is
// used here to match the --file convention `report`/`accept` already use.
async function declareCommand(argv, { cwd, stdout }) {
  const [name] = argv;
  const file = flagValue(argv, '--file');
  if (!name || !file) throw new Refusal('declare needs <name> --file <path>');
  const rawDefinition = JSON.parse(await readFile(file, 'utf8'));
  const { definitionDigest } = await declare(cwd, name, rawDefinition);
  stdout.write(`declare ${name} ${definitionDigest}\n`);
}
async function checkCommand([REQ], { cwd, stdout, stderr }) {
  if (!REQ) throw new Refusal('check needs a requirement id');
  const sha = await check(cwd, REQ);
  stdout.write(`check ${sha} ${REQ}\n`);
  // A per-requirement result that is not exactly `sudus: REQ: pass|fail` lands on unverified;
  // say what the output had for that requirement so the mismatch is visible, not silent.
  const rec = (await readLog(cwd)).find((r) => r.sha === sha);
  if (!rec || rec.payload.status !== 'ran') return;
  for (const x of rec.payload.results) {
    if (x.result !== 'unverified') continue;
    let lines = [];
    try { lines = (await readFile(outputPath(cwd, rec.payload.output), 'utf8')).split('\n').filter((l) => l.includes(x.requirement)); } catch { /* output missing */ }
    const saw = lines.length ? `saw ${lines.map((l) => JSON.stringify(l.trimEnd())).join(', ')}` : 'no output line names it';
    stderr.write(`sudus: ${x.requirement} is unverified: no output line is exactly "sudus: ${x.requirement}: pass" or "sudus: ${x.requirement}: fail"; ${saw}\n`);
  }
}
// `sudus review mechanism REQ <fail-receipt>` (the working agreement's own wording, plan 13) names
// no mechanism: the assigned command resolves it from REQ the same way lib/review.mjs's targets()
// resolves a commitment's mechanisms, by which declared mechanism names that requirement. Refused
// when zero or more than one mechanism does, rather than guessed.
async function reviewMechanismCommand([req, receipt], { cwd, stdout, stderr }) {
  if (!req) { stderr.write('sudus: review mechanism needs <REQ> [<fail-receipt>]\n'); return 1; }
  if (!receipt) {
    // The latest fail receipt for REQ, which is the one wake's reason names; the agent that ran the
    // check is not always the one that reviews.
    const fr = (await readLog(cwd)).findLast((r) => r.kind === 'receipt' && r.payload.status === 'ran' && r.payload.results.some((x) => x.requirement === req && x.result === 'fail'));
    if (!fr) { stderr.write(`sudus: no fail receipt for ${req}; run sudus check ${req} against a violating example first\n`); return 1; }
    receipt = fr.sha;
  }
  const all = await readMechanisms(cwd);
  const names = Object.keys(all).filter((n) => all[n].definition.requirements.includes(req)).sort();
  if (names.length !== 1) {
    stderr.write(`sudus: ${names.length === 0 ? `no mechanism declares ${req}` : `${names.length} mechanisms declare ${req}: ${names.join(', ')}; name one with sudus declare`}\n`);
    return 1;
  }
  await reviewMechanism(cwd, names[0], req, receipt);
  stdout.write(`sudus: review mechanism ${req} ${names[0]}\n`);
  return 0;
}
// review, brief, report, resolve and accept write the review chain (section 4). lib/review.mjs's
// own cliReview/cliBrief/cliReport/cliResolve/cliAccept keep the {code, out} contract their own
// tests call directly (tests/review.test.mjs); these adapters translate that into ctx.stdout/
// ctx.stderr the same way escalateCommand and friends already do above. `review`'s first positional
// argument `mechanism` dispatches to reviewMechanismCommand instead (plan 05's reviewMechanism),
// per this task's own instruction.
async function reviewCommand(argv, ctx) {
  if (argv[0] === 'mechanism') return reviewMechanismCommand(argv.slice(1), ctx);
  const { code, out } = await cliReview(ctx.cwd, argv, { env: ctx.env ?? process.env });
  (code === 0 ? ctx.stdout : ctx.stderr).write(out);
  return code;
}
async function briefCommand(argv, ctx) {
  const { code, out } = await cliBrief(ctx.cwd, argv, { env: ctx.env ?? process.env });
  (code === 0 ? ctx.stdout : ctx.stderr).write(out);
  return code;
}
async function reportCommand(argv, ctx) {
  const { code, out } = await cliReport(ctx.cwd, argv, { env: ctx.env ?? process.env });
  (code === 0 ? ctx.stdout : ctx.stderr).write(out);
  return code;
}
async function resolveCommand(argv, ctx) {
  const { code, out } = await cliResolve(ctx.cwd, argv, { env: ctx.env ?? process.env });
  (code === 0 ? ctx.stdout : ctx.stderr).write(out);
  return code;
}
async function acceptCommand(argv, ctx) {
  const { code, out } = await cliAccept(ctx.cwd, argv, { env: ctx.env ?? process.env });
  (code === 0 ? ctx.stdout : ctx.stderr).write(out);
  return code;
}
// sudus push (plan 12): pushes the branch and both durable refs to the authority remote, atomic
// where the remote supports it, safely ordered otherwise. Not in STATE_CHANGING (lib/scope.mjs):
// it moves refs on the remote only and writes no local declared input or Sudus record, so it
// needs neither a preflight scope check nor a cycle-counter settle. A TravelError's message
// already begins "sudus: "; main()'s ordinary catch path reports it and exits 1.
async function pushCommand(argv, { cwd, stdout }) {
  const r = await push(cwd);
  stdout.write(`sudus: pushed ${r.pushed.join(', ')} to ${r.remote} (${r.mode})\n`);
  return 0;
}
export const COMMANDS = {
  show: { usage: 'show <sha>|items', run: show },
  lint: { usage: 'lint docs/spec', run: lintCommand },
  init: { usage: 'init --remote <name>|--local-only [--signing-key <path>] [--adopt <digest>] --quote <words>', run: initCommand },
  migrate: { usage: 'migrate', run: (args, { cwd, stdout, stderr }) => runMigrate(args, { cwd, stdout: (s) => stdout.write(`${s}\n`), stderr: (s) => stderr.write(`${s}\n`) }) },
  authorize: { usage: 'authorize [ok|instead|ask] --quote <words>', run: authorizeCommand },
  decisions: { usage: 'decisions [--read <id> --quote <words>]', run: decisionsCommand },
  recover: { usage: 'recover <transaction>', run: recoverCommand },
  begin: { usage: 'begin <action> <target> [--touch <path>]...', run: beginCommand },
  end: { usage: 'end [--abandon] [--lease <sha>]', run: endCommand },
  check: { usage: 'check <REQ>', run: checkCommand },
  declare: { usage: 'declare <name> --file <path>', run: declareCommand },
  scope: { usage: 'scope <breach-sha or path> keep|restore', run: cmdScope },
  start: { usage: 'start <slug>', run: startCommand },
  done: { usage: 'done <slug>', run: doneCommand },
  supersede: { usage: 'supersede <successor> --quote <text>', run: supersedeCommand },
  promote: { usage: 'promote <item-sha>', run: promoteCommand },
  item: { usage: 'item --backlog|--defect --slug <s> --from <REQ> --body <text> | item --next-feature --slug <s> --from <REQ or contract> --body <text>', run: itemCommand },
  outside: { usage: 'outside <item-sha> --reason <text>', run: outsideCommand },
  fix: { usage: 'fix <item-sha>', run: fixCommand },
  decide: { usage: 'decide --consequential --title <t> --rests-on <REQ,...> --wrong-if <t> --body <t> (a spec-phase deference decision) | decide --consequential --commitment <s> --concern <token>... --question <q> --recommendation <r> --because <b> --if-wrong <w> --instead <i> [--option <t>...] [--path <file>...] [--decision <id>...] (a measured work-loop decision)', run: decideCommand },
  realize: { usage: 'realize <decision-id> --subject <text>', run: realizeCommand },
  escalate: { usage: 'escalate [--consequential] --commitment <s> --concern <token>... --question <q> --recommendation <r> --because <b> --if-wrong <w> --instead <i> [--option <t>...] [--path <file>...] [--decision <id>...]', run: escalateCommand },
  calibrate: { usage: 'calibrate', run: calibrateCommand },
  measure: { usage: 'measure [--brief] [--harness <name>] --commitment <s> --concern <token>... --question <q> --recommendation <r> --because <b> --if-wrong <w> --instead <i> --option <t>... [--path <file>...] [--decision <id>...] [--transport-module <path> (test only)] | measure <slug> --file <path>', run: measureCommand },
  answer: { usage: 'answer <slug> ok|instead|ask --quote <words> [--escalation <sha>]', run: answerCommand },
  reply: { usage: 'reply <slug> <text> [--escalation <sha>]', run: replyCommand },
  dispute: { usage: 'dispute --commitment <s> --record <sha> --n <n> --question <q> --recommendation <r> --because <b> --if-wrong <w> --instead <i>', run: disputeCommand },
  review: { usage: 'review <slug> --file <path> | review mechanism <REQ> [<fail-receipt>]', run: reviewCommand },
  brief: { usage: 'brief <slug> [--harness <name>]', run: briefCommand },
  report: { usage: 'report <slug> --file <path>', run: reportCommand },
  resolve: { usage: 'resolve <slug> <n> "<how>" [--source <sha>]', run: resolveCommand },
  accept: { usage: 'accept <slug> --file <path>', run: acceptCommand },
  push: { usage: 'push', run: pushCommand },
  // cmdWake(cwd) (lib/wake.mjs) writes its one line of output straight to process.stdout, not the
  // command table's own injected stdout stream: wake's own contract (section 6) is a plain
  // process-stdout print for the hooks and `sudus wake`, and this command's own tests (loop.mjs's
  // runWake, and this test file's direct spawnSync of bin/sudus.mjs) both run it as a real child
  // process, whose stdout the harness always captures independent of this table's io injection.
  wake: { usage: 'wake', run: (args, { cwd }) => cmdWake(cwd) },
};
const FILE_FLAGS = new Set(['--file', '--signing-key']);
async function toplevel(cwd) {
  const r = await git(['rev-parse', '--show-toplevel'], { cwd, expect: [0, 128] });
  return r.code === 0 ? r.stdout.trim() : null;
}
export function usage() {
  return ['usage: sudus <command> [args]', '', ...Object.values(COMMANDS).map((c) => `  sudus ${c.usage}`), '  sudus --help', '  sudus --version', ''].join('\n');
}
export async function version() {
  return JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version;
}
// ...inject carries test-only overrides through to each command's ctx (env, most commonly, for a
// developer-only command's attested evidence); `sudus init` takes its own answers as argv flags,
// read by runInit itself, not through ctx at all.
export async function main(argv, { cwd = process.cwd(), stdout = process.stdout, stderr = process.stderr, ...inject } = {}) {
  let [name, ...args] = argv;
  try {
    if (!name || name === '--help' || name === 'help') { stdout.write(usage()); return 0; }
    if (name === '--version' || name === 'version') { stdout.write(`${await version()}\n`); return 0; }
    const cmd = COMMANDS[name];
    if (!cmd) throw new Refusal(`unknown command ${name}; run sudus --help`);
    // Every path Sudus handles (declared inputs, leases, snapshots, breaches) is repository-relative,
    // so a command typed in a subdirectory runs at the top level; `sudus wake` from scripts/x used
    // to hash declared inputs against scripts/x and fail on the first one. A flag whose value is a
    // file read from disk (--file, --signing-key) keeps meaning the file where it was typed.
    const top = await toplevel(cwd);
    if (top && top !== resolvePath(cwd)) {
      for (let i = 0; i + 1 < args.length; i++) if (FILE_FLAGS.has(args[i])) args[i + 1] = resolvePath(cwd, args[i + 1]);
      cwd = top;
    }
    // `sudus <command> --help` prints that command's usage line and runs nothing. Only the first
    // argument is read: a later `--help` is the command's own input (a backlog or escalate text,
    // a --quote), and a STATE_CHANGING command such as push must never run under a help request.
    if (args[0] === '--help' || args[0] === '-h') { stdout.write(`usage: sudus ${cmd.usage}\n`); return 0; }
    // withLoop (lib/cycle.mjs) already runs the preflight scope check for a STATE_CHANGING
    // command (it wraps runWithPreflight itself) and settles the administrative-cycle counter
    // after the command completes; a non-STATE_CHANGING command (wake, show, lint, recover, ...)
    // runs directly, with no preflight and no settle, exactly as plan 07 already dispatched it.
    const code = STATE_CHANGING.has(name)
      ? await withLoop(cwd, name, () => cmd.run(args, { cwd, stdout, stderr, ...inject }))
      : await cmd.run(args, { cwd, stdout, stderr, ...inject });
    return code ?? 0;
  } catch (e) {
    if (e instanceof NoVerdict) { stdout.write(`sudus: ${e.message}\n`); return 3; }
    // Fix round 1 item 9: guard against doubling an existing "sudus: " prefix (e.g. scope.mjs's
    // ScopeError, whose message already carries one) instead of prepending unconditionally; a
    // message with no prefix (Refusal and friends) is unaffected.
    const msg = e.message.split('\n')[0];
    stderr.write(msg.startsWith('sudus: ') ? `${msg}\n` : `sudus: ${msg}\n`);
    return 1;
  }
}
