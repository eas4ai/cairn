import { test, expect } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Every test here spawns the scripts or the engine as child
// processes, so a loaded machine makes them slow rather than wrong.
// The timeout is generous on purpose: a red suite must mean a defect.
const TEST_TIMEOUT = 120_000;

const CHECK = new URL(
  "../skills/new-project/scripts/language-check.mjs",
  import.meta.url
).pathname;
const OWN_SPECS = new URL("../docs/superpowers/specs", import.meta.url).pathname;
const OWN_SPEC_SET = new URL("../docs/specs/same-page", import.meta.url).pathname;

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

const TEMPLATES = new URL("../skills/new-project/templates", import.meta.url).pathname;

// The Working vocabulary section is the standard dictionary and must be
// verbatim in every glossary (CONF-014), so fixtures take it from the
// shipped template and put their own terms under Project terms.
function standardSection(text) {
  const lines = text.split("\n");
  const start = lines.indexOf("## Working vocabulary");
  let end = lines.findIndex((l, i) => i > start && l.startsWith("## "));
  if (end < 0) end = lines.length;
  return lines.slice(start, end).join("\n");
}
const STANDARD = standardSection(readFileSync(join(TEMPLATES, "glossary.md"), "utf8"));

const GLOSSARY = `# Glossary

${STANDARD}
## Project terms

**Authentication service**:
The component that issues and validates tokens.
_Avoid_: service
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
Falsifier: a request with a malformed header reaches dispatch and the
broker returns a success response.

[BROKER-002]
The broker MUST NOT execute an operation that the plugin is not
authorized to use.
Falsifier: a plugin without the operation's capability calls it and
the broker completes it.

[BROKER-003]
The broker MAY cache a manifest for the duration of a lease.

## Acceptance criteria

- When a plugin sends ten invalid requests, the broker MUST reject
  all ten.
`;

// The map every CLEAN_SPEC fixture needs, so a CONF-040 finding never
// masquerades as the finding under test.
const BROKER_MAP = `# Evidence map\n\n## BROKER\n\n| Requirement | Coverage | Method | Evidence |\n|---|---|---|---|\n| BROKER-001 | Uncovered | - | |\n| BROKER-002 | Uncovered | - | |\n| BROKER-003 | Uncovered | - | |\n`;

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
}, TEST_TIMEOUT);

// False-block guard: non-normative sections are never scanned.
test("prose outside normative sections is not scanned", () => {
  const dir = specDir({
    "01-broker.md": `# Demo\n\nStatus: Normative design specification\nPrefix: BROKER\n\n## Why this exists\n\nThe system should gracefully evolve and will normally improve.\n`,
  });
  const r = run([dir]);
  expect(r.status).toBe(0);
}, TEST_TIMEOUT);

// False-block guard: mentions are not use (LANG-062 / CONF-013).
test("quoted terms, code spans, and fenced blocks are exempt", () => {
  const dir = specDir({
    "01-broker.md": `# Demo\n\nStatus: Draft for review\nPrefix: BROKER\n\n## Capabilities\n\n[BROKER-001]\nThe broker MUST NOT log the word "should" or the span \`gracefully\`.\n\n\`\`\`text\nThe system should gracefully handle it.\n\`\`\`\n`,
  });
  const r = run([dir]);
  expect(r.status).toBe(0);
}, TEST_TIMEOUT);

// The "Normative." marker pulls a non-canonical section into scope.
test("Normative. marker makes a section scannable (LANG-061)", () => {
  const dir = specDir({
    "01-broker.md": `# Demo\n\nStatus: Normative design specification\nPrefix: BROKER\n\n## Extra rules\n\nNormative.\n\n[BROKER-001]\nThe broker should reject bad requests.\n`,
  });
  const r = run([dir]);
  expect(r.status).toBe(1);
  expect(r.stdout).toContain("SHOULD");
  expect(r.stdout).toContain("LANG-005");
}, TEST_TIMEOUT);

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
}, TEST_TIMEOUT);

