// lib/review.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import { appendRecord, readLog, chainStart, carriedInto } from './records.mjs';
import { writeWorkspaceSnapshot, readSnapshot, listPaths, refuseSensitive, ALWAYS_EXCLUDED } from './snapshots.mjs';
import { readMechanisms } from './mechanisms.mjs';
import { resetOnProgress } from './cycle.mjs';
import { openRange, disputes, unanswered } from './escalate.mjs';
import { sha256 } from './canon.mjs';
import { listTree, git, treeIdentityReadOnly } from './gitx.mjs';
import { matchGlob, CREDENTIAL_PATTERNS } from './paths.mjs';
import { layoutOf, isOutputPath } from './layout.mjs';
import { loadSettings } from './settings.mjs';
import { parseDomainFile, parseRoadmap } from './spec.mjs';
import { HARNESS_ENV } from './auth.mjs';
import { atSnapshot } from './scope.mjs';

export class ReviewError extends Error {}
export const QUESTIONS = { mechanism: ['Q1', 'Q2'], requirement: ['Q3', 'Q4'], commitment: ['Q5', 'Q6'] };
export function sessionIdentity(env = process.env) { return env.SUDUS_SESSION ?? env.CLAUDE_SESSION_ID ?? null; }
const nonEmpty = (s) => typeof s === 'string' && s.trim() !== '';
const ADR_PATH = 'docs/decisions.jsonl';

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
  const reported = completeReport(t.range.records);
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

// Sudus 4.0.0 (spec revision 16): the adversary is one fresh subagent with none of the builder's
// conversation. It reads the project itself, the whole specification first, and runs nothing: the
// receipts in the brief say what already ran. Its role is the developer's text below, quoted as
// written except two spelling fixes ("imperative", "your report"); the Rules are the developer's
// other rulings of 2026-09-25 (read-only, no subagents, the whole specification) and the note that
// a claim in the builder's account is something to disprove.
export const ROLE = [
  'Your task is READ-ONLY in the repo. You may use a scratchpad to record your finding but will clean up after yourself once you have created a report. Your report is your only output: deliver it to the builder and stop.',
  '',
  'Rules:',
  '- Do not build, run tests or run any project code. The receipts below say what already ran.',
  '- Do not start subagents. Do the whole review inline, yourself.',
  '- Keep your scratchpad and your report file outside the repository. A file written inside it changes the workspace, and sudus report refuses a report once the workspace differs from the reviewed snapshot.',
  '- Read the whole specification under docs/spec, with its glossary and roadmap, and docs/decisions.jsonl before you judge anything. Judge this commitment as part of the whole system, not as a feature alone.',
  '- Treat every claim in the builder\'s account as something to disprove, not as settled.',
  '- Do not read the paths listed under Paths not to read.',
  '',
  'You have no stake in Done. The builder wants this commitment finished; you do not inherit that goal. Your role is very important as it is to prove that the implementation for this commitment is not production ready. The builder will record your report and it will be committed to the repo as evidence. You are accountable for the contents of your report to the builder. Everything you report will be validated. Ensure that you are satisfied with the report before you give it to the builder. The user will use these reports to score the builders performance as well as yours. Accuracy and candidness is imperative.',
  '',
  'If your report includes a bug report about Sudus, that you have discovered - stop the review, provide the bug report to the builder and stop. Sudus will likely require remediation before continuing the review.',
  '',
  'Scrutinize the commitment against the requirement, not against the builder\'s account of it. Put the frozen text of each requirement beside what was built, and judge the work through five lenses:',
  '',
  '1. The falsifier. Is the chosen failure the right observable failure for this obligation, or a weaker neighbour? Does the mechanism detect it, and could the code satisfy the check without meeting the obligation? Is there an input that reaches the falsifier which the check never exercises?',
  '2. The decisions. Every one the builder made, recorded or not: the defaults, the assumptions, the convenient reading of an ambiguous line. Were the premises true? Was the option not taken closer to the text? Did any decision belong to the developer?',
  '3. Security. The trust boundaries the change touched: input crossing them, paths and symlinks, secrets in code, records or output, new dependencies, new egress, new defaults.',
  '4. Logic. Every new branch, catch, default and early return, and the input that takes the other side of it. Ordering, idempotency, partial failure.',
  '5. Complexity and spec adherence. Behavior no requirement names. Behavior a requirement names that holds only on the happy path. Changed paths no mechanism covers. Documentation the code no longer matches. The same falsifier unreachable with less.',
  '',
  'If you know there is a likely issue, start there.',
  '',
  'A finding is a specific claim against the work: where (path and line, record, or requirement id), what is wrong, and why, quoting the requirement text or the decision it contradicts. Mark it Critical (a requirement is unmet, the falsifier is reachable, or a security exposure ships), Major (an uncovered defect in a touched path, or a decision that was the developer\'s) or Minor (an edge the commitment did not promise, or complexity the next commitment pays for). No fixes: a remedy is one line of advice, and optional. A note that is not a defect goes with the attempt that raised it, not in the numbered findings.',
  '',
  'The attempts the brief requires are made by reading: for each pair, say what you looked for, what you found, and whether it held. Do not pad. A clean report earned by scrutiny is a good outcome. Developer rulings are settled; the implementation of them is not.',
  '',
  'The user requires your best effort.',
];

