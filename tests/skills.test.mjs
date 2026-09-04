// The skills carry the repaired rules and not the old ones. A static
// proxy: the text that governs the agent's behavior, checked for what it
// says. Behavior itself is observed by the review each time a skill runs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const NEW = readFileSync(new URL("../skills/new-project/SKILL.md", import.meta.url), "utf8");
const EXISTING = readFileSync(new URL("../skills/existing-project/SKILL.md", import.meta.url), "utf8");
const BOTH = NEW + "\n" + EXISTING;
const has = (text, s, why) => assert.ok(text.includes(s), `${why}: missing "${s}"`);
const lacks = (text, s, why) => assert.ok(!text.includes(s), `${why}: still contains "${s}"`);

test("the over-asking rule is gone from both skills (SPEC-005, SPEC-006)", () => {
  lacks(BOTH, "one question per message", "SPEC-005");
  lacks(BOTH, "never silently resolve", "SPEC-005");
  has(NEW, "resolve it and state the reading", "SPEC-005/007");
  has(NEW, "Ask the developer only when the answer is a preference, a\n   priority, or a fact outside the repository", "SPEC-006");
});

test("understanding is restated before writing (SPEC-003)", () => has(NEW, "State your understanding in your own words\n   before writing any artifact", "SPEC-003"));

test("falsifiers are proposed as one set and confirmed by exception (SPEC-004)", () => {
  has(NEW, "Propose the\n   falsifiers for a whole domain as one set", "SPEC-004");
  has(NEW, "correct only the wrong ones", "SPEC-004");
  has(EXISTING, "propose the section's falsifiers as one set", "SPEC-004 on Path A/B");
});

test("depth is inferred and domains derived, never asked or imposed (SPEC-008, SPEC-009)", () => {
  has(NEW, "Infer documentation depth", "SPEC-008");
  lacks(BOTH, "what documentation depth is warranted", "SPEC-008");
  has(NEW, "Derive the domains from the project", "SPEC-009");
  lacks(BOTH, "NN-<domain>", "SPEC-009: numbered domain scheme");
  has(EXISTING, "Depth follows the work, not the size of the codebase", "SPEC-008 on an existing codebase");
});

test("a term enters the glossary at first occurrence (SPEC-010)", () => has(NEW, "add it to glossary.md at that moment", "SPEC-010"));

test("the phase ends at the first commitment, and later ones are specified during the loop (SPEC-011, SPEC-012)", () => {
  has(NEW, "ends at the keystone, the glossary, and the first commitment", "SPEC-011");
  has(NEW, "Later commitments are specified during the loop", "SPEC-012");
  has(NEW, "for the first commitment\nonly", "SPEC-012");
});

test("a requirement goes Agreed only with a nameable mechanism (SPEC-013)", () => has(NEW, "name\n   a mechanism that could observe its falsifier", "SPEC-013"));

test("review before agreement, recording what it attacked (SPEC-014, SPEC-015)", () => {
  has(NEW, "Review before agreement", "SPEC-014");
  has(NEW, "Record what the review attacked,\n   not only what it found", "SPEC-015");
});

test("no spec file without requirements; nothing Agreed without a falsifier (SPEC-001, SPEC-002)", () => {
  has(NEW, "Create no spec file you have no requirements for", "SPEC-001");
  has(NEW, "A requirement is Draft until the\n   developer confirms its text and its falsifier", "SPEC-002");
});

test("Observed is marked, and is not contract (SPEC-016, SPEC-017)", () => {
  has(EXISTING, "Status: Observed", "SPEC-016");
  has(EXISTING, "only\n    Agreed text is contract", "SPEC-017");
  has(EXISTING, "The loop refuses a commitment\n    that names an Observed requirement", "SPEC-017 mechanism");
});

test("nothing from the Same Page engine survives in the skills", () => {
  for (const s of ["same-page elaborate", "same-page verify", ".same-page/", "validators/", "trust <", "conformance.md", "iterations/001.md", "/next-iteration"]) lacks(BOTH, s, "port");
});
