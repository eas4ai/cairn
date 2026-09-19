import { git, readRef, catCommit } from './gitx.mjs';
import { decodeRecord, SCHEMAS, obj, LOG_REF } from './records.mjs';
import { readSnapshot, SNAPSHOTS_REF } from './snapshots.mjs';
import { lint, SPEC_DIR } from './spec.mjs';
import { runInit } from './init.mjs';
import { runAuthorize, runDecisionsRead } from './auth.mjs';
import { runRecover } from './tx.mjs';
import { runBegin, runEnd, readLease, touchOutcome } from './lease.mjs';
import { applyTouch } from './mechanisms.mjs';

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
async function endCommand(args, ctx) {
  const io = toLineIo(ctx);
  const lease = await readLease(ctx.cwd);
  const code = await runEnd(args, io);
  if (code === 0 && lease) {
    const outcome = await touchOutcome(ctx.cwd, lease);
    const result = await applyTouch(ctx.cwd, lease, outcome);
    for (const u of result.unclaimed) io.stdout(`cairn: touch ${u.path} not written: ${u.reason}`);
  }
  return code;
}
async function decisionsCommand(args, ctx) {
  if (args.includes('--read')) return runDecisionsRead(args, toLineIo(ctx));
  // Fix round 1, item 10: this message used to start with the word "cairn" itself, and main()'s
  // catch below always adds its own "cairn: " prefix, so the printed line read "cairn: cairn
  // decisions: ...". Every other Refusal message in this file is plain for the same reason; this one
  // now matches them.
  throw new Refusal('decisions needs --read <id>');
}
export const COMMANDS = {
  show: { usage: 'show <sha>', run: show },
  lint: { usage: 'lint docs/spec', run: lintCommand },
  init: { usage: 'init', run: initCommand },
  authorize: { usage: 'authorize', run: authorizeCommand },
  decisions: { usage: 'decisions --read <id>', run: decisionsCommand },
  recover: { usage: 'recover <transaction>', run: recoverCommand },
  begin: { usage: 'begin <action> <target> [--touch <path>]...', run: beginCommand },
  end: { usage: 'end', run: endCommand },
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
    const code = await cmd.run(args, { cwd, stdout, stderr, ...inject });
    return code ?? 0;
  } catch (e) {
    if (e instanceof NoVerdict) { stdout.write(`cairn: ${e.message}\n`); return 3; }
    stderr.write(`cairn: ${e.message.split('\n')[0]}\n`);
    return 1;
  }
}
