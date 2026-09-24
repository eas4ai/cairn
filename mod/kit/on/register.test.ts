import type { On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'

// The band, the pane and the braille fallback, run through Claude Code's own engine by its mod test
// kit, with the view turned on: `npm run test:mod` runs these in a copy of the plugin whose `view`
// default is `above-prompt`, as a person who chose it in /config has it. The kit passes a plugin
// its manifest's defaults and nothing else.

const WAKE = 'verdict: Resolvable\naction: record docs/spec/roadmap.md\nreason: docs/spec/roadmap.md is a declared input with uncommitted changes; commit it, then run the check again, so that the receipt binds the committed bytes\npredicate: the path is clean\n'
const BAND = { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 100, scroll: { offset: 0, bodyRows: 20 }, view: {} }

function world(on: On, blits: { deny?: string }) {
  const seen = { runs: 0, blits: 0, sources: new Set<string>(), status: [] as (string | undefined)[] }
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/work' }))
  on('fs.exists', ($, e) => ({ value: e.path === '/work/.sudus/settings.json' || e.path === '/work/.git' }))
  on('process.run', () => { seen.runs++; return { value: { exitCode: 0, stdout: WAKE, stderr: '' } } })
  on('ui.blit', ($, e) => { seen.blits++; seen.sources.add(JSON.stringify((e as { source?: unknown }).source)); return { value: blits } })
  // What the engine draws in the band beneath the plugins: nothing of its own.
  on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'Box', children: [] }))
  on('ui.log', () => ({ value: undefined }))
  on('ui.status', ($, e) => { seen.status.push(e.text); return { value: undefined } })
  return seen
}

describe('register', () => {
  test('the band says the next step in plain words at the left, with the picture face at the right', async ($, on) => {
    const clock = mock.clock(on)
    const seen = world(on, {})
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
    await clock.settle()
    expect(seen.runs).toBe(1)
    // The status row an earlier version pinned is cleared, and nothing writes it again.
    expect(seen.status).toEqual([undefined])
    const ui = await $.ui.mount({ plugin: 'sudus', surface: 'terminal', component: 'AbovePrompt', props: BAND, viewport: { columns: 100, rows: 40 } })
    expect((await ui.find({ type: 'Text', text: /^Working$/ }))).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /committing docs\/spec\/roadmap\.md before the checks run/ }))).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /declared input|receipt|Resolvable/ }))).toBeUndefined()
    expect((await ui.find({ type: 'Image', key: 'face' }))).toBeDefined()
    // Clear of the collapse control the engine draws over the band's top-right corner.
    expect(JSON.stringify(await ui.drawn())).toContain('"paddingRight":4')
    await clock.advance(8000)
    expect(seen.blits > 50).toBe(true)
    expect(seen.sources.size > 20).toBe(true)
    expect(seen.status).toEqual([undefined])
  })

  test('a terminal that draws no pictures gets the braille face, which blinks', async ($, on) => {
    const clock = mock.clock(on)
    // The engine's own words (Claude Code 2.1.281) for a terminal with no placeholder images.
    const seen = world(on, { deny: 'the Image draws its alt here: the terminal draws no placeholder images (test)' })
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
    await clock.settle()
    const ui = await $.ui.mount({ plugin: 'sudus', surface: 'terminal', component: 'AbovePrompt', props: BAND, viewport: { columns: 100, rows: 40 } })
    await clock.advance(400)
    const again = await $.ui.mount({ plugin: 'sudus', surface: 'terminal', component: 'AbovePrompt', props: BAND, viewport: { columns: 100, rows: 40 } })
    expect(await again.find({ type: 'Image' })).toBeUndefined()
    const face = await again.drawn({ in: 'sudus:face' })
    expect(/[\u2800-\u28ff]{10}/.test(JSON.stringify(face))).toBe(true)
    const blits = seen.blits
    await clock.advance(1000)
    expect(seen.blits).toBe(blits)
    const frames = new Set<string>()
    for (let i = 0; i < 50; i++) { await again.advance(150); frames.add(JSON.stringify(await again.drawn({ in: 'sudus:face' }))) }
    expect(frames.size).toBe(2)
    await ui.unmount()
  })

  test('the pane draws the picture face and the verdict', async ($, on) => {
    const clock = mock.clock(on)
    world(on, {})
    on('ui.open', () => ({ value: { isPlaced: true } }))
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
    await clock.settle()
    const ui = await $.ui.mount({ plugin: 'sudus', surface: 'terminal', component: 'Pane', requestId: 'sudus', props: { title: 'Sudus', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} }, viewport: { columns: 160, rows: 40 } })
    expect(await ui.find({ type: 'Image', key: 'face' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Working: committing docs\/spec\/roadmap\.md before the checks run$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /so that the receipt binds the committed bytes$/ })).toBeDefined()
  })

  test('a survey keeps the band', async ($, on) => {
    const clock = mock.clock(on)
    world(on, {})
    on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'Text', children: ['survey'] }))
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
    await clock.settle()
    const ui = await $.ui.mount({ plugin: 'sudus', surface: 'terminal', component: 'AbovePrompt', props: { ...BAND, hasSurvey: true }, viewport: { columns: 100, rows: 40 } })
    expect(await ui.find({ type: 'Text', text: /Working/ })).toBeUndefined()
  })
})
