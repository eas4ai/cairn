// lib/review.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import { appendRecord, readLog, chainStart } from './records.mjs';
import { writeWorkspaceSnapshot, writeWorkspaceSnapshotFromTree, readSnapshot, listPaths, refuseSensitive, ALWAYS_EXCLUDED } from './snapshots.mjs';
import { readMechanisms } from './mechanisms.mjs';
import { resetOnProgress, BOUNDS, writeCycleEscalation, acceptanceRounds } from './cycle.mjs';
import { openRange, disputes, unanswered, escalate, validateDraft } from './escalate.mjs';
import { canonicalize, sha256 } from './canon.mjs';
import { listTree, git, treeIdentityReadOnly, writeTreeFromPaths } from './gitx.mjs';
import { matchGlob, CREDENTIAL_PATTERNS } from './paths.mjs';
import { layoutOf, isOutputPath } from './layout.mjs';
import os from 'node:os';
import { loadSettings } from './settings.mjs';
import { parseDomainFile, parseRoadmap } from './spec.mjs';
import { HARNESS_ENV } from './auth.mjs';
import { atSnapshot } from './scope.mjs';

export class ReviewError extends Error {}
export const QUESTIONS = { mechanism: ['Q1', 'Q2'], requirement: ['Q3', 'Q4'], commitment: ['Q5', 'Q6'] };
export function sessionIdentity(env = process.env) { return env.SUDUS_SESSION ?? env.CLAUDE_SESSION_ID ?? null; }
const nonEmpty = (s) => typeof s === 'string' && s.trim() !== '';

// Fix round 1 item 3 (Important): a read-only counterpart to writeWorkspaceSnapshot's own tree
// computation, for every place this module needs the current workspace's tree purely to compare
// against an already-recorded snapshot, never to create a new one. lib/gitx.mjs's
// treeIdentityReadOnly (plan 08's fix for the same class of defect in wake's currency check,
// commit b54b893c) produces the exact tree sha writeWorkspaceSnapshot would, without writing a
// Git object or advancing refs/sudus/snapshots.
async function currentWorkspaceTree(cwd, settings) {
  const { tracked, untracked } = await listPaths(cwd);
  refuseSensitive(untracked, settings.network_exclude ?? []);
  return treeIdentityReadOnly(cwd, { paths: [...tracked, ...untracked], exclude: ALWAYS_EXCLUDED });
}

export async function targets(cwd, log, slug) {
  const r = openRange(log, slug);
  const requirements = r.start.payload.requirements.map((q) => q.requirement);
  const all = await readMechanisms(cwd);
  const mechanisms = Object.keys(all).filter((m) => all[m].definition.requirements.some((q) => requirements.includes(q))).sort();
  return { slug, start: r.start, range: r, requirements, mechanisms };
}

export function requiredPairs(t) {
  return [
    ...t.mechanisms.flatMap((m) => QUESTIONS.mechanism.map((q) => [q, m])),
    ...t.requirements.flatMap((x) => QUESTIONS.requirement.map((q) => [q, x])),
    ...QUESTIONS.commitment.map((q) => [q, t.slug]),
  ];
}

export function checkAnswers(answers, t) {
  if (!Array.isArray(answers)) throw new ReviewError('sudus: review: answers must be a list');
  const seen = new Set();
  for (const a of answers) {
    if (!a || Object.keys(a).sort().join(',') !== 'question,status,target,text') throw new ReviewError('sudus: review: answer keys are question, target, status, text');
    if (!requiredPairs(t).some(([q, x]) => q === a.question && x === a.target)) throw new ReviewError(`sudus: review: ${a.target} is not a target of ${t.slug} for ${a.question}`);
    if (a.status !== 'observed' && a.status !== 'not-checked') throw new ReviewError(`sudus: review: ${a.target} ${a.question} status must be observed or not-checked`);
    if (typeof a.text !== 'string') throw new ReviewError(`sudus: review: ${a.target} ${a.question} text must be a string`);
    if (a.status === 'observed' && !nonEmpty(a.text)) throw new ReviewError(`sudus: review: ${a.target} ${a.question} observed needs text: a command, path or output`);
    const key = `${a.question} ${a.target}`;
    if (seen.has(key)) throw new ReviewError(`sudus: review: ${key} answered twice`);
    seen.add(key);
  }
  for (const [q, x] of requiredPairs(t)) if (!seen.has(`${q} ${x}`)) throw new ReviewError(`sudus: review: ${x} ${q} has no answer`);
  return answers;
}

export function checkFindings(findings) {
  if (!Array.isArray(findings)) throw new ReviewError('sudus: findings must be a list');
  findings.forEach((f, i) => {
    if (!f || Object.keys(f).sort().join(',') !== 'n,text' || f.n !== i + 1 || !nonEmpty(f.text)) throw new ReviewError('sudus: findings must be numbered 1, 2, ... each with text');
  });
  return findings;
}

