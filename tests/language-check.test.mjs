import { test, expect } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const CHECK = new URL(
  "../skills/new-project/scripts/language-check.mjs",
  import.meta.url
).pathname;
const OWN_SPECS = new URL("../docs/superpowers/specs", import.meta.url).pathname;

function run(args, cwd) {
  return spawnSync("node", [CHECK, ...args], { cwd, encoding: "utf8" });
}

function specDir(files) {
  const dir = mkdtempSync(join(tmpdir(), "same-page-lang-"));
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content);
  }
  return dir;
}

const GLOSSARY = `# Glossary

## Working vocabulary

**Authentication service**:
The component that issues and validates tokens.
_Avoid_: service

**Defer**:
A developer verdict that moves agreed work out of scope.
_Avoid_: out of scope (as a model verdict), later
`;

const CLEAN_SPEC = `# Demo -- 01 Broker

Status: Normative design specification
Prefix: BROKER
Last revised: 2026-09-01

## Scope

Plain prose that may ramble and will not be scanned, gracefully.

## Capabilities

### Request handling

[BROKER-001]
When a plugin sends an invalid request, the broker MUST reject the
request.

[BROKER-002]
The broker MUST NOT execute an operation that the plugin is not
authorized to use.

[BROKER-003]
The broker MAY cache a manifest for the duration of a lease.

## Acceptance criteria

- When a plugin sends ten invalid requests, the broker MUST reject
  all ten.
`;

// ---------------------------------------------------------------- clean

// False-block guard: valid SPTE produces zero findings and exit 0.
test("clean SPTE spec passes with exit 0", () => {
  const dir = specDir({
    "glossary.md": GLOSSARY,
    "01-broker.md": CLEAN_SPEC,
    "conformance.md": `# Evidence map\n\n## BROKER\n\n| Requirement | Coverage | Method | Evidence |\n|---|---|---|---|\n| BROKER-001 | Uncovered | - | |\n| BROKER-002 | Uncovered | - | |\n| BROKER-003 | Uncovered | - | |\n`,
  });
  const r = run([dir]);
  expect(r.stdout).toContain("no findings");
  expect(r.status).toBe(0);
});

// False-block guard: non-normative sections are never scanned.
test("prose outside normative sections is not scanned", () => {
  const dir = specDir({
    "01-broker.md": `# Demo\n\nStatus: Normative design specification\nPrefix: BROKER\n\n## Why this exists\n\nThe system should gracefully evolve and will normally improve.\n`,
  });
  const r = run([dir]);
  expect(r.status).toBe(0);
});

// False-block guard: mentions are not use (LANG-062 / CONF-013).
test("quoted terms, code spans, and fenced blocks are exempt", () => {
  const dir = specDir({
    "01-broker.md": `# Demo\n\nStatus: Draft for review\nPrefix: BROKER\n\n## Capabilities\n\n[BROKER-001]\nThe broker MUST NOT log the word "should" or the span \`gracefully\`.\n\n\`\`\`text\nThe system should gracefully handle it.\n\`\`\`\n`,
  });
  const r = run([dir]);
  expect(r.status).toBe(0);
});

// The "Normative." marker pulls a non-canonical section into scope.
test("Normative. marker makes a section scannable (LANG-061)", () => {
  const dir = specDir({
    "01-broker.md": `# Demo\n\nStatus: Normative design specification\nPrefix: BROKER\n\n## Extra rules\n\nNormative.\n\n[BROKER-001]\nThe broker should reject bad requests.\n`,
  });
  const r = run([dir]);
  expect(r.status).toBe(1);
  expect(r.stdout).toContain("SHOULD");
  expect(r.stdout).toContain("LANG-005");
});

// ---------------------------------------------------------------- report

