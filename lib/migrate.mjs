// lib/migrate.mjs: `sudus migrate` moves a project from the former layout (.cairn/, refs/cairn/*,
// the tool's name before 3.0.0) to the Sudus layout (.sudus/, refs/sudus/*), once. It runs only
// between commitments: the next start's snapshot is the next allowed base (section 5, scope), so
// no breach is ever observed against a start snapshot that still names .cairn/ paths. The records
// already on the log keep their original envelope; readers accept both.
import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { git, readRef, updateRefCAS, deleteRefCAS } from './gitx.mjs';
import { readLog, range } from './records.mjs';
import { loadSettings } from './settings.mjs';
import { layoutOf, forgetLayout, SUDUS, CAIRN } from './layout.mjs';

export class MigrateError extends Error { constructor(m) { super(m); this.name = 'MigrateError'; } }
const refuse = (m) => { throw new MigrateError(`sudus: ${m}`); };

export async function migrate(cwd) {
  const moveDir = layoutOf(cwd) === CAIRN;
  const moves = [];
  for (const k of ['log', 'snapshots', 'lease']) {
    const sha = await readRef(cwd, CAIRN[k]);
    if (!sha) continue;
    if (await readRef(cwd, SUDUS[k])) refuse(`${CAIRN[k]} and ${SUDUS[k]} both exist; migrate moves a project with one log, not two; delete the ref that is not this project's, then run it again`);
    moves.push({ from: CAIRN[k], to: SUDUS[k], sha });
  }
  if (!moves.length && !moveDir) return { migrated: false, moves: [], dir: null, commit: null };
  if (moves.some((m) => m.from === CAIRN.lease)) refuse('an action lease is held; run sudus end when it is finished, or sudus end --abandon, then migrate');
  const logRef = moves.find((m) => m.from === CAIRN.log)?.from ?? SUDUS.log;
  const log = await readLog(cwd, logRef);
  const r = range(log);
  if (r.start && !r.closed) refuse(`${r.start.payload.slug} is open; migrate runs between commitments; run sudus wake and follow it to Done first`);
  const open = log.findLast((x) => x.kind === 'command-intent' && !log.some((y) => y !== x && y.payload && y.payload.intent === x.sha));
  if (open) refuse(`transaction ${open.payload.tx} is open; run sudus recover ${open.payload.tx} first`);
  if (moveDir) {
    const dirty = (await git(['status', '--porcelain', '-z', '--', CAIRN.dir, '.gitignore'], { cwd })).stdout.split('\0').filter(Boolean);
    if (dirty.length) refuse(`${dirty.length} path(s) under ${CAIRN.dir} or .gitignore are changed and uncommitted; commit or discard them, then migrate`);
  }
  for (const m of moves) { await updateRefCAS(cwd, m.to, m.sha, null); await deleteRefCAS(cwd, m.from, m.sha); }
  let commit = null;
  if (moveDir) {
    const tracked = (await git(['ls-files', '-z', '--', CAIRN.dir], { cwd })).stdout.split('\0').filter(Boolean);
    if (tracked.length) await git(['mv', '-k', CAIRN.dir, SUDUS.dir], { cwd });
    else renameSync(join(cwd, CAIRN.dir), join(cwd, SUDUS.dir));
    const paths = [CAIRN.dir, SUDUS.dir];
    const ignore = join(cwd, '.gitignore');
    if (existsSync(ignore)) {
      const text = readFileSync(ignore, 'utf8');
      const moved = text.replace(/(^|\/)\.cairn(?=\/|$)/gm, `$1${SUDUS.dir}`);
      if (moved !== text) { writeFileSync(ignore, moved); paths.push('.gitignore'); }
    }
    if (tracked.length || paths.includes('.gitignore')) {
      await git(['commit', '-q', '-m', `sudus: migrate from the ${CAIRN.dir} layout to ${SUDUS.dir}`, '--', ...paths], { cwd });
      commit = (await git(['rev-parse', 'HEAD'], { cwd })).stdout.trim();
    }
  }
  forgetLayout(cwd);
  return { migrated: true, moves, dir: moveDir ? `${CAIRN.dir} -> ${SUDUS.dir}` : null, commit };
}

export async function runMigrate(argv, io) {
  try {
    const r = await migrate(io.cwd);
    if (!r.migrated) { io.stdout(`sudus: nothing to migrate; this project uses the ${SUDUS.dir} layout`); return 0; }
    const parts = [...r.moves.map((m) => `${m.from} -> ${m.to}`), ...(r.dir ? [r.dir] : [])];
    const remote = (await loadSettings(io.cwd).catch(() => null))?.settings.authority_remote ?? null;
    io.stdout(`sudus: migrated ${parts.join(', ')}${r.commit ? ` (commit ${r.commit.slice(0, 8)})` : ''}${remote ? `; sudus push publishes the moved refs to ${remote}` : ''}`);
    return 0;
  } catch (e) { io.stderr(e.message.startsWith('sudus: ') ? e.message : `sudus: ${e.message}`); return 1; }
}