// ---------------------------------------------------------------- tokens

test("lowercase normative keywords are reported (CONF-004)", () => {
  const dir = specDir({
    "01-broker.md": `# Demo\n\nStatus: Normative design specification\nPrefix: BROKER\n\n## Capabilities\n\n[BROKER-001]\nThe broker must reject an invalid request.\n`,
  });
  const r = run([dir]);
  expect(r.status).toBe(1);
  expect(r.stdout).toContain("MUST\n  Normative keyword in lower case. (LANG-006");
}, TEST_TIMEOUT);

test("uppercase OPTIONAL is reported; lowercase optional is not (CONF-003)", () => {
  const bad = specDir({
    "01-a.md": `# D\n\nStatus: Normative design specification\nPrefix: AA\n\n## Capabilities\n\n[AA-001]\nCaching is OPTIONAL for the broker.\n`,
  });
  expect(run([bad]).status).toBe(1);
  const ok = specDir({
    "01-a.md": `# D\n\nStatus: Draft for review\nPrefix: AA\n\n## Capabilities\n\n[AA-001]\nWhen a request carries an optional header, the broker MUST accept the request.\n`,
  });
  expect(run([ok]).status).toBe(0);
}, TEST_TIMEOUT);

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
}, TEST_TIMEOUT);

// ---------------------------------------------------------------- sentences

test("compound requirements are reported (CONF-007)", () => {
  const dir = specDir({
    "01-a.md": `# D\n\nStatus: Normative design specification\nPrefix: AA\n\n## Capabilities\n\n[AA-001]\nThe broker MUST validate the manifest and MUST NOT cache an invalid one.\n`,
  });
  const r = run([dir]);
  expect(r.status).toBe(1);
  expect(r.stdout).toContain("COMPOUND REQUIREMENT");
  expect(r.stdout).toContain("LANG-020");
}, TEST_TIMEOUT);

test("pronoun and placeholder subjects are reported (CONF-008)", () => {
  const dir = specDir({
    "01-a.md": `# D\n\nStatus: Normative design specification\nPrefix: AA\n\n## Capabilities\n\n[AA-001]\nWhen a request arrives, it MUST be rejected.\n\n[AA-002]\nThe system MUST log every rejection.\n\n[AA-003]\nMUST reject unsigned manifests.\n`,
  });
  const r = run([dir]);
  expect(r.status).toBe(1);
  expect(r.stdout).toContain("IT\n  Pronoun or placeholder subject. (LANG-021");
  expect(r.stdout).toContain("THE SYSTEM\n  Pronoun or placeholder subject. (LANG-021");
  expect(r.stdout).toContain("NO ACTOR\n  Requirement names no actor. (LANG-021");
}, TEST_TIMEOUT);

test("requirement sentences over 30 words are reported (CONF-009)", () => {
  const words = Array.from({ length: 33 }, (_, i) => `word${i}`).join(" ");
  const dir = specDir({
    "01-a.md": `# D\n\nStatus: Normative design specification\nPrefix: AA\n\n## Capabilities\n\n[AA-001]\nThe broker MUST accept ${words}.\n`,
  });
  const r = run([dir]);
  expect(r.status).toBe(1);
  expect(r.stdout).toContain("SENTENCE LENGTH");
  expect(r.stdout).toContain("LANG-024");
}, TEST_TIMEOUT);

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
}, TEST_TIMEOUT);

test("unresolved references to a declared prefix are reported", () => {
  const dir = specDir({
    "01-a.md": `# D\n\nStatus: Normative design specification\nPrefix: AA\n\n## Capabilities\n\n[AA-001]\nThe broker MUST enforce AA-999 at boot.\n`,
  });
  const r = run([dir]);
  expect(r.status).toBe(1);
  expect(r.stdout).toContain("Unresolved requirement reference");
}, TEST_TIMEOUT);

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
}, TEST_TIMEOUT);

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
}, TEST_TIMEOUT);

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
}, TEST_TIMEOUT);

