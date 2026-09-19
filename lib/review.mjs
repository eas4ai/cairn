// lib/review.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { appendRecord, readLog } from './records.mjs';
import { writeWorkspaceSnapshot } from './snapshots.mjs';
import { readMechanisms } from './mechanisms.mjs';
import { resetOnProgress, BOUNDS, writeCycleEscalation } from './cycle.mjs';
import { openRange, disputes, unanswered, escalate } from './escalate.mjs';
import { canonicalize, sha256 } from './canon.mjs';
import { listTree, git } from './gitx.mjs';
import { matchGlob, CREDENTIAL_PATTERNS } from './paths.mjs';
import os from 'node:os';
import { readSnapshot } from './snapshots.mjs';
import { loadSettings } from './settings.mjs';
import { parseDomainFile } from './spec.mjs';
const execFileP = promisify(execFile);

export class ReviewError extends Error {}
export const QUESTIONS = { mechanism: ['Q1', 'Q2'], requirement: ['Q3', 'Q4'], commitment: ['Q5', 'Q6'] };
export function sessionIdentity(env = process.env) { return env.CAIRN_SESSION ?? env.CLAUDE_SESSION_ID ?? null; }
const nonEmpty = (s) => typeof s === 'string' && s.trim() !== '';

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
  if (!Array.isArray(answers)) throw new ReviewError('cairn: review: answers must be a list');
  const seen = new Set();
  for (const a of answers) {
    if (!a || Object.keys(a).sort().join(',') !== 'question,status,target,text') throw new ReviewError('cairn: review: answer keys are question, target, status, text');
    if (!requiredPairs(t).some(([q, x]) => q === a.question && x === a.target)) throw new ReviewError(`cairn: review: ${a.target} is not a target of ${t.slug} for ${a.question}`);
    if (a.status !== 'observed' && a.status !== 'not-checked') throw new ReviewError(`cairn: review: ${a.target} ${a.question} status must be observed or not-checked`);
    if (typeof a.text !== 'string') throw new ReviewError(`cairn: review: ${a.target} ${a.question} text must be a string`);
    if (a.status === 'observed' && !nonEmpty(a.text)) throw new ReviewError(`cairn: review: ${a.target} ${a.question} observed needs text: a command, path or output`);
    const key = `${a.question} ${a.target}`;
    if (seen.has(key)) throw new ReviewError(`cairn: review: ${key} answered twice`);
    seen.add(key);
  }
  for (const [q, x] of requiredPairs(t)) if (!seen.has(`${q} ${x}`)) throw new ReviewError(`cairn: review: ${x} ${q} has no answer`);
  return answers;
}

export function checkFindings(findings) {
  if (!Array.isArray(findings)) throw new ReviewError('cairn: findings must be a list');
  findings.forEach((f, i) => {
    if (!f || Object.keys(f).sort().join(',') !== 'n,text' || f.n !== i + 1 || !nonEmpty(f.text)) throw new ReviewError('cairn: findings must be numbered 1, 2, ... each with text');
  });
  return findings;
}

export async function review(cwd, slug, submission, opts = {}) {
  const log = await readLog(cwd);
  const t = await targets(cwd, log, slug);
  const { examined } = submission;
  if (!Array.isArray(examined) || examined.length === 0 || !examined.every(nonEmpty)) throw new ReviewError('cairn: review: examined needs at least one entry');
  const answers = checkAnswers(submission.answers, t);
  const findings = checkFindings(submission.findings ?? []);
  const snapshot = await writeWorkspaceSnapshot(cwd);
  const sha = await appendRecord(cwd, 'review', slug, { slug, session: sessionIdentity(opts.env), snapshot, examined, answers, findings });
  await resetOnProgress(cwd); // the loop advanced from implementation to review: semantic progress
  return sha;
}

// lib/review.mjs (append)
export async function catBlob(cwd, sha) {
  const { stdout } = await execFileP('git', ['cat-file', 'blob', sha], { cwd, encoding: 'buffer', maxBuffer: 256 * 1024 * 1024 });
  return stdout;
}

export function exclusionClass(p, settings) {
  if (p === '.git' || p.startsWith('.git/')) return 'git';
  if (p.startsWith('.cairn/output/')) return 'output';
  if ((settings.network_exclude ?? []).some((g) => matchGlob(g, p))) return 'network_exclude';
  if (CREDENTIAL_PATTERNS.some((g) => matchGlob(g, p))) return 'credential';
  return null;
}

