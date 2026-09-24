/* @jsx h */
import type { Register, Timer } from 'claude-code'

import { brailleOf } from './braille.ts'
import { blinkOf, figureAt, svgOf, type Expression } from './figure.ts'
import { latest } from './latest.ts'
import { rasterOf } from './raster.ts'
import { bandOf, cannotStart, changesVerdict, expressionOf, parseWake, usesSudus, type Verdict } from './verdict.ts'

// The Sudus plugin's hooks module: what `sudus wake` names next, in front of the person, in the
// band above the prompt, a pane beside the transcript, or both. Sudus's blobatar floats at the
// band's right and wears the verdict's expression, breathing, glancing and blinking as blobatar
// does; a terminal that shows no pictures gets the same face in braille, blinking. Everything is
// set in settings.json (pluginConfigs.sudus.options); there is no command. Zero tokens: the module
// runs `sudus wake` itself after every turn and every sudus, cairn or git command, and never asks
// the model anything. A hook never waits on wake: it asks for a refresh and returns, and one wake
// runs at a time with the newest request always landing. Claude Code loads it only with function
// hooks on (early access); the plugin's shell hooks run either way.

const PANE_ID = 'sudus'
const TITLE = 'Sudus'
const FACE_KEY = 'face'
// The band's face: about square on a terminal, whose cells are twice as tall as they are wide.
const IMAGE_COLUMNS = 8
const IMAGE_ROWS = 4
const IMAGE_PX = 96
const BRAILLE_ROWS = 5
// The pane's face.
const PANE_COLUMNS = 12
const PANE_ROWS = 6
const PANE_PX = 96
const SVG_PX = 72
// About 12 frames a second: the blink is 180 ms of a cycle of several seconds.
const FRAME_MS = 80
const PROBE_MS = 250
const WAKE_TIMEOUT_MS = 20000
// Why `$.ui.blit` refuses a picture on a terminal that draws none; the face turns to braille.
const NO_PICTURES = /the Image draws its alt here/

type View = 'status-line' | 'pane' | 'both' | 'off'

const VIEWS: readonly View[] = ['status-line', 'pane', 'both', 'off']

const viewOf = (value: unknown): View => (VIEWS as readonly unknown[]).includes(value) ? (value as View) : 'status-line'

let view: View = 'status-line'
let command = 'sudus'
let isPluginCopy = false
let hasMotion = true
let seed = 'sudus'
let verdict: Verdict = { kind: 'missing', detail: 'sudus wake has not run yet' }
let isTurnRunning = false
let hasRefreshed = false
let isPaneOpen = false
let isPaneClosedByPerson = false
// The band's instance, once drawn: what `$.ui.blit` names to swap the face.
let bandId: string | null = null
// Whether the terminal shows pictures: unknown until the first swap of the face says.
let showsPictures: boolean | null = null
let motionMs = 0
let isSwapping = false
let isProbeDue = false
let motion: Timer | null = null
const refreshes = latest()

// Bound at session.start over that dispatch's `$`, as the diff mod binds its host: the other
// hooks ask for a paint, a refresh or a probe without handing `$` to anything.
let paint: () => void = () => undefined
let refresh: () => void = () => undefined
let probe: () => void = () => undefined

const showsBand = () => view === 'status-line' || view === 'both'
const showsPane = () => view === 'pane' || view === 'both'

const colorOf = (v: Verdict): string | undefined => bandOf(v)?.color

const brailles = new Map<string, { open: string[]; shut: string[]; color: string; blinkMs: number }>()
function brailleFace(x: Expression): { open: string[]; shut: string[]; color: string; blinkMs: number } {
  const key = `${seed}\0${x}`
  let face = brailles.get(key)
  if (!face) {
    const blink = blinkOf(seed)
    const open = brailleOf(figureAt(seed, x, 0, 0, false), BRAILLE_ROWS)
    const shut = brailleOf(figureAt(seed, x, blink.shutAt, 1, false), BRAILLE_ROWS)
    face = { open: open.lines, shut: shut.lines, color: open.color, blinkMs: blink.periodMs }
    brailles.set(key, face)
  }
  return face
}