// The worked example from the conformance spec, reproduced in structure.
test("AUTH-014 fixture reproduces the report format", () => {
  const dir = specDir({
    "glossary.md": GLOSSARY,
    "02-auth.md": `# Demo -- 02 Auth\n\nStatus: Normative design specification\nPrefix: AUTH\n\n## Capabilities\n\n[AUTH-014]\nThe service should gracefully handle invalid tokens.\n`,
  });
  const r = run([dir]);
  expect(r.status).toBe(1);
  expect(r.stdout).toContain("AUTH-014");
  expect(r.stdout).toContain('"The service should gracefully handle invalid tokens."');
  expect(r.stdout).toContain("SERVICE\n  Ambiguous term. (LANG-013");
  expect(r.stdout).toContain("Project vocabulary contains: authentication service");
  expect(r.stdout).toContain("SHOULD\n  Ambiguous normative strength. (LANG-005");
  expect(r.stdout).toContain("Did you mean MUST or MAY?");
  expect(r.stdout).toContain("GRACEFULLY\n  Undefined qualitative term. (LANG-030");
  expect(r.stdout).toContain("State the observable required behavior.");
});

// ---------------------------------------------------------------- tokens

test("lowercase normative keywords are reported (CONF-004)", () => {
  const dir = specDir({
    "01-broker.md": `# Demo\n\nStatus: Normative design specification\nPrefix: BROKER\n\n## Capabilities\n\n[BROKER-001]\nThe broker must reject an invalid request.\n`,
  });
  const r = run([dir]);
  expect(r.status).toBe(1);
  expect(r.stdout).toContain("MUST\n  Normative keyword in lower case. (LANG-006");
});

test("uppercase OPTIONAL is reported; lowercase optional is not (CONF-003)", () => {
  const bad = specDir({
    "01-a.md": `# D\n\nStatus: Normative design specification\nPrefix: AA\n\n## Capabilities\n\n[AA-001]\nCaching is OPTIONAL for the broker.\n`,
  });
  expect(run([bad]).status).toBe(1);
  const ok = specDir({
    "01-a.md": `# D\n\nStatus: Draft for review\nPrefix: AA\n\n## Capabilities\n\n[AA-001]\nWhen a request carries an optional header, the broker MUST accept the request.\n`,
  });
  expect(run([ok]).status).toBe(0);
});

test("unqualified Avoid terms fire; qualified ones do not (CONF-006)", () => {
  const dir = specDir({
    "glossary.md": GLOSSARY,
    "01-a.md": `# D\n\nStatus: Normative design specification\nPrefix: AA\n\n## Capabilities\n\n[AA-001]\nWhen work is out of scope, the broker MUST report it later.\n`,
  });
  const r = run([dir]);
  expect(r.status).toBe(1);
  expect(r.stdout).toContain("LATER");
  // "out of scope" is parenthetically qualified -> pass two, not here.
  expect(r.stdout).not.toContain("OUT OF SCOPE");
});

// ---------------------------------------------------------------- sentences

test("compound requirements are reported (CONF-007)", () => {
  const dir = specDir({
    "01-a.md": `# D\n\nStatus: Normative design specification\nPrefix: AA\n\n## Capabilities\n\n[AA-001]\nThe broker MUST validate the manifest and MUST NOT cache an invalid one.\n`,
  });
  const r = run([dir]);
  expect(r.status).toBe(1);
  expect(r.stdout).toContain("COMPOUND REQUIREMENT");
  expect(r.stdout).toContain("LANG-020");
});

test("pronoun and placeholder subjects are reported (CONF-008)", () => {
  const dir = specDir({
    "01-a.md": `# D\n\nStatus: Normative design specification\nPrefix: AA\n\n## Capabilities\n\n[AA-001]\nWhen a request arrives, it MUST be rejected.\n\n[AA-002]\nThe system MUST log every rejection.\n\n[AA-003]\nMUST reject unsigned manifests.\n`,
  });
  const r = run([dir]);
  expect(r.status).toBe(1);
  expect(r.stdout).toContain("IT\n  Pronoun or placeholder subject. (LANG-021");
  expect(r.stdout).toContain("THE SYSTEM\n  Pronoun or placeholder subject. (LANG-021");
  expect(r.stdout).toContain("NO ACTOR\n  Requirement names no actor. (LANG-021");
});

