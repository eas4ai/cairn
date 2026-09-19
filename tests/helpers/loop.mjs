import { mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { makeProject } from './repo.mjs';
import { git } from '../../lib/gitx.mjs';
import { appendRecord, readLog } from '../../lib/records.mjs';
import { writeWorkspaceSnapshot } from '../../lib/snapshots.mjs';
import { parseDomainFile } from '../../lib/spec.mjs';
import { declare } from '../../lib/mechanisms.mjs';
import { check } from '../../lib/check.mjs';
import { reviewMechanism } from '../../lib/mechanisms.mjs';
import { appendDecision } from '../../lib/adr.mjs';
import { spawnSync } from 'node:child_process';

const domainFile = (reqs) => 'Prefix: DEMO\n\n' + reqs.map((r) =>
  `[${r}] The demo command prints hello for ${r}.\n` +
  `Falsifier: the flag file for ${r} says fail.\n` +
  `Mechanism: ${r.toLowerCase()}\nStatus: Agreed 2026-09-19\n`).join('\n');

export const mechanismFor = (r) => ({
  command: `node -e "process.stdout.write('cairn: ${r}: '+require('fs').readFileSync('flags/${r}','utf8').trim()+'\\n')"`,
  inputs: ['src/demo.mjs', `flags/${r}`], documents: [], requirements: [r],
  results: 'per-requirement', identity: {},
});

export async function loopRepo({ reqs = ['DEMO-001'], slug = 'first', settings = {} } = {}) {
  const { cwd } = await makeProject({ settings: { outside: ['README.md', 'notes/**'], source: ['src/**'], ...settings } });
  const write = async (p, text) => {
    await mkdir(dirname(join(cwd, p)), { recursive: true });
    await writeFile(join(cwd, p), text);
  };
  const remove = (p) => rm(join(cwd, p), { force: true });
  const link = async (p, target) => {
    await mkdir(dirname(join(cwd, p)), { recursive: true });
    await symlink(target, join(cwd, p));
  };
  const commit = async (msg) => { await git(['add', '-A'], { cwd }); await git(['commit', '-q', '--allow-empty', '-m', msg], { cwd }); };
  await write('docs/spec/overview.md', '# Demo\n\nA demo program.\n\n| Domain | Prefix | File |\n|---|---|---|\n| demo | DEMO | demo.md |\n');
  await write('docs/spec/glossary.md', '# Glossary\n\n- demo: the sample program.\n');
  await write('docs/spec/roadmap.md', `Current: ${slug}\n\n## ${slug}\n\nRequirements: ${reqs.join(' ')}\n\nDelivers the demo.\n`);
  await write('docs/spec/demo.md', domainFile(reqs));
  await write('README.md', '# demo\n');
  await write('src/demo.mjs', 'console.log("hello");\n');
  for (const r of reqs) await write(`flags/${r}`, 'fail\n');
  await commit('Demo project');
  for (const r of reqs) await declare(cwd, r.toLowerCase(), mechanismFor(r));
  await commit('Declare demo mechanisms');
  const { blocks } = parseDomainFile(await readFile(join(cwd, 'docs/spec/demo.md'), 'utf8'));
  const startSnapshot = await writeWorkspaceSnapshot(cwd);
  // Deviation from the plan text: the 'start' schema on this branch (lib/records.mjs) also
  // requires `intent` and `results` fields (plan 06's carried obligation, already applied to
  // tests/snapshots.test.mjs's own 'start' fixture); the plan's literal payload omits them, which
  // would make appendRecord throw RecordError for a missing field. Added here with the same
  // null/empty values that fixture uses, since this is a directly-appended fixture record, not one
  // written through lib/commitment.mjs's transactional start().
  const startSha = await appendRecord(cwd, 'start', slug, {
    slug, snapshot: startSnapshot, from_superseded: null, intent: null, results: [],
    requirements: blocks.map((b) => ({ requirement: b.id, text_digest: b.textDigest })),
  });
  const add = (kind, target, payload) => appendRecord(cwd, kind, target, payload);
  const snap = () => writeWorkspaceSnapshot(cwd);
  // Deviation from the plan text: the 'answer' schema's `evidence` field (lib/records.mjs) is
  // lib/auth.mjs's discriminated-union evidence shape, not the plan's flat {mode, author}
  // object -- the 'unsigned-local' variant needs purpose/subject/nonce/author{name,email}/
  // confirmed. This fixture never runs through lib/auth.mjs's real verification (these are raw
  // appendRecord calls, not the authenticateDeveloper flow), so any structurally valid value
  // satisfies the schema check that appendRecord runs.
  const evidence = { mode: 'unsigned-local', purpose: 'answer', subject: 'answer', nonce: 'test-nonce', author: { name: 'Dev', email: 'dev@example.test' }, confirmed: true };
  const steps = {
    async passReq(r) {
      await write(`flags/${r}`, 'fail\n'); await commit(`${r} flag fail`);
      const fail = await check(cwd, r);
      await reviewMechanism(cwd, r.toLowerCase(), r, fail);
      await commit(`${r} mechanism reviewed`);
      await write(`flags/${r}`, 'pass\n'); await commit(`${r} flag pass`);
      return check(cwd, r);
    },
    async failReq(r) { await write(`flags/${r}`, 'fail\n'); await commit(`${r} flag fail`); return check(cwd, r); },
    async review(findings = []) {
      const mech = reqs.map((r) => r.toLowerCase());
      const answers = [
        ...mech.flatMap((m) => ['Q1', 'Q2'].map((q) => ({ question: q, target: m, status: 'observed', text: 'flag fail receipt' }))),
        ...reqs.flatMap((r) => ['Q3', 'Q4'].map((q) => ({ question: q, target: r, status: 'observed', text: 'flag pass' }))),
        ...['Q5', 'Q6'].map((q) => ({ question: q, target: slug, status: 'not-checked', text: '' })),
      ];
      return add('review', slug, { slug, session: null, snapshot: await snap(), examined: ['src/demo.mjs'], answers, findings });
    },
    // Deviation from the plan text: the real 'brief' schema (lib/records.mjs) names its three
    // digest fields projection_digest/payload_digest/exclusions_digest, not
    // projection/payload/exclusions; the real 'report' schema names projection_digest (not
    // projection), carries a nullable builder_model field the plan's payload omitted, and its
    // attempts entries and interface_attempts entries are {question,target,text} and {path,text}
    // objects, not bare strings/pairs. Adapted here to the schema actually committed.
    async report(findings = []) {
      const log = await readLog(cwd);
      const rev = log.filter((x) => x.kind === 'review').at(-1);
      const brief = await add('brief', slug, { slug, review: rev.sha, projection_digest: 'sha256:' + '1'.repeat(64), payload_digest: 'sha256:' + '2'.repeat(64), exclusions_digest: 'sha256:' + '3'.repeat(64) });
      const attempts = rev.payload.answers.map(({ question, target }) => ({ question, target, text: 'attempted' }));
      return add('report', slug, { slug, session: null, snapshot: rev.payload.snapshot, brief, model: 'test-model', transport: 'local', boundary: 'enforced', builder_model: null, projection_digest: 'sha256:' + '1'.repeat(64), attempts, findings, interface_attempts: [] });
    },
    resolveFinding: async (source, n) => add('resolution', slug, { source, finding: n, snapshot: await snap(), explanation: 'fixed' }),
    // Deviation from the plan text: the real 'acceptance' schema names its digest field
    // delta_digest, not delta.
    async accept({ accepted = [], rejected = [], findings = [] } = {}) {
      const rep = (await readLog(cwd)).filter((x) => x.kind === 'report').at(-1);
      return add('acceptance', slug, { slug, session: null, report: rep.sha, snapshot: await snap(), delta_digest: 'sha256:' + '4'.repeat(64), accepted: accepted.map((s) => ({ resolution: s, reason: 'ok' })), rejected: rejected.map((s) => ({ resolution: s, reason: 'not fixed' })), findings });
    },
    escalate: (concerns, s = slug) => add('escalation', s, { slug: s, question: 'Q?', recommendation: 'R', because: 'B', if_wrong: 'W', instead: 'I', concerns, evaluation: null }),
    answer: (esc, kind, text = '') => add('answer', slug, { escalation: esc, kind, text, owner: null, evidence }),
    reply: (esc) => add('reply', slug, { escalation: esc, text: 'explained' }),
    item: (kind, source, s = 'idea') => add('item', s, { kind, slug: s, source, body: 'an idea' }),
    // Deviation from the plan text: lib/adr.mjs's real appendDecision(cwd, line, {command}) takes
    // a required second {command} argument (checked against the line kind's ASSIGNED writer list)
    // and the 'decision' schema's closed key set includes `interfaces` (a list of any named
    // interface-classified paths), which the plan's payload omitted.
    decide: () => appendDecision(cwd, { kind: 'decision', level: 'Consequential', by: 'agent', title: 'Use a map', rests_on: [], wrong_if: 'lookups are rare', body: 'A map keeps lookups constant.', base_snap: startSnapshot, evaluation: null, interfaces: [] }, { command: 'decide' }),
    runWake: () => spawnSync(process.execPath, [new URL('../../bin/cairn.mjs', import.meta.url).pathname, 'wake'], { cwd, encoding: 'utf8', env: { ...process.env, CAIRN_SESSION: 'test-session' } }),
  };
  return { cwd, slug, reqs, startSha, startSnapshot, write, remove, link, commit, log: () => readLog(cwd), add, snap, ...steps };
}