export const register: Register = (on, options) => {
  view = viewOf(options.view)
  command = typeof options.command === 'string' && options.command.trim() ? options.command.trim() : 'sudus'
  hasMotion = options.motion !== false
  seed = typeof options.face === 'string' && options.face.trim() ? options.face.trim() : 'sudus'

  if (view === 'off') return

  on('session.start', async ($, e, next) => {
    const r = await next(e)
    paint = () => {
      try {
        if (showsBand() || isPaneOpen) $.ui.invalidate('ui.render')
        if (showsPane() && !isPaneClosedByPerson && !isPaneOpen && hasRefreshed && verdict.kind !== 'none') {
          // The pane opens on the first verdict of a Sudus project, never in a repository that
          // does not use Sudus.
          isPaneOpen = true
          $.ui.open({ id: PANE_ID, title: TITLE }).catch(err => {
            isPaneOpen = false
            $.ui.log(`sudus: pane not opened: ${err}`)
          })
        }
      } catch (err) {
        $.ui.log(`sudus: not drawn: ${err}`)
      }
    }
    // Swaps the band's picture for the next frame, or once to learn whether the terminal draws
    // pictures at all; a refusal saying it draws the alt instead turns the face to braille.
    const swap = (t: number, amp: number) => {
      if (isSwapping || bandId === null || showsPictures === false || verdict.kind === 'none') return
      isSwapping = true
      const face = rasterOf(figureAt(seed, expressionOf(verdict, isTurnRunning), t, amp, true), IMAGE_PX)
      $.ui.blit({ requestId: bandId, key: FACE_KEY, source: { rgba: face.rgba, width: face.width, height: face.height }, columns: IMAGE_COLUMNS, rows: IMAGE_ROWS })
        .then(res => {
          if (res.deny === undefined) showsPictures = true
          else if (NO_PICTURES.test(res.deny)) {
            showsPictures = false
            motion?.cancel()
            motion = null
            $.ui.log(`sudus: ${res.deny}; the face is drawn in braille`)
            $.ui.invalidate('ui.render')
          }
        })
        .catch(err => $.ui.log(`sudus: face not swapped: ${err}`))
        .finally(() => { isSwapping = false })
    }
    probe = () => {
      if (isProbeDue) return
      isProbeDue = true
      $.clock.after(PROBE_MS, () => { isProbeDue = false; swap(motionMs, 0) })
    }
    if (showsBand() && hasMotion) {
      motion = $.clock.every(FRAME_MS, () => {
        motionMs += FRAME_MS
        swap(motionMs, 1)
      })
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

  // The band above the prompt: the verdict at the left, wrapped and never cut, and the face at the
  // right. A survey holds the band while it asks; the band yields to it.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const band = bandOf(verdict)
    if (!showsBand() || !hasRefreshed || band === undefined || e.props.hasSurvey || e.surface !== 'terminal') {
      bandId = null
      return next(e)
    }
    bandId = e.requestId
    const { Box, Text, Image, Client } = $.ui.resolve(e)
    const expression = expressionOf(verdict, isTurnRunning)
    let face
    if (showsPictures === false) {
      const b = brailleFace(expression)
      face = <Client key="sudus:face" module="./face.tsx" props={{ ...b, blinkMs: hasMotion ? b.blinkMs : 0 }} />
    } else {
      const r = rasterOf(figureAt(seed, expression, motionMs, hasMotion ? 1 : 0, true), IMAGE_PX)
      face = <Image key={FACE_KEY} source={{ rgba: r.rgba, width: r.width, height: r.height }} columns={IMAGE_COLUMNS} rows={IMAGE_ROWS} alt=" " />
      if (showsPictures === null && !hasMotion) probe()
    }
    const below = await next(e)
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" justifyContent="space-between" alignItems="center" columnGap={2} paddingLeft={1}>
          <Box flexDirection="column" flexGrow={1} flexShrink={1}>
            <Text wrap="wrap">
              <Text dimColor>{'sudus  '}</Text>
              <Text color={band.color}>{band.label}</Text>
              {band.subject ? `  ${band.subject}` : ''}
            </Text>
            {band.lines.map((l, i) => <Text key={`l${i}`} wrap="wrap">{l}</Text>)}
          </Box>
          {face}
        </Box>
        {below}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE_ID) return next(e)
    const expression = expressionOf(verdict, isTurnRunning)
    const color = colorOf(verdict)
    const lines = paneLines(verdict, isTurnRunning)
    const shapes = figureAt(seed, expression, 0, 0, true)
    if (e.surface === 'terminal') {
      const { Box, Text, Image } = $.ui.resolve(e)
      const face = rasterOf(shapes, PANE_PX)
      return (
        <Box flexDirection="column" paddingTop={1} paddingLeft={1}>
          <Box flexDirection="row" columnGap={2}>
            <Image key="face" source={{ rgba: face.rgba, width: face.width, height: face.height }} columns={PANE_COLUMNS} rows={PANE_ROWS} alt={`Sudus is ${expression}`} />
            <Box flexDirection="column">
              <Text color={color}>{lines.headline}</Text>
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
          <Svg source={svgOf(shapes)} alt={`Sudus is ${expression}`} width={SVG_PX} height={SVG_PX} />
          <Box flexDirection="column">
            <Text color={color}>{lines.headline}</Text>
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
