import { randomBytes } from 'node:crypto';
import { git, readRef, catCommit } from './gitx.mjs';
import { decodeRecord, SCHEMAS, obj, LOG_REF } from './records.mjs';
import { readSnapshot, SNAPSHOTS_REF } from './snapshots.mjs';
import { lint, SPEC_DIR } from './spec.mjs';
import { runInit } from './init.mjs';
import { runAuthorize, runDecisionsRead, cliSigner, cliNonce, ttyConfirm } from './auth.mjs';
import { runRecover } from './tx.mjs';
import { runBegin, runEnd, readLease, touchOutcome } from './lease.mjs';
import { applyTouch } from './mechanisms.mjs';
import { cmdScope, STATE_CHANGING } from './scope.mjs';
// Fix round 2 finding 2 (Important): lib/cli.mjs never imported lib/commitment.mjs, so start,
// done, supersede, promote, item, outside, fix, and lib/adr.mjs's decide/realize/readAdr were
// unreachable from the binary -- every one of them existed only as a library function no command
// ever called.
import { start, done, supersede, promote, item, outside, fix, realize } from './commitment.mjs';
import { decide, readAdr } from './adr.mjs';
import { b64url } from './canon.mjs';
import { cmdWake } from './wake.mjs';
import { withLoop } from './cycle.mjs';

export class Refusal extends Error { constructor(m) { super(m); this.name = 'Refusal'; } }
export class NoVerdict extends Error { constructor(m) { super(m); this.name = 'NoVerdict'; } }
export const FETCH_LINE = "git fetch <authority> 'refs/cairn/log:refs/cairn/log' 'refs/cairn/snapshots:refs/cairn/snapshots'";