// ---------------------------------------------------------------- map

const MAP_SPEC = `# D\n\nStatus: Normative design specification\nPrefix: AA\n\n## Capabilities\n\n[AA-001]\nThe broker MUST accept a valid request.\nFalsifier: a valid request arrives and the broker rejects it.\n`;

test("agreed identifiers with no conformance.md are reported (CONF-040)", () => {
  const dir = specDir({ "01-a.md": MAP_SPEC });
  const r = run([dir]);
  expect(r.status).toBe(1);
  expect(r.stdout).toContain("No conformance.md");
}, TEST_TIMEOUT);

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
}, TEST_TIMEOUT);

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
}, TEST_TIMEOUT);

test("a complete, truthful map passes (CONF-040/041/042)", () => {
  const dir = specDir({
    "01-a.md": MAP_SPEC,
    "evidence.rs": "// cited evidence\n",
    "conformance.md": MAP_HEAD + "| AA-001 | Asserted | inspected | evidence.rs |\n",
  });
  expect(run([dir]).status).toBe(0);
}, TEST_TIMEOUT);

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
}, TEST_TIMEOUT);

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
}, TEST_TIMEOUT);

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
}, TEST_TIMEOUT);

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
}, TEST_TIMEOUT);

// ---------------------------------------------------------------- self

// The interlock: both design specs pass their own checker.
// Self-hosting with teeth: the package's own glossary supplies the Avoid
// terms, so CONF-006 runs here instead of being skipped.
test("the language and evidence-map specs pass their own check", () => {
  const r = run([OWN_SPEC_SET, OWN_SPECS]);
  expect(r.stdout).toContain("no findings");
  expect(r.stdout).not.toContain("CONF-006) skipped");
  expect(r.status).toBe(0);
}, TEST_TIMEOUT);

// CONF-010: the check never writes.
test("the check does not modify scanned files", () => {
  const dir = specDir({ "glossary.md": GLOSSARY, "01-broker.md": CLEAN_SPEC });
  const before = readFileSync(join(dir, "01-broker.md"), "utf8");
  run([dir]);
  expect(readFileSync(join(dir, "01-broker.md"), "utf8")).toBe(before);
}, TEST_TIMEOUT);

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
}, TEST_TIMEOUT);

// ---------------------------------------------------------------- standard dictionary

// CONF-014: the Working vocabulary section is the standard dictionary,
// identical in every project by default; a project changes an entry only
// by a recorded _Ruling_: line. False-pass guards: an unruled edit, a
// missing entry, a missing section, and a foreign entry are reported.
// False-block guards: the verbatim section passes (every fixture above
// is built from it), and a ruled edit passes with an INFO line.
test("an edited standard-dictionary entry without a ruling is reported (CONF-014)", () => {
  const edited = GLOSSARY.replace("Implemented and verified.", "Implemented, tests optional.");
  expect(edited).not.toBe(GLOSSARY);
  const dir = specDir({ "glossary.md": edited, "01-broker.md": CLEAN_SPEC });
  const r = run([dir]);
  expect(r.status).toBe(1);
  expect(r.stdout).toContain("STANDARD DICTIONARY DRIFT: Done");
  expect(r.stdout).toContain("glossary.md:");
}, TEST_TIMEOUT);

test("an edited standard-dictionary entry with a ruling passes and is listed (CONF-014)", () => {
  const ruled = GLOSSARY.replace(
    "Implemented and verified. Code without its verification is not done.\n_Avoid_: mostly done, done pending tests\n",
    "Implemented and verified by the developer. Code without its verification is not done.\n_Avoid_: mostly done, done pending tests\n_Ruling_: 2026-09-01 -- verification here means the developer ran it\n"
  );
  expect(ruled).not.toBe(GLOSSARY);
  const dir = specDir({ "glossary.md": ruled, "01-broker.md": CLEAN_SPEC, "conformance.md": BROKER_MAP });
  const r = run([dir]);
  expect(r.stdout).toContain("no findings");
  expect(r.stdout).toContain("standard term ruled for this project: Done");
  expect(r.status).toBe(0);
}, TEST_TIMEOUT);

