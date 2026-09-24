// Runs the mod's kit tests (mod/kit) through Claude Code's own engine: `claude plugin test` runs
// every *.test.ts under the folder it is given, and the node tests under tests/ are not kit tests,
// so the plugin is copied to a scratch folder without them first. Needs `claude` on PATH.
// Run with: npm run test:mod
import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const dir = mkdtempSync(join(tmpdir(), 'sudus-mod-'))
try {
  for (const p of ['.claude-plugin', 'hooks', 'mod', 'package.json']) cpSync(join(root, p), join(dir, p), { recursive: true })
  const run = spawnSync('claude', ['plugin', 'test', dir], { stdio: 'inherit' })
  if (run.error) { console.error(`claude plugin test could not start: ${run.error.message}`); process.exitCode = 1 }
  else process.exitCode = run.status ?? 1
} finally {
  rmSync(dir, { recursive: true, force: true })
}