export const LENSES = ['falsifier', 'decision', 'security', 'logic', 'complexity'];
export const SEVERITIES = ['Critical', 'Major', 'Minor'];
// A 3.x report carries a projection digest; a 4.0.0 report never does. A report that stopped on a
// Sudus bug names the bug and attempts nothing, so it does not complete the review.
export const isLegacyReport = (r) => 'projection_digest' in r.payload;
export const isBugReport = (r) => typeof r.payload.sudus_bug === 'string';
export const completeReport = (records) => records.filter((r) => r.kind === 'report' && !isBugReport(r)).at(-1) ?? null;
const oneLine = (text) => String(text).replace(/[\s\x00-\x1f\x7f-\x9f]+/g, ' ').trim();

// One attempt per requirement's falsifier, per decision the brief named, and per commitment-wide
// lens (security, logic, complexity and spec adherence).
export function attackPairs(t, decisions) {
  return [
    ...t.requirements.map((x) => ['falsifier', x]),
    ...decisions.map((d) => ['decision', d]),
    ...['security', 'logic', 'complexity'].map((q) => [q, t.slug]),
  ];
}

async function adrAt(cwd, treeSha) {
  const e = (await listTree(cwd, treeSha)).find((x) => x.path === ADR_PATH);
  if (!e) return [];
  return (await catBlob(cwd, e.sha)).toString('utf8').split('\n').filter((l) => l.trim() !== '')
    .flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
}

// The decisions the agent made in this commitment, for lens 2: the decision lines it added to
// docs/decisions.jsonl between the start of the supersession chain and the reviewed snapshot (a
// developer's are rulings, which are settled), and the backlog and next-feature items it captured,
// each work it put off. A decision it never recorded is the adversary's to find in the code.
export async function agentDecisions(cwd, log, base, rev) {
  const treeOf = async (ws) => (await readSnapshot(cwd, ws, 'workspace')).tree;
  const before = new Set((await adrAt(cwd, await treeOf(base.payload.snapshot))).map((l) => l.id));
  const adr = (await adrAt(cwd, await treeOf(rev.payload.snapshot)))
    .filter((l) => l.kind === 'decision' && l.by !== 'developer' && !before.has(l.id))
    .map((l) => ({ id: l.id, text: oneLine(`[${l.level}] ${l.title}. Rests on: ${(l.rests_on ?? []).join('; ') || 'nothing named'}. Wrong if: ${l.wrong_if}. ${l.body}`) }));
  const from = log.findIndex((r) => r.sha === base.sha), to = log.findIndex((r) => r.sha === rev.sha);
  const items = log.slice(from + 1, to).filter((r) => r.kind === 'item' && ['backlog', 'next-feature'].includes(r.payload.kind)).map((r) => {
    const out = log.find((o) => o.kind === 'outside' && o.payload.item === r.sha);
    return { id: r.sha, text: oneLine(`captured the ${r.payload.kind} item ${r.payload.slug} from ${r.payload.source}: ${r.payload.body}${out ? `; outside this commitment because: ${out.payload.reason}` : ''}`) };
  });
  return [...adr, ...items];
}

