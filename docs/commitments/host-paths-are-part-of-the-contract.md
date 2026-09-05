# Host paths are part of the contract

Slug: host-paths-are-part-of-the-contract
Requirements: SPEC-019, SPEC-024

## Goal

A specification can describe host paths the product requires without
allowing undeclared machine-local citations. Requested by the developer
on 2026-09-05 after 25 false positives in an adopting project.

## Deliverables

- A slash after a closing placeholder bracket continues the template.
- Host paths: in a file header declares comma-separated absolute or
  home-relative paths; exact matches and child paths are allowed.
- Declarations in examples or requirement bodies do not grant exceptions.
- Project skills and the human manual explain when and how to declare paths.

## Verification

Reproduce placeholder and host-path findings before the fix. Test strict
defaults, file isolation, path boundaries, quoted and fenced examples,
and declared paths. Run the existing suite and both lints. Lint a copy
of the adopting project specification with only the needed declarations;
leave its working repository unchanged. Review before Done.
