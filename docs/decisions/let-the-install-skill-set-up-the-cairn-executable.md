# Let the install skill set up the Cairn executable

Level: Judged
Decided by: agent
Rests on: PKG-014
Would be wrong if: Installing the skills still requires the human to reconstruct executable setup, or the skill replaces an existing installation without inspecting it
History: The recorded reversal changed the experience log from reporting alone to informing per-decision judgment. This installation change neither changes decision levels nor steers work from a metric; the developer explicitly requested the setup workflow, so a Judged record remains appropriate.

## Decision

Add a self-contained install-cairn skill alongside the two project skills. It checks prerequisites and existing Cairn commands, uses a persistent production checkout, links only the executable, verifies help and PATH, and leaves project adoption to the project skills. This lets the Vercel skills CLI provide the installation entry point without pretending that installing instructions also installs a binary. Keep the existing link script as the combined command-and-skills alternative.

## Realized by

- 342393e Add install-cairn and document installation through the skills CLI
