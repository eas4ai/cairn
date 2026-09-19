# Cutover: archive 1.x, make v2 main

Run by the developer, in /home/shawn/workspace2/cairn-dev, after the
first v2 Done (section 14, step 5; decision 13.7). The agent prepares
nothing else; every command below is yours.

Privacy: eas4ai/cairn-dev is private and may hold v2. eas4ai/cairn
(the `public` remote) never receives `v2`, `refs/cairn/*` or
docs/plans/ until you say so; the local pre-push hook refuses such a
push. Nothing in this checklist pushes to `public`.

## Before

- [ ] `cairn wake` on the v2 worktree prints `Done:`.
- [ ] `node --test tests/*.test.mjs` passes on v2, fixtures included.
- [ ] docs/cutover/cut-list.md is committed and every row read.
- [ ] `git -C /home/shawn/workspace2/cairn-dev status --porcelain` is empty
      and `git -C /home/shawn/workspace2/cairn-dev branch --show-current` is `main`.

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

    git checkout v2
    git merge --no-ff main -m "Merge the archived 1.x line so its history stays reachable from main"
    git branch -f main v2
    git checkout main
    git push origin main
    git push origin 'refs/cairn/log:refs/cairn/log' 'refs/cairn/snapshots:refs/cairn/snapshots'

Only if the merge conflicts (it should not: v2 replaced every 1.x
file), resolve by taking v2's side for every path and keep the README
note from the 1.x commit at the end of README.md.

## After

- [ ] `git log --oneline -1 main` shows the merge commit.
- [ ] `git describe --tags v1-final` prints `v1-final`.
- [ ] `node --test tests/*.test.mjs` passes on main.
- [ ] `cairn wake` on main prints `Done:`; `cairn push` succeeds against origin.
- [ ] The production checkout at /home/shawn/workspace2/cairn is not
      touched by this checklist; it fast-forwards from cairn-dev main
      only on your word, and eas4ai/cairn receives v2 only then.
- [ ] Remove the `v2` branch locally: `git branch -d v2` (the worktree at
      /home/shawn/workspace2/cairn-v2 must be removed first with
      `git worktree remove /home/shawn/workspace2/cairn-v2`).
