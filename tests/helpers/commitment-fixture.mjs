// tests/helpers/commitment-fixture.mjs
import { makeProject } from './repo.mjs';

export const OVERVIEW = `# Demo

The demo greets people. It is not a chat system.

## Spec map

| File | Prefix |
|---|---|
| demo.md | DEMO |
| core.md | CORE |
`;
export const DEMO = `Prefix: DEMO

[DEMO-001] The greeter prints hello when run with no arguments.
Falsifier: running the greeter with no arguments prints anything other than hello.
Mechanism: greeter
Status: Agreed 2026-09-19

[DEMO-002] The greeter accepts a name argument.
Falsifier: running the greeter with a name prints a greeting without it.
Mechanism: greeter
Status: Agreed 2026-09-19

[DEMO-003] The greeter supports a quiet flag.
Falsifier: the quiet flag still prints.
Mechanism: greeter
Status: Draft
`;
export const CORE = `Prefix: CORE
Scope: every commitment

[CORE-001] The tool exits 0 on success.
Falsifier: a successful run exits nonzero.
Mechanism: exit-code
Status: Agreed 2026-09-19
`;
export const ROADMAP = `# Roadmap

Current: first

## first

Requirements: DEMO-001

Delivers the greeting. Done when hello prints.

## second

Requirements: DEMO-002

Delivers the name argument. Done when the name is greeted.

## drafty

Requirements: DEMO-003

Delivers the quiet flag.
`;
export async function project(settings = {}) {
  const repo = await makeProject({ settings: { source: ['src/**'], interfaces: ['src/api/**'], data: ['migrations/**'], ...settings } });
  await repo.write('docs/spec/overview.md', OVERVIEW);
  await repo.write('docs/spec/glossary.md', '# Glossary\n\ngreeter: the program.\n');
  await repo.write('docs/spec/demo.md', DEMO);
  await repo.write('docs/spec/core.md', CORE);
  await repo.write('docs/spec/roadmap.md', ROADMAP);
  await repo.write('AGENTS.md', '# Working agreement\n\nRun cairn wake.\n');
  await repo.write('src/main.mjs', 'console.log("hello");\n');
  await repo.commit('Add the demo specification');
  await repo.authorize();
  return repo;
}
export const roadmapWith = (current) => ROADMAP.replace('Current: first', `Current: ${current}`);
