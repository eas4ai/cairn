commit: 34895ec
examined: README, human manual, install-cairn skill, installer coverage, and production-source installation commands.
verification:
  - Checked Vercel skills documentation and exercised skills CLI 1.5.23 in isolated home/project directories: discovery, global installation, project installation, listing, and update. Both existing skills and the working-agreement template were retained.
  - Installed all three skills from the local development source before publication. Their files match the source. Executed the fresh-install shell block from the installed install-cairn skill against the production GitHub repository; the persistent executable link resolves correctly and Cairn help succeeds. No project adoption files were created.
  - Reviewed the skill paths for existing commands, existing checkout/destination conflicts, missing prerequisites, and subprocess versus parent PATH. These conditional instructions were read; no claim of independent agent behavior testing is made.
  - The skill-creator validator passed. The installer tests confirm all three skills are linked. All 176 tests and both lints passed through the committed-tree check.
  - Verified local document links and anchors. The primary flow now starts with the skills CLI and an explicit install-cairn request; the Bash installer remains a separate alternative. Session-start automation is not included.
  - Reviewed against the production coding rules: no executable behavior changed, no automatic project adoption, existing settings are preserved, and commands were exercised rather than inferred. No open finding.
findings:
  - none
