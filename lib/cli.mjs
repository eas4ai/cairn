import { git, readRef, catCommit } from './gitx.mjs';
import { decodeRecord, SCHEMAS, obj, LOG_REF } from './records.mjs';
import { readSnapshot, SNAPSHOTS_REF } from './snapshots.mjs';
import { lint, SPEC_DIR } from './spec.mjs';

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
export const COMMANDS = { show: { usage: 'show <sha>', run: show }, lint: { usage: 'lint docs/spec', run: lintCommand } };
export function usage() {
  return ['usage: cairn <command> [args]', '', ...Object.values(COMMANDS).map((c) => `  cairn ${c.usage}`), '  cairn --help', ''].join('\n');
}
export async function main(argv, { cwd = process.cwd(), stdout = process.stdout, stderr = process.stderr } = {}) {
  const [name, ...args] = argv;
  try {
    if (!name || name === '--help' || name === 'help') { stdout.write(usage()); return 0; }
    const cmd = COMMANDS[name];
    if (!cmd) throw new Refusal(`unknown command ${name}; run cairn --help`);
    await cmd.run(args, { cwd, stdout, stderr });
    return 0;
  } catch (e) {
    if (e instanceof NoVerdict) { stdout.write(`cairn: ${e.message}\n`); return 3; }
    stderr.write(`cairn: ${e.message.split('\n')[0]}\n`);
    return 1;
  }
}
