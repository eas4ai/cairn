# Drafted requirements held for the kernel

Status: Draft

Requirements confirmed by the developer that the kernel, as it reads
today, would act on wrongly if they stood in their domain file. Each
carries a Confirmed: line with the date, and moves to its domain
file, its own Status: line restored, when the commitment that makes
the kernel read it correctly is Done. This file declares no prefix,
and no line in it begins with Status: Agreed, because the kernel
reads any such line as the file's.

## From package.md

Held here because the kernel folds every Agreed PKG requirement into
every commitment, which is the defect PKG-015 corrects; in package.md
it would demand a mechanism of commitment 10 that commitment 14
builds.

[PKG-015] The loop MUST fold into every commitment only the
requirements of a spec file that carries the line
`Scope: every commitment`.
Falsifier: a requirement is folded into a commitment from a file
without that line.
Confirmed: 2026-09-05, held here until commitment 14

The kernel folded every requirement whose identifier began with PKG,
which is this repository's prefix and a natural one for a consumer's
packaging domain. The file says it is inherited; the kernel reads the
file.
