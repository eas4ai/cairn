import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bandOf, cannotStart, changesVerdict, expressionOf, MULTI_WORD_ACTIONS, nextStepOf, parseWake, shortHashes, usesSudus, type Verdict } from '../mod/verdict.ts'
import { ORDER } from '../lib/wake.mjs'

// The exact lines lib/wake.mjs render() prints.
const RESOLVABLE = 'verdict: Resolvable\naction: run WTE-001\nreason: no current receipt carries a result for WTE-001\npredicate: a current receipt carries a result for the requirement\nlayout: .cairn (the former name); sudus migrate moves it to .sudus between commitments\n'

const verdictOf = (v: Verdict) => {
  if (v.kind !== 'verdict') throw new Error(`expected a verdict, got ${v.kind}`)
  return v
}

test('a Resolvable verdict reads action, target, reason, predicate and the layout line', () => {
  const v = verdictOf(parseWake(RESOLVABLE, 0))
  assert.deepEqual([v.verdict, v.action, v.target, v.exit], ['Resolvable', 'run', 'WTE-001', 0])
  assert.equal(v.reason, 'no current receipt carries a result for WTE-001')
  assert.ok(v.layout?.startsWith('.cairn'))
  assert.equal(expressionOf(v, false), 'idle')
  assert.equal(expressionOf(v, true), 'thinking')
  assert.deepEqual(bandOf(v), { label: 'Working', color: 'green', subject: 'running the check for WTE-001', lines: [] })
})

test('Waiting is unsure, or mad with no developer to answer; Done is happy', () => {
  const w = parseWake('verdict: Waiting\nparty: developer\nreason: escalation abc awaits an answer\npredicate: p\n', 0)
  assert.equal(expressionOf(w, false), 'unsure')
  assert.deepEqual(bandOf(w), { label: 'Your answer needed', color: 'yellow', subject: '', lines: [] })
  assert.equal(expressionOf(parseWake('verdict: Waiting\nparty: developer\nreason: r\npredicate: p\n', 4), false), 'mad')
  assert.equal(expressionOf(parseWake('verdict: Done\ncommitment: first\nreason: r\npredicate: p\n', 0), false), 'happy')
})

test('Done names its commitment, and Waiting shows the escalation question', () => {
  const d = verdictOf(parseWake('verdict: Done\ncommitment: first\nreason: done record closes first and no backlog item waits\npredicate: a done record names the commitment and final workspace snapshot\n', 0))
  assert.deepEqual([d.verdict, d.target], ['Done', 'first'])
  assert.deepEqual(bandOf(d), { label: 'Done', color: 'cyan', subject: 'first', lines: [] })
  const w = verdictOf(parseWake('verdict: Waiting\nparty: developer\nreason: escalation 1a2b awaits an answer\nquestion: Raise the bound to 1 ms?\nrecommendation: yes\nbecause: b\nif wrong: w\ninstead: i\npredicate: p\n', 0))
  assert.equal(w.question, 'Raise the bound to 1 ms?')
  assert.deepEqual(bandOf(w)?.lines, ['Raise the bound to 1 ms?'])
})

test('an exit-3 line is sick and a repair; wake that cannot be reached is sleepy', () => {
  const line = parseWake('sudus: outside a project; run /new-project or /existing-project\n', 3)
  assert.deepEqual(line, { kind: 'line', line: 'sudus: outside a project; run /new-project or /existing-project', exit: 3 })
  assert.equal(expressionOf(line, false), 'sick')
  assert.deepEqual(bandOf(line), { label: 'Setup', color: 'red', subject: 'outside a project', lines: [] })
  const missing = parseWake('', 1)
  assert.equal(missing.kind, 'missing')
  assert.equal(expressionOf(missing, false), 'sleepy')
  assert.deepEqual(bandOf(missing), { label: 'Not answering', color: 'red', subject: 'sudus wake did not finish', lines: [] })
})

test('a repository that does not use Sudus draws no band and keeps an idle face', () => {
  const none: Verdict = { kind: 'none' }
  assert.equal(bandOf(none), undefined)
  assert.equal(expressionOf(none, false), 'idle')
})

