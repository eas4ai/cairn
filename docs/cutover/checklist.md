# Cutover: archive 1.x, make v2 main

Run by the developer, in /home/shawn/workspace2/cairn-dev, after the
first v2 Done (section 14, step 5; decision 13.7). The agent prepares
nothing else; every command below is yours. Every command in this
checklist was run and its output checked in a disposable clone before
this file was written (main built from a shallow tree copy of
/home/shawn/workspace2/cairn-dev at tag v0.7.0, v2 built from a shallow
tree copy of the cairn-v2 worktree); see the plan 14 report's "Fix round
1" section for the transcript. `v2` is an orphan branch (its root commit
has no parent) with no commit in common with `main`
(`git merge-base v2 main` exits 1): the steps below reflect that, not a
merge of two related histories.

Privacy: eas4ai/cairn-dev is private and may hold v2. eas4ai/cairn
(the `public` remote) never receives `v2`, `refs/cairn/*` or
docs/plans/ until you say so; the local pre-push hook refuses such a
push. Nothing in this checklist pushes to `public`.

## Before

- [ ] `cairn wake` on the v2 worktree prints `Done:`.
- [ ] `node --test tests/*.test.mjs` passes on v2, fixtures included.
- [ ] docs/cutover/cut-list.md is committed and every row read.
- [ ] `.cairn/settings.json`'s `typesafeai` block has `weights`, `agent_ceiling`
      and `confidence_floors`, not the seven old thresholds or a `mode` field;
      settings gains `developer: present` or `absent`. `cairn wake` above
      already proves settings load cleanly, but this is the one thing this
      checklist's own "Before" pass calls out by name, since the shape changed
      twice within v2's own development and a stale `.cairn/settings.json`
      carried over from an earlier v2 checkout would otherwise only surface as
      an opaque `settings refused` message deep in some other step.
- [ ] `git -C /home/shawn/workspace2/cairn-dev status --porcelain` is empty
      and `git -C /home/shawn/workspace2/cairn-dev branch --show-current` is `main`.
- [ ] `git -C /home/shawn/workspace2/cairn-v2 status --porcelain` is empty.
- [ ] Look at the production checkout, /home/shawn/workspace2/cairn. It is
      not touched by this checklist (see "After"), but if it currently
      carries uncommitted or untracked work -- at the time this checklist
      was written that was an uncommitted edit to `bin/hook.mjs` and an
      untracked `Claude outputs/` directory -- decide what you want done
      with it before you go further; nothing here does that for you.
- [ ] Remove the `cairn-v2` worktree, so `v2` can be checked out directly
      in the main checkout below (Git refuses to check out a branch that
      is already checked out in another worktree of the same
      repository):

      cd /home/shawn/workspace2/cairn-dev
      git worktree remove /home/shawn/workspace2/cairn-v2

## Archive the 1.x line

    cd /home/shawn/workspace2/cairn-dev
    git fetch origin
    git tag -a v1-final -m "Final commit of the Cairn 1.x line before v2 became main" main
    git push origin v1-final

Add this note to the top of README.md on main and commit it as the last
1.x commit, then move the tag to it:

    Cairn 1.x ends at tag v1-final. Cairn 2 continues on main; its
    records are commits on refs/cairn/log and refs/cairn/snapshots and
    1.x records under .cairn/ are not read (docs/spec/cairn-v2.md,
    section 12).

    git add README.md
    git commit -m "Close the 1.x line with a README note"
    git tag -f -a v1-final -m "Final commit of the Cairn 1.x line before v2 became main"
    git push --force origin v1-final
    git branch v1-archive v1-final
    git push origin v1-archive

## Make v2 main