test("requirement sentences over 30 words are reported (CONF-009)", () => {
  const words = Array.from({ length: 33 }, (_, i) => `word${i}`).join(" ");
  const dir = specDir({
    "01-a.md": `# D\n\nStatus: Normative design specification\nPrefix: AA\n\n## Capabilities\n\n[AA-001]\nThe broker MUST accept ${words}.\n`,
  });
  const r = run([dir]);
  expect(r.status).toBe(1);
  expect(r.stdout).toContain("SENTENCE LENGTH");
  expect(r.stdout).toContain("LANG-024");
});

// ---------------------------------------------------------------- identifiers

test("duplicate, wrong-prefix, short, and undeclared identifiers are reported (CONF-001)", () => {
  const dup = specDir({
    "01-a.md": `# D\n\nStatus: Normative design specification\nPrefix: AA\n\n## Capabilities\n\n[AA-001]\nThe broker MUST accept a valid request.\n\n[AA-001]\nThe broker MUST reject an invalid request.\n`,
  });
  expect(run([dup]).stdout).toContain("Duplicate identifier");
  const wrong = specDir({
    "01-a.md": `# D\n\nStatus: Normative design specification\nPrefix: AA\n\n## Capabilities\n\n[BB-001]\nThe broker MUST accept a valid request.\n`,
  });
  expect(run([wrong]).stdout).toContain("not this spec's declared prefix");
  const short = specDir({
    "01-a.md": `# D\n\nStatus: Normative design specification\nPrefix: AA\n\n## Capabilities\n\n[AA-01]\nThe broker MUST accept a valid request.\n`,
  });
  expect(run([short]).stdout).toContain("not three digits");
  const undeclared = specDir({
    "01-a.md": `# D\n\nStatus: Normative design specification\n\n## Capabilities\n\n[AA-001]\nThe broker MUST accept a valid request.\n`,
  });
  expect(run([undeclared]).stdout).toContain("no declared prefix");
});

test("unresolved references to a declared prefix are reported", () => {
  const dir = specDir({
    "01-a.md": `# D\n\nStatus: Normative design specification\nPrefix: AA\n\n## Capabilities\n\n[AA-001]\nThe broker MUST enforce AA-999 at boot.\n`,
  });
  const r = run([dir]);
  expect(r.status).toBe(1);
  expect(r.stdout).toContain("Unresolved requirement reference");
});

// ---------------------------------------------------------------- history

function gitSpecDir(files) {
  const dir = specDir(files);
  const g = (args) => spawnSync("git", args, { cwd: dir, encoding: "utf8" });
  g(["init", "-q"]);
  g(["config", "user.email", "test@example.com"]);
  g(["config", "user.name", "test"]);
  g(["add", "-A"]);
  g(["commit", "-qm", "v1"]);
  return dir;
}

test("removing an identifier is reported; withdrawing is not (CONF-002)", () => {
  const base = `# D\n\nStatus: Draft for review\nPrefix: AA\n\n## Capabilities\n\n[AA-001]\nThe broker MUST accept a valid request.\n\n[AA-002]\nThe broker MUST reject an invalid request.\n`;
  const removed = gitSpecDir({ "01-a.md": base });
  writeFileSync(
    join(removed, "01-a.md"),
    base.replace(/\[AA-002\]\nThe broker MUST reject an invalid request\.\n/, "")
  );
  const r1 = run([removed]);
  expect(r1.status).toBe(1);
  expect(r1.stdout).toContain("Identifier removed");
  const withdrawn = gitSpecDir({ "01-a.md": base });
  writeFileSync(
    join(withdrawn, "01-a.md"),
    base.replace(
      "[AA-002]\nThe broker MUST reject an invalid request.",
      "[AA-002]\nWithdrawn: 2026-09-01 -- superseded by AA-003.\n\n[AA-003]\nWhen a request is invalid, the broker MUST reject the request."
    )
  );
  expect(run([withdrawn]).status).toBe(0);
});