// What already ran, so the adversary never runs it again: per requirement, the latest receipt
// carrying a result for it and the fail receipt its mechanism review binds.
function receiptLines(log, t, mechanisms) {
  const L = [];
  for (const req of t.requirements) {
    const r = log.findLast((x) => x.kind === 'receipt' && x.payload.results.some((y) => y.requirement === req));
    const res = r?.payload.results.find((y) => y.requirement === req);
    L.push(r ? `${req}: latest receipt ${r.sha} from mechanism ${r.payload.mechanism}: ${r.payload.status === 'ran' ? res.result : 'error'}` : `${req}: no receipt`);
    for (const [name, m] of Object.entries(mechanisms)) {
      const fr = m.review?.[req]?.failReceipt;
      if (fr && m.definition.requirements.includes(req)) L.push(`${req}: fail receipt ${fr} from mechanism ${name}, the violating example its review binds`);
    }
  }
  return L;
}

export function renderBrief({ slug, roadmap, blocks, mechanisms, receipts = [], rev, decisions = [], obligations, changed = [], carriedFrom = null, excluded = [], patterns = [], pairs = [], rules = [] }) {
  const L = [`# Adversary brief: ${slug}`, '', '## Your role', ...ROLE, '', '## Roadmap section', roadmap, '', '## Frozen requirements and falsifiers'];
  for (const b of blocks) L.push(`[${b.id}] ${b.obligation}`, `Falsifier: ${b.falsifier}`, '');
  L.push('## Mechanism definitions');
  for (const [name, m] of Object.entries(mechanisms)) L.push(`${name}: ${JSON.stringify(m.definition)}`);
  L.push('', '## Receipts (what already ran; do not run it again)', ...receipts);
  L.push('', '## Builder claims');
  for (const a of rev.answers) L.push(`${kindOf(a.question)} ${a.target} ${a.question} ${a.status}: ${a.text}`);
  L.push('', '## Builder findings');
  for (const f of rev.findings) L.push(`${f.n}. ${f.text}`);
  L.push('', '## Agent decisions (each is a decision pair below)', ...(decisions.length ? decisions.map((d) => `decision ${d.id}: ${d.text}`) : ['none recorded']));
  L.push('', '## Interface obligations', ...obligations);
  // The commitment's whole footprint, from the start snapshot to the reviewed one (issue #8: a
  // successor carries the work of the commitments it superseded, so it starts at the chain's first).
  const from = carriedFrom ? `start snapshot of ${carriedFrom}, whose work ${slug} carries through a supersede,` : 'start snapshot';
  L.push('', `## Changed paths (${from} to reviewed snapshot; A added, M modified, D deleted)`, ...changed.map((d) => `${d.status} ${d.path}`));
  L.push('', '## Paths not to read', 'These hold credentials or are excluded from every model by the settings. Do not open them; any file matching one of the patterns is excluded too, tracked or not.',
    ...patterns.map((g) => `pattern ${g}`), ...excluded.map((p) => `${p.class} ${p.path}`));
  // Issue #13: the host's limits come from settings.adversary_rules, so they are part of the
  // recorded brief instead of an edit to it.
  if (rules.length) L.push('', '## Host rules', 'The machine you run on sets these limits; keep to them.', ...rules.map((r) => `- ${r}`));
  // Issue #13: the brief is the adversary's entire prompt, so it spells the report file's exact
  // shape and every required pair as sudus report checks them.
  L.push('', '## Report',
    'Write your report as one JSON file outside the repository and give back its path; it goes to `sudus report` unchanged. It is an object with exactly these fields:',
    '- "attempts": one {"question", "target", "looked_for", "found", "held"} for each pair below, spelled exactly as written. "looked_for" and "found" are text; "held" is true when the work held against what you looked for and false when it did not.',
    ...pairs.map(([q, x]) => `  ${q} ${x}`),
    `- "interface_attempts": one {"path", "looked_for", "found", "held"} for each path below, each path a JSON string to copy as it is${obligations.length ? '' : ' (none: write [])'}`,
    ...obligations.map((p) => `  ${JSON.stringify(p)}`),
    '- "findings": [{"n": 1, "severity": "Critical", "where": "...", "text": "...", "remedy": null}, ...], numbered from 1 in order, or [] when you found nothing. "severity" is Critical, Major or Minor; "where" is the path and line, record or requirement id; "text" is what is wrong and why; "remedy" is one line of advice or null.',
    '- "sudus_bug": null, or the bug report when you stopped on a Sudus bug; then "attempts", "interface_attempts" and "findings" are [].', '');
  return L.join('\n');
}

