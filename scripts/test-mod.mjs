// Runs the mod's kit tests through Claude Code's own engine. `claude plugin test` runs every
// *.test.ts under the folder it is given and passes the plugin its manifest's option defaults, so
// each run is a scratch copy of the plugin holding one folder of mod/kit: `off` as the plugin
// ships, and `on` with the `view` default set to `above-prompt`, as a person who chose it has it.
// Needs `claude` on PATH. Run with: npm run test:mod
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const RUNS = [{ kit: 'off', view: null }, { kit: 'on', view: 'above-prompt' }]

let failed = false
for (const { kit, view } of RUNS) {
  const dir = mkdtempSync(join(tmpdir(), `sudus-mod-${kit}-`))
  try {
    for (const p of ['.claude-plugin', 'hooks', 'mod', 'package.json']) cpSync(join(root, p), join(dir, p), { recursive: true })
    for (const other of RUNS) if (other.kit !== kit) rmSync(join(dir, 'mod/kit', other.kit), { recursive: true, force: true })
    if (view !== null) {
      const manifest = join(dir, '.claude-plugin/plugin.json')
      const p = JSON.parse(readFileSync(manifest, 'utf8'))
      p.userConfig.view.default = view
      writeFileSync(manifest, JSON.stringify(p, null, 2))
    }
    console.log(`== mod/kit/${kit}${view ? ` (view: ${view})` : ' (as shipped)'}`)
    const run = spawnSync('claude', ['plugin', 'test', dir], { stdio: 'inherit' })
    if (run.error) { console.error(`claude plugin test could not start: ${run.error.message}`); failed = true }
    else if (run.status !== 0) failed = true
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
process.exitCode = failed ? 1 : 0