test('the band says the next step in plain words, with no hashes or kernel terms', () => {
  const report = parseWake('verdict: Resolvable\naction: report z-index-tests-segfault\nreason: no report names the reviewed snapshot 40e0cee2aaed5c04e01cde39cc71285f0dd953df through a current brief\npredicate: p\n', 0)
  assert.deepEqual(bandOf(report), { label: 'Working', color: 'green', subject: 'independent review of z-index-tests-segfault', lines: [] })
  assert.equal(nextStepOf('resolve', 'first 2'), 'fixing review finding 2 on first')
  assert.equal(nextStepOf('escalate', 'first 1'), 'preparing a question for you about review finding 1 on first')
  assert.equal(nextStepOf('escalate', 'WTE-001'), 'preparing a question for you about WTE-001')
  assert.equal(nextStepOf('record', 'docs/spec/roadmap.md'), 'committing docs/spec/roadmap.md before the checks run')
  assert.equal(nextStepOf('recover', '01J0000000000000000000000'), 'finishing an interrupted Sudus command')
  assert.equal(nextStepOf('a-new-action', 'x'), 'a-new-action x')
  // Every action wake can name has plain words.
  for (const a of ORDER.filter((x: string) => x !== 'waiting')) assert.notEqual(nextStepOf(a, 't'), `${a} t`, a)
  for (const a of ['commit', 'implement', 'escalate', 'reply']) assert.notEqual(nextStepOf(a, 't'), `${a} t`, a)
  assert.equal(shortHashes('snapshot 40e0cee2aaed5c04e01cde39cc71285f0dd953df and 40e0cee'), 'snapshot 40e0cee and 40e0cee')
})

test('only a question you owe an answer to gets a line of its own, whole', () => {
  const q = `Finding 1 on the report 40e0cee2aaed5c04e01cde39cc71285f0dd953df was rejected twice; ${'x'.repeat(200)}?`
  const w = parseWake(`verdict: Waiting\nparty: developer\nreason: r\nquestion: ${q}\npredicate: p\n`, 0)
  assert.deepEqual(bandOf(w)?.lines, [`Finding 1 on the report 40e0cee was rejected twice; ${'x'.repeat(200)}?`])
  assert.equal(bandOf(parseWake(`verdict: Waiting\nparty: developer\nreason: r\nquestion: ${q}\npredicate: p\n`, 4))?.label, 'Stuck')
})

test('a sudus, cairn or history-changing git command refreshes; other commands do not', () => {
  assert.equal(changesVerdict('sudus check WTE-001'), true)
  assert.equal(changesVerdict('cd app && cairn begin implement X'), true)
  assert.equal(changesVerdict('git commit -m "x"'), true)
  assert.equal(changesVerdict('git status'), false)
  assert.equal(changesVerdict('npm test'), false)
  assert.equal(changesVerdict('echo sudusness'), false)
})

test('review mechanism is read as one action, and every multi-word action wake names is known', () => {
  const v = verdictOf(parseWake('verdict: Resolvable\naction: review mechanism WTE-001\nreason: r\npredicate: p\n', 0))
  assert.deepEqual([v.action, v.target], ['review mechanism', 'WTE-001'])
  assert.equal(bandOf(v)?.subject, 'reviewing the check for WTE-001')
  assert.deepEqual(ORDER.filter((a: string) => a.includes(' ')), [...MULTI_WORD_ACTIONS])
})

test('a Sudus project is found from a subdirectory and in a linked worktree, and never past the working tree root', async () => {
  const fs = (...paths: string[]) => async (p: string) => paths.includes(p)
  // A linked worktree: .git is a file there, and only its branch carries the settings.
  assert.equal(await usesSudus('/w/tree/src/deep', fs('/w/tree/.git', '/w/tree/.sudus/settings.json')), true)
  assert.equal(await usesSudus('/w/tree/', fs('/w/tree/.git', '/w/tree/.cairn/settings.json')), true)
  assert.equal(await usesSudus('/w/main', fs('/w/main/.git')), false)
  // A repository inside another project's directory is its own working tree.
  assert.equal(await usesSudus('/a/b', fs('/a/.sudus/settings.json', '/a/b/.git')), false)
  assert.equal(await usesSudus('/not/a/repo', fs()), false)
  assert.equal(await usesSudus('/', fs('/.sudus/settings.json')), true)
})

test('only a command that cannot start sends the mod to the plugin copy', () => {
  // The engine's own words (Claude Code 2.1.281) for a command missing from PATH.
  assert.equal(cannotStart('HooksError: sudus: $.process.run(sudus) failed to start: ENOENT: Executable not found in $PATH: "sudus"'), true)
  assert.equal(cannotStart('HooksError: sudus: $.process.run(sudus) aborted: still running after 20000ms'), false)
})