export async function review(cwd, slug, submission, opts = {}) {
  const log = await readLog(cwd);
  const t = await targets(cwd, log, slug);
  // Review of 3.8.2: a second review after the report made wake name `report` for it forever,
  // while report refuses a second report. After the report, fixes get resolutions (section 9).
  const reported = t.range.records.find((r) => r.kind === 'report');
  if (reported) throw new ReviewError(`sudus: ${slug} has a report; a change after it gets a resolution (sudus resolve), not a new review`);
  const { examined } = submission;
  if (!Array.isArray(examined) || examined.length === 0 || !examined.every(nonEmpty)) throw new ReviewError('sudus: review: examined needs at least one entry');
  const answers = checkAnswers(submission.answers, t);
  const findings = checkFindings(submission.findings ?? []);
  const snapshot = await writeWorkspaceSnapshot(cwd);
  const sha = await appendRecord(cwd, 'review', slug, { slug, session: sessionIdentity(opts.env), snapshot, examined, answers, findings });
  await resetOnProgress(cwd); // the loop advanced from implementation to review: semantic progress
  return sha;
}

// lib/review.mjs (append)
// Fix round 1 item 5 (Minor): goes through lib/gitx.mjs's own git() (spawn-based, LC_ALL pinned,
// its stdout accumulated with no size cap) instead of a duplicate execFile spawn with a
// hard-coded 256MB maxBuffer; a blob larger than that cap used to crash with a raw Node
// ERR_CHILD_PROCESS_STDIO_MAXBUFFER instead of a clean `sudus: ` refusal on failure.
//
// Fix round 2 new finding 2 (Minor): git()'s stdout accumulation has no cap of its own (that was
// the point of the item 5 fix above), but git() eagerly builds a UTF-8 string from the whole
// buffer for its own `stdout` field; a blob near or above Node's MAX_STRING_LENGTH (512 MiB) made
// that string build throw ERR_STRING_TOO_LONG synchronously inside the child's close listener --
// an uncaught exception, not a promise rejection, so no `sudus: ` line was ever printed. The size
// is checked with `git cat-file -s` before any bytes are read, so an oversize blob is refused
// cleanly instead of reaching that string build at all. 256 MiB is comfortably below the 512 MiB
// Node ceiling and matches the limit this module used before the item 5 fix.
export const MAX_BLOB_BYTES = 256 * 1024 * 1024;
export function checkBlobSize(sha, size) {
  if (size > MAX_BLOB_BYTES) throw new ReviewError(`sudus: brief: blob ${sha} is ${size} bytes, over the ${MAX_BLOB_BYTES} byte limit`);
  return size;
}
export async function catBlob(cwd, sha) {
  const size = Number((await git(['cat-file', '-s', sha], { cwd })).stdout.trim());
  checkBlobSize(sha, size);
  const { raw } = await git(['cat-file', 'blob', sha], { cwd });
  return raw;
}

export function exclusionClass(p, settings) {
  if (p === '.git' || p.startsWith('.git/')) return 'git';
  if (isOutputPath(p)) return 'output';
  if ((settings.network_exclude ?? []).some((g) => matchGlob(g, p))) return 'network_exclude';
  if (CREDENTIAL_PATTERNS.some((g) => matchGlob(g, p))) return 'credential';
  return null;
}

function checkLink(p, target) {
  if (target.startsWith('/') || target.startsWith('~')) throw new ReviewError(`sudus: brief: absolute symlink at ${p}`);
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(p), target));
  if (resolved === '..' || resolved.startsWith('../')) throw new ReviewError(`sudus: brief: out-of-tree symlink at ${p}`);
}

// `omitted` names tracked paths the tree never held: a workspace snapshot leaves out the output
// directory (ALWAYS_EXCLUDED), so a tracked file under it reaches the manifest only this way.
export async function project(cwd, settings, treeSha, dir, omitted = []) {
  await fs.mkdir(dir, { recursive: true });
  const manifest = { classes: [], paths: [] };
  const included = [];
  for (const e of (await listTree(cwd, treeSha)).sort((a, b) => (a.path < b.path ? -1 : 1))) {
    const cls = exclusionClass(e.path, settings);
    if (cls) { manifest.paths.push({ path: e.path, class: cls }); continue; }
    if (e.mode === '160000') throw new ReviewError(`sudus: brief: unresolved gitlink at ${e.path}`);
    if (!['100644', '100755', '120000'].includes(e.mode)) throw new ReviewError(`sudus: brief: special file at ${e.path}`);
    const bytes = await catBlob(cwd, e.sha);
    const out = path.join(dir, ...e.path.split('/'));
    await fs.mkdir(path.dirname(out), { recursive: true });
    if (e.mode === '120000') { const target = bytes.toString('utf8'); checkLink(e.path, target); await fs.symlink(target, out); }
    else await fs.writeFile(out, bytes, { mode: e.mode === '100755' ? 0o755 : 0o644 });
    included.push([e.path, e.mode, e.sha]);
  }
  // Issue #25: the adversary could not tell a tracked output file from a missing one.
  for (const p of omitted) if (!manifest.paths.some((x) => x.path === p)) manifest.paths.push({ path: p, class: exclusionClass(p, settings) ?? 'output' });
  manifest.paths.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  manifest.classes = [...new Set(manifest.paths.map((p) => p.class))].sort();
  return { projectionDigest: sha256(canonicalize(included)), manifest, exclusionsDigest: sha256(canonicalize(manifest)), included };
}

// lib/review.mjs (append)
// HARNESS_ENV moved to lib/auth.mjs (attested evidence needs the same harness detection this
// module's own detectHarness already used) and is re-exported here so every existing importer of
// it from lib/review.mjs keeps working.
export { HARNESS_ENV };
export const CONFINES = { claude_code: false, codex: false, muse: false };