test("a missing standard entry and a foreign entry in the section are reported (CONF-014)", () => {
  const withoutDrift = GLOSSARY.replace(/\*\*Drift\*\*:\n[^]*?\n\n/, "");
  const foreign = withoutDrift.replace("## Project terms", "**Widget**:\nA thing.\n_Avoid_: gadget\n\n## Project terms");
  const dir = specDir({ "glossary.md": foreign, "01-broker.md": CLEAN_SPEC });
  const r = run([dir]);
  expect(r.status).toBe(1);
  expect(r.stdout).toContain("STANDARD DICTIONARY DRIFT: Drift");
  expect(r.stdout).toContain("NOT A STANDARD TERM: Widget");
}, TEST_TIMEOUT);

test("a glossary without the Working vocabulary section is reported (CONF-014)", () => {
  const dir = specDir({
    "glossary.md": "# Glossary\n\n## Project terms\n\n**Thing**:\nA thing.\n_Avoid_: stuff\n",
    "01-broker.md": CLEAN_SPEC,
  });
  const r = run([dir]);
  expect(r.status).toBe(1);
  expect(r.stdout).toContain("STANDARD DICTIONARY MISSING");
}, TEST_TIMEOUT);

// A script copied without its templates cannot compare; it says so (INFO)
// and does not fail the run.
test("a script without its template beside it says so and does not fail (CONF-014)", () => {
  const lone = mkdtempSync(join(tmpdir(), "same-page-lone-"));
  mkdirSync(join(lone, "scripts"));
  writeFileSync(join(lone, "scripts", "language-check.mjs"), readFileSync(CHECK, "utf8"));
  const dir = specDir({ "glossary.md": GLOSSARY, "01-broker.md": CLEAN_SPEC, "conformance.md": BROKER_MAP });
  const r = spawnSync("node", [join(lone, "scripts", "language-check.mjs"), dir], { cwd: dir, encoding: "utf8" });
  expect(r.stdout).toContain("CONF-014) skipped");
  expect(r.status).toBe(0);
}, TEST_TIMEOUT);

// ---------------------------------------------------------------- section status and falsifier lines (iteration 003)

const SECTIONED = `# D

Status: Draft for review
Prefix: AA

## Drafted

Normative.

[AA-001]
The broker MUST accept a valid request.

## Confirmed

Normative.

Agreed: 2026-09-02

[AA-002]
The broker MUST reject an invalid request.
Falsifier: an invalid request arrives and the broker accepts it.

### Inherits the section's agreement

[AA-003]
The broker MUST NOT cache an error response.
Falsifier: an error response is served from the cache.

### Observed part

Status: Observed (as-built; unconfirmed)

[AA-004]
The broker MUST log every request.
`;
const SECTIONED_MAP = "# Evidence map\n\n## AA\n\n| Requirement | Coverage | Method | Evidence |\n|---|---|---|---|\n| AA-002 | Uncovered | - | |\n| AA-003 | Uncovered | - | |\n";

