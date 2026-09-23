import { test } from 'node:test'
import assert from 'node:assert/strict'
import { changesVerdict, expressionOf, parseWake, statusTextOf, type Verdict } from '../mod/verdict.ts'

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
  assert.equal(statusTextOf(v, false, true), '(o_o) Sudus | Resolvable | run WTE-001 | no current receipt carries a result for WTE-001')
  assert.equal(statusTextOf(v, true, true), '(o_o)? Sudus | Resolvable | run WTE-001 | no current receipt carries a result for WTE-001')
})

test('Waiting is sad, or mad with no developer to answer; Done is happy', () => {
  const w = parseWake('verdict: Waiting\nparty: developer\nreason: escalation abc awaits an answer\npredicate: p\n', 0)
  assert.equal(expressionOf(w, false), 'sad')
  assert.equal(statusTextOf(w, false, false), 'Sudus | Waiting for the developer | escalation abc awaits an answer')
  assert.equal(expressionOf(parseWake('verdict: Waiting\nparty: developer\nreason: r\npredicate: p\n', 4), false), 'mad')
  assert.equal(expressionOf(parseWake('verdict: Done\ncommitment: first\nreason: r\npredicate: p\n', 0), false), 'happy')
})

test('Done names its commitment, and Waiting shows the escalation question', () => {
  const d = verdictOf(parseWake('verdict: Done\ncommitment: first\nreason: done record closes first and no backlog item waits\npredicate: a done record names the commitment and final workspace snapshot\n', 0))
  assert.deepEqual([d.verdict, d.target], ['Done', 'first'])
  assert.equal(statusTextOf(d, false, false), 'Sudus | Done | first')
  const w = verdictOf(parseWake('verdict: Waiting\nparty: developer\nreason: escalation 1a2b awaits an answer\nquestion: Raise the bound to 1 ms?\nrecommendation: yes\nbecause: b\nif wrong: w\ninstead: i\npredicate: p\n', 0))
  assert.equal(w.question, 'Raise the bound to 1 ms?')
  assert.equal(statusTextOf(w, false, true), '(;_;) Sudus | Waiting for the developer | Raise the bound to 1 ms?')
})

test('an exit-3 line and an empty print are sick, and say so', () => {
  const line = parseWake('sudus: outside a project; run /new-project or /existing-project\n', 3)
  assert.deepEqual(line, { kind: 'line', line: 'sudus: outside a project; run /new-project or /existing-project', exit: 3 })
  assert.equal(expressionOf(line, false), 'sick')
  assert.equal(statusTextOf(line, false, true), '(x_x) Sudus | sudus: outside a project; run /new-project or /existing-project')
  assert.equal(parseWake('', 1).kind, 'missing')
})

test('a repository that does not use Sudus clears the status line and keeps an idle face', () => {
  const none: Verdict = { kind: 'none' }
  assert.equal(statusTextOf(none, false, true), undefined)
  assert.equal(statusTextOf(none, true, true), undefined)
  assert.equal(expressionOf(none, false), 'idle')
})

test('a long reason is cut to the status line width', () => {
  const s = statusTextOf(parseWake(`verdict: Resolvable\naction: fix gate\nreason: ${'x'.repeat(300)}\npredicate: p\n`, 0), false, false)
  assert.equal(s?.length, 120)
  assert.ok(s?.endsWith('...'))
})

test('a sudus, cairn or history-changing git command refreshes; other commands do not', () => {
  assert.equal(changesVerdict('sudus check WTE-001'), true)
  assert.equal(changesVerdict('cd app && cairn begin implement X'), true)
  assert.equal(changesVerdict('git commit -m "x"'), true)
  assert.equal(changesVerdict('git status'), false)
  assert.equal(changesVerdict('npm test'), false)
  assert.equal(changesVerdict('echo sudusness'), false)
})