function checkLink(p, target) {
  if (target.startsWith('/') || target.startsWith('~')) throw new ReviewError(`cairn: brief: absolute symlink at ${p}`);
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(p), target));
  if (resolved === '..' || resolved.startsWith('../')) throw new ReviewError(`cairn: brief: out-of-tree symlink at ${p}`);
}

export async function project(cwd, settings, treeSha, dir) {
  await fs.mkdir(dir, { recursive: true });
  const manifest = { classes: [], paths: [] };
  const included = [];
  for (const e of (await listTree(cwd, treeSha)).sort((a, b) => (a.path < b.path ? -1 : 1))) {
    const cls = exclusionClass(e.path, settings);
    if (cls) { manifest.paths.push({ path: e.path, class: cls }); continue; }
    if (e.mode === '160000') throw new ReviewError(`cairn: brief: unresolved gitlink at ${e.path}`);
    if (!['100644', '100755', '120000'].includes(e.mode)) throw new ReviewError(`cairn: brief: special file at ${e.path}`);
    const bytes = await catBlob(cwd, e.sha);
    const out = path.join(dir, ...e.path.split('/'));
    await fs.mkdir(path.dirname(out), { recursive: true });
    if (e.mode === '120000') { const target = bytes.toString('utf8'); checkLink(e.path, target); await fs.symlink(target, out); }
    else await fs.writeFile(out, bytes, { mode: e.mode === '100755' ? 0o755 : 0o644 });
    included.push([e.path, e.mode, e.sha]);
  }
  manifest.classes = [...new Set(manifest.paths.map((p) => p.class))].sort();
  return { projectionDigest: sha256(canonicalize(included)), manifest, exclusionsDigest: sha256(canonicalize(manifest)), included };
}

// lib/review.mjs (append)
export const HARNESS_ENV = [['CLAUDECODE', 'claude_code'], ['CODEX_HOME', 'codex'], ['MUSE_SESSION', 'muse']];
export const CONFINES = { claude_code: false, codex: false, muse: false };

export function detectHarness(settings, { harness, env = process.env } = {}) {
  const name = harness ?? env.CAIRN_HARNESS ?? (HARNESS_ENV.find(([v]) => env[v]) ?? [])[1];
  if (!name) throw new ReviewError('cairn: brief: no harness detected; pass --harness <name>');
  if (!settings.harness || !(name in settings.harness)) throw new ReviewError(`cairn: brief: harness ${name} has no settings entry`);
  const entry = settings.harness[name] ?? {};
  return { name, model: entry.adversary_model ?? null, transport: entry.adversary_transport ?? null, boundary: CONFINES[name] ? 'enforced' : 'unenforced' };
}

