# Evidence names the kernel that wrote it

Surfaced from: LOOP-023
Captured: 2026-09-11T23:01:17.946Z

The kernel knows when a mechanism, an input, or a review went stale, and has no idea when the referee itself changed. A production kernel upgrade in the middle of a live commitment on 2026-09-11 reinterpreted records written under the earlier kernel (result lines, unverified, the attempt count, what a breach is) with nothing on disk saying so, and cost a rewind while the project was mid-bugfix. Two parts. A rule for the working agreement and the README: the kernel is upgraded at Done, never inside a commitment; a commitment starts and finishes on one referee. And a fact that makes the rule observable: every evidence record and review carries the running kernel's digest beside mechanism_digest, and the wake treats a record written under a different kernel as stale, with the reason naming it. One field in check(), one comparison in assess(), one sentence in loop.md. The digest also gives a consumer a version to pin: the kernel is one file with no dependencies, so a project can vendor a copy and the digest says which one it runs. Promotion is the developer's.
