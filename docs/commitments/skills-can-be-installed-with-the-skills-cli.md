# Skills can be installed with the skills CLI

Slug: skills-can-be-installed-with-the-skills-cli
Requirements: PKG-014

## Goal

A person can install Cairn skills using the Vercel skills CLI, with a
clear explanation of how the Cairn command is installed separately.
Requested by the developer on 2026-09-06.

## Deliverables

- README commands for selecting all three Cairn skills from the production repo.
- An install-cairn skill that installs and verifies the executable after the
  skills CLI has installed the agent instructions. Preserve existing commands
  and skill locations. Requested in the developer follow-up.
- Human manual covering project and global scope, agent selection, checking
  installation, and updates. Distinguish skills from the Cairn executable.
- Preserve the existing installer instructions and explain using one
  installation method for each skill location.

## Verification

Check the upstream documentation. Discover and install the production
skills in an isolated home and project, verify the template is included,
and exercise the documented commands. Run existing checks and review the
finished guidance before publishing.
