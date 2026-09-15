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
const lacks = (text, s, why) => assert.ok(!text.includes(s), `${why}: still contains "${s}"`); test("the over-asking rule is gone from both skills (SPEC-005, SPEC-006, SPEC-007)", () => { lacks(BOTH, "one question per message", "SPEC-005"); lacks(BOTH, "never silently resolve", "SPEC-005"); has(NEW, "resolve it and state the reading", "SPEC-005/007"); has(NEW, "Ask the developer only when the answer is a preference, a priority, or a fact outside the repository", "SPEC-006");
}); test("a decision during the phase is recorded (DEC-003)", () => has(NEW, "is recorded with `cairn decide`", "DEC-003 in the phase"));

test("understanding is restated before writing (SPEC-003)", () => has(NEW, "State your understanding in your own words before writing any artifact", "SPEC-003")); test("falsifiers are proposed as one set and confirmed by exception (SPEC-004)", () => { has(NEW, "Propose the falsifiers for a whole domain as one set", "SPEC-004"); has(NEW, "correct only the wrong ones", "SPEC-004"); has(EXISTING, "propose the section's falsifiers as one set", "SPEC-004 on Path A/B");
}); test("depth is inferred and domains derived, never asked or imposed (SPEC-008, SPEC-009)", () => { has(NEW, "Infer documentation depth", "SPEC-008"); lacks(BOTH, "what documentation depth is warranted", "SPEC-008"); has(NEW, "Derive the domains from the project", "SPEC-009"); lacks(BOTH, "NN-<domain>", "SPEC-009: numbered domain scheme"); has(EXISTING, "Depth follows the work, not the size of the codebase", "SPEC-008 on an existing codebase");
}); test("a term enters the glossary at first occurrence (SPEC-010)", () => has(NEW, "add it to glossary.md at that moment", "SPEC-010")); test("the phase ends at the first commitment, and later ones are specified during the loop (SPEC-011, SPEC-012)", () => { has(NEW, "ends at the keystone, the glossary, and the first commitment", "SPEC-011"); has(NEW, "A later commitment is specified at Done", "SPEC-012"); has(NEW, "/next-iteration", "SPEC-012: the phase between loops"); has(NEW, "for the first commitment only", "SPEC-012");
}); test("a requirement goes Agreed only with a nameable mechanism (SPEC-013)", () => has(NEW, "name a mechanism that could observe its falsifier", "SPEC-013")); test("review before agreement, recording what it attacked (SPEC-014, SPEC-015)", () => { has(NEW, "Review before agreement", "SPEC-014"); has(NEW, "Record what the review attacked, not only what it found", "SPEC-015");
}); test("no spec file without requirements; nothing Agreed without a falsifier (SPEC-001, SPEC-002)", () => { has(NEW, "Create no spec file you have no requirements for", "SPEC-001"); has(NEW, "A requirement is Draft until the developer confirms its text and its falsifier", "SPEC-002");
}); test("Observed is marked, and is not contract (SPEC-016, SPEC-017)", () => { has(EXISTING, "Status: Observed", "SPEC-016"); has(EXISTING, "only Agreed text is contract", "SPEC-017"); has(EXISTING, "The loop refuses a commitment that names an Observed requirement", "SPEC-017 mechanism");
}); test("the skills exclude artifacts outside Cairn's workflow", () => { for (const s of ["validators/", "trust <", "conformance.md", "iterations/001.md"]) lacks(BOTH, s, "unsupported artifact");
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
test("both skills write the working agreement without naming a vendor's file (LOOP-002, LOOP-036, PKG-006)", () => {
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
test("the working agreement states the promote, next-iteration, and no-deferral moves (LOOP-029, LOOP-087, LOOP-091, LOOP-092)", () => {
  has(TEMPLATE, "Done: the commitment is complete and the backlog holds nothing to promote", "LOOP-087, LOOP-091 Done");
  has(TEMPLATE, "When wake says `promote`", "LOOP-087 move");
  has(TEMPLATE, "--promotes", "LOOP-115: the promotion record names its item on a Promotes line");
  has(TEMPLATE, "Status: Agreed <date> by promotion <decision slug>", "LOOP-088 marker");
  lacks(TEMPLATE, "When wake says `escalate next-iteration`", "LOOP-091: the loop never chooses a next-iteration item");
  has(TEMPLATE, "Next-iteration is the developer's to open", "LOOP-091");
  has(TEMPLATE, "cairn backlog --next-iteration", "LOOP-093 capture");
  has(TEMPLATE, "Deferral is not allowed", "LOOP-092");
  has(TEMPLATE, "`Outside because:` line", "LOOP-092 line");
  has(TEMPLATE, "The next commitment is the loop's while the backlog holds items", "LOOP-029 developer's move");
});
test("both skills sort captures into the backlog or next-iteration and forbid deferral (LOOP-029, LOOP-092, LOOP-093)", () => {
  has(NEW, "cairn backlog --next-iteration --changes", "new-project names the second destination");
  has(EXISTING, "cairn backlog --next-iteration --changes", "existing-project names the second destination");
  has(NEW, "Neither is deferral", "LOOP-092 in new-project");
  has(EXISTING, "Neither is deferral", "LOOP-092 in existing-project");
  has(EXISTING, ".cairn/next-iteration/", "existing-project reads it at wake");
});
test("the skill requires a falsifier on every requirement, a MAY included (SPEC-025)", () => {
  lacks(NEW, "A permission-only MAY carries none", "the old exemption");
  has(NEW, "Every requirement carries a Falsifier: line, a MAY included", "SPEC-025");
  has(NEW, "the falsifier is the state in which the permission is withheld", "SPEC-025: what a permission's falsifier is");
  has(NEW, "A MAY with no observable falsifier is not recorded", "SPEC-013 route");
});
test("the working agreement names the hooks as optional and the install skill registers them for two harnesses (PKG-006, PKG-018, PKG-019)", () => {
  has(TEMPLATE, "When the harness runs Cairn's hooks, the verdict arrives at session start and a stop is refused while it is Resolvable; this agreement holds without them", "hooks are optional");
  const INSTALL = flat("../skills/install-cairn/SKILL.md");
  has(INSTALL, "bin/hook.mjs session-start", "session-start registration");
  has(INSTALL, "bin/hook.mjs stop", "stop registration");
  has(INSTALL, ".claude/settings.json", "Claude Code settings path");
  has(INSTALL, ".codex/hooks.json", "Codex hooks path");
  lacks(INSTALL, "link.sh", "the link script is retired");
});
test("the working agreement says the kernel is upgraded at Done, never inside a commitment (LOOP-096)", () => {
  has(TEMPLATE, "The kernel is upgraded at Done, never inside a commitment; a commitment starts and finishes on one referee", "LOOP-096");
});

// The phase between loops: the skill the developer opens at Done (SPEC-012, SPEC-026, SPEC-027).
test("the next-iteration skill starts from the specification and ends by naming the next commitment (SPEC-026, SPEC-027)", () => {
  const NEXT = flat("../skills/next-iteration/SKILL.md");
  has(NEXT, "name: next-iteration", "the skill under its name");
  has(NEXT, "Do not write docs/recon.md", "SPEC-026: no recon report");
  has(NEXT, "Write no Observed text", "SPEC-026: no Observed specs");
  has(NEXT, "Run `cairn wake`", "the phase starts where the loop stands");
  has(NEXT, "ends by naming the next commitment", "SPEC-012, SPEC-026");
  has(NEXT, "Specified from:", "SPEC-027: the commitment names its items");
  has(NEXT, "Promoted to: <slug>", "SPEC-027: the stamp");
  has(NEXT, "Revised <date>", "a revised requirement says what its first text said");
  has(NEXT, "Rules 1 through 8 of /new-project apply", "the standing rules carry over");
  has(NEXT, "If this isn't clear, ask me to explain it another way before you decide", "the invitation to ask");
  lacks(NEXT, "CLAUDE.md", "PKG-006");
});
test("every document that names the project skills names next-iteration beside them (SPEC-026, PKG-014)", () => {
  const INSTALL = flat("../skills/install-cairn/SKILL.md");
  has(INSTALL, "npx skills update install-cairn new-project existing-project next-iteration", "install-cairn refreshes it");
  has(INSTALL, "`next-iteration` for a project already under Cairn", "install-cairn hands it back");
  has(flat("../README.md"), "--skill install-cairn new-project existing-project next-iteration", "the README installs it");
  has(flat("../docs/manual.md"), "--skill install-cairn new-project existing-project next-iteration", "the manual installs it");
  has(flat("../docs/manual.md"), "| `next-iteration` |", "the manual's skill table");
  has(EXISTING, "switch to /next-iteration", "existing-project routes a project already under Cairn to it");
  has(TEMPLATE, "run next-iteration", "the working agreement names the developer's move");
  lacks(TEMPLATE, "run new-project or existing-project as for one", "the old route is gone");
});

// Every action wake can name has a move in the working agreement (LOOP-101).
test("the working agreement states a move for every action the kernel can name (LOOP-101)", () => {
  const verbs = new Set([...raw("../bin/cairn.mjs").matchAll(/action: [`"]([a-z]+)/g)].map((m) => m[1]));
  assert.ok(verbs.size >= 12, `found only ${[...verbs].join(", ")}`);
  for (const v of verbs) assert.ok(new RegExp("`" + v + "( <|`| )").test(raw("../skills/new-project/templates/AGENTS.md")), `no move for ${v}`);
});
test("the working agreement states both record formats and the two flags the moves need (LOOP-036)", () => {
  has(TEMPLATE, "command: <shell command>", "the declaration format");
  has(TEMPLATE, "reviewed: - <REQ> sha256:<digest>", "the reviewed list");
  has(TEMPLATE, "findings: - open: <defect> - resolved: <defect, and how>", "the review format");
  has(TEMPLATE, "`findings:` may be an empty list, never absent", "LOOP-086");
  has(TEMPLATE, "--level Blocking", "LOOP-013 route");
  has(TEMPLATE, "--outside", "LOOP-092 flag");
  has(TEMPLATE, "declare | repair | promote | resolve", "the in-progress action list");
  assert.equal(raw("../CLAUDE.md").trim(), "@AGENTS.md", "CLAUDE.md is a pure include");
});
test("the skills demonstrate a safe violating example and preserve recon findings (SPEC-022, SPEC-023)", () => {
  has(NEW, "demonstrate that it catches a safe example of the stated violation", "SPEC-022");
  has(EXISTING, "carry each unresolved finding forward with its evidence", "SPEC-023");
});

// The documents a consumer reads say what the code does (PKG-029, PKG-030, PKG-031, LOOP-087).
test("the specification skills run the checker through the cairn command (PKG-029)", () => {
  const NEXT = flat("../skills/next-iteration/SKILL.md");
  for (const [text, name] of [[NEW, "new-project"], [EXISTING, "existing-project"], [NEXT, "next-iteration"]]) {
    has(text, "cairn lint docs/spec", `${name} names the command`);
    lacks(text, "scripts/spec-lint.mjs", `${name} names no checkout path`);
  }
  has(EXISTING, "separate file that includes the template", "a consumer's own instructions stay out of the working agreement file");
});
test("the README invokes the phase skills by name and states versions and platforms (PKG-030, PKG-031)", () => {
  const README = flat("../README.md");
  for (const s of ["> /new-project", "> /existing-project", "> /next-iteration"]) has(README, s, "invoked by name");
  lacks(README, "Use the new-project skill", "no prose request"); lacks(README, "Use the existing-project skill", "no prose request"); lacks(README, "Use the next-iteration skill", "no prose request");
  has(README, "Node 18", "minimum Node"); has(README, "Git 2.5", "minimum Git"); has(README, "Windows", "platform statement");
  has(README, "up to the harness's cap", "the stop hook is bounded");
});
test("the manual and the walkthrough say the loop promotes backlog items at Done", () => {
  const MANUAL = flat("../docs/manual.md"), WALK = flat("../docs/walkthrough.md");
  lacks(MANUAL, "You select the next commitment when you are ready", "the old sentence");
  lacks(WALK, "the agent does not start them automatically", "the old sentence");
  has(WALK, "promotes", "the walkthrough names promotion");
  has(MANUAL, ".cairn/evidence/runs/", "the receipt path"); lacks(MANUAL, "numeric collision suffix", "the suffix is the process id");
});
