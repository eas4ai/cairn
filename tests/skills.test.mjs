// The skills carry the repaired rules and not the old ones. A static
// proxy: the text that governs the agent's behavior, checked for what it
// says. Behavior itself is observed by the review each time a skill runs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs"; // Whitespace is collapsed before matching, so the checks read content, not wrapping.
const flat = (u) => readFileSync(new URL(u, import.meta.url), "utf8").replace(/\s+/g, " ");
const NEW = flat("../skills/new-project/SKILL.md");
const EXISTING = flat("../skills/existing-project/SKILL.md");
const BOTH = NEW + " " + EXISTING;
const has = (text, s, why) => assert.ok(text.includes(s), `${why}: missing "${s}"`);
const lacks = (text, s, why) => assert.ok(!text.includes(s), `${why}: still contains "${s}"`); test("the over-asking rule is gone from both skills (SPEC-005, SPEC-006)", () => { lacks(BOTH, "one question per message", "SPEC-005"); lacks(BOTH, "never silently resolve", "SPEC-005"); has(NEW, "resolve it and state the reading", "SPEC-005/007"); has(NEW, "Ask the developer only when the answer is a preference, a priority, or a fact outside the repository", "SPEC-006");
}); test("a decision during the phase is recorded (DEC-003)", () => has(NEW, "is recorded with `cairn decide`", "DEC-003 in the phase"));

test("understanding is restated before writing (SPEC-003)", () => has(NEW, "State your understanding in your own words before writing any artifact", "SPEC-003")); test("falsifiers are proposed as one set and confirmed by exception (SPEC-004)", () => { has(NEW, "Propose the falsifiers for a whole domain as one set", "SPEC-004"); has(NEW, "correct only the wrong ones", "SPEC-004"); has(EXISTING, "propose the section's falsifiers as one set", "SPEC-004 on Path A/B");
}); test("depth is inferred and domains derived, never asked or imposed (SPEC-008, SPEC-009)", () => { has(NEW, "Infer documentation depth", "SPEC-008"); lacks(BOTH, "what documentation depth is warranted", "SPEC-008"); has(NEW, "Derive the domains from the project", "SPEC-009"); lacks(BOTH, "NN-<domain>", "SPEC-009: numbered domain scheme"); has(EXISTING, "Depth follows the work, not the size of the codebase", "SPEC-008 on an existing codebase");
}); test("a term enters the glossary at first occurrence (SPEC-010)", () => has(NEW, "add it to glossary.md at that moment", "SPEC-010")); test("the phase ends at the first commitment, and later ones are specified during the loop (SPEC-011, SPEC-012)", () => { has(NEW, "ends at the keystone, the glossary, and the first commitment", "SPEC-011"); has(NEW, "Later commitments are specified during the loop", "SPEC-012"); has(NEW, "for the first commitment only", "SPEC-012");
}); test("a requirement goes Agreed only with a nameable mechanism (SPEC-013)", () => has(NEW, "name a mechanism that could observe its falsifier", "SPEC-013")); test("review before agreement, recording what it attacked (SPEC-014, SPEC-015)", () => { has(NEW, "Review before agreement", "SPEC-014"); has(NEW, "Record what the review attacked, not only what it found", "SPEC-015");
}); test("no spec file without requirements; nothing Agreed without a falsifier (SPEC-001, SPEC-002)", () => { has(NEW, "Create no spec file you have no requirements for", "SPEC-001"); has(NEW, "A requirement is Draft until the developer confirms its text and its falsifier", "SPEC-002");
}); test("Observed is marked, and is not contract (SPEC-016, SPEC-017)", () => { has(EXISTING, "Status: Observed", "SPEC-016"); has(EXISTING, "only Agreed text is contract", "SPEC-017"); has(EXISTING, "The loop refuses a commitment that names an Observed requirement", "SPEC-017 mechanism");
}); test("the skills exclude artifacts outside Cairn's workflow", () => { for (const s of ["validators/", "trust <", "conformance.md", "iterations/001.md", "/next-iteration"]) lacks(BOTH, s, "unsupported artifact");
});

// The working agreement: the file a consumer-repo agent reads at wake.
const TEMPLATE = flat("../skills/new-project/templates/AGENTS.md");
const raw = (u) => readFileSync(new URL(u, import.meta.url), "utf8");
test("the working agreement names the agent's move for each verdict and the write-ahead record (LOOP-036)", () => {
  has(TEMPLATE, "Resolvable: do the one action named. Then run `cairn wake` again", "LOOP-036 Resolvable");
  has(TEMPLATE, "Escalate: present the escalation", "LOOP-036 Escalate");
  has(TEMPLATE, "Done: the commitment is complete", "LOOP-036 Done");
  for (const f of ["action:", "target:", "base:", "started:"]) has(TEMPLATE, f, "LOOP-022 record field");
  has(TEMPLATE, "records evidence only against a committed tree", "LOOP-030");
});
test("the working agreement names the developer's moves (LOOP-036, DEC-014)", () => {
  has(TEMPLATE, "cairn answer <slug>", "LOOP-014 answer");
  has(TEMPLATE, "removing the queue entry in a commit is the review", "DEC-014 exit");
});
test("this repository runs by the file it ships", () => {
  assert.equal(raw("../AGENTS.md"), raw("../skills/new-project/templates/AGENTS.md"), "AGENTS.md is the template byte for byte");
  assert.match(raw("../CLAUDE.md"), /AGENTS\.md/, "the other name includes it");
});
test("both skills write the working agreement without naming a vendor's file (LOOP-036, PKG-006)", () => {
  has(NEW, "copying templates/AGENTS.md", "new-project writes it");
  has(EXISTING, "the working agreement, AGENTS.md", "existing-project writes or verifies it");
  has(EXISTING, "append the template after a blank line and keep the rest", "a consumer's own AGENTS.md survives");
  has(TEMPLATE, "the roadmap, the current commitment, and the decision records", "LOOP-002: what wake reads");
  lacks(BOTH, "CLAUDE.md", "PKG-006");
});
test("the working agreement says what an attempt is (LOOP-036, DEC-017, DEC-018)", () => {
  has(TEMPLATE, "An attempt is one distinct digest of the mechanism's declared inputs among the failing checks since the last pass", "DEC-017");
  has(TEMPLATE, "the first check of a requirement is its baseline, never an attempt", "DEC-018");
});
test("the working agreement says a failure no footprint change can address is an escalation, and where an inherited requirement is repaired (DEC-019, LOOP-057)", () => {
  has(TEMPLATE, "A failure no change inside the footprint can address is not an attempt at all: it is an escalation", "DEC-019");
  has(TEMPLATE, "A failing requirement every commitment inherits is repaired under the current commitment", "LOOP-057");
});
