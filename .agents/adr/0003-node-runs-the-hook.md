# 0003: node runs the hook; bun develops it

Date: 2026-08-10

Hook registrations invoke node: node is guaranteed wherever npx skills
works, so consumers need nothing extra. The hook is dependency-free .mjs
that runs under bun or node unchanged; bun test runs the suite in
development. Rejected: python3 (diverges from the JS toolchain the skills
ecosystem already requires) and bun-only (imposes an install on consumers).