export async function brief(cwd, slug, opts = {}) {
  const { settings } = await loadSettings(cwd);
  const log = await readLog(cwd);
  const t = await targets(cwd, log, slug);
  const rev = t.range.records.filter((r) => r.kind === 'review').at(-1);
  if (!rev) throw new ReviewError(`sudus: no review for ${slug}`);
  // The adversary runs once per commitment: after a complete report, a brief has no report to lead
  // to (review of 4.0.0: one was written anyway, an orphan record). After a report that stopped on
  // a Sudus bug there is no complete report, so the review goes on through a new brief.
  const prior = completeReport(t.range.records);
  if (prior) throw new ReviewError(`sudus: one report per commitment; ${slug} has ${prior.sha}, so it takes no new brief`);
  const launch = detectHarness(settings, opts);
  const snap = await readSnapshot(cwd, rev.payload.snapshot, 'workspace');
  const entries = await listTree(cwd, snap.tree);
  const roadmapEntry = entries.find((e) => e.path === 'docs/spec/roadmap.md');
  const all = await readMechanisms(cwd);
  const mechanisms = Object.fromEntries(t.mechanisms.map((m) => [m, all[m]]));
  const base = chainStart(log, t.start);
  const decisions = await agentDecisions(cwd, log, base, rev);
  const text = renderBrief({
    slug, roadmap: roadmapEntry ? roadmapSection((await catBlob(cwd, roadmapEntry.sha)).toString('utf8'), slug) : '',
    blocks: await specBlocks(cwd, entries, t.requirements), mechanisms, receipts: receiptLines(log, t, mechanisms),
    rev: rev.payload, decisions, obligations: await interfaceObligations(cwd, settings, base.payload.snapshot, rev.payload.snapshot),
    changed: await diffTree(cwd, (await readSnapshot(cwd, base.payload.snapshot, 'workspace')).tree, snap.tree),
    carriedFrom: base === t.start ? null : base.payload.slug,
    excluded: entries.map((e) => ({ path: e.path, class: exclusionClass(e.path, settings) })).filter((x) => x.class === 'network_exclude' || x.class === 'credential'),
    patterns: [...(settings.network_exclude ?? []), ...CREDENTIAL_PATTERNS],
    pairs: attackPairs(t, decisions.map((d) => d.id)), rules: settings.adversary_rules ?? [],
  });
  const payloadDigest = sha256(text);
  const sha = await appendRecord(cwd, 'brief', slug, { slug, review: rev.sha, harness: launch.name, model: launch.model, payload_digest: payloadDigest, decisions: decisions.map((d) => d.id) });
  const briefPath = path.join(cwd, layoutOf(cwd).output, `brief-${payloadDigest.slice(7)}.md`);
  await fs.mkdir(path.dirname(briefPath), { recursive: true });
  await fs.writeFile(briefPath, text);
  const withModel = launch.model ? ` running as ${launch.model}` : '';
  const launchText = [`sudus: brief ${slug} ${sha}`, `brief: ${briefPath}`, `brief digest: ${payloadDigest}`, `harness: ${launch.name}`, `model: ${launch.model ?? 'any'}`,
    `start: in ${launch.name}, start one fresh subagent${withModel} with none of your conversation, working in ${cwd}, with the file ${briefPath} as its entire prompt. It reads only and starts no subagents. When it hands back its report file, run: sudus report ${slug} --file <its report>`, ''].join('\n');
  return { sha, briefPath, launch: launchText, text };
}

const ATTEMPT_KEYS = 'found,held,looked_for,question,target';
export function checkAttempts(attempts, pairs, slug) {
  if (!Array.isArray(attempts)) throw new ReviewError('sudus: report: attempts must be a list');
  const seen = new Set();
  for (const a of attempts) {
    if (!a || typeof a !== 'object' || Object.keys(a).sort().join(',') !== ATTEMPT_KEYS) throw new ReviewError('sudus: report: an attempt is {question, target, looked_for, found, held}');
    if (!nonEmpty(a.looked_for) || !nonEmpty(a.found) || typeof a.held !== 'boolean') throw new ReviewError(`sudus: report: ${a.question} ${a.target} needs looked_for and found text and held true or false`);
    if (!pairs.some(([q, x]) => q === a.question && x === a.target)) throw new ReviewError(`sudus: report: ${a.question} ${a.target} is not a pair the brief for ${slug} names`);
    const key = `${a.question} ${a.target}`;
    if (seen.has(key)) throw new ReviewError(`sudus: report: ${key} attempted twice`);
    seen.add(key);
  }
  for (const [q, x] of pairs) if (!seen.has(`${q} ${x}`)) throw new ReviewError(`sudus: report: ${q} ${x} has no attempt`);
  return attempts;
}

