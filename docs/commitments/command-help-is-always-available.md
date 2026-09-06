# Command help is always available

Slug: command-help-is-always-available
Requirements: PKG-017

## Goal

A user can discover CLI commands and options by running cairn --help.

## Deliverables

- --help and -h print the same plain-language command reference to stdout
  and exit 0 before repository checks or command execution.
- Help works before or after a command, including with a nonexistent root.
- Existing invalid-option handling and the -- argument separator remain.
- README and human manual explain how to ask for command help.

## Verification

Test help in an empty directory and on commands that normally write
records. Check stdout, stderr, exit status, unchanged files, parser errors,
and literal arguments. Run the suite and both lints, review the reference
against dispatch and command validators, then publish to production.
