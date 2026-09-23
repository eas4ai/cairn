/* @jsx h */
import type { Register } from 'claude-code'

import { EXPRESSIONS, SUDUS_SVG, type Expression } from './faces.ts'
import { latest } from './latest.ts'
import { rasterOf, type Raster } from './raster.ts'
import { cannotStart, changesVerdict, expressionOf, parseWake, statusTextOf, usesSudus, type Verdict } from './verdict.ts'

// The Sudus plugin's hooks module: what `sudus wake` names next, in front of the person, as a
// status line under the prompt, a pane beside the transcript, or both, with a blobatar face whose
// expression follows the verdict. Everything is set in settings.json
// (pluginConfigs.sudus.options); there is no command. Zero tokens: the module runs `sudus wake`
// itself after every turn and every sudus, cairn or git command, and never asks the model
// anything. A hook never waits on wake: it asks for a refresh and returns, and one wake runs at a
// time with the newest request always landing. Claude Code loads it only with function hooks on
// (early access); the plugin's shell hooks run either way.

const PANE_ID = 'sudus'
const TITLE = 'Sudus'
const FACE_COLUMNS = 12
const FACE_ROWS = 6
const FACE_PX = 96
const SVG_PX = 72
const WAKE_TIMEOUT_MS = 20000
const BLOBATAR = 'https://blobatar.dev/avatar/'

type View = 'status-line' | 'pane' | 'both' | 'off'

const VIEWS: readonly View[] = ['status-line', 'pane', 'both', 'off']

const viewOf = (value: unknown): View => (VIEWS as readonly unknown[]).includes(value) ? (value as View) : 'status-line'

let view: View = 'status-line'
let command = 'sudus'
let isPluginCopy = false
let withAsciiFace = true
let seed = 'sudus'
let verdict: Verdict = { kind: 'missing', detail: 'sudus wake has not run yet' }
let isTurnRunning = false
let hasRefreshed = false
let isPaneOpen = false
let isPaneClosedByPerson = false
let svgs: Record<Expression, string> = { ...SUDUS_SVG }
const rasters = new Map<Expression, Raster>()
const refreshes = latest()

// Bound at session.start over that dispatch's `$`, as the diff mod binds its host: the other
// hooks ask for a paint or a refresh without handing `$` to anything.
let paint: () => void = () => undefined
let refresh: () => void = () => undefined

const showsStatus = () => view === 'status-line' || view === 'both'
const showsPane = () => view === 'pane' || view === 'both'

const colorOf = (v: Verdict): string | undefined =>
  v.kind === 'none' ? undefined : v.kind !== 'verdict' ? 'red' : v.verdict === 'Done' ? 'cyan' : v.verdict === 'Waiting' ? 'yellow' : 'green'

const rasterFor = (x: Expression): Raster => {
  let r = rasters.get(x)
  if (!r) { r = rasterOf(svgs[x], FACE_PX); rasters.set(x, r) }
  return r
}