export async function requireRefs(cwd) {
  const inside = await git(['rev-parse', '--is-inside-work-tree'], { cwd, expect: [0, 128] });
  if (inside.code !== 0) throw new NoVerdict('not inside a Git repository; run /new-project or /existing-project');
  if (!(await readRef(cwd, LOG_REF)) || !(await readRef(cwd, SNAPSHOTS_REF))) throw new NoVerdict(`durable refs missing; run: ${FETCH_LINE}`);
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
async function show([sha], { cwd, stdout }) {
  if (!sha || !/^[0-9a-f]{4,40}$/.test(sha)) throw new Refusal('show needs a record SHA');
  await requireRefs(cwd);
  const full = await git(['rev-parse', '--verify', '--quiet', `${sha}^{commit}`], { cwd, expect: [0, 1] });
  if (full.code !== 0) throw new Refusal(`no commit ${sha}`);
  const commit = await catCommit(cwd, full.stdout.trim());
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
// Fix round 1, item 5: confirm/confirmRemote/chooseKey/confirmDigest pass through from main()'s own
// options when supplied, so tests can drive cairn init/authorize/decisions --read through main()
// with an injected confirm instead of needing a real controlling terminal.
function toLineIo({ cwd, stdout, stderr, confirm, confirmRemote, chooseKey, confirmDigest }) {
  return { cwd, env: process.env, stdout: (l) => stdout.write(`${l}\n`), stderr: (l) => stderr.write(`${l}\n`),
    confirm, confirmRemote, chooseKey, confirmDigest };
}
async function initCommand(args, ctx) { return runInit(args, toLineIo(ctx)); }
async function authorizeCommand(args, ctx) { return runAuthorize(args, toLineIo(ctx)); }
async function recoverCommand(args, ctx) { return runRecover(args, toLineIo(ctx)); }
async function beginCommand(args, ctx) { return runBegin(args, toLineIo(ctx)); }
// Fix round 1 finding 2 (Critical): applyTouch used to be wired in as a module-level
// `onEnd(applyTouch)` side effect in lib/mechanisms.mjs, but this command table is the actual
// shipped path (bin/cairn.mjs -> main -> endCommand -> runEnd) and it never imported
// lib/mechanisms.mjs, so that hook never registered and `cairn end` never wrote a touched path
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
async function endCommand(args, ctx) {
  const io = toLineIo(ctx);
  const lease = await readLease(ctx.cwd);
  const code = await runEnd(args, io);
  if (code === 0 && lease) {
    try {
      const outcome = await touchOutcome(ctx.cwd, lease);
      const result = await applyTouch(ctx.cwd, lease, outcome);
      for (const u of result.unclaimed) io.stdout(`cairn: touch ${u.path} not written: ${u.reason}`);
    } catch (e) {
      const reason = e.message.split('\n')[0];
      for (const p of lease.touch) io.stdout(`cairn: touch ${p} not written: ${reason}`);
    }
  }
  return code;
}
// Fix round 2 finding 2: bare `cairn decisions` (no --read) renders the ADR file, per section 4
// ("cairn decisions renders the file"); previously this command only ever supported --read.
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
// cliSigner reading --signature/--nonce for a signed project and ttyConfirm as the unsigned-local
// default when the CLI's own caller (main()) does not inject a test confirm function.
async function supersedeCommand(argv, ctx) {
  const [successor] = argv;
  if (!successor) throw new Refusal('supersede needs a successor slug');
  const quote = flagValue(argv, '--quote');
  const io = toLineIo(ctx);
  const nonce = cliNonce(argv) ?? b64url(randomBytes(16));
  const sha = await supersede(ctx.cwd, successor, { quote, sign: cliSigner(argv, io), confirm: ctx.confirm ?? ttyConfirm, nonce });
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
async function decideCommand(argv, { cwd, stdout }) {
  if (!argv.includes('--consequential')) throw new Refusal('decide needs --consequential (a Blocking decision is an escalation, not this command)');
  const title = flagValue(argv, '--title');
  const restsOnRaw = flagValue(argv, '--rests-on');
  const wrongIf = flagValue(argv, '--wrong-if');
  const body = flagValue(argv, '--body');
  if (!title || !restsOnRaw || !wrongIf || !body) throw new Refusal('decide needs --title, --rests-on, --wrong-if and --body');
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
export const COMMANDS = {
  show: { usage: 'show <sha>', run: show },
  lint: { usage: 'lint docs/spec', run: lintCommand },
  init: { usage: 'init', run: initCommand },
  authorize: { usage: 'authorize', run: authorizeCommand },
  decisions: { usage: 'decisions [--read <id>]', run: decisionsCommand },
  recover: { usage: 'recover <transaction>', run: recoverCommand },
  begin: { usage: 'begin <action> <target> [--touch <path>]...', run: beginCommand },
  end: { usage: 'end', run: endCommand },
  scope: { usage: 'scope <breach-sha> keep|restore', run: cmdScope },
  start: { usage: 'start <slug>', run: startCommand },
  done: { usage: 'done <slug>', run: doneCommand },
  supersede: { usage: 'supersede <successor> --quote <text>', run: supersedeCommand },
  promote: { usage: 'promote <item-sha>', run: promoteCommand },
  item: { usage: 'item --backlog|--next-feature|--defect --slug <s> --from <REQ or contract> --body <text>', run: itemCommand },
  outside: { usage: 'outside <item-sha> --reason <text>', run: outsideCommand },
  fix: { usage: 'fix <item-sha>', run: fixCommand },
  decide: { usage: 'decide --consequential --title <t> --rests-on <REQ,...> --wrong-if <t> --body <t>', run: decideCommand },
  realize: { usage: 'realize <decision-id> --subject <text>', run: realizeCommand },
  // cmdWake(cwd) (lib/wake.mjs) writes its one line of output straight to process.stdout, not the
  // command table's own injected stdout stream: wake's own contract (section 6) is a plain
  // process-stdout print for the hooks and `cairn wake`, and this command's own tests (loop.mjs's
  // runWake, and this test file's direct spawnSync of bin/cairn.mjs) both run it as a real child
  // process, whose stdout the harness always captures independent of this table's io injection.
  wake: { usage: 'wake', run: (args, { cwd }) => cmdWake(cwd) },
};
export function usage() {
  return ['usage: cairn <command> [args]', '', ...Object.values(COMMANDS).map((c) => `  cairn ${c.usage}`), '  cairn --help', ''].join('\n');
}
// Fix round 1, item 5: ...inject carries the test-only confirm/confirmRemote/chooseKey/confirmDigest
// overrides through to toLineIo above; a real cairn.mjs invocation never supplies them, so init,
// authorize and decisions --read fall back to their terminal-backed defaults exactly as before.
export async function main(argv, { cwd = process.cwd(), stdout = process.stdout, stderr = process.stderr, ...inject } = {}) {
  const [name, ...args] = argv;
  try {
    if (!name || name === '--help' || name === 'help') { stdout.write(usage()); return 0; }
    const cmd = COMMANDS[name];
    if (!cmd) throw new Refusal(`unknown command ${name}; run cairn --help`);
    // withLoop (lib/cycle.mjs) already runs the preflight scope check for a STATE_CHANGING
    // command (it wraps runWithPreflight itself) and settles the administrative-cycle counter
    // after the command completes; a non-STATE_CHANGING command (wake, show, lint, recover, ...)
    // runs directly, with no preflight and no settle, exactly as plan 07 already dispatched it.
    const code = STATE_CHANGING.has(name)
      ? await withLoop(cwd, name, () => cmd.run(args, { cwd, stdout, stderr, ...inject }))
      : await cmd.run(args, { cwd, stdout, stderr, ...inject });
    return code ?? 0;
  } catch (e) {
    if (e instanceof NoVerdict) { stdout.write(`cairn: ${e.message}\n`); return 3; }
    // Fix round 1 item 9: guard against doubling an existing "cairn: " prefix (e.g. scope.mjs's
    // ScopeError, whose message already carries one) instead of prepending unconditionally; a
    // message with no prefix (Refusal and friends) is unaffected.
    const msg = e.message.split('\n')[0];
    stderr.write(msg.startsWith('cairn: ') ? `${msg}\n` : `cairn: ${msg}\n`);
    return 1;
  }
}
