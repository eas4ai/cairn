// lib/review.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { appendRecord, readLog } from './records.mjs';
import { writeWorkspaceSnapshot } from './snapshots.mjs';
import { readMechanisms } from './mechanisms.mjs';
import { resetOnProgress } from './cycle.mjs';
import { openRange } from './escalate.mjs';
import { canonicalize, sha256 } from './canon.mjs';
import { listTree } from './gitx.mjs';
import { matchGlob, CREDENTIAL_PATTERNS } from './paths.mjs';
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
