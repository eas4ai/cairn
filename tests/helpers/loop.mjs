import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { makeProject } from './repo.mjs';
import { git } from '../../lib/gitx.mjs';
import { appendRecord, readLog } from '../../lib/records.mjs';
import { writeWorkspaceSnapshot } from '../../lib/snapshots.mjs';
import { parseDomainFile } from '../../lib/spec.mjs';
import { declare } from '../../lib/mechanisms.mjs';

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
  return {
    cwd, slug, reqs, startSha, startSnapshot, write, remove, commit,
    log: () => readLog(cwd),
    add: (kind, target, payload) => appendRecord(cwd, kind, target, payload),
    snap: () => writeWorkspaceSnapshot(cwd),
  };
}