test("an Agreed section inside a Draft file is held to the map, and its subsections inherit; an Observed subsection does not (CONF-015)", () => {
  const missing = run([specDir({ "01-a.md": SECTIONED })]);
  expect(missing.stdout).toContain("No conformance.md, but 2 Agreed requirement(s) exist. (CONF-040)");
  expect(missing.status).toBe(1);
  const partial = run([specDir({ "01-a.md": SECTIONED, "conformance.md": SECTIONED_MAP.replace("| AA-003 | Uncovered | - | |\n", "") })]);
  expect(partial.stdout).toContain("AA-003\n  Agreed requirement missing from the map");
  const ok = run([specDir({ "01-a.md": SECTIONED, "conformance.md": SECTIONED_MAP })]);
  expect(ok.stdout).toContain("no findings");
  expect(ok.status).toBe(0);
  // A row for the Observed requirement is a row for an identifier the map may not hold (CONF-043 spirit), but the
  // check only refuses unknown identifiers; what it must not do is require AA-001 or AA-004.
  expect(ok.stdout).not.toContain("AA-001");
  expect(ok.stdout).not.toContain("AA-004");
}, TEST_TIMEOUT);

test("an Agreed MUST with no Falsifier line is reported; Draft and Observed ones are not (CONF-016)", () => {
  const r = run([specDir({ "01-a.md": SECTIONED.replace("Falsifier: an error response is served from the cache.\n", ""), "conformance.md": SECTIONED_MAP })]);
  expect(r.stdout).toContain("AA-003\n  Agreed MUST or MUST NOT requirement with no Falsifier: line. (LANG-070, LANG-075, CONF-016)");
  expect(r.stdout).not.toContain("AA-001\n  Agreed MUST");
  expect(r.stdout).not.toContain("AA-004\n  Agreed MUST");
  expect(r.status).toBe(1);
}, TEST_TIMEOUT);

test("a Falsifier line under a permission-only MAY is reported (CONF-017)", () => {
  const spec = CLEAN_SPEC.replace("The broker MAY cache a manifest for the duration of a lease.\n", "The broker MAY cache a manifest for the duration of a lease.\nFalsifier: a manifest is cached past its lease.\n");
  const r = run([specDir({ "glossary.md": GLOSSARY, "01-broker.md": spec, "conformance.md": BROKER_MAP })]);
  expect(r.stdout).toContain("BROKER-003\n  Falsifier: line under a permission-only MAY requirement. (LANG-073, CONF-017)");
  expect(r.status).toBe(1);
}, TEST_TIMEOUT);

test("a normative keyword inside a Falsifier line is reported; a mention is not (CONF-018)", () => {
  const bad = CLEAN_SPEC.replace("broker returns a success response.", "broker MUST return a success response.");
  const r = run([specDir({ "glossary.md": GLOSSARY, "01-broker.md": bad, "conformance.md": BROKER_MAP })]);
  expect(r.stdout).toContain("BROKER-001\n  Normative keyword inside a Falsifier: line. (LANG-077, CONF-018)");
  expect(r.status).toBe(1);
  const mention = CLEAN_SPEC.replace("broker returns a success response.", "broker returns a success response although the rule says `MUST`.");
  const m = run([specDir({ "glossary.md": GLOSSARY, "01-broker.md": mention, "conformance.md": BROKER_MAP })]);
  expect(m.stdout).toContain("no findings");
}, TEST_TIMEOUT);

test("the four rules together produce exactly four findings on the contract's fixture (iteration 003 definition of done)", () => {
  const spec = SECTIONED.replace("Falsifier: an error response is served from the cache.\n", "")
    .replace("[AA-004]\nThe broker MUST log every request.\n", "[AA-004]\nThe broker MUST log every request.\n\n## Permissions\n\nNormative.\n\nAgreed: 2026-09-02\n\n[AA-005]\nThe broker MAY cache a manifest.\nFalsifier: a manifest is cached.\n\n[AA-006]\nThe broker MUST NOT serve a stale manifest.\nFalsifier: the broker MUST serve a fresh manifest.\n");
  const r = run([specDir({ "01-a.md": spec })]);
  expect(r.stdout).toContain("language check: 4 finding(s)");
  expect(r.stdout).toContain("(CONF-040)");
  expect(r.stdout).toContain("CONF-016)");
  expect(r.stdout).toContain("CONF-017)");
  expect(r.stdout).toContain("CONF-018)");
}, TEST_TIMEOUT);
