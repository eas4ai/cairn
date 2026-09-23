// tests/helpers/mechanism-fixture.mjs
import { makeProject } from './repo.mjs';
import { declare } from '../../lib/mechanisms.mjs';

export const SPEC = `Prefix: DEMO

[DEMO-001] The greeter prints hello when run with no arguments.
Falsifier: running the greeter with no arguments prints anything other than hello.
Mechanism: greeter
Status: Agreed 2026-09-19

[DEMO-002] The greeter exits 0 when run with no arguments.
Falsifier: running the greeter with no arguments exits nonzero.
Mechanism: greeter
Status: Draft

[DEMO-003] The greeter accepts a name argument.
Falsifier: running the greeter with a name prints a greeting without it.
Mechanism: other
Status: Agreed 2026-09-19
`;
export const CHECK = `import { readFileSync } from 'node:fs';
const text = readFileSync('hello.txt', 'utf8').trim();
console.log('sudus: DEMO-001: ' + (text === 'hello' ? 'pass' : 'fail'));
`;
export const DEFINITION = {
  command: 'node check.mjs', cwd: null,
  inputs: ['check.mjs', 'hello.txt', 'notes.md'], documents: ['notes.md'],
  requirements: ['DEMO-001', 'DEMO-002'], results: 'per-requirement',
  identity: { tools: { node: 'node --version' }, env: ['SUDUS_FIXTURE_ENV'], image: null },
};
export async function project() {
  const repo = await makeProject({ settings: { source: ['bin/**'], outside: ['README.md'] } });
  await repo.write('docs/spec/demo.md', SPEC);
  await repo.write('check.mjs', CHECK);
  await repo.write('hello.txt', 'hello\n');
  await repo.write('notes.md', 'notes\n');
  await repo.write('README.md', 'readme\n');
  await repo.commit('Add the demo spec and greeter fixture');
  return repo;
}
export async function declared(overrides = {}) {
  const repo = await project();
  await declare(repo.cwd, 'greeter', { ...DEFINITION, ...overrides });
  return repo;
}
