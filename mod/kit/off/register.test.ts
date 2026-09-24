import { describe, expect, mock, test } from 'claude-code/testing'

// The plugin as it ships, run through Claude Code's own engine by its mod test kit: the view is off
// until the person chooses one, so nothing is drawn and `sudus wake` never runs.

describe('register', () => {
  test('off by default: no band, no pane, no wake', async ($, on) => {
    const clock = mock.clock(on)
    let runs = 0
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    on('session.cwd', () => ({ value: '/work' }))
    on('fs.exists', ($, e) => ({ value: e.path === '/work/.sudus/settings.json' }))
    on('process.run', () => { runs++; return { value: { exitCode: 0, stdout: 'verdict: Done\ncommitment: first\nreason: r\npredicate: p\n', stderr: '' } } })
    on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'Box', children: [] }))
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
    await clock.advance(1000)
    await $.tool.call({ tool: 'Bash', command: 'sudus wake' }).catch(() => undefined)
    const ui = await $.ui.mount({ plugin: 'sudus', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 100, scroll: { offset: 0, bodyRows: 20 }, view: {} }, viewport: { columns: 100, rows: 40 } })
    expect(await ui.drawn()).toEqual({ type: 'Box', children: [] })
    expect(runs).toBe(0)
  })
})