// Fix round 1 item 4 (Minor, spec-binding): section 9 says "A null or unknown entry means any
// model, subject to the projection boundary." A harness absent from settings.harness entirely is
// no longer refused; it resolves the same way an explicit `null` entry does, to no pinned model or
// transport. This is a deviation from this plan's own Task 3 test, which asserted the refusal; the
// spec is the binding authority (recorded in the fix round 1 report).
export function detectHarness(settings, { harness, env = process.env } = {}) {
  const name = harness ?? env.SUDUS_HARNESS ?? (HARNESS_ENV.find(([v]) => env[v]) ?? [])[1];
  if (!name) throw new ReviewError('sudus: brief: no harness detected; pass --harness <name>');
  const entry = (settings.harness && settings.harness[name]) ?? {};
  return { name, model: entry.adversary_model ?? null, transport: entry.adversary_transport ?? null, boundary: CONFINES[name] ? 'enforced' : 'unenforced' };
}

// -z: without it git C-quotes a path with non-ASCII or special bytes ("src/api/caf\303\251.mjs"),
// which no interfaces glob matches, so a changed interface silently lost its obligation (review of
// 3.5.0). With -z each status and path is its own NUL-terminated field, unquoted.
export async function diffTree(cwd, fromTree, toTree) {
  const { stdout } = await git(['diff-tree', '-r', '-z', '--name-status', '--no-renames', fromTree, toTree], { cwd });
  const fields = stdout.split('\0').filter((f, i, all) => i < all.length - 1 || f !== '');
  const out = [];
  for (let i = 0; i + 1 < fields.length; i += 2) out.push({ status: fields[i], path: fields[i + 1] });
  return out.sort((a, b) => (a.path < b.path ? -1 : 1));
}

export async function interfaceObligations(cwd, settings, fromWs, toWs) {
  const a = await readSnapshot(cwd, fromWs, 'workspace'), b = await readSnapshot(cwd, toWs, 'workspace');
  return (await diffTree(cwd, a.tree, b.tree)).map((d) => d.path).filter((p) => (settings.interfaces ?? []).some((g) => matchGlob(g, p)));
}

async function specBlocks(cwd, entries, ids) {
  const out = [];
  for (const e of entries) {
    if (!e.path.startsWith('docs/spec/') || !e.path.endsWith('.md')) continue;
    for (const b of parseDomainFile((await catBlob(cwd, e.sha)).toString('utf8')).blocks) if (ids.includes(b.id)) out.push(b);
  }
  return out.sort((x, y) => (x.id < y.id ? -1 : 1));
}