const IFACE_KEYS = 'found,held,looked_for,path';
export function checkInterfaceAttempts(list, obligations) {
  if (!Array.isArray(list) || !list.every((x) => x && typeof x === 'object' && Object.keys(x).sort().join(',') === IFACE_KEYS && typeof x.path === 'string' && nonEmpty(x.looked_for) && nonEmpty(x.found) && typeof x.held === 'boolean')) {
    throw new ReviewError('sudus: report: an interface attempt is {path, looked_for, found, held} with looked_for and found text');
  }
  for (const p of obligations) if (!list.some((x) => x.path === p)) throw new ReviewError(`sudus: report: interface ${p} has no attempt`);
  return list;
}

export function checkRatedFindings(findings) {
  if (!Array.isArray(findings)) throw new ReviewError('sudus: report: findings must be a list');
  return findings.map((f, i) => {
    const keys = f && typeof f === 'object' ? Object.keys(f) : [];
    if (!keys.length || keys.some((k) => !['n', 'severity', 'where', 'text', 'remedy'].includes(k)) || f.n !== i + 1) throw new ReviewError('sudus: report: findings are numbered 1, 2, ... each {n, severity, where, text, remedy}');
    if (!SEVERITIES.includes(f.severity)) throw new ReviewError(`sudus: report: finding ${f.n} severity is Critical, Major or Minor`);
    if (!nonEmpty(f.where) || !nonEmpty(f.text)) throw new ReviewError(`sudus: report: finding ${f.n} needs where and text`);
    const remedy = f.remedy ?? null;
    if (remedy !== null && (!nonEmpty(remedy) || /[\r\n]/.test(remedy))) throw new ReviewError(`sudus: report: finding ${f.n} remedy is one line or null`);
    return { n: f.n, severity: f.severity, where: f.where, text: f.text, remedy };
  });
}

const BODY_KEYS = ['attempts', 'findings', 'interface_attempts', 'sudus_bug'];
export async function report(cwd, slug, body, opts = {}) {
  const { settings } = await loadSettings(cwd);
  const log = await readLog(cwd);
  const t = await targets(cwd, log, slug);
  const prior = completeReport(t.range.records);
  if (prior) throw new ReviewError(`sudus: one report per commitment; ${slug} has ${prior.sha}`);
  const rev = t.range.records.filter((r) => r.kind === 'review').at(-1);
  const br = t.range.records.filter((r) => r.kind === 'brief').at(-1);
  if (!rev || !br) throw new ReviewError(`sudus: ${slug} needs a review and a brief before a report`);
  if (br.payload.review !== rev.sha) throw new ReviewError(`sudus: brief ${br.sha} is stale: the review is ${rev.sha}`);
  if ('projection_digest' in br.payload) throw new ReviewError(`sudus: brief ${br.sha} was written by Sudus 3; run sudus brief ${slug} again`);
  if (t.range.records.some((r) => r.kind === 'report' && r.payload.brief === br.sha)) throw new ReviewError(`sudus: brief ${br.sha} already has a report; run sudus brief ${slug} again`);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ReviewError('sudus: report: the file holds one JSON object');
  const extra = Object.keys(body).filter((k) => !BODY_KEYS.includes(k));
  if (extra.length) throw new ReviewError(`sudus: report: unknown field ${extra.join(', ')}; the fields are ${BODY_KEYS.join(', ')}`);
  // The adversary reads only: a report is refused once the workspace differs from the reviewed
  // snapshot, whatever changed it. report() writes no snapshot of its own, so the tree is only read.
  const nowTree = await currentWorkspaceTree(cwd, settings), then = await readSnapshot(cwd, rev.payload.snapshot, 'workspace');
  if (nowTree !== then.tree && !(await atSnapshot(cwd, then.tree))) throw new ReviewError('sudus: report: the workspace differs from the reviewed snapshot; the adversary reads only, so a report is taken only while the work is as reviewed');
  const bug = body.sudus_bug ?? null;
  if (bug !== null && !nonEmpty(bug)) throw new ReviewError('sudus: report: sudus_bug is null or the bug report text');
  let attempts = [], interface_attempts = [], findings = [];
  if (bug !== null) {
    if (['attempts', 'interface_attempts', 'findings'].some((k) => Array.isArray(body[k]) ? body[k].length > 0 : body[k] !== undefined)) throw new ReviewError('sudus: report: a report that stops on a Sudus bug has empty attempts, interface_attempts and findings');
  } else {
    attempts = checkAttempts(body.attempts ?? [], attackPairs(t, br.payload.decisions), slug);
    const obligations = await interfaceObligations(cwd, settings, chainStart(log, t.start).payload.snapshot, rev.payload.snapshot);
    interface_attempts = checkInterfaceAttempts(body.interface_attempts ?? [], obligations);
    findings = checkRatedFindings(body.findings ?? []);
  }
  const sha = await appendRecord(cwd, 'report', slug, { slug, snapshot: rev.payload.snapshot, brief: br.sha, attempts, interface_attempts, findings, sudus_bug: bug });
  if (bug === null) await resetOnProgress(cwd);
  return sha;
}