`v2` and `main` share no history, so an ordinary `git merge` refuses
with "refusing to merge unrelated histories", and forcing it past that
with `--allow-unrelated-histories` alone stages every 1.x-only path
(`.cairn/evidence/`'s several thousand files among them) as ordinary
additions into the result -- there is nothing to conflict on a path
that exists on only one side. The cutover is a replacement of the
tree, not a merge of trees: use the `ours` strategy, which records
both parents (so 1.x's history stays reachable from `main`) but keeps
`v2`'s tree exactly, byte for byte, with nothing from `main` staged.

    cd /home/shawn/workspace2/cairn-dev
    git checkout v2
    git merge --allow-unrelated-histories -s ours main -m "Merge the archived 1.x line so its history stays reachable from main"
    git diff v2@{1} HEAD   # must print nothing: the tree did not change
    git checkout main
    git merge --ff-only v2
    cairn push

There is no conflict to resolve and nothing to choose a side on; if
`git diff v2@{1} HEAD` prints anything, stop and do not push -- the
tree changed and something above was run wrong.

`cairn push`, not a plain `git push`, sends `main`, `refs/cairn/log` and
`refs/cairn/snapshots` together: the working agreement's own push
paragraph (lib/travel.mjs's AGREEMENT_PUSH_TEXT) says "Never push
refs/cairn/\* with plain git push", because a raw push has no lease and
cairn push validates each ref against the remote's own current tip
before sending. The original text of this checklist named the plain
`git push` form for these two refs; that was wrong and is corrected
here, not carried forward.

### Kept files

- [ ] assets/cover.jpg and assets/notation.png are already in v2's
      tree, byte-identical to 1.x's (confirmed by matching Git blob SHA
      and by `cmp` in the disposable clone test). Nothing to do.
- [ ] docs/video/ is a local reference directory, never tracked in this
      repository on either line (`git ls-files docs/video` is empty on
      both 1.x's main and v2); the production checkout at
      /home/shawn/workspace2/cairn happens to have the files on disk,
      untracked, and a branch switch or merge leaves an untracked
      directory in place, so this needs no cutover step there. v2 has no
      root .gitignore yet, though, so if you ever populate docs/video/
      locally after this cutover, add it first so it can never be
      committed by accident:

      git check-ignore -q docs/video/ || { echo "docs/video/" >> .gitignore; git add .gitignore; git commit -m "Ignore docs/video, a local-only reference directory not tracked in this repository"; }

### 1.x paths this commit removes

Every one of these is absent from v2's tree by construction (not by an
extra deletion step): the `-s ours` merge above already excludes them.
Counted directly, comparing 1.x's main (at tag v0.7.0) against v2's tree
in the disposable clone test. Disposition for every row: removed by the
cutover commit; recoverable from the v0.7.0 tag (and from `v1-final`
above, which points at the same content).

| Path | Count | What it was |
|---|---|---|
| `.cairn/evidence/` | 7,608 | every mechanism's receipt history |
| `docs/decisions/` | 88 | 1.x decision files (the four-level scale) |
| `.cairn/reviews/` | 68 | independent review reports |
| `docs/commitments/` | 67 | 1.x commitment files |
| `.cairn/backlog/` | 43 | captured backlog items |
| `.cairn/stops/` | 27 | stop-hook refusal records |
| `.cairn/next-iteration/` | 14 | next-iteration items |
| `.cairn/escalations/` | 9 | escalation files |
| `docs/spec/*.md` (1.x) | 8 | autonomy.md, decisions.md, glossary.md, loop.md, overview.md, package.md, roadmap.md, specification.md -- replaced by v2's one docs/spec/cairn-v2.md |
| `docs/audit/` | 4 | audit reports |
| `docs/diagrams/` (1.x) | 3 | the 1.x loop diagrams |
| `.cairn/mechanisms/` | 3 | 1.x mechanism definitions (markdown, not v2's JSON) |
| `bin/hooks/`, `bin/hook.mjs`, `bin/spec.mjs` | 4 | 1.x's refusing stop hook and its helpers |
| `scripts/pkg-lint.mjs`, `scripts/spec-lint.mjs` | 2 | 1.x package and spec lint |
| `tests/*.test.mjs` (1.x-only) | 36 | tests for everything above |
| `skills/next-iteration/` | 1 | renamed `next-feature` in v2 |
| `docs/recon.md` | 1 | a 1.x-only working file |
| `AGENTS.md`, `CLAUDE.md`, `.gitignore` (1.x root files) | 3 | v2 does not self-host on itself yet, so it has no root AGENTS.md/CLAUDE.md of its own until you start that; write them (the new-project skill's own templates are the starting point) when you do |

`docs/manual.md` and `docs/walkthrough.md` are not in this table: both
paths still exist, replaced with v2's own content (`git diff
--diff-filter=M` in the disposable clone test), not removed.

What a 1.x project's own developer loses on upgrade: everything in
`.cairn/` under their own project (their evidence, reviews, escalations,
backlog, and mechanism definitions) -- v2 does not read 1.x records
(section 12) and this repository's own cutover is the same kind of
change, at this repository's own scale. The disposition for every
individual 1.x requirement this cut removed, replaced or kept is
docs/cutover/cut-list.md, generated from the 1.x specification by
scripts/cutlist.mjs; read it before this step, not after.

## Release

Once main is v2 and `cairn wake` on it reports `Done`, cut the release
exactly as docs/releasing.md describes; this checklist does not repeat
that document's refusal rules, only names the one command and confirms
(in the disposable clone test) that it does what that document says:
bump `package.json` and the four plugin manifests from `2.0.0-dev` to
`2.0.0` together, refuse if any AI attribution trailer landed since the
last tag, commit `Release 2.0.0`, and tag `v2.0.0` with the CHANGELOG
entry as the tag message.

    node scripts/release.mjs 2.0.0

If it refuses on the attribution check, reword the named commit first
(the working agreement's own `reword <sha>` action) and run it again.
The push is yours, exactly as docs/releasing.md's own "After the script
runs" section says: check every requirement wake names, let wake reach
`Done` again, then

    git push origin main v2.0.0

## After

- [ ] `git log --oneline main` includes the `-s ours` merge commit (it is
      not necessarily the tip: the release commit below lands after it).
- [ ] `git describe --tags v1-final` prints `v1-final`.
- [ ] `node --test tests/*.test.mjs` passes on main.
- [ ] `cairn wake` on main prints `Done:`; `cairn push` succeeds against origin.
- [ ] The production checkout at /home/shawn/workspace2/cairn is not
      touched by this checklist; it fast-forwards from cairn-dev main
      only on your word, and eas4ai/cairn receives v2 only then.
- [ ] Remove the `v2` branch locally: `git branch -d v2` (already merged
      into `main` by the `-s ours` step, so `-d`, not `-D`, succeeds).