// Fix round 1 item 7 (Minor): matches the slug against lib/spec.mjs's own roadmap parser (its
// `sections` map is keyed by the exact heading text, `head[1]` from `/^#+\s+(.+?)\s*$/`), instead
// of a substring test on raw heading lines. A heading whose title merely contains the slug as a
// substring (e.g. "## first-pass (abandoned)" above "## first") no longer wins.
export function roadmapSection(text, slug) {
  const { sections } = parseRoadmap(text);
  if (!(slug in sections)) return '';
  const lines = text.split('\n');
  const i = sections[slug].line - 1;
  const j = lines.findIndex((l, k) => k > i && /^#+\s/.test(l));
  return lines.slice(i, j < 0 ? undefined : j).join('\n').trim();
}

const kindOf = (q) => (q < 'Q3' ? 'mechanism' : q < 'Q5' ? 'requirement' : 'commitment');

export function renderBrief({ slug, roadmap, blocks, mechanisms, rev, obligations, changed = [], carriedFrom = null, manifest, launch, pairs = [], projectionDigest = null, rules = [] }) {
  const L = [`# Adversary brief: ${slug}`, '', '## Roadmap section', roadmap, '', '## Frozen requirements and falsifiers'];
  for (const b of blocks) L.push(`[${b.id}] ${b.obligation}`, `Falsifier: ${b.falsifier}`, '');
  L.push('## Mechanism definitions');
  for (const [name, m] of Object.entries(mechanisms)) L.push(`${name}: ${JSON.stringify(m.definition)}`);
  L.push('', '## Builder claims');
  for (const a of rev.answers) L.push(`${kindOf(a.question)} ${a.target} ${a.question} ${a.status}: ${a.text}`);
  L.push('', '## Builder findings');
  for (const f of rev.findings) L.push(`${f.n}. ${f.text}`);
  L.push('', '## Interface obligations', ...obligations);
  // The projection has no history, so Q4 ("what else the change touched that no check covers")
  // was unanswerable from it: the adversary could only restate the builder's claim. The name-
  // status diff from the start snapshot to the reviewed one is the commitment's whole footprint;
  // paths only, never contents, so an excluded path is named here exactly as the manifest names it.
  // A successor carries the work of the commitments it superseded, so its footprint starts at the
  // first start of the chain (issue #8), and the heading names that start.
  const from = carriedFrom ? `start snapshot of ${carriedFrom}, whose work ${slug} carries through a supersede,` : 'start snapshot';
  L.push('', `## Changed paths (${from} to reviewed snapshot; A added, M modified, D deleted)`, ...changed.map((d) => `${d.status} ${d.path}`));
  L.push('', '## Exclusion manifest (classes and paths, never contents)');
  for (const p of manifest.paths) L.push(`${p.class} ${p.path}`);
  L.push('', '## Boundary', `Harness ${launch.name}, model ${launch.model ?? 'any'}, transport ${launch.transport ?? 'any'}.`,
    `You may read only the projection directory. Boundary: ${launch.boundary}.`,
    'This projection omits network_exclude and credential paths. It is an egress boundary, not an information-flow proof: it cannot detect a secret a person or primary coding agent copied into ordinary prose, and it does not govern Git pushes.',
    // Issue #13: the host's limits (parallel jobs, a separate build directory, paths to stay out
    // of) come from settings.adversary_rules, so they are part of the recorded brief instead of an
    // edit to it.
    ...(rules.length ? ['', '## Host rules', 'The machine you run on sets these limits; keep to them in every experiment.', ...rules.map((r) => `- ${r}`)] : []),
    '', '## Your work', 'For each mechanism (Q1, Q2): try to make it pass without the behavior, make it fail for a setup reason, and find an input it reads but does not declare. For each Q3: try to reach the falsifier with an input. For each Q4: compare the changed paths above with the claim and find touched paths it omitted. For Q5 and Q6: look where the builder said not to. Every interface obligation gets a caller-level attempt. Write one attempt per question and target, one per interface path, and number your findings from 1.', '');
  // Issue #13: the brief is the adversary's entire prompt, and it never said what file sudus report
  // accepts, so the builder had to rewrite the adversary's output. The report's exact shape, this
  // brief's projection digest and every required pair, spelled as the report checks them, follow.
  L.push('## Report',
    'Write your report as one JSON file and give back its path; it goes to `sudus report` unchanged. It is an object with exactly these fields:',
    `- "projection_digest": "${projectionDigest}"`,
    '- "model": the model you actually ran as, and "transport": "local" or "remote", the one you actually ran over',
    '- "attempts": one {"question", "target", "text"} for each pair below, spelled exactly as written; "text" says what you tried and what happened',
    ...pairs.map(([q, x]) => `  ${q} ${x}`),
    `- "interface_attempts": one {"path", "text"} for each path below, each a JSON string to copy as it is${obligations.length ? '' : ' (none: write [])'}`,
    ...obligations.map((p) => `  ${JSON.stringify(p)}`),
    '- "findings": [{"n": 1, "text": "..."}, ...], numbered from 1 in order, or [] when you found nothing', '');
  return L.join('\n');
}

export async function brief(cwd, slug, opts = {}) {
  const { settings } = await loadSettings(cwd);
  const log = await readLog(cwd);
  const t = await targets(cwd, log, slug);
  const rev = t.range.records.filter((r) => r.kind === 'review').at(-1);
  if (!rev) throw new ReviewError(`sudus: no review for ${slug}`);
  const launch = detectHarness(settings, opts);
  const snap = await readSnapshot(cwd, rev.payload.snapshot, 'workspace');
  const dir = opts.dir ?? await fs.mkdtemp(path.join(os.tmpdir(), `sudus-projection-${slug}-`));
  const { tracked } = await listPaths(cwd);
  const omitted = tracked.filter((p) => ALWAYS_EXCLUDED.some((x) => p === x || p.startsWith(`${x}/`)));
  const proj = await project(cwd, settings, snap.tree, dir, omitted);
  const entries = await listTree(cwd, snap.tree);
  const roadmapEntry = entries.find((e) => e.path === 'docs/spec/roadmap.md');
  const all = await readMechanisms(cwd);
  const base = chainStart(log, t.start);
  const text = renderBrief({
    slug, roadmap: roadmapEntry ? roadmapSection((await catBlob(cwd, roadmapEntry.sha)).toString('utf8'), slug) : '',
    blocks: await specBlocks(cwd, entries, t.requirements), mechanisms: Object.fromEntries(t.mechanisms.map((m) => [m, all[m]])),
    rev: rev.payload, obligations: await interfaceObligations(cwd, settings, base.payload.snapshot, rev.payload.snapshot),
    changed: await diffTree(cwd, (await readSnapshot(cwd, base.payload.snapshot, 'workspace')).tree, snap.tree),
    carriedFrom: base === t.start ? null : base.payload.slug, manifest: proj.manifest, launch,
    pairs: requiredPairs(t), projectionDigest: proj.projectionDigest, rules: settings.adversary_rules ?? [],
  });
  const payloadDigest = sha256(text);
  const sha = await appendRecord(cwd, 'brief', slug, {
    slug, review: rev.sha, harness: launch.name, model: launch.model, transport: launch.transport, boundary: launch.boundary,
    projection_digest: proj.projectionDigest, payload_digest: payloadDigest, exclusions_digest: proj.exclusionsDigest,
  });
  const briefPath = path.join(cwd, layoutOf(cwd).output, `brief-${payloadDigest.slice(7)}.md`);
  await fs.mkdir(path.dirname(briefPath), { recursive: true });
  await fs.writeFile(briefPath, text);
  const any = (v) => v ?? 'any';
  const launchText = [`sudus: brief ${slug} ${sha}`, `brief: ${briefPath}`, `brief digest: ${payloadDigest}`, `projection: ${dir}`, `projection digest: ${proj.projectionDigest}`,
    `harness: ${launch.name}`, `model: ${any(launch.model)}`, `transport: ${any(launch.transport)}`, `boundary: ${launch.boundary}`,
    `start: in ${launch.name}, start a fresh adversary with model ${any(launch.model)} over ${any(launch.transport)}, working directory ${dir}, with the file ${briefPath} as its entire prompt; when it finishes, run: sudus report ${slug} --file <its report>`, ''].join('\n');
  return { sha, projectionDir: dir, briefPath, launch: launchText, text };
}

// lib/review.mjs (append)
export function checkAttempts(attempts, t) {
  if (!Array.isArray(attempts)) throw new ReviewError('sudus: report: attempts must be a list');
  const seen = new Set();
  for (const a of attempts) {
    if (!a || Object.keys(a).sort().join(',') !== 'question,target,text' || !nonEmpty(a.text)) throw new ReviewError('sudus: report: an attempt is {question, target, text} with text');
    if (!requiredPairs(t).some(([q, x]) => q === a.question && x === a.target)) throw new ReviewError(`sudus: report: ${a.target} is not a target of ${t.slug} for ${a.question}`);
    // Fix round 1 item 6 (Minor): mirrors checkAnswers' "answered twice" refusal (above) -- a
    // duplicate (question, target) pair used to be silently accepted here, so a report's attempt
    // list could carry duplicates.
    const key = `${a.question} ${a.target}`;
    if (seen.has(key)) throw new ReviewError(`sudus: report: ${key} attempted twice`);
    seen.add(key);
  }
  for (const [q, x] of requiredPairs(t)) if (!seen.has(`${q} ${x}`)) throw new ReviewError(`sudus: report: ${x} ${q} has no attempt`);
  return attempts;
}

export function checkInterfaceAttempts(list, obligations) {
  if (!Array.isArray(list) || !list.every((x) => x && Object.keys(x).sort().join(',') === 'path,text' && nonEmpty(x.text))) throw new ReviewError('sudus: report: an interface attempt is {path, text} with text');
  for (const p of obligations) if (!list.some((x) => x.path === p)) throw new ReviewError(`sudus: report: interface ${p} has no attempt`);
  return list;
}

export async function report(cwd, slug, body, opts = {}) {
  const { settings } = await loadSettings(cwd);
  const log = await readLog(cwd);
  const t = await targets(cwd, log, slug);
  const prior = t.range.records.find((r) => r.kind === 'report');
  if (prior) throw new ReviewError(`sudus: one report per commitment; ${slug} has ${prior.sha}`);
  const rev = t.range.records.filter((r) => r.kind === 'review').at(-1);
  const br = t.range.records.filter((r) => r.kind === 'brief').at(-1);
  if (!rev || !br) throw new ReviewError(`sudus: ${slug} needs a review and a brief before a report`);
  if (br.payload.review !== rev.sha) throw new ReviewError(`sudus: brief ${br.sha} is stale: the review is ${rev.sha}`);
  if (body.projection_digest !== br.payload.projection_digest) throw new ReviewError('sudus: report: projection digest does not match the brief');
  // Fix round 1 item 3 (Important): report() writes no record whose snapshot is a fresh one (its
  // own `snapshot` field below is the review's already-recorded one), so the comparison tree only
  // ever needs to be read, never written and never advancing refs/sudus/snapshots.
  const nowTree = await currentWorkspaceTree(cwd, settings), then = await readSnapshot(cwd, rev.payload.snapshot, 'workspace');
  if (nowTree !== then.tree && !(await atSnapshot(cwd, then.tree))) throw new ReviewError('sudus: report: the workspace differs from the reviewed snapshot');
  // Fix round 1 item 1 (Critical): the launch instruction comes from the brief record sudus brief
  // itself wrote, never re-derived from a harness name the report body supplies -- that let any
  // report escape the model/transport check by naming a harness whose settings entry pins nothing.
  // The body may still carry a harness field (informational, or the harness's own self-report);
  // when present it is checked against the brief's, never used to look anything up.
  const launch = { name: br.payload.harness, model: br.payload.model, transport: br.payload.transport, boundary: br.payload.boundary };
  if (body.harness !== undefined && body.harness !== null && body.harness !== launch.name) throw new ReviewError(`sudus: report: harness ${body.harness} does not match the brief's ${launch.name}`);
  // The brief's `any` means the adversary may run as any model over either transport; the report
  // still records which ones it actually ran as, so `any` is never a report value.
  if (typeof body.model !== 'string' || body.model === '' || body.model === 'any') throw new ReviewError('sudus: report: model is the model the adversary actually ran as; the brief\'s any accepts any name but is not one');
  if (body.transport !== 'local' && body.transport !== 'remote') throw new ReviewError('sudus: report: transport is the one the adversary actually ran over, local or remote; the brief\'s any accepts either but is not one');
  if (launch.model !== null && body.model !== launch.model) throw new ReviewError(`sudus: report: model ${body.model} does not match the launch instruction ${launch.model}`);
  if (launch.transport !== null && body.transport !== launch.transport) throw new ReviewError(`sudus: report: transport ${body.transport} does not match the launch instruction ${launch.transport}`);
  const session = body.session ?? null;
  if (rev.payload.session !== null && session === rev.payload.session) throw new ReviewError(`sudus: report: session ${session} wrote the review`);
  const attempts = checkAttempts(body.attempts ?? [], t);
  const obligations = await interfaceObligations(cwd, settings, chainStart(log, t.start).payload.snapshot, rev.payload.snapshot);
  const interface_attempts = checkInterfaceAttempts(body.interface_attempts ?? [], obligations);
  const findings = checkFindings(body.findings ?? []);
  const sha = await appendRecord(cwd, 'report', slug, {
    slug, session, snapshot: rev.payload.snapshot, brief: br.sha, model: body.model, transport: body.transport, boundary: launch.boundary,
    builder_model: body.builder_model ?? null, projection_digest: body.projection_digest, attempts, findings, interface_attempts,
  });
  await resetOnProgress(cwd);
  return sha;
}

// lib/review.mjs (append)
const FINDING_KINDS = ['review', 'report', 'acceptance'];

// Finding-bearing records a supersession carried into this range: "Unanswered escalations,
// unresolved findings and unfixed defect items carry" (spec, supersession). They sit before the
// successor's start, so the range alone never saw them and Done was reachable with them open.
export function carriedFindingSources(log, r) {
  const carried = new Set(log.filter((x) => x.kind === 'superseded').flatMap((x) => x.payload.carried));
  const inRange = new Set(r.records.map((x) => x.sha));
  return log.filter((x) => carried.has(x.sha) && FINDING_KINDS.includes(x.kind) && !inRange.has(x.sha));
}
export function ledger(log, slug) {
  const r = openRange(log, slug);
  const carried = carriedFindingSources(log, r);
  const accs = log.filter((x) => x.kind === 'acceptance');
  const verdictOf = (res) => {
    const a = accs.find((x) => x.payload.accepted.some((v) => v.resolution === res.sha) || x.payload.rejected.some((v) => v.resolution === res.sha));
    return !a ? 'submitted' : a.payload.accepted.some((v) => v.resolution === res.sha) ? 'accepted' : 'rejected';
  };
  const out = [];
  for (const src of [...carried, ...r.records.filter((x) => FINDING_KINDS.includes(x.kind))]) {
    for (const f of src.payload.findings) {
      const resolutions = log.filter((x) => x.kind === 'resolution' && x.payload.source === src.sha && x.payload.finding === f.n);
      const verdicts = resolutions.map(verdictOf);
      const status = disputes(log, src.sha, f.n) ? 'disputed' : verdicts.includes('accepted') ? 'resolved' : verdicts.at(-1) === 'submitted' ? 'submitted' : verdicts.at(-1) === 'rejected' ? 'rejected' : 'open';
      out.push({ source: src.sha, kind: src.kind, n: f.n, text: f.text, status, resolutions, rejections: verdicts.filter((v) => v === 'rejected').length });
    }
  }
  return out;
}

// Issue #23: the findings the acceptance-round escalation names (lib/cycle.mjs), so the
// developer's ok on it closes them. A finding another unanswered escalation names is left to it.
export function openFindingConcerns(log, slug) {
  const held = new Set(unanswered(log).flatMap((e) => e.payload.concerns.split(' ')));
  return ledger(log, slug).filter((f) => f.status === 'open' || f.status === 'rejected')
    .map((f) => ({ token: `finding:${f.source}#${f.n}`, n: f.n, kind: f.kind, source: f.source }))
    .filter((f) => !held.has(f.token));
}

// The escalation drafts for the findings this acceptance rejects a second time, each a function
// of the acceptance's own sha, which the text quotes. Only the acceptance that rejects a finding
// the second time escalates it; a later acceptance judging other resolutions does not.
function rejectedTwiceDrafts(log, slug, rejected) {
  // Issue #21: a reason may span lines, and an escalation field is one line.
  const oneLine = (text) => text.replace(/[\s\x00-\x1f\x7f-\x9f]+/g, ' ').trim();
  const now = (res) => rejected.find((v) => v.resolution === res.sha);
  return ledger(log, slug).filter((f) => f.status === 'submitted' && f.rejections === 1 && now(f.resolutions.at(-1))).map((f) => (acceptance) => {
    // Issue #18: the reasons are this finding's own rejections, each with its acceptance; the
    // latest acceptance's rejections can be other findings', and hold only the second one.
    const reasons = f.resolutions.flatMap((res) => {
      const a = log.find((x) => x.kind === 'acceptance' && x.payload.rejected.some((v) => v.resolution === res.sha));
      if (a) return [`${oneLine(a.payload.rejected.find((v) => v.resolution === res.sha).reason)} (acceptance ${a.sha})`];
      return now(res) ? [`${oneLine(now(res).reason)} (acceptance ${acceptance})`] : [];
    });
    return {
      commitment: slug, concerns: [`finding:${f.source}#${f.n}`],
      question: `Finding ${f.n} on the ${f.kind} was rejected twice; does the developer rule on it?`,
      // Issue #20: ok closes the finding (lib/escalate.mjs disputes), so the recommendation is that
      // one ruling; the finding standing is the instead answer, which leaves it open.
      recommendation: `Close finding ${f.n} as answered: Done stops waiting on an accepted fix for it.`,
      because: `The adversary rejected it twice: ${reasons.join('; ')}.`,
      if_wrong: `The defect finding ${f.n} names ships unfixed.`,
      instead: 'Answer instead with the approach the next fix takes; the finding stays open, and the agent resolves it again.',
      options: [], named_paths: [], cited_decisions: [],
    };
  });
}

export async function resolve(cwd, slug, n, explanation, opts = {}) {
  if (!nonEmpty(explanation)) throw new ReviewError('sudus: resolve: explanation needs text');
  const log = await readLog(cwd);
  const all = ledger(log, slug).filter((f) => f.n === n && (!opts.source || f.source === opts.source));
  const submitted = all.find((f) => f.status === 'submitted');
  if (submitted) throw new ReviewError(`sudus: resolve: finding ${n} on ${submitted.source} awaits acceptance`);
  const open = all.filter((f) => f.status === 'open' || f.status === 'rejected');
  if (open.length === 0) {
    const closed = all.find((f) => f.status === 'disputed');
    if (closed) throw new ReviewError(`sudus: resolve: the developer's ok on escalation ${disputes(log, closed.source, n)} closed finding ${n} on ${closed.source}; it takes no resolution`);
    throw new ReviewError(`sudus: resolve: no unresolved finding ${n}${opts.source ? ` on ${opts.source}` : ''}`);
  }
  if (open.length > 1) throw new ReviewError(`sudus: resolve: finding ${n} is on ${open.map((f) => f.source).join(' and ')}; pass --source <sha>`);
  const f = open[0];
  const token = `finding:${f.source}#${n}`;
  const blocked = unanswered(log).find((e) => e.payload.concerns.split(' ').includes(token));
  if (blocked) throw new ReviewError(`sudus: resolve: finding ${n} on ${f.source} is under escalation ${blocked.sha}`);
  const snapshot = await writeWorkspaceSnapshot(cwd);
  return appendRecord(cwd, 'resolution', slug, { source: f.source, finding: n, snapshot, explanation });
}

// lib/review.mjs (append)
const SHA = /^[0-9a-f]{40}$/;

export async function reviewState(cwd, slug) {
  const log = await readLog(cwd);
  const r = openRange(log, slug);
  const rev = r.records.filter((x) => x.kind === 'review').at(-1) ?? null;
  const rep = r.records.find((x) => x.kind === 'report') ?? null;
  const acc = r.records.filter((x) => x.kind === 'acceptance').at(-1) ?? null;
  const l = ledger(log, slug);
  const reasons = [];
  if (!rev) reasons.push('no review');
  if (!rep) reasons.push('no report');
  if (rev && rep && rep.payload.snapshot !== rev.payload.snapshot) reasons.push('the report is not at the reviewed snapshot');
  for (const f of l) if (!['resolved', 'disputed'].includes(f.status)) reasons.push(`finding ${f.n} on ${f.source} is ${f.status}`);
  if (rep) {
    // Fix round 1 item 3 (Important): reviewState is a pure query (section 5's "Wake is
    // read-only" is exactly the property this function must keep once plan 14 hands it to wake,
    // per this plan's own "Left to other plans" note); it must never write a Git object or
    // advance refs/sudus/snapshots merely to answer a question.
    const { settings } = await loadSettings(cwd);
    const currentTree = await currentWorkspaceTree(cwd, settings);
    const moved = async (ws) => { const t = (await readSnapshot(cwd, ws, 'workspace')).tree; return t !== currentTree && !(await atSnapshot(cwd, t)); };
    if (acc) { if (await moved(acc.payload.snapshot)) reasons.push('the latest acceptance is not at the final workspace snapshot'); }
    else if (r.records.some((x) => x.kind === 'resolution') || await moved(rep.payload.snapshot)) reasons.push('no acceptance examines the post-report delta');
  }
  return { review: rev, report: rep, acceptance: acc, ledger: l, ready: reasons.length === 0, reasons };
}

export async function accept(cwd, slug, body, opts = {}) {
  const { settings } = await loadSettings(cwd);
  const log = await readLog(cwd);
  const r = openRange(log, slug);
  const rev = r.records.filter((x) => x.kind === 'review').at(-1);
  const rep = r.records.find((x) => x.kind === 'report');
  if (!rep) throw new ReviewError(`sudus: accept: ${slug} has no report`);
  const judged = new Set(r.records.filter((x) => x.kind === 'acceptance').flatMap((a) => [...a.payload.accepted, ...a.payload.rejected].map((v) => v.resolution)));
  const submitted = r.records.filter((x) => x.kind === 'resolution' && !judged.has(x.sha));
  // Fix round 1 item 3 (Important): every refusal below reads the workspace read-only; accept()
  // writes its one real snapshot (below, once every check has passed) only because its own record
  // genuinely names a new workspace snapshot, unlike report()'s. This early check is a cheap,
  // read-only gate for the common "nothing to do" case (zero writes); it is not the tree the
  // eventual record uses, so a workspace change in this narrow window can only make the gate
  // wrongly not-fire (accept proceeds to the real read below), never write an inconsistent record.
  const gateTree = await currentWorkspaceTree(cwd, settings), reportedAt = await readSnapshot(cwd, rep.payload.snapshot, 'workspace');
  if (submitted.length === 0 && (gateTree === reportedAt.tree || await atSnapshot(cwd, reportedAt.tree))) throw new ReviewError('sudus: accept: nothing submitted since the report and no delta to examine');
  const verdicts = Array.isArray(body.resolutions) ? body.resolutions : [];
  // Deviation from the plan text: the plan's own two loops ran in the order "every submitted
  // resolution has a verdict" then "every given verdict names a submitted resolution", so a verdict
  // for an unknown sha alongside an unjudged real resolution reported the wrong one missing its
  // verdict instead of naming the bogus sha. Task 6's own test asserts /is not a submitted
  // resolution/ for exactly that case (a fabricated 40-hex sha submitted while r1 is still
  // unjudged), so the sha-validity loop runs first and the completeness loop runs after.
  const accepted = [], rejected = [];
  // Fix round 1 item 2 (Important): each submitted resolution gets exactly one verdict. Without
  // this, the same sha could appear in both accepted and rejected (or twice in either list) and
  // write a self-contradictory, never-editable record; ledger()'s verdictOf read it as accepted
  // regardless, so the rejection silently vanished from the count the second-rejection escalation
  // depends on.
  const verdicted = new Set();
  for (const v of verdicts) {
    if (!SHA.test(v.sha ?? '') || !submitted.some((s) => s.sha === v.sha)) throw new ReviewError(`sudus: accept: ${v.sha} is not a submitted resolution`);
    if (verdicted.has(v.sha)) throw new ReviewError(`sudus: accept: ${v.sha} has more than one verdict`);
    verdicted.add(v.sha);
    if (v.verdict === 'accepted') accepted.push({ resolution: v.sha, reason: v.reason ?? '' });
    else if (v.verdict === 'rejected' && nonEmpty(v.reason)) rejected.push({ resolution: v.sha, reason: v.reason });
    else throw new ReviewError(`sudus: accept: rejected ${v.sha} needs a reason; a verdict is accepted or rejected`);
  }
  for (const s of submitted) if (!verdicts.some((v) => v.sha === s.sha)) throw new ReviewError(`sudus: accept: resolution ${s.sha} has no verdict`);
  const session = body.session ?? null;
  if (rev.payload.session !== null && session === rev.payload.session) throw new ReviewError(`sudus: accept: session ${session} wrote the review`);
  const findings = checkFindings(body.findings ?? []);
  // Fix round 2 new finding 1 (Important): every refusal has now run. The previous code read the
  // workspace twice here -- once above (gateTree, read-only, never written) and again inside
  // writeWorkspaceSnapshot, using the *first* read's tree for the delta and the *second* read's
  // tree for the record. A workspace change between those two independent reads could make
  // diffTree crash on a tree object that was never written ("fatal: bad object"), or silently
  // record a delta_digest that disagreed with the snapshot the record actually names. The tree is
  // read exactly once here: writeTreeFromPaths writes the blobs and the tree (so diffTree always
  // has a real object to examine), the same tree feeds the delta and the commit, and nothing
  // between them re-reads the filesystem, so the two can never disagree.
  const { tracked, untracked } = await listPaths(cwd);
  refuseSensitive(untracked, settings.network_exclude ?? []);
  const tree = await writeTreeFromPaths(cwd, { paths: [...tracked, ...untracked], exclude: ALWAYS_EXCLUDED });
  const delta = await diffTree(cwd, reportedAt.tree, tree);
  const snapshot = await writeWorkspaceSnapshotFromTree(cwd, tree);
  // Issue #21: the escalations this acceptance writes are drafted and checked before it is
  // appended, so a draft that cannot be written refuses the acceptance instead of following it.
  const drafts = rejectedTwiceDrafts(log, slug, rejected);
  drafts.forEach((draft) => validateDraft(draft('0'.repeat(40))));
  const sha = await appendRecord(cwd, 'acceptance', slug, { slug, session, report: rep.sha, snapshot, delta_digest: sha256(canonicalize(delta)), accepted, rejected, findings });
  for (const draft of drafts) await escalate(cwd, draft(sha));
  const after = await readLog(cwd);
  const state = await reviewState(cwd, slug);
  if (state.ready) await resetOnProgress(cwd);
  else if (acceptanceRounds(openRange(after, slug).records, after) >= BOUNDS.acceptanceRounds) await writeCycleEscalation(cwd, slug, { kind: 'acceptanceRounds', actionClass: 'accept', target: slug });
  return sha;
}

// lib/review.mjs (append)
function splitFlags(argv) {
  const pos = [], named = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) { named[argv[i].slice(2)] = argv[i + 1]; i++; } else pos.push(argv[i]);
  }
  return { pos, named };
}
async function fileBody(named) {
  if (!named.file) throw new ReviewError('sudus: --file <path> is required');
  return JSON.parse(await fs.readFile(named.file, 'utf8'));
}
const asCli = (fn) => async (cwd, argv, opts = {}) => {
  try { return { code: 0, out: await fn(cwd, splitFlags(argv), opts) }; }
  catch (e) { return { code: 1, out: (e.message.startsWith('sudus: ') ? e.message : `sudus: ${e.message}`) + '\n' }; }
};
export const cliReview = asCli(async (cwd, { pos: [slug], named }, opts) => `sudus: review ${slug} ${await review(cwd, slug, await fileBody(named), opts)}\n`);
export const cliBrief = asCli(async (cwd, { pos: [slug], named }, opts) => (await brief(cwd, slug, { harness: named.harness, env: opts.env })).launch);
export const cliReport = asCli(async (cwd, { pos: [slug], named }, opts) => `sudus: report ${slug} ${await report(cwd, slug, await fileBody(named), opts)}\n`);
// Fix round 1 item 8 (Minor): a missing, non-integer or less-than-1 finding number used to become
// `Number(n)` unchecked (NaN for anything unparsable), reaching the user as the confusing "no
// unresolved finding NaN" instead of a refusal naming the actual bad input.
export const cliResolve = asCli(async (cwd, { pos: [slug, n, ...how], named }) => {
  const num = Number(n);
  if (n === undefined || !Number.isInteger(num) || num < 1) throw new ReviewError(`sudus: resolve: finding number ${n === undefined ? '(none given)' : JSON.stringify(n)} must be a positive integer`);
  return `sudus: resolution ${slug} ${await resolve(cwd, slug, num, how.join(' '), { source: named.source })}\n`;
});
export const cliAccept = asCli(async (cwd, { pos: [slug], named }, opts) => `sudus: acceptance ${slug} ${await accept(cwd, slug, await fileBody(named), opts)}\n`);