// 'acceptance' records are 3.x's; their findings still count, and a resolution an acceptance
// rejected leaves its finding open.
const FINDING_KINDS = ['review', 'report', 'acceptance'];

// Finding-bearing records a supersession carried into this range: "Unanswered escalations,
// unresolved findings and unfixed defect items carry" (spec, supersession). They sit before the
// successor's start, so the range alone never saw them and Done was reachable with them open.
// Only the supersession that opened this commitment counts (issue #32).
export function carriedFindingSources(log, r) {
  const carried = carriedInto(log, r.start);
  const inRange = new Set(r.records.map((x) => x.sha));
  return log.filter((x) => carried.has(x.sha) && FINDING_KINDS.includes(x.kind) && !inRange.has(x.sha));
}
// Each finding of the commitment and what the builder did with it: resolved (a resolution no 3.x
// acceptance rejected), declined (with its reason), disputed (a developer's ok on an escalation
// naming it) or open.
export function ledger(log, slug, r = openRange(log, slug)) {
  const carried = carriedFindingSources(log, r);
  const rejected = new Set(log.filter((x) => x.kind === 'acceptance').flatMap((a) => a.payload.rejected.map((v) => v.resolution)));
  const out = [];
  for (const src of [...carried, ...r.records.filter((x) => FINDING_KINDS.includes(x.kind))]) {
    for (const f of src.payload.findings) {
      const same = (x) => x.payload.source === src.sha && x.payload.finding === f.n;
      const resolution = log.filter((x) => x.kind === 'resolution' && same(x) && !rejected.has(x.sha)).at(-1) ?? null;
      const decline = log.filter((x) => x.kind === 'decline' && same(x)).at(-1) ?? null;
      const disputed = disputes(log, src.sha, f.n);
      const status = disputed ? 'disputed' : resolution ? 'resolved' : decline ? 'declined' : 'open';
      out.push({ source: src.sha, kind: src.kind, n: f.n, text: f.text, severity: f.severity ?? null, where: f.where ?? null, status, resolution, decline, disputed });
    }
  }
  return out;
}

function openFinding(log, slug, n, opts, verb) {
  const all = ledger(log, slug).filter((f) => f.n === n && (!opts.source || f.source === opts.source));
  const open = all.filter((f) => f.status === 'open');
  if (open.length === 0) {
    const closed = all[0];
    if (closed?.status === 'disputed') throw new ReviewError(`sudus: ${verb}: the developer's ok on escalation ${closed.disputed} closed finding ${n} on ${closed.source}`);
    if (closed?.status === 'resolved') throw new ReviewError(`sudus: ${verb}: finding ${n} on ${closed.source} is resolved by ${closed.resolution.sha}`);
    if (closed?.status === 'declined') throw new ReviewError(`sudus: ${verb}: finding ${n} on ${closed.source} was declined by ${closed.decline.sha}`);
    throw new ReviewError(`sudus: ${verb}: no finding ${n}${opts.source ? ` on ${opts.source}` : ''} is open`);
  }
  if (open.length > 1) throw new ReviewError(`sudus: ${verb}: finding ${n} is on ${open.map((f) => f.source).join(' and ')}; pass --source <sha>`);
  const f = open[0];
  const blocked = unanswered(log).find((e) => e.payload.concerns.split(' ').includes(`finding:${f.source}#${n}`));
  if (blocked) throw new ReviewError(`sudus: ${verb}: finding ${n} on ${f.source} is under escalation ${blocked.sha}`);
  return f;
}

