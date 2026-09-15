commitment: consumers-can-run-the-lint-and-open-the-skills
commit: f6ca65d
examined:
  - The build: the lint command and Node check in bin/cairn.mjs, the header and help lines, the three skills' checker sentences and the existing-project instruction-file advice, the README passages, the manual passages, the walkthrough blocks and prose, the spec prose in loop.md, specification.md, glossary.md and overview.md, the roadmap note and four pointers, the recon resolution section, the removal of docs/spec/draft.md, and the package lint's deferral scope.
  - The seven new tests red at 5622005 and green after the implementation; the walkthrough run block by block to find why its evidence commits never ran.
findings: []

## Commitment review at f6ca65d, 2026-09-15

Every requirement has current passing evidence: PKG-028 through
PKG-032, PKG-016, LOOP-087, and the inherited package set. The suite
is 422 passing, both lints clean, the kernel at 1471 of 1500 lines.

Safe violating examples: the seven new tests failed at 5622005, each on
the fault it names. The walkthrough's clean-tree assertion failed
first on the implementation itself: the blocks run under sh -e and
each check block ends with a nonzero verdict, so git commands placed
after cairn check never ran. The evidence commits now open the
following block, which is also the shape the working agreement
describes, and the assertion passes.

Attacked:

- cairn lint spawns the checker beside this kernel with the project
  root as cwd, so a relative DIR resolves in the consumer's project and
  the exit code is the checker's. The command needs no roadmap, like
  help; a consumer runs it before docs/spec/roadmap.md exists.
- The Node check reads the major version at start; on Node 17 the
  import of parseArgs fails before main runs, so the message reaches
  only Node 18 and later that lack a feature used later. It is stated
  for completeness; the README's minimum is the working statement.
- The README says Windows is unsupported. The audit found the hook's
  symlink and HOME assumptions and the URL path defect; the last is
  fixed, the first two stand, so the statement is true today.
- The phase skills keep disable-model-invocation; the README now shows
  them invoked by name. Codex's invocation form is unverified; the
  README says "the way your agent application invokes a skill" and
  names Claude Code's form only.
- The deferral scan now reads the README, the manual and the
  walkthrough; the probe before the change found no hit in any of the
  three, and the pkg-lint fixture proves a hit is reported.
- docs/spec/draft.md is gone; it declared no prefix and held no
  requirement, the spec lint reads only what remains, and the keystone
  never listed it.
- The roadmap note says each section states the contract at its date;
  four sections gained a one-line pointer to the commitment that
  revised them. Other sections were read for the same condition and
  none states a rule a later section reversed.

Self-audit against the production rules: the deliverables the
commitment lists; one walkthrough shape corrected after the test
showed the first placement never ran; every check reported here ran
and passed. No open finding.