export async function diffTree(cwd, fromTree, toTree) {
  const { stdout } = await git(['diff-tree', '-r', '--name-status', '--no-renames', fromTree, toTree], { cwd });
  return stdout.split('\n').filter(Boolean).map((l) => { const [status, p] = l.split('\t'); return { path: p, status }; }).sort((a, b) => (a.path < b.path ? -1 : 1));
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

function roadmapSection(text, slug) {
  const lines = text.split('\n');
  const i = lines.findIndex((l) => /^#+\s/.test(l) && l.includes(slug));
  if (i < 0) return '';
  const j = lines.findIndex((l, k) => k > i && /^#+\s/.test(l));
  return lines.slice(i, j < 0 ? undefined : j).join('\n').trim();
}

const kindOf = (q) => (q < 'Q3' ? 'mechanism' : q < 'Q5' ? 'requirement' : 'commitment');

export function renderBrief({ slug, roadmap, blocks, mechanisms, rev, obligations, manifest, launch }) {
  const L = [`# Adversary brief: ${slug}`, '', '## Roadmap section', roadmap, '', '## Frozen requirements and falsifiers'];
  for (const b of blocks) L.push(`[${b.id}] ${b.obligation}`, `Falsifier: ${b.falsifier}`, '');
  L.push('## Mechanism definitions');
  for (const [name, m] of Object.entries(mechanisms)) L.push(`${name}: ${JSON.stringify(m.definition)}`);
  L.push('', '## Builder claims');
  for (const a of rev.answers) L.push(`${kindOf(a.question)} ${a.target} ${a.question} ${a.status}: ${a.text}`);
  L.push('', '## Builder findings');
  for (const f of rev.findings) L.push(`${f.n}. ${f.text}`);
  L.push('', '## Interface obligations', ...obligations, '', '## Exclusion manifest (classes and paths, never contents)');
  for (const p of manifest.paths) L.push(`${p.class} ${p.path}`);
  L.push('', '## Boundary', `Harness ${launch.name}, model ${launch.model ?? 'any'}, transport ${launch.transport ?? 'any'}.`,
    `You may read only the projection directory. Boundary: ${launch.boundary}.`,
    'This projection omits network_exclude and credential paths. It is an egress boundary, not an information-flow proof: it cannot detect a secret a person or primary coding agent copied into ordinary prose, and it does not govern Git pushes.',
    '', '## Your work', 'For each mechanism (Q1, Q2): try to make it pass without the behavior, make it fail for a setup reason, and find an input it reads but does not declare. For each Q3: try to reach the falsifier with an input. For each Q4: find touched paths the claim omitted. For Q5 and Q6: look where the builder said not to. Every interface obligation gets a caller-level attempt. Write one attempt per question and target, one per interface path, and number your findings from 1.', '');
  return L.join('\n');
}

export async function brief(cwd, slug, opts = {}) {
  const { settings } = await loadSettings(cwd);
  const log = await readLog(cwd);
  const t = await targets(cwd, log, slug);
  const rev = t.range.records.filter((r) => r.kind === 'review').at(-1);
  if (!rev) throw new ReviewError(`cairn: no review for ${slug}`);
  const launch = detectHarness(settings, opts);
  const snap = await readSnapshot(cwd, rev.payload.snapshot, 'workspace');
  const dir = opts.dir ?? await fs.mkdtemp(path.join(os.tmpdir(), `cairn-projection-${slug}-`));
  const proj = await project(cwd, settings, snap.tree, dir);
  const entries = await listTree(cwd, snap.tree);
  const roadmapEntry = entries.find((e) => e.path === 'docs/spec/roadmap.md');
  const all = await readMechanisms(cwd);
  const text = renderBrief({
    slug, roadmap: roadmapEntry ? roadmapSection((await catBlob(cwd, roadmapEntry.sha)).toString('utf8'), slug) : '',
    blocks: await specBlocks(cwd, entries, t.requirements), mechanisms: Object.fromEntries(t.mechanisms.map((m) => [m, all[m]])),
    rev: rev.payload, obligations: await interfaceObligations(cwd, settings, t.start.payload.snapshot, rev.payload.snapshot), manifest: proj.manifest, launch,
  });
  const payloadDigest = sha256(text);
  const sha = await appendRecord(cwd, 'brief', slug, {
    slug, review: rev.sha, harness: launch.name, model: launch.model, transport: launch.transport, boundary: launch.boundary,
    projection_digest: proj.projectionDigest, payload_digest: payloadDigest, exclusions_digest: proj.exclusionsDigest,
  });
  const briefPath = path.join(cwd, '.cairn/output', `brief-${payloadDigest.slice(7)}.md`);
  await fs.mkdir(path.dirname(briefPath), { recursive: true });
  await fs.writeFile(briefPath, text);
  const any = (v) => v ?? 'any';
  const launchText = [`cairn: brief ${slug} ${sha}`, `brief: ${briefPath}`, `brief digest: ${payloadDigest}`, `projection: ${dir}`, `projection digest: ${proj.projectionDigest}`,
    `harness: ${launch.name}`, `model: ${any(launch.model)}`, `transport: ${any(launch.transport)}`, `boundary: ${launch.boundary}`,
    `start: in ${launch.name}, start a fresh adversary with model ${any(launch.model)} over ${any(launch.transport)}, working directory ${dir}, with the file ${briefPath} as its entire prompt; when it finishes, run: cairn report ${slug} --file <its report>`, ''].join('\n');
  return { sha, projectionDir: dir, briefPath, launch: launchText, text };
}

// lib/review.mjs (append)
export function checkAttempts(attempts, t) {
  if (!Array.isArray(attempts)) throw new ReviewError('cairn: report: attempts must be a list');
  const seen = new Set();
  for (const a of attempts) {
    if (!a || Object.keys(a).sort().join(',') !== 'question,target,text' || !nonEmpty(a.text)) throw new ReviewError('cairn: report: an attempt is {question, target, text} with text');
    if (!requiredPairs(t).some(([q, x]) => q === a.question && x === a.target)) throw new ReviewError(`cairn: report: ${a.target} is not a target of ${t.slug} for ${a.question}`);
    seen.add(`${a.question} ${a.target}`);
  }
  for (const [q, x] of requiredPairs(t)) if (!seen.has(`${q} ${x}`)) throw new ReviewError(`cairn: report: ${x} ${q} has no attempt`);
  return attempts;
}

export function checkInterfaceAttempts(list, obligations) {
  if (!Array.isArray(list) || !list.every((x) => x && Object.keys(x).sort().join(',') === 'path,text' && nonEmpty(x.text))) throw new ReviewError('cairn: report: an interface attempt is {path, text} with text');
  for (const p of obligations) if (!list.some((x) => x.path === p)) throw new ReviewError(`cairn: report: interface ${p} has no attempt`);
  return list;
}

export async function report(cwd, slug, body, opts = {}) {
  const { settings } = await loadSettings(cwd);
  const log = await readLog(cwd);
  const t = await targets(cwd, log, slug);
  const prior = t.range.records.find((r) => r.kind === 'report');
  if (prior) throw new ReviewError(`cairn: one report per commitment; ${slug} has ${prior.sha}`);
  const rev = t.range.records.filter((r) => r.kind === 'review').at(-1);
  const br = t.range.records.filter((r) => r.kind === 'brief').at(-1);
  if (!rev || !br) throw new ReviewError(`cairn: ${slug} needs a review and a brief before a report`);
  if (br.payload.review !== rev.sha) throw new ReviewError(`cairn: brief ${br.sha} is stale: the review is ${rev.sha}`);
  if (body.projection_digest !== br.payload.projection_digest) throw new ReviewError('cairn: report: projection digest does not match the brief');
  const now = await readSnapshot(cwd, await writeWorkspaceSnapshot(cwd), 'workspace'), then = await readSnapshot(cwd, rev.payload.snapshot, 'workspace');
  if (now.tree !== then.tree) throw new ReviewError('cairn: report: the workspace differs from the reviewed snapshot');
  // Fix round 1 item 1 (Critical): the launch instruction comes from the brief record cairn brief
  // itself wrote, never re-derived from a harness name the report body supplies -- that let any
  // report escape the model/transport check by naming a harness whose settings entry pins nothing.
  // The body may still carry a harness field (informational, or the harness's own self-report);
  // when present it is checked against the brief's, never used to look anything up.
  const launch = { name: br.payload.harness, model: br.payload.model, transport: br.payload.transport, boundary: br.payload.boundary };
  if (body.harness !== undefined && body.harness !== null && body.harness !== launch.name) throw new ReviewError(`cairn: report: harness ${body.harness} does not match the brief's ${launch.name}`);
  if (typeof body.model !== 'string' || body.model === '') throw new ReviewError('cairn: report: model must be a string');
  if (launch.model !== null && body.model !== launch.model) throw new ReviewError(`cairn: report: model ${body.model} does not match the launch instruction ${launch.model}`);
  if (launch.transport !== null && body.transport !== launch.transport) throw new ReviewError(`cairn: report: transport ${body.transport} does not match the launch instruction ${launch.transport}`);
  const session = body.session ?? null;
  if (rev.payload.session !== null && session === rev.payload.session) throw new ReviewError(`cairn: report: session ${session} wrote the review`);
  const attempts = checkAttempts(body.attempts ?? [], t);
  const obligations = await interfaceObligations(cwd, settings, t.start.payload.snapshot, rev.payload.snapshot);
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

export function ledger(log, slug) {
  const r = openRange(log, slug);
  const accs = r.records.filter((x) => x.kind === 'acceptance');
  const verdictOf = (res) => {
    const a = accs.find((x) => x.payload.accepted.some((v) => v.resolution === res.sha) || x.payload.rejected.some((v) => v.resolution === res.sha));
    return !a ? 'submitted' : a.payload.accepted.some((v) => v.resolution === res.sha) ? 'accepted' : 'rejected';
  };
  const out = [];
  for (const src of r.records.filter((x) => FINDING_KINDS.includes(x.kind))) {
    for (const f of src.payload.findings) {
      const resolutions = r.records.filter((x) => x.kind === 'resolution' && x.payload.source === src.sha && x.payload.finding === f.n);
      const verdicts = resolutions.map(verdictOf);
      const status = disputes(log, src.sha, f.n) ? 'disputed' : verdicts.includes('accepted') ? 'resolved' : verdicts.at(-1) === 'submitted' ? 'submitted' : verdicts.at(-1) === 'rejected' ? 'rejected' : 'open';
      out.push({ source: src.sha, kind: src.kind, n: f.n, text: f.text, status, resolutions, rejections: verdicts.filter((v) => v === 'rejected').length });
    }
  }
  return out;
}

export async function resolve(cwd, slug, n, explanation, opts = {}) {
  if (!nonEmpty(explanation)) throw new ReviewError('cairn: resolve: explanation needs text');
  const log = await readLog(cwd);
  const all = ledger(log, slug).filter((f) => f.n === n && (!opts.source || f.source === opts.source));
  const submitted = all.find((f) => f.status === 'submitted');
  if (submitted) throw new ReviewError(`cairn: resolve: finding ${n} on ${submitted.source} awaits acceptance`);
  const open = all.filter((f) => f.status === 'open' || f.status === 'rejected');
  if (open.length === 0) throw new ReviewError(`cairn: resolve: no unresolved finding ${n}${opts.source ? ` on ${opts.source}` : ''}`);
  if (open.length > 1) throw new ReviewError(`cairn: resolve: finding ${n} is on ${open.map((f) => f.source).join(' and ')}; pass --source <sha>`);
  const f = open[0];
  const blocked = unanswered(log).find((e) => e.payload.concerns === `finding:${f.source}#${n}`);
  if (blocked) throw new ReviewError(`cairn: resolve: finding ${n} on ${f.source} is under escalation ${blocked.sha}`);
  const snapshot = await writeWorkspaceSnapshot(cwd);
  return appendRecord(cwd, 'resolution', slug, { source: f.source, finding: n, snapshot, explanation });
}

// lib/review.mjs (append)
const SHA = /^[0-9a-f]{40}$/;

export function acceptanceRounds(r) {
  const rep = r.records.find((x) => x.kind === 'report');
  return rep ? r.records.slice(r.records.indexOf(rep) + 1).filter((x) => x.kind === 'acceptance').length : 0;
}

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
    const current = await readSnapshot(cwd, await writeWorkspaceSnapshot(cwd), 'workspace');
    const treeOf = async (ws) => (await readSnapshot(cwd, ws, 'workspace')).tree;
    if (acc) { if ((await treeOf(acc.payload.snapshot)) !== current.tree) reasons.push('the latest acceptance is not at the final workspace snapshot'); }
    else if (r.records.some((x) => x.kind === 'resolution') || (await treeOf(rep.payload.snapshot)) !== current.tree) reasons.push('no acceptance examines the post-report delta');
  }
  return { review: rev, report: rep, acceptance: acc, ledger: l, ready: reasons.length === 0, reasons };
}

export async function accept(cwd, slug, body, opts = {}) {
  const log = await readLog(cwd);
  const r = openRange(log, slug);
  const rev = r.records.filter((x) => x.kind === 'review').at(-1);
  const rep = r.records.find((x) => x.kind === 'report');
  if (!rep) throw new ReviewError(`cairn: accept: ${slug} has no report`);
  const judged = new Set(r.records.filter((x) => x.kind === 'acceptance').flatMap((a) => [...a.payload.accepted, ...a.payload.rejected].map((v) => v.resolution)));
  const submitted = r.records.filter((x) => x.kind === 'resolution' && !judged.has(x.sha));
  const snapshot = await writeWorkspaceSnapshot(cwd);
  const current = await readSnapshot(cwd, snapshot, 'workspace'), reportedAt = await readSnapshot(cwd, rep.payload.snapshot, 'workspace');
  if (submitted.length === 0 && current.tree === reportedAt.tree) throw new ReviewError('cairn: accept: nothing submitted since the report and no delta to examine');
  const verdicts = Array.isArray(body.resolutions) ? body.resolutions : [];
  // Deviation from the plan text: the plan's own two loops ran in the order "every submitted
  // resolution has a verdict" then "every given verdict names a submitted resolution", so a verdict
  // for an unknown sha alongside an unjudged real resolution reported the wrong one missing its
  // verdict instead of naming the bogus sha. Task 6's own test asserts /is not a submitted
  // resolution/ for exactly that case (a fabricated 40-hex sha submitted while r1 is still
  // unjudged), so the sha-validity loop runs first and the completeness loop runs after.
  const accepted = [], rejected = [];
  for (const v of verdicts) {
    if (!SHA.test(v.sha ?? '') || !submitted.some((s) => s.sha === v.sha)) throw new ReviewError(`cairn: accept: ${v.sha} is not a submitted resolution`);
    if (v.verdict === 'accepted') accepted.push({ resolution: v.sha, reason: v.reason ?? '' });
    else if (v.verdict === 'rejected' && nonEmpty(v.reason)) rejected.push({ resolution: v.sha, reason: v.reason });
    else throw new ReviewError(`cairn: accept: rejected ${v.sha} needs a reason; a verdict is accepted or rejected`);
  }
  for (const s of submitted) if (!verdicts.some((v) => v.sha === s.sha)) throw new ReviewError(`cairn: accept: resolution ${s.sha} has no verdict`);
  const session = body.session ?? null;
  if (rev.payload.session !== null && session === rev.payload.session) throw new ReviewError(`cairn: accept: session ${session} wrote the review`);
  const findings = checkFindings(body.findings ?? []);
  const delta = await diffTree(cwd, reportedAt.tree, current.tree);
  const sha = await appendRecord(cwd, 'acceptance', slug, { slug, session, report: rep.sha, snapshot, delta_digest: sha256(canonicalize(delta)), accepted, rejected, findings });
  const after = await readLog(cwd);
  for (const f of ledger(after, slug)) {
    if (f.status === 'rejected' && f.rejections === 2) {
      await escalate(cwd, {
        commitment: slug, concerns: [`finding:${f.source}#${f.n}`],
        question: `Finding ${f.n} on the ${f.kind} was rejected twice; does the developer rule on it?`,
        recommendation: 'Rule: the finding stands and the fix changes approach, or the finding is closed as answered.',
        because: `The adversary rejected it twice: ${rejected.map((x) => x.reason).join('; ') || 'see the acceptance record'}.`,
        if_wrong: 'The loop keeps spending acceptance rounds on one finding.', instead: 'Answer instead <direction> naming the fix you want.',
        options: [], named_paths: [], cited_decisions: [],
      });
    }
  }
  const state = await reviewState(cwd, slug);
  if (state.ready) await resetOnProgress(cwd);
  else if (acceptanceRounds(openRange(after, slug)) >= BOUNDS.acceptanceRounds) await writeCycleEscalation(cwd, slug, { kind: 'acceptanceRounds', actionClass: 'accept', target: slug });
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
  if (!named.file) throw new ReviewError('cairn: --file <path> is required');
  return JSON.parse(await fs.readFile(named.file, 'utf8'));
}
const asCli = (fn) => async (cwd, argv, opts = {}) => {
  try { return { code: 0, out: await fn(cwd, splitFlags(argv), opts) }; }
  catch (e) { return { code: 1, out: (e.message.startsWith('cairn: ') ? e.message : `cairn: ${e.message}`) + '\n' }; }
};
export const cliReview = asCli(async (cwd, { pos: [slug], named }, opts) => `cairn: review ${slug} ${await review(cwd, slug, await fileBody(named), opts)}\n`);
export const cliBrief = asCli(async (cwd, { pos: [slug], named }, opts) => (await brief(cwd, slug, { harness: named.harness, env: opts.env })).launch);
export const cliReport = asCli(async (cwd, { pos: [slug], named }, opts) => `cairn: report ${slug} ${await report(cwd, slug, await fileBody(named), opts)}\n`);
export const cliResolve = asCli(async (cwd, { pos: [slug, n, ...how], named }) => `cairn: resolution ${slug} ${await resolve(cwd, slug, Number(n), how.join(' '), { source: named.source })}\n`);
export const cliAccept = asCli(async (cwd, { pos: [slug], named }, opts) => `cairn: acceptance ${slug} ${await accept(cwd, slug, await fileBody(named), opts)}\n`);
