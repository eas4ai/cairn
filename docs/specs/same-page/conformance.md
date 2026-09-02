# Evidence map

The map from Agreed requirement identifiers to implementation
evidence, for every Agreed identifier in the corpus the self-hosting
check scans: this directory and docs/superpowers/specs/. One table per
prefix, one row per identifier. Each column carries exactly one
meaning.

Coverage is Covered (cited evidence beyond implementation inspection
addresses the requirement's falsifier), Asserted (implementation is
cited and no evidence mechanism addresses the falsifier), or
Uncovered (no evidence is claimed).

Method names the mechanism that produced the evidence: formal, model,
property, integration, test, static, inspected, manual, or - on an
Uncovered row. The list is not a rank. An Asserted row always carries
method inspected, because inspection addresses no falsifier.

Evidence cites a repository path, with an optional ::identifier
locator. The map is a claim register: a false Covered entry is drift
like any other. The language check verifies the map's integrity.

## PKG

| Requirement | Coverage | Method | Evidence |
|---|---|---|---|
| PKG-001 | Covered | test | tests/engine.test.mjs::PKG-001 |
| PKG-002 | Covered | test | tests/engine.test.mjs::PKG-002 |
| PKG-003 | Uncovered | - | |
| PKG-004 | Uncovered | - | |
| PKG-005 | Asserted | inspected | hooks/hooks.json |
| PKG-006 | Asserted | inspected | skills/new-project/scripts/ |
| PKG-007 | Covered | test | tests/language-check.test.mjs::scaffolded-templates-pass |

## ENG

| Requirement | Coverage | Method | Evidence |
|---|---|---|---|
| ENG-001 | Uncovered | - | |
| ENG-002 | Covered | test | tests/engine.test.mjs::ENG-002 |
| ENG-003 | Uncovered | - | |
| ENG-004 | Uncovered | - | |
| ENG-005 | Uncovered | - | |
| ENG-006 | Uncovered | - | |
| ENG-007 | Uncovered | - | |
| ENG-008 | Uncovered | - | |
| ENG-010 | Covered | test | tests/engine.test.mjs::ENG-010 |
| ENG-011 | Covered | test | tests/engine.test.mjs::ENG-011 |
| ENG-012 | Covered | test | tests/engine.test.mjs::ENG-012 |
| ENG-013 | Covered | test | tests/engine.test.mjs::ENG-013 |
| ENG-014 | Covered | test | tests/engine.test.mjs::ENG-014 |
| ENG-015 | Covered | test | tests/engine.test.mjs::ENG-015 |
| ENG-016 | Covered | test | tests/engine.test.mjs::ENG-016 |
| ENG-017 | Uncovered | - | |
| ENG-018 | Covered | test | tests/engine.test.mjs::ENG-018 |
| ENG-019 | Covered | test | tests/engine.test.mjs::ENG-019 |
| ENG-020 | Covered | test | tests/engine.test.mjs::ENG-020 |
| ENG-021 | Covered | test | tests/engine.test.mjs::ENG-021 |
| ENG-022 | Uncovered | - | |
| ENG-023 | Asserted | inspected | skills/new-project/scripts/engine/same-page.ts |
| ENG-024 | Covered | test | tests/engine.test.mjs::ENG-024 |
| ENG-025 | Uncovered | - | |
| ENG-070 | Covered | test | tests/engine.test.mjs::ENG-070 |
| ENG-071 | Uncovered | - | |
| ENG-072 | Asserted | inspected | skills/new-project/scripts/engine/same-page.ts |
| ENG-073 | Covered | test | tests/engine.test.mjs::ENG-073 |
| ENG-074 | Uncovered | - | |
| ENG-075 | Covered | test | tests/engine.test.mjs::ENG-075 |
| ENG-076 | Covered | test | tests/engine.test.mjs::ENG-076 |
| ENG-077 | Covered | test | tests/engine.test.mjs::ENG-077 |
| ENG-078 | Asserted | inspected | skills/new-project/SKILL.md |
| ENG-079 | Asserted | inspected | skills/new-project/SKILL.md |
| ENG-110 | Uncovered | - | |
| ENG-111 | Uncovered | - | |
| ENG-112 | Uncovered | - | |
| ENG-113 | Uncovered | - | |
| ENG-114 | Uncovered | - | |
| ENG-115 | Uncovered | - | |
| ENG-116 | Uncovered | - | |
| ENG-117 | Uncovered | - | |
| ENG-118 | Uncovered | - | |
| ENG-119 | Uncovered | - | |
| ENG-120 | Uncovered | - | |
| ENG-186 | Covered | test | tests/engine.test.mjs::ENG-186 |
| ENG-187 | Covered | test | tests/engine.test.mjs::ENG-187 |
| ENG-188 | Covered | test | tests/engine.test.mjs::ENG-188 |
| ENG-189 | Covered | test | tests/engine.test.mjs::ENG-189 |
| ENG-190 | Covered | test | tests/engine.test.mjs::ENG-190 |
| ENG-191 | Uncovered | - | |
| ENG-192 | Covered | test | tests/engine.test.mjs::ENG-192 |
| ENG-193 | Covered | test | tests/engine.test.mjs::ENG-193 |
| ENG-194 | Uncovered | - | |
| ENG-195 | Uncovered | - | |
| ENG-196 | Uncovered | - | |
| ENG-197 | Covered | test | tests/engine.test.mjs::ENG-197 |
| ENG-198 | Uncovered | - | |
| ENG-199 | Uncovered | - | |
| ENG-200 | Uncovered | - | |
| ENG-201 | Uncovered | - | |
| ENG-205 | Covered | test | tests/engine.test.mjs::ENG-205 |
| ENG-206 | Covered | test | tests/engine.test.mjs::ENG-206 |
| ENG-207 | Covered | test | tests/engine.test.mjs::ENG-077 |
| ENG-208 | Asserted | inspected | skills/new-project/SKILL.md |
| ENG-209 | Uncovered | - | |
| ENG-210 | Uncovered | - | |
| ENG-211 | Covered | test | tests/engine.test.mjs::ENG-211 |
| ENG-215 | Uncovered | - | |
| ENG-216 | Asserted | inspected | skills/new-project/SKILL.md |
| ENG-217 | Covered | test | tests/engine.test.mjs::ENG-217 |
| ENG-218 | Uncovered | - | |
| ENG-219 | Uncovered | - | |
| ENG-225 | Asserted | inspected | skills/new-project/SKILL.md |
| ENG-226 | Uncovered | - | |
| ENG-227 | Uncovered | - | |
| ENG-228 | Uncovered | - | |
| ENG-229 | Uncovered | - | |
| ENG-230 | Asserted | inspected | skills/next-iteration/SKILL.md |
| ENG-231 | Asserted | inspected | skills/next-iteration/SKILL.md |
| ENG-232 | Asserted | inspected | skills/new-project/scripts/spec-drift-gate.mjs |
| ENG-233 | Asserted | inspected | skills/new-project/scripts/spec-drift-gate.mjs |
| ENG-234 | Uncovered | - | |
| ENG-235 | Asserted | inspected | skills/new-project/scripts/spec-drift-gate.mjs |
| ENG-240 | Asserted | inspected | docs/specs/same-page/iterations/001.md |
| ENG-241 | Asserted | inspected | docs/specs/same-page/iterations/001.md |