export const register: Register = (on, options) => {
  view = viewOf(options.view)
  command = typeof options.command === 'string' && options.command.trim() ? options.command.trim() : 'sudus'
  withAsciiFace = options.asciiFace !== false
  seed = typeof options.face === 'string' && options.face.trim() ? options.face.trim() : 'sudus'

  if (view === 'off') return

  on('session.start', async ($, e, next) => {
    const r = await next(e)
    paint = () => {
      try {
        if (showsStatus()) $.ui.status(statusTextOf(verdict, isTurnRunning, withAsciiFace))
        if (showsPane() && !isPaneClosedByPerson) {
          if (isPaneOpen) $.ui.invalidate('ui.render')
          else if (hasRefreshed && verdict.kind !== 'none') {
            // The pane opens on the first verdict of a Sudus project, never in a repository
            // that does not use Sudus.
            isPaneOpen = true
            $.ui.open({ id: PANE_ID, title: TITLE }).catch(err => {
              isPaneOpen = false
              $.ui.log(`sudus: pane not opened: ${err}`)
            })
          }
        }
      } catch (err) {
        $.ui.log(`sudus: not drawn: ${err}`)
      }
    }
    refresh = () => {
      void refreshes(async () => {
        try {
          const cwd = await $.session.cwd()
          if (!(await usesSudus(cwd, p => $.fs.exists(p)))) verdict = { kind: 'none' }
          else {
            const init = { cwd, timeoutMs: WAKE_TIMEOUT_MS }
            const pluginCopy = ['node', `${$.plugin.root}/bin/sudus.mjs`, 'wake']
            const run = await $.process.run(isPluginCopy ? pluginCopy : [command, 'wake'], init).catch(err => {
              // The sudus on PATH cannot start: run this plugin's own copy from now on, as the
              // session-start hook does. A slow sudus, or a command the person named in settings,
              // is reported as it is.
              if (isPluginCopy || command !== 'sudus' || !cannotStart(err)) throw err
              isPluginCopy = true
              $.ui.log(`sudus: ${command} cannot start (${String(err).split('\n')[0]}); running this plugin's copy`)
              return $.process.run(pluginCopy, init)
            })
            verdict = parseWake(run.stdout, run.exitCode)
          }
        } catch (err) {
          const why = String(err).split('\n')[0]
          verdict = { kind: 'missing', detail: cannotStart(err) ? `${command} cannot start (${why}); the install-sudus skill sets it up` : `${command} wake did not finish (${why})` }
        }
        hasRefreshed = true
        paint()
      })
    }
    if (seed !== 'sudus') {
      // Another face: its six expressions fetched once; a fetch that fails keeps the sudus face.
      const fetched: Partial<Record<Expression, string>> = {}
      for (const x of EXPRESSIONS) {
        try {
          const { ok, text } = await $.http.fetch(`${BLOBATAR}${encodeURIComponent(seed)}?background=squircle&expression=${x}`)
          if (ok && text.startsWith('<svg')) fetched[x] = text
        } catch (err) {
          $.ui.log(`sudus: face ${seed} not fetched (${x}): ${err}`)
        }
      }
      if (EXPRESSIONS.every(x => fetched[x] !== undefined)) { svgs = fetched as Record<Expression, string>; rasters.clear() }
    }
    refresh()
    return r
  })

  // A subagent's run raises no turn.start, so every one here is the main loop's.
  on('turn.start', async ($, e, next) => {
    isTurnRunning = true
    paint()
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId) return r
    isTurnRunning = false
    paint()
    refresh()
    return r
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const r = await next(e)
    const cmd = (e as { command?: unknown }).command
    if (typeof cmd === 'string' && changesVerdict(cmd)) refresh()
    return r
  })

  on('ui.close', { id: PANE_ID }, ($, e, next) => {
    isPaneOpen = false
    if (e.origin.kind === 'person') isPaneClosedByPerson = true
    return next(e)
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE_ID) return next(e)
    const expression = expressionOf(verdict, isTurnRunning)
    const color = colorOf(verdict)
    const lines = paneLines(verdict, isTurnRunning)
    if (e.surface === 'terminal') {
      const { Box, Text, Image } = $.ui.resolve(e)
      const face = rasterFor(expression)
      return (
        <Box flexDirection="column" paddingTop={1} paddingLeft={1}>
          <Box flexDirection="row" columnGap={2}>
            <Image key="face" source={{ rgba: face.rgba, width: face.width, height: face.height }} columns={FACE_COLUMNS} rows={FACE_ROWS} alt={`Sudus is ${expression}`} />
            <Box flexDirection="column">
              <Text bold color={color}>{lines.headline}</Text>
              {lines.body.map((l, i) => <Text key={`b${i}`} wrap="wrap">{l}</Text>)}
            </Box>
          </Box>
          {lines.notes.map((l, i) => <Text key={`n${i}`} dimColor wrap="wrap">{l}</Text>)}
        </Box>
      )
    }
    const { Box, Text, Svg } = $.ui.resolve(e)
    return (
      <Box flexDirection="column" paddingTop={1} paddingLeft={1}>
        <Box flexDirection="row" columnGap={2}>
          <Svg source={svgs[expression]} alt={`Sudus is ${expression}`} width={SVG_PX} height={SVG_PX} />
          <Box flexDirection="column">
            <Text bold color={color}>{lines.headline}</Text>
            {lines.body.map((l, i) => <Text key={`b${i}`} wrap="wrap">{l}</Text>)}
          </Box>
        </Box>
        {lines.notes.map((l, i) => <Text key={`n${i}`} dimColor wrap="wrap">{l}</Text>)}
      </Box>
    )
  })
}

function paneLines(v: Verdict, isTurnRunning: boolean): { headline: string; body: string[]; notes: string[] } {
  const turn = isTurnRunning ? ' (a turn is running)' : ''
  if (v.kind === 'none') return { headline: 'No Sudus project here' + turn, body: ['This repository has no .sudus/settings.json; the new-project or existing-project skill starts one.'], notes: [] }
  if (v.kind === 'missing') return { headline: 'Sudus is not reachable' + turn, body: [v.detail], notes: [] }
  if (v.kind === 'line') return { headline: (v.exit === 3 ? 'Repair' : 'Sudus') + turn, body: [v.line], notes: [] }
  const notes = [`predicate: ${v.predicate}`]
  if (v.layout) notes.push(v.layout)
  if (v.verdict === 'Done') return { headline: (v.target ? `Done: ${v.target}` : 'Done') + turn, body: [v.reason], notes }
  if (v.verdict === 'Waiting') return { headline: `Waiting for the ${v.party ?? 'developer'}` + turn, body: v.question ? [v.question, v.reason] : [v.reason], notes }
  return { headline: `${v.action ?? ''} ${v.target ?? ''}`.trim() + turn, body: [v.reason], notes }
}