test("reusing a withdrawn identifier is reported (CONF-002)", () => {
  const base = `# D\n\nStatus: Draft for review\nPrefix: AA\n\n## Capabilities\n\n[AA-001]\nWithdrawn: 2026-08-01 -- folded into AA-002.\n\n[AA-002]\nThe broker MUST reject an invalid request.\n`;
  const dir = gitSpecDir({ "01-a.md": base });
  writeFileSync(
    join(dir, "01-a.md"),
    base.replace(
      "[AA-001]\nWithdrawn: 2026-08-01 -- folded into AA-002.",
      "[AA-001]\nThe broker MUST accept a valid request."
    )
  );
  const r = run([dir]);
  expect(r.status).toBe(1);
  expect(r.stdout).toContain("Withdrawn identifier reused");
});

test("no git history yields an INFO line, not a finding (CONF-002)", () => {
  const dir = specDir({
    "01-a.md": CLEAN_SPEC.replace(
      "Status: Normative design specification",
      "Status: Draft for review"
    ),
  });
  const r = run([dir], tmpdir());
  expect(r.status).toBe(0);
  expect(r.stdout).toContain("identifier-stability check (CONF-002) skipped");
});

// ---------------------------------------------------------------- map

const MAP_SPEC = `# D\n\nStatus: Normative design specification\nPrefix: AA\n\n## Capabilities\n\n[AA-001]\nThe broker MUST accept a valid request.\n`;

test("agreed identifiers with no conformance.md are reported (CONF-040)", () => {
  const dir = specDir({ "01-a.md": MAP_SPEC });
  const r = run([dir]);
  expect(r.status).toBe(1);
  expect(r.stdout).toContain("No conformance.md");
});

test("Draft and Observed specs do not require map rows (CONF-043)", () => {
  const dir = specDir({
    "01-a.md": MAP_SPEC.replace(
      "Status: Normative design specification",
      "Status: Draft for review"
    ),
    "02-b.md": MAP_SPEC.replace(
      "Status: Normative design specification",
      "Status: Observed (as-built; unconfirmed)"
    ).replace(/AA/g, "BB"),
  });
  expect(run([dir]).status).toBe(0);
});

const MAP_HEAD = "# Evidence map\n\n## AA\n\n| Requirement | Coverage | Method | Evidence |\n|---|---|---|---|\n";

test("map rows are validated: coverage, evidence presence, path, duplicates, unknown ids", () => {
  const dir = specDir({
    "01-a.md": MAP_SPEC,
    "conformance.md":
      MAP_HEAD +
      "| AA-001 | Covered | integration | |\n" +
      "| AA-001 | Sorta | integration | nowhere/missing.rs |\n" +
      "| AA-999 | Uncovered | - | |\n",
  });
  const r = run([dir]);
  expect(r.status).toBe(1);
  expect(r.stdout).toContain("Covered with no evidence citation");
  expect(r.stdout).toContain('Invalid map coverage "Sorta"');
  expect(r.stdout).toContain("appears more than once");
  expect(r.stdout).toContain("Evidence path does not exist");
  expect(r.stdout).toContain("identifier no spec defines");
});

test("a complete, truthful map passes (CONF-040/041/042)", () => {
  const dir = specDir({
    "01-a.md": MAP_SPEC,
    "evidence.rs": "// cited evidence\n",
    "conformance.md": MAP_HEAD + "| AA-001 | Asserted | inspected | evidence.rs |\n",
  });
  expect(run([dir]).status).toBe(0);
});

