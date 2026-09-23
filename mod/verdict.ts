// What `sudus wake` printed, read into one record, and what the status line and the face say
// about it. Pure functions: no engine, no I/O, so tests/mod-verdict.test.ts runs them alone.

import type { Expression } from './faces.ts'

export type Verdict =
  | {
      kind: 'verdict'
      verdict: 'Resolvable' | 'Waiting' | 'Done'
      action: string | null
      target: string | null
      party: string | null
      question: string | null
      reason: string
      predicate: string
      layout: string | null
      exit: number
    }
  | { kind: 'line'; line: string; exit: number }
  | { kind: 'missing'; detail: string }
  | { kind: 'none' }

// A working tree with neither .sudus/settings.json nor .cairn/settings.json does not use Sudus:
// wake is not run there, the status line is cleared and the pane says so.
export const SETTINGS_FILES: readonly string[] = ['.sudus/settings.json', '.cairn/settings.json']

// Whether the session's directory belongs to a Sudus project: a settings file of either layout in
// it or an ancestor, up to the working tree's root, the first directory holding .git (a directory
// in the main tree, a file in a linked worktree, whose own branch may be the only one on Sudus).
export async function usesSudus(cwd: string, exists: (path: string) => Promise<boolean>): Promise<boolean> {
  let dir = cwd.replace(/\/+$/, '')
  for (;;) {
    for (const f of SETTINGS_FILES) if (await exists(`${dir}/${f}`)) return true
    if (dir === '' || await exists(`${dir}/.git`)) return false
    dir = dir.slice(0, dir.lastIndexOf('/'))
  }
}

// Whether `$.process.run` rejected because the command cannot start, the one case the status line
// runs this plugin's own copy instead; a command that is only slow is reported, never replaced.
export function cannotStart(err: unknown): boolean {
  return /failed to start|\bENOENT\b/.test(String(err))
}

// The actions wake names with more than one word (lib/wake.mjs ORDER), read whole before the target.
export const MULTI_WORD_ACTIONS: readonly string[] = ['review mechanism']

function splitAction(act: string): [string, string | null] {
  const multi = MULTI_WORD_ACTIONS.find(a => act === a || act.startsWith(`${a} `))
  const sp = multi !== undefined ? multi.length : act.indexOf(' ')
  return sp < 0 ? [act, null] : [act.slice(0, sp), act.slice(sp + 1) || null]
}

// Wake prints `key: value` lines: verdict; `action: <word> <target>` for Resolvable,
// `commitment: <slug>` for Done, `party:` and the escalation's `question:` for Waiting; reason,
// predicate, and a `layout:` line on a project still on the former layout. An exit of 3 is one
// line naming a repair or a skill; 4 is Waiting with no developer to answer.
export function parseWake(stdout: string, exitCode: number): Verdict {
  const lines = stdout.split('\n').map(l => l.trimEnd()).filter(l => l.length > 0)
  const fields = new Map<string, string>()
  for (const line of lines) {
    const m = /^([a-z]+): (.*)$/.exec(line)
    if (m) fields.set(m[1]!, m[2]!)
  }
  const verdict = fields.get('verdict')
  if (verdict === 'Resolvable' || verdict === 'Waiting' || verdict === 'Done') {
    const act = fields.get('action') ?? null
    const [action, actionTarget] = act === null ? [null, null] : splitAction(act)
    return {
      kind: 'verdict',
      verdict,
      action,
      target: fields.get('commitment') ?? actionTarget,
      party: fields.get('party') ?? null,
      question: fields.get('question') ?? null,
      reason: fields.get('reason') ?? '',
      predicate: fields.get('predicate') ?? '',
      layout: fields.get('layout') ?? null,
      exit: exitCode,
    }
  }
  const line = lines.find(l => l.startsWith('sudus:')) ?? lines[0]
  if (line !== undefined) return { kind: 'line', line, exit: exitCode }
  return { kind: 'missing', detail: `sudus wake printed nothing (exit ${exitCode})` }
}

// The face for a verdict: thinking while a turn runs; idle with work to do or no Sudus project;
// sad while the developer owes an answer; mad when no one can answer; sick on a repair or outside
// a project; happy at Done.
export function expressionOf(v: Verdict, isTurnRunning: boolean): Expression {
  if (isTurnRunning) return 'thinking'
  if (v.kind === 'none') return 'idle'
  if (v.kind === 'missing') return 'sick'
  if (v.kind === 'line') return 'sick'
  if (v.verdict === 'Done') return 'happy'
  if (v.verdict === 'Waiting') return v.exit === 4 ? 'mad' : 'sad'
  return 'idle'
}

// A tiny ASCII face for the status line, keyed to the same expression as the picture.
export const ASCII_FACE: Record<Expression, string> = {
  idle: '(o_o)',
  happy: '(^_^)',
  sad: '(;_;)',
  mad: '(>_<)',
  sick: '(x_x)',
  thinking: '(o_o)?',
}

const STATUS_MAX = 120

// One line under the prompt, or undefined to clear it where the repository does not use Sudus.
// The reason is cut to fit by characters, never inside one.
export function statusTextOf(v: Verdict, isTurnRunning: boolean, withFace: boolean): string | undefined {
  if (v.kind === 'none') return undefined
  const face = withFace ? `${ASCII_FACE[expressionOf(v, isTurnRunning)]} ` : ''
  let text: string
  if (v.kind === 'missing') text = `Sudus | ${v.detail}`
  else if (v.kind === 'line') text = `Sudus | ${v.line}`
  else if (v.verdict === 'Done') text = v.target ? `Sudus | Done | ${v.target}` : 'Sudus | Done'
  else if (v.verdict === 'Waiting') text = `Sudus | Waiting for the ${v.party ?? 'developer'} | ${v.question ?? v.reason}`
  else text = `Sudus | Resolvable | ${v.action ?? ''} ${v.target ?? ''} | ${v.reason}`.replace(/\s+\|/g, ' |')
  const chars = Array.from(face + text)
  return chars.length <= STATUS_MAX ? chars.join('') : chars.slice(0, STATUS_MAX - 3).join('') + '...'
}

// Whether a Bash command can change the verdict: any sudus or cairn invocation, or a git commit.
export function changesVerdict(command: string): boolean {
  return /(^|[\s;&|(])(sudus|cairn)(\s|$)/.test(command) || /\bgit\s+(commit|checkout|switch|reset|revert|merge|rebase|pull|stash)\b/.test(command)
}