export async function resolve(cwd, slug, n, explanation, opts = {}) {
  if (!nonEmpty(explanation)) throw new ReviewError('sudus: resolve: explanation needs text');
  const f = openFinding(await readLog(cwd), slug, n, opts, 'resolve');
  const snapshot = await writeWorkspaceSnapshot(cwd);
  return appendRecord(cwd, 'resolution', slug, { source: f.source, finding: n, snapshot, explanation });
}

// The builder decides every finding (developer's ruling, 2026-09-25): it fixes it, or declines it
// with its reason. A decline never waits for anyone; the developer reads it in the review report
// sudus done prints.
export async function decline(cwd, slug, n, reason, opts = {}) {
  if (!nonEmpty(reason)) throw new ReviewError('sudus: decline: a decline needs its reason');
  const f = openFinding(await readLog(cwd), slug, n, opts, 'decline');
  return appendRecord(cwd, 'decline', slug, { source: f.source, finding: n, reason });
}

export async function reviewState(cwd, slug) {
  const log = await readLog(cwd);
  const r = openRange(log, slug);
  const rev = r.records.filter((x) => x.kind === 'review').at(-1) ?? null;
  const rep = completeReport(r.records);
  const l = ledger(log, slug);
  const reasons = [];
  if (!rev) reasons.push('no review');
  if (!rep) reasons.push('no report');
  if (rev && rep && rep.payload.snapshot !== rev.payload.snapshot) reasons.push('the report is not at the reviewed snapshot');
  for (const f of l) if (f.status === 'open') reasons.push(`finding ${f.n} on ${f.source} is open`);
  return { review: rev, report: rep, ledger: l, ready: reasons.length === 0, reasons };
}

// The review report the developer reads at Done, before the next feature or commitment: every
// finding of the commitment, its severity, and what the builder did with it.
export function reviewReport(log, slug, r) {
  const rep = completeReport(r.records);
  const rows = ledger(log, slug, r);
  const count = (s) => rows.filter((f) => f.status === s).length;
  const L = [`review report for ${slug}: ${rows.length} finding${rows.length === 1 ? '' : 's'}, ${count('resolved')} fixed, ${count('declined')} declined${count('disputed') ? `, ${count('disputed')} closed by the developer` : ''}${rep ? ` (adversary report ${rep.sha.slice(0, 12)})` : ''}`];
  for (const f of rows) {
    L.push(`- ${f.severity ? `${f.severity}, ` : ''}finding ${f.n} of the ${f.kind} ${f.source.slice(0, 12)}${f.where ? ` at ${oneLine(f.where)}` : ''}: ${oneLine(f.text)}`);
    if (f.status === 'resolved') L.push(`  fixed: ${oneLine(f.resolution.payload.explanation)} (resolution ${f.resolution.sha.slice(0, 12)})`);
    else if (f.status === 'declined') L.push(`  declined: ${oneLine(f.decline.payload.reason)} (decline ${f.decline.sha.slice(0, 12)})`);
    else if (f.status === 'disputed') L.push(`  closed by the developer's ok on escalation ${f.disputed.slice(0, 12)}`);
    else L.push('  open');
  }
  return L.join('\n') + '\n';
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
export const cliDecline = asCli(async (cwd, { pos: [slug, n, ...why], named }) => {
  const num = Number(n);
  if (n === undefined || !Number.isInteger(num) || num < 1) throw new ReviewError(`sudus: decline: finding number ${n === undefined ? '(none given)' : JSON.stringify(n)} must be a positive integer`);
  return `sudus: decline ${slug} ${await decline(cwd, slug, num, why.join(' '), { source: named.source })}\n`;
});
