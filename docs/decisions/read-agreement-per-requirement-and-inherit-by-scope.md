# Read agreement per requirement and inherit by scope

Level: Consequential
Decided by: agent
Rests on: SPEC-018, SPEC-019, PKG-015, PKG-011, LOOP-057
Would be wrong if: A block status changes another requirement or an unscoped file still contributes inherited requirements
History: The earlier package-rule reversal established inheritance explicitly. This decision keeps those constraints inherited through package.md while removing the accidental meaning of a consumer prefix. It is Consequential because adopters must declare Scope to keep their own global constraints inherited.

## Decision

Use one parser for contiguous requirement blocks, fenced examples, file header defaults, and block Status overrides in the kernel and lint. Metadata in a requirement is not file metadata. Fold only Agreed blocks from files whose header says Scope: every commitment, regardless of prefix. Add that header to Cairns package spec and move the confirmed PKG-015 there without changing its obligation. Keep requirement identity based on its text and falsifier, excluding status metadata. Lint local absolute paths even when quoted or in examples; do not flag URLs, standalone slash or tilde mentions, or documented slash command names.

## Realized by

- 5d76475 Read agreement per requirement and declare inherited constraints explicitly
