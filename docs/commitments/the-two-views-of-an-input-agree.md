# The two views of an input agree

Slug: the-two-views-of-an-input-agree
Requirements: LOOP-023, LOOP-024
Inherits: every PKG requirement

## Goal

A declared input digests the same way in the tree and at a commit.

The kernel digests declared inputs twice: over the working tree when it
records evidence and compares it, and over a commit when it asks
whether a review is still fresh. In the tree it read a symbolic link
through to its target's content; at a commit, git shows a link as its
target path. The two views never agreed on a link, so a review that
examined one was stale on its own commit, forever. Found while adding
CLAUDE.md to this repository, which is a one-line include and not a
link for that reason. Promoted from the backlog on the developer's
word.

Delivers two things.

- The test: a fixture whose mechanism declares a link; after check and
  a review at that commit, wake says Done; after the link is pointed
  elsewhere and committed, wake says run, because the declared input
  changed.
- The kernel reads a link as its target path in the tree, which is
  what git stores, so both views hash the same bytes. A mechanism that
  reads through a link declares the target too, as it declares any
  other file it reads (LOOP-006).

## Tests

- a linked declared input digests the same at a commit and in the tree
  (LOOP-023, LOOP-024)

## Done when

- LOOP-023 and LOOP-024 have current passing evidence from node-test.
- A review record at the current commit with no open finding.
- `cairn wake` says Done.
