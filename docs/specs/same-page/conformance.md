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
| PKG-003 | Uncovered | - |  |
| PKG-004 | Uncovered | - |  |
| PKG-005 | Covered | test | tests/hooks.test.mjs::PKG-005 |
| PKG-006 | Asserted | inspected | skills/new-project/scripts/ |
| PKG-007 | Covered | test | tests/language-check.test.mjs::scaffolded-templates-pass |

## CONF

| Requirement | Coverage | Method | Evidence |
|---|---|---|---|
| CONF-015 | Covered | test | tests/language-check.test.mjs::CONF-015 |
| CONF-016 | Covered | test | tests/language-check.test.mjs::CONF-016 |
| CONF-017 | Covered | test | tests/language-check.test.mjs::CONF-017 |
| CONF-018 | Covered | test | tests/language-check.test.mjs::CONF-018 |

## ENG

| Requirement | Coverage | Method | Evidence |
|---|---|---|---|
| ENG-001 | Covered | test | tests/engine-l5.test.mjs::ENG-001 |
| ENG-002 | Covered | test | tests/engine.test.mjs::ENG-002 |
| ENG-003 | Covered | test | tests/engine-l2.test.mjs::ENG-003 |
| ENG-004 | Covered | test | tests/engine-l2.test.mjs::ENG-049 |
| ENG-005 | Covered | test | tests/engine-l2.test.mjs::ENG-030 |
| ENG-006 | Covered | test | tests/engine-l2.test.mjs::ENG-034 |
| ENG-007 | Covered | test | tests/engine-l2.test.mjs::ENG-007 |
| ENG-008 | Covered | test | tests/engine-l2.test.mjs::ENG-008 |
| ENG-010 | Covered | test | tests/engine.test.mjs::ENG-010 |
| ENG-011 | Covered | test | tests/engine.test.mjs::ENG-011 |
| ENG-012 | Covered | test | tests/engine.test.mjs::ENG-012 |
| ENG-013 | Covered | test | tests/engine.test.mjs::ENG-013 |
| ENG-014 | Covered | test | tests/engine.test.mjs::ENG-014 |
| ENG-015 | Covered | test | tests/engine.test.mjs::ENG-015 |
| ENG-016 | Covered | test | tests/engine.test.mjs::ENG-016 |
| ENG-017 | Covered | test | tests/engine-l2.test.mjs::ENG-017 |
| ENG-018 | Covered | test | tests/engine.test.mjs::ENG-018 |
| ENG-019 | Covered | test | tests/engine.test.mjs::ENG-019 |
| ENG-020 | Covered | test | tests/engine.test.mjs::ENG-020 |
| ENG-021 | Covered | test | tests/engine.test.mjs::ENG-021 |
| ENG-022 | Uncovered | - |  |
| ENG-023 | Asserted | inspected | skills/new-project/scripts/engine/same-page.ts |
| ENG-024 | Covered | test | tests/engine.test.mjs::ENG-024 |
| ENG-025 | Uncovered | - |  |
| ENG-026 | Covered | test | tests/engine-l2.test.mjs::ENG-026 |
| ENG-027 | Covered | test | tests/engine-l2.test.mjs::ENG-027 |
| ENG-028 | Covered | test | tests/engine-l2.test.mjs::ENG-028 |
| ENG-029 | Covered | test | tests/engine-l2.test.mjs::ENG-029 |
| ENG-030 | Covered | test | tests/engine-l2.test.mjs::ENG-030 |
| ENG-031 | Covered | test | tests/engine-l2.test.mjs::ENG-031 |
| ENG-032 | Uncovered | - |  |
| ENG-033 | Covered | test | tests/engine-l5.test.mjs::ENG-035 |
| ENG-034 | Covered | test | tests/engine-l2.test.mjs::ENG-034 |
| ENG-035 | Covered | test | tests/engine-l5.test.mjs::ENG-035 |
| ENG-036 | Covered | test | tests/engine-l5.test.mjs::ENG-035 |
| ENG-037 | Covered | test | tests/engine-l5.test.mjs::ENG-035 |
| ENG-038 | Covered | test | tests/engine-l2.test.mjs::ENG-038 |
| ENG-039 | Covered | test | tests/engine-l2.test.mjs::ENG-039 |
| ENG-040 | Covered | test | tests/engine-l2.test.mjs::ENG-040 |
| ENG-041 | Covered | test | tests/engine-l6.test.mjs::ENG-041 |
| ENG-042 | Covered | test | tests/engine-l6.test.mjs::ENG-041 |
| ENG-043 | Covered | test | tests/engine-l2.test.mjs::ENG-044 |
| ENG-044 | Covered | test | tests/engine-l2.test.mjs::ENG-044 |
| ENG-045 | Covered | test | tests/engine-l2.test.mjs::ENG-045 |
| ENG-046 | Covered | test | tests/engine-l2.test.mjs::ENG-046 |
| ENG-047 | Covered | test | tests/engine-l2.test.mjs::ENG-047 |
| ENG-048 | Covered | test | tests/engine-l2.test.mjs::ENG-048 |
| ENG-049 | Covered | test | tests/engine-l2.test.mjs::ENG-049 |
| ENG-050 | Covered | test | tests/engine-l2.test.mjs::ENG-050 |
| ENG-051 | Covered | test | tests/engine-l2.test.mjs::ENG-051 |
| ENG-052 | Covered | test | tests/engine-l2.test.mjs::ENG-052 |
| ENG-053 | Covered | test | tests/engine-l2.test.mjs::ENG-080 |
| ENG-054 | Covered | test | tests/engine-l2.test.mjs::ENG-054 |
| ENG-055 | Covered | test | tests/engine-l6.test.mjs::ENG-055 |
| ENG-056 | Covered | test | tests/engine-l6.test.mjs::ENG-055 |
| ENG-057 | Covered | test | tests/engine-l2.test.mjs::ENG-057 |
| ENG-058 | Covered | test | tests/engine-l2.test.mjs::ENG-058 |
| ENG-059 | Covered | test | tests/engine-l2.test.mjs::ENG-059 |
| ENG-060 | Covered | test | tests/engine-l2.test.mjs::ENG-060 |
| ENG-061 | Covered | test | tests/engine-l2.test.mjs::ENG-061 |
| ENG-062 | Covered | test | tests/engine-l2.test.mjs::ENG-062 |
| ENG-063 | Uncovered | - |  |
| ENG-064 | Covered | test | tests/engine-l2.test.mjs::ENG-064 |
| ENG-065 | Covered | test | tests/engine-l2.test.mjs::ENG-065 |
| ENG-066 | Uncovered | - |  |
| ENG-067 | Covered | test | tests/hooks.test.mjs::ENG-067 |
| ENG-070 | Covered | test | tests/engine.test.mjs::ENG-070 |
| ENG-071 | Uncovered | - |  |
| ENG-072 | Asserted | inspected | skills/new-project/scripts/engine/same-page.ts |
| ENG-073 | Covered | test | tests/engine.test.mjs::ENG-073 |
| ENG-074 | Covered | test | tests/engine-l5.test.mjs::ENG-034 |
| ENG-075 | Covered | test | tests/engine.test.mjs::ENG-075 |
| ENG-076 | Covered | test | tests/engine.test.mjs::ENG-076 |
| ENG-077 | Covered | test | tests/engine.test.mjs::ENG-077 |
| ENG-078 | Asserted | inspected | skills/new-project/SKILL.md |
| ENG-079 | Asserted | inspected | skills/new-project/SKILL.md |
| ENG-080 | Covered | test | tests/engine-l2.test.mjs::ENG-080 |
| ENG-081 | Covered | test | tests/engine-l2.test.mjs::ENG-080 |
| ENG-082 | Covered | test | tests/engine-l2.test.mjs::ENG-080 |
| ENG-083 | Covered | test | tests/engine-l2.test.mjs::ENG-080 |
| ENG-084 | Covered | test | tests/engine-l3.test.mjs::ENG-084 |
| ENG-085 | Covered | test | tests/engine-l3.test.mjs::ENG-084 |
| ENG-086 | Covered | test | tests/engine-l2.test.mjs::ENG-080 |
| ENG-087 | Covered | test | tests/engine-l2.test.mjs::ENG-087 |
| ENG-088 | Covered | test | tests/engine-l2.test.mjs::ENG-088 |
| ENG-100 | Uncovered | - |  |
| ENG-101 | Covered | test | tests/engine-l2.test.mjs::ENG-101 |
| ENG-102 | Covered | test | tests/engine-l2.test.mjs::ENG-102 |
| ENG-103 | Covered | test | tests/engine-l2.test.mjs::ENG-103 |
| ENG-104 | Asserted | inspected | skills/new-project/SKILL.md |
| ENG-105 | Covered | test | tests/engine-l2.test.mjs::ENG-105 |
| ENG-110 | Covered | test | tests/engine-l2.test.mjs::ENG-111 |
| ENG-111 | Covered | test | tests/engine-l2.test.mjs::ENG-111 |
| ENG-112 | Covered | test | tests/engine-l2.test.mjs::ENG-111 |
| ENG-113 | Covered | test | tests/engine-l2.test.mjs::ENG-111 |
| ENG-114 | Covered | test | tests/engine-l2.test.mjs::ENG-111 |
| ENG-115 | Covered | test | tests/engine-l2.test.mjs::ENG-111 |
| ENG-116 | Asserted | inspected | skills/next-iteration/SKILL.md |
| ENG-117 | Covered | test | tests/engine-l2.test.mjs::ENG-111 |
| ENG-118 | Covered | test | tests/engine-l2.test.mjs::ENG-111 |
| ENG-119 | Covered | test | tests/engine-l2.test.mjs::ENG-111 |
| ENG-120 | Covered | test | tests/engine-l2.test.mjs::ENG-111 |
| ENG-121 | Covered | test | tests/engine-l3.test.mjs::ENG-084 |
| ENG-122 | Covered | test | tests/engine-l3.test.mjs::ENG-122 |
| ENG-123 | Covered | test | tests/engine-l3.test.mjs::ENG-122 |
| ENG-124 | Covered | test | tests/engine-l3.test.mjs::ENG-122 |
| ENG-125 | Covered | test | tests/engine-l3.test.mjs::ENG-122 |
| ENG-126 | Covered | test | tests/engine-l3.test.mjs::ENG-084 |
| ENG-127 | Covered | test | tests/engine-l6.test.mjs::ENG-124 |
| ENG-128 | Covered | test | tests/engine-l3.test.mjs::ENG-122 |
| ENG-129 | Covered | test | tests/engine-l3.test.mjs::ENG-122 |
| ENG-130 | Covered | test | tests/engine-l3.test.mjs::ENG-130 |
| ENG-131 | Covered | test | tests/engine-l6.test.mjs::ENG-124 |
| ENG-132 | Covered | test | tests/engine-l3.test.mjs::ENG-130 |
| ENG-133 | Covered | test | tests/engine-l3.test.mjs::ENG-130 |
| ENG-140 | Covered | test | tests/engine-l3.test.mjs::ENG-140 |
| ENG-141 | Covered | test | tests/engine-l3.test.mjs::ENG-141 |
| ENG-142 | Covered | test | tests/engine-l3.test.mjs::ENG-140 |
| ENG-143 | Covered | test | tests/engine-l3.test.mjs::ENG-141 |
| ENG-144 | Covered | test | tests/engine-l3.test.mjs::ENG-144 |
| ENG-145 | Covered | test | tests/engine-l3.test.mjs::ENG-144 |
| ENG-150 | Covered | test | tests/engine-l3.test.mjs::ENG-150 |
| ENG-151 | Covered | test | tests/engine-l3.test.mjs::ENG-150 |
| ENG-152 | Covered | test | tests/engine-l3.test.mjs::ENG-150 |
| ENG-155 | Covered | test | tests/engine-l4.test.mjs::ENG-155 |
| ENG-156 | Covered | test | tests/engine-l4.test.mjs::ENG-156 |
| ENG-157 | Covered | test | tests/engine-l4.test.mjs::ENG-157 |
| ENG-158 | Covered | test | tests/engine-l4.test.mjs::ENG-156 |
| ENG-159 | Covered | test | tests/engine-l4.test.mjs::ENG-155 |
| ENG-160 | Covered | test | tests/engine-l4.test.mjs::ENG-155 |
| ENG-161 | Covered | test | tests/engine-l2.test.mjs::ENG-161 |
| ENG-162 | Covered | test | tests/engine-l2.test.mjs::ENG-162 |
| ENG-163 | Covered | test | tests/engine-l2.test.mjs::ENG-163 |
| ENG-164 | Covered | test | tests/engine-l2.test.mjs::ENG-164 |
| ENG-165 | Covered | test | tests/engine-l2.test.mjs::ENG-165 |
| ENG-166 | Covered | test | tests/engine-l6.test.mjs::ENG-166 |
| ENG-167 | Covered | test | tests/engine-l6.test.mjs::ENG-166 |
| ENG-170 | Covered | test | tests/engine-l5.test.mjs::ENG-170 |
| ENG-171 | Covered | test | tests/engine-l5.test.mjs::ENG-171 |
| ENG-172 | Covered | test | tests/engine-l5.test.mjs::ENG-171 |
| ENG-173 | Covered | test | tests/engine-l5.test.mjs::ENG-173 |
| ENG-174 | Covered | test | tests/engine-l5.test.mjs::ENG-173 |
| ENG-175 | Covered | test | tests/engine-l5.test.mjs::ENG-001 |
| ENG-180 | Covered | test | tests/engine-l2.test.mjs::ENG-180 |
| ENG-181 | Covered | test | tests/engine-l2.test.mjs::ENG-181 |
| ENG-182 | Covered | test | tests/engine-l2.test.mjs::ENG-180 |
| ENG-183 | Covered | test | tests/engine-l2.test.mjs::ENG-183 |
| ENG-184 | Uncovered | - |  |
| ENG-185 | Covered | test | tests/engine-l2.test.mjs::ENG-185 |
| ENG-186 | Covered | test | tests/engine.test.mjs::ENG-186 |
| ENG-187 | Covered | test | tests/engine.test.mjs::ENG-187 |
| ENG-188 | Covered | test | tests/engine.test.mjs::ENG-188 |
| ENG-189 | Covered | test | tests/engine.test.mjs::ENG-189 |
| ENG-190 | Covered | test | tests/engine.test.mjs::ENG-190 |
| ENG-191 | Uncovered | - |  |
| ENG-192 | Covered | test | tests/engine.test.mjs::ENG-192 |
| ENG-193 | Covered | test | tests/engine.test.mjs::ENG-193 |
| ENG-194 | Covered | test | tests/engine-l4.test.mjs::ENG-155 |
| ENG-195 | Covered | test | tests/engine-l4.test.mjs::ENG-198 |
| ENG-196 | Covered | test | tests/engine-l4.test.mjs::ENG-198 |
| ENG-197 | Covered | test | tests/engine.test.mjs::ENG-197 |
| ENG-198 | Covered | test | tests/engine-l4.test.mjs::ENG-198 |
| ENG-199 | Covered | test | tests/engine-l4.test.mjs::ENG-198 |
| ENG-200 | Covered | test | tests/engine-l4.test.mjs::ENG-198 |
| ENG-201 | Asserted | inspected | skills/new-project/SKILL.md |
| ENG-205 | Covered | test | tests/engine.test.mjs::ENG-205 |
| ENG-206 | Covered | test | tests/engine.test.mjs::ENG-206 |
| ENG-207 | Covered | test | tests/engine.test.mjs::ENG-077 |
| ENG-208 | Asserted | inspected | skills/new-project/SKILL.md |
| ENG-209 | Covered | test | tests/engine-l2.test.mjs::ENG-209 |
| ENG-210 | Covered | test | tests/engine-l2.test.mjs::ENG-017 |
| ENG-211 | Covered | test | tests/engine.test.mjs::ENG-211 |
| ENG-215 | Covered | test | tests/engine-l2.test.mjs::ENG-215 |
| ENG-216 | Asserted | inspected | skills/new-project/SKILL.md |
| ENG-217 | Covered | test | tests/engine.test.mjs::ENG-217 |
| ENG-218 | Covered | test | tests/engine-l2.test.mjs::ENG-218 |
| ENG-219 | Covered | test | tests/engine-l2.test.mjs::ENG-219 |
| ENG-225 | Asserted | inspected | skills/new-project/SKILL.md |
| ENG-226 | Asserted | inspected | skills/existing-project/SKILL.md |
| ENG-227 | Asserted | inspected | skills/existing-project/SKILL.md |
| ENG-228 | Asserted | inspected | skills/new-project/SKILL.md |
| ENG-229 | Asserted | inspected | skills/existing-project/SKILL.md |
| ENG-230 | Asserted | inspected | skills/next-iteration/SKILL.md |
| ENG-231 | Asserted | inspected | skills/next-iteration/SKILL.md |
| ENG-232 | Asserted | inspected | skills/new-project/scripts/spec-drift-gate.mjs |
| ENG-233 | Covered | test | tests/hooks.test.mjs::ENG-233 |
| ENG-234 | Uncovered | - |  |
| ENG-235 | Covered | test | tests/hooks.test.mjs::ENG-233 |
| ENG-240 | Asserted | inspected | docs/specs/same-page/iterations/001.md |
| ENG-241 | Asserted | inspected | docs/specs/same-page/iterations/001.md |