// The column split: coverage and method are separate axes, and no
// check reads a mechanism out of a coverage word.
test("an unknown method is reported (CONF-045)", () => {
  const dir = specDir({
    "01-a.md": MAP_SPEC,
    "evidence.rs": "// cited evidence\n",
    "conformance.md": MAP_HEAD + "| AA-001 | Covered | vibes | evidence.rs |\n",
  });
  const r = run([dir]);
  expect(r.status).toBe(1);
  expect(r.stdout).toContain('Invalid map method "vibes"');
});

test("inspected and Asserted agree in both directions (CONF-046/047)", () => {
  const dir = specDir({
    "01-a.md": MAP_SPEC,
    "evidence.rs": "// cited evidence\n",
    "conformance.md": MAP_HEAD + "| AA-001 | Covered | inspected | evidence.rs |\n",
  });
  expect(run([dir]).stdout).toContain("Method inspected with coverage that is not Asserted");

  const other = specDir({
    "01-a.md": MAP_SPEC,
    "evidence.rs": "// cited evidence\n",
    "conformance.md": MAP_HEAD + "| AA-001 | Asserted | test | evidence.rs |\n",
  });
  expect(run([other]).stdout).toContain('Coverage Asserted with method "test"');
});

test("an Uncovered row carries no method and no evidence (CONF-048/049)", () => {
  const dir = specDir({
    "01-a.md": MAP_SPEC,
    "conformance.md": MAP_HEAD + "| AA-001 | Uncovered | test | |\n",
  });
  expect(run([dir]).stdout).toContain('Coverage Uncovered with method "test"');

  const other = specDir({
    "01-a.md": MAP_SPEC,
    "evidence.rs": "// cited evidence\n",
    "conformance.md": MAP_HEAD + "| AA-001 | Uncovered | - | evidence.rs |\n",
  });
  expect(run([other]).stdout).toContain("Coverage Uncovered with an evidence citation");
});

// A pre-split map is reported as a shape finding, not silently
// misread with its evidence cell parsed as a method.
test("a three-column map row is reported (CONF-041/045)", () => {
  const dir = specDir({
    "01-a.md": MAP_SPEC,
    "evidence.rs": "// cited evidence\n",
    "conformance.md": `# Conformance\n\n## AA\n\n| Req | Status | Evidence |\n|---|---|---|\n| AA-001 | Asserted | evidence.rs |\n`,
  });
  const r = run([dir]);
  expect(r.status).toBe(1);
  expect(r.stdout).toContain("does not carry the four map columns");
});

// ---------------------------------------------------------------- self

// The interlock: both design specs pass their own checker.
test("the language and evidence-map specs pass their own check", () => {
  const r = run([OWN_SPECS]);
  expect(r.stdout).toContain("no findings");
  expect(r.status).toBe(0);
});

// CONF-010: the check never writes.
test("the check does not modify scanned files", () => {
  const dir = specDir({ "glossary.md": GLOSSARY, "01-broker.md": CLEAN_SPEC });
  const before = readFileSync(join(dir, "01-broker.md"), "utf8");
  run([dir]);
  expect(readFileSync(join(dir, "01-broker.md"), "utf8")).toBe(before);
});

// The shipped templates scaffold a spec set that passes the check:
// templates can never drift out of the language they teach.
test("a spec set scaffolded from the shipped templates passes", () => {
  const templates = new URL(
    "../skills/new-project/templates",
    import.meta.url
  ).pathname;
  const dir = mkdtempSync(join(tmpdir(), "same-page-scaffold-"));
  mkdirSync(join(dir, "iterations"), { recursive: true });
  const copy = (from, to) =>
    writeFileSync(join(dir, to), readFileSync(join(templates, from), "utf8"));
  copy("glossary.md", "glossary.md");
  copy("domain-spec.md", "01-domain.md");
  copy("conformance.md", "conformance.md");
  writeFileSync(
    join(dir, "iterations", "001.md"),
    readFileSync(join(templates, "iteration.md"), "utf8")
  );
  const r = run([dir]);
  expect(r.stdout).toContain("no findings");
  expect(r.status).toBe(0);
});
