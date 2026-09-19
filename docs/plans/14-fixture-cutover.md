# End-to-end fixture and cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** prove the whole loop as real commands against a throwaway repository with a bare authority remote, in three fixtures (full loop, evaluator shadow mode, crash recovery), then produce the 1.x cut list and the developer's cutover checklist.

**Architecture:** one helper builds a two-requirement project and runs `bin/cairn.mjs` as a child process for every agent command; the two developer-only steps (init confirmation, authorization) and the developer's answers are performed through the lib modules with an injected confirmation function. After every step the test reads `wake(cwd)` and asserts the exact verdict, action and predicate, and at the end it reads `refs/cairn/log` and asserts the exact kind sequence. The crash fixture puts a fake `git` on PATH that kills the running `cairn start` between two ref updates.

**Tech Stack:** Node 24 ES modules, `node --test`, `node:assert/strict`, `node:child_process`, Git with a bare remote.

**Spec:** `docs/spec/cairn-v2.md` revision 5, sections 3 (The work loop), 5 (Done, Precedence), 9 (one adversary per commitment), 12 (Removed from 1.x), 14 (Next steps), section 13 decisions 5, 7 and 21.

## Global Constraints

See `docs/plans/overview.md`. Specific to this plan, quoted from the spec:

- "Wake names one action and its predicate; the agent performs that action until the predicate holds, leaves the required code, snapshot or log record, then wakes again." (section 3)
- "Terminal output is not durable state" and "A done record means done" (sections 3, 4)
- "The report is written once at the candidate snapshot. Every later fix is a resolution." (section 5)
- "Records from 1.x are not read." (section 4); "Cairn 1.x records are not read; migration happens at a v2 Done." (13.5)
- "Backlog items do not block Done; the next wake promotes at most one." (13.21)
- "This repository develops v2 on its v2 branch and archives 1.x at cutover." (13.7)
- Privacy (overview.md): `v2`, `refs/cairn/*` and these plans never go to the `public` remote until the developer says so.

Depends on every plan. CLI flag spellings used below are the ones plans 03 to 12 register; Task 1's `assertFlags` verifies each against `cairn <command> --help` before a fixture runs, so a misspelling fails with the flag's name rather than deep in the loop.

---

## File structure

```
tests/helpers/fixture.mjs      project builder, command runner, wake and log assertions
tests/fixture.test.mjs         the full loop
tests/fixture-shadow.test.mjs  the same loop with the evaluator in shadow mode
tests/fixture-crash.test.mjs   kill cairn start between two stores; recover
scripts/cutlist.mjs            reads the 1.x spec files, writes docs/cutover/cut-list.md
tests/cutlist.test.mjs
docs/cutover/cut-list.md       generated
docs/cutover/checklist.md      the developer's archive and branch-switch commands
```

---

### Task 1: The fixture helper

**Files:**
- Create: `tests/helpers/fixture.mjs`
- Create: `tests/fixture.test.mjs` (first test only)

**Interfaces:**
- Consumes: `wake(cwd)` from `lib/wake.mjs`; `readLog(cwd)` from `lib/records.mjs`; `authenticateDeveloper(cwd, settings, {purpose, confirm})` and `authorize(cwd)` from `lib/auth.mjs` (plan 03 accepts `confirm`, the injected controlling-terminal confirmation its own tests use; `authorize` calls `authenticateDeveloper` with the options it is given, so this helper passes them through as `authorize(cwd, {confirm})`); `init(cwd, {confirmRemote, chooseKey, confirm, confirmDigest})` from `lib/init.mjs` (plan 03 Task 5; the fixture writes `.cairn/settings.json` first, so init validates it and takes `origin` from `confirmRemote`); `answer(cwd, slug, kind, text, {confirm})` from `lib/escalate.mjs`; `appendDecision` is not used directly (the CLI writes decisions); `tests/helpers/repo.mjs` from plan 01 is not needed because the fixture builds its own repository and remote.
- Produces: `buildProject() -> {dir, remote, git, cairn, wakeIs, kinds, developer}`; `assertFlags(cmd, flags)`; the `PREDICATE` table copied from section 5.

- [ ] **Step 1: Write the helper**

```js
// tests/helpers/fixture.mjs
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import assert from "node:assert/strict";
import { wake } from "../../lib/wake.mjs";
import { readLog } from "../../lib/records.mjs";
import { authorize } from "../../lib/auth.mjs";
import { init } from "../../lib/init.mjs";
import { answer } from "../../lib/escalate.mjs";

export const ROOT = resolve(new URL("../..", import.meta.url).pathname);
export const KERNEL = join(ROOT, "bin/cairn.mjs");

// Section 5, verbatim.
export const PREDICATE = {
  repair: "the named hand-written file reads under its grammar and no unrelated byte changed",
  recover: "the intent has one terminal domain or abort record and every store matches its resulting identity",
  reconcile: "the local action lease is gone and the action it named finished or was explicitly abandoned",
  scope: "every scope-breach record for the path has a developer-approved keep disposition or a restore snapshot equal to its allowed base",
  fix: "a fix record names the item and a workspace snapshot that changes no protected contract; its requirement has a current pass at or after it",
  record: "the action lease covers the path through its target's declared inputs, or the path is clean",
  commit: "the path is clean, or the action lease covers it",
  declare: "a mechanism definition names the requirement and no pre-existing undeclared delta was legalized",
  run: "a current receipt carries a result for the requirement",
  implement: "a current receipt says pass and review metadata binds the requirement to the current definition and text digests with a fail receipt",
  escalate: "after three distinct attempts without a pass, an escalation concerns the requirement before a fourth",
  "review mechanism": "review metadata has that binding and fail receipt; no declared product input changed",
  capture: "an outside record names the item, or an escalation concerns it",
  review: "a review names the current workspace snapshot and answers every fixed question for every target",
  report: "a current brief and report name the reviewed snapshot and projection; every question and interface obligation has an attempt",
  resolve: "a resolution names finding N of its exact source record, or an escalation disputes it",
  accept: "an acceptance at the current workspace snapshot examines the cumulative post-report delta and gives a verdict on every submitted resolution; new findings may remain for the next `resolve` action",
  build: "a realized ADR line names the decision's base and resulting snapshots and the realization check passed",
  done: "a done record names the commitment and final workspace snapshot",
  promote: "no commitment is open; one promotion names a backlog item and decision; `Current:` and a one-item successor start were written transactionally",
  reply: "a reply record names the open `ask` escalation",
};

const SETTINGS = {
  schema: 1, authority_remote: "origin", outside: ["README.md", "notes/**"], source: ["src/**"], interfaces: [], data: [],
  network_exclude: ["private/**"], signing_key: null, attribution: "forbidden",
  harness: { claude_code: { adversary_model: "claude-fable-5-1", adversary_transport: "remote" } },
  typesafeai: { enabled: false, mode: "shadow", model: "jev-1.13.0", route_confidence: 0.8, sufficient_threshold: 0.7, outside_threshold: 0.8, contradicts_ceiling: 0.3, reversible_floor: 0.7, observed_floor: 0.6, max_false_downgrade: 0.05, min_calibration_agent_predictions: 60, request_cap_bytes: 48000 },
};

export const SPEC = {
  "docs/spec/overview.md": "# Adder\n\nAdder adds two numbers. It is not a calculator.\n\n| Domain | Prefix |\n|---|---|\n| docs/spec/add.md | REQ |\n",
  "docs/spec/glossary.md": "# Glossary\n\n- sum: the result of add.\n",
  "docs/spec/add.md": "Prefix: REQ\n\n[REQ-001] The add function returns the sum of two numbers.\nFalsifier: add(2, 3) returns anything but 5.\nMechanism: tests\nStatus: Draft\n\n[REQ-002] The add function refuses a non-number argument by throwing a TypeError.\nFalsifier: add(\"2\", 3) returns a value instead of throwing.\nMechanism: tests\nStatus: Draft\n",
  "docs/spec/roadmap.md": "Current: fixture\n\n## fixture\n\nRequirements: REQ-001 REQ-002\n\nDelivers add. Done when both requirements have current passes and the adversary has accepted.\n",
};

export const MECH_TEST = `import { add } from "../src/add.mjs";
const say = (id, ok) => process.stdout.write("cairn: " + id + ": " + (ok ? "pass" : "fail") + "\\n");
let sum = false, refuses = false;
try { sum = add(2, 3) === 5; } catch {}
try { add("2", 3); } catch (e) { refuses = e instanceof TypeError; }
say("REQ-001", sum); say("REQ-002", refuses);
`;

export function buildProject({ settings = SETTINGS } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "cairn-fixture-"));
  const remote = mkdtempSync(join(tmpdir(), "cairn-remote-"));
  const sh = (cwd, cmd, args, opts = {}) => spawnSync(cmd, args, { cwd, encoding: "utf8", ...opts });
  const git = (...a) => { const r = sh(dir, "git", a); assert.equal(r.status, 0, `git ${a.join(" ")}: ${r.stderr}`); return r.stdout; };
  spawnSync("git", ["init", "-q", "--bare", remote]);
  git("init", "-q", "-b", "main"); git("config", "user.email", "dev@example.invalid"); git("config", "user.name", "dev");
  git("remote", "add", "origin", remote);
  for (const [p, text] of Object.entries(SPEC)) { mkdirSync(join(dir, p, ".."), { recursive: true }); writeFileSync(join(dir, p), text); }
  mkdirSync(join(dir, ".cairn")); writeFileSync(join(dir, ".cairn/settings.json"), JSON.stringify(settings, null, 2) + "\n");
  mkdirSync(join(dir, "tests")); writeFileSync(join(dir, "tests/req.test.mjs"), MECH_TEST);
  mkdirSync(join(dir, "src")); writeFileSync(join(dir, "src/add.mjs"), "export function add() { return undefined; }\n");
  writeFileSync(join(dir, "README.md"), "adder\n"); writeFileSync(join(dir, ".gitignore"), ".cairn/output/\n");
  git("add", "-A"); git("commit", "-q", "-m", "Prepare the fixture project");
  const cairn = (args, { stdin, env, expectExit = 0 } = {}) => {
    const r = sh(dir, process.execPath, [KERNEL, ...args], { input: stdin, env: { ...process.env, ...env } });
    assert.equal(r.status, expectExit, `cairn ${args.join(" ")} exited ${r.status}: ${r.stderr}${r.stdout}`);
    return r;
  };
  const wakeIs = async (verdict, action, target) => {
    const w = await wake(dir);
    assert.equal(w.verdict, verdict, JSON.stringify(w));
    if (action) { assert.equal(w.action, action, JSON.stringify(w)); assert.equal(w.predicate, PREDICATE[action], w.action); }
    if (target !== undefined) assert.equal(w.target, target, JSON.stringify(w));
    return w;
  };
  const kinds = async () => (await readLog(dir)).map((r) => r.kind);
  const confirm = async () => true;
  const developer = {
    init: () => init(dir, { confirmRemote: async () => 'origin', chooseKey: async () => null, confirm, confirmDigest: async () => true }),
    authorize: () => authorize(dir, { confirm }),
    answer: (slug, kind, text) => answer(dir, slug, kind, text, { confirm }),
  };
  const write = (p, text) => { mkdirSync(join(dir, p, ".."), { recursive: true }); writeFileSync(join(dir, p), text); };
  const commit = (msg) => { git("add", "-A"); git("commit", "-q", "-m", msg); return git("rev-parse", "HEAD").trim(); };
  return { dir, remote, git, cairn, wakeIs, kinds, developer, write, commit, readLog: () => readLog(dir), remove: (p) => rmSync(join(dir, p), { force: true }) };
}

export function assertFlags(cmd, flags) {
  const help = spawnSync(process.execPath, [KERNEL, ...cmd.split(" "), "--help"], { encoding: "utf8" }).stdout;
  for (const f of flags) assert.ok(help.includes(f), `cairn ${cmd} --help does not list ${f}`);
}

export const REPORT_FLAGS = ["--file", "--model", "--transport"];
```

- [ ] **Step 2: Write the first test**

```js
// tests/fixture.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { writeFileSync, readFileSync } from "node:fs";
import { buildProject, assertFlags, PREDICATE, REPORT_FLAGS } from "./helpers/fixture.mjs";

test("the CLI registers every flag the fixture uses", () => {
  assertFlags("declare", ["--command", "--input", "--requirement", "--results", "--identity"]);
  assertFlags("item", ["--backlog", "--defect", "--next-feature", "--slug", "--from", "--body"]);
  assertFlags("escalate", ["--slug", "--question", "--recommendation", "--because", "--if-wrong", "--instead", "--concerns"]);
  assertFlags("decide", ["--consequential", "--title", "--because", "--wrong-if", "--body"]);
  assertFlags("realize", ["--subject"]);
  assertFlags("review", ["--file"]);
  assertFlags("report", REPORT_FLAGS);
  assertFlags("accept", ["--file"]);
  assertFlags("supersede", ["--quote"]);
  assertFlags("scope", ["restore", "keep"]);
});
```

- [ ] **Step 3: Run test to verify it fails or passes**

Run: `node --test tests/fixture.test.mjs`
Expected: PASS when plans 03 to 12 registered these flags; otherwise FAIL naming the missing flag. A missing flag is fixed in the plan that owns the command (add the flag to its `lib/cli.mjs` entry) before continuing; the fixture does not work around it.

- [ ] **Step 4: Commit**

```bash
git add tests/helpers/fixture.mjs tests/fixture.test.mjs
git commit -m "Add the end-to-end fixture helper and the flag check"
```

---

### Task 2: The spec tail: init, declare, fail receipt, review mechanism, authorize, start

**Files:**
- Modify: `tests/fixture.test.mjs`

**Interfaces:**
- Consumes: Task 1; `cairn declare`, `check`, `review mechanism`, `start`, `wake` as child processes.
- Produces: the `tail(p)` function the later segments call first.

- [ ] **Step 1: Write the failing test**

```js
export async function tail(p) {
  // Not a project yet: wake exits 3 naming the skill.
  const w0 = await (await import("../lib/wake.mjs")).wake(p.dir);
  assert.equal(w0.exit, 3); assert.match(w0.line, /\/new-project or \/existing-project/);
  await p.developer.init();
  assert.deepEqual(await p.kinds(), ["init"]);
  // Agree the blocks (the developer confirmed them at the gate; the file edit is the agent's).
  p.write("docs/spec/add.md", readFileSync(join(p.dir, "docs/spec/add.md"), "utf8").replaceAll("Status: Draft", "Status: Agreed 2026-09-19"));
  p.commit("Agree the two requirements");
  assert.equal(p.cairn(["lint", "docs/spec"]).stdout.trim(), "cairn: lint: clean");
  p.cairn(["declare", "tests", "--command", "node tests/req.test.mjs", "--input", "src", "--input", "tests", "--requirement", "REQ-001", "--requirement", "REQ-002", "--results", "per-requirement", "--identity", `node=${process.version}`]);
  p.commit("Declare the tests mechanism");
  const fail = p.cairn(["check", "REQ-001"]).stdout.trim().split("\n").at(-1);
  assert.match(fail, /^cairn: receipt [0-9a-f]{40} REQ-001: fail REQ-002: fail$/);
  const receipt = fail.split(" ")[2];
  assert.deepEqual(await p.kinds(), ["init", "receipt"]);
  p.cairn(["review", "mechanism", "REQ-001", receipt]); p.cairn(["review", "mechanism", "REQ-002", receipt]);
  p.commit("Bind the mechanism review to the fail receipt");
  p.write("AGENTS.md", readFileSync(join(ROOT, "skills/new-project/templates/AGENTS.md"), "utf8"));   // plan 13's template is the working agreement
  p.commit("Add the working agreement");
  p.cairn(["start", "fixture"], { expectExit: 1 });   // refused: no authorization
  await p.developer.authorize();
  assert.deepEqual(await p.kinds(), ["init", "receipt", "authorization"]);
  p.cairn(["start", "fixture"]);
  assert.deepEqual(await p.kinds(), ["init", "receipt", "authorization", "command-intent", "start"]);
  assert.equal(p.git("config", "--get-all", "remote.origin.fetch").includes("refs/cairn/log:refs/cairn/log"), true);
  await p.wakeIs("Resolvable", "implement", "REQ-001");
}

test("spec tail: init, declare, fail receipt, mechanism review, authorize, start", async () => {
  const p = buildProject();
  await tail(p);
});
```

Add `ROOT` to the import from `./helpers/fixture.mjs`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/fixture.test.mjs`
Expected: FAIL at the first assertion whose output format differs from a plan's actual output (most likely the lint line or the receipt line). Fix the assertion to the format the owning plan prints only if that plan's own tests pin it; otherwise the owning plan prints the format asserted here.

- [ ] **Step 3: Make it pass and commit**

Run: `node --test tests/fixture.test.mjs`
Expected: PASS.

```bash
git add tests/fixture.test.mjs
git commit -m "Play the spec tail through the fixture"
```

---

### Task 3: The work loop: implement, capture, defect, escalation, scope breach, decision

**Files:**
- Modify: `tests/fixture.test.mjs`

**Interfaces:**
- Consumes: Task 2's `tail`; `cairn begin`, `end`, `check`, `item`, `outside`, `fix`, `escalate`, `reply`, `scope`, `decide`.
- Produces: `work(p) -> {itemSha, decisionId}`.

- [ ] **Step 1: Write the failing test**

```js
const ADD_OK = "export function add(a, b) {\n  if (typeof a !== \"number\" || typeof b !== \"number\") throw new TypeError(\"add needs numbers\");\n  return a + b;\n}\n";
const sha = (out, kind) => new RegExp(`^cairn: ${kind} ([0-9a-f]{40})`, "m").exec(out)[1];

export async function work(p) {
  // implement REQ-001 under a lease; both requirements pass on one receipt.
  p.cairn(["begin", "implement", "REQ-001"]);
  p.write("src/add.mjs", ADD_OK); p.commit("Implement add");
  p.cairn(["end"]);
  p.cairn(["check", "REQ-001"]);
  assert.equal((await p.kinds()).at(-1), "receipt");
  await p.wakeIs("Resolvable", "review", "fixture");

  // A backlog item from the commitment's own requirement needs an outside record.
  const item = sha(p.cairn(["item", "--backlog", "--slug", "fixture-2", "--from", "REQ-002", "--body", "Report which argument was not a number."]).stdout, "item");
  await p.wakeIs("Resolvable", "capture", item);
  p.cairn(["outside", item, "The message text is not in either falsifier."]);
  await p.wakeIs("Resolvable", "review", "fixture");

  // A defect against the commitment's requirement is worked, not captured (13.1).
  const defect = sha(p.cairn(["item", "--defect", "--slug", "add-nan", "--from", "REQ-002", "--body", "add(NaN, 1) returns NaN instead of throwing."]).stdout, "item");
  await p.wakeIs("Resolvable", "fix", defect);
  p.cairn(["begin", "fix", defect]);
  p.write("src/add.mjs", ADD_OK.replace("typeof b !== \"number\")", "typeof b !== \"number\" || Number.isNaN(a) || Number.isNaN(b))"));
  p.commit("Refuse NaN"); p.cairn(["end"]); p.cairn(["check", "REQ-002"]);
  p.cairn(["fix", defect]);
  assert.equal((await p.kinds()).at(-1), "fix");
  await p.wakeIs("Resolvable", "review", "fixture");

  // Escalation: Waiting, ask, reply, ok.
  p.cairn(["escalate", "--slug", "nan-policy", "--concerns", "REQ-002", "--question", "Should add refuse NaN?", "--recommendation", "Yes", "--because", "NaN is a number type but not a sum.", "--if-wrong", "Callers relying on NaN propagation break.", "--instead", "Let NaN through."]);
  const waiting = await p.wakeIs("Waiting");
  assert.equal(waiting.target, "nan-policy");
  await p.developer.answer("nan-policy", "ask", "Which callers?");
  await p.wakeIs("Resolvable", "reply", "nan-policy");
  p.cairn(["reply", "nan-policy", "No caller in src passes NaN today."]);
  await p.wakeIs("Waiting");
  await p.developer.answer("nan-policy", "ok", "");
  await p.wakeIs("Resolvable", "review", "fixture");

  // Scope breach: an undeclared, non-outside file observed by the next state-changing command.
  p.write("src/extra.mjs", "export const extra = 1;\n"); p.commit("Stray file");
  p.cairn(["item", "--backlog", "--slug", "stray", "--from", "REQ-001", "--body", "stray"]);
  const breach = (await p.readLog()).findLast((r) => r.kind === "scope-breach");
  assert.ok(breach); assert.equal(breach.payload.path, "src/extra.mjs");
  await p.wakeIs("Resolvable", "scope", "src/extra.mjs");
  p.remove("src/extra.mjs"); p.commit("Remove the stray file");
  p.cairn(["scope", breach.sha, "restore"]);
  assert.equal((await p.kinds()).at(-1), "scope");
  const stray = (await p.readLog()).findLast((r) => r.kind === "item").sha;
  await p.wakeIs("Resolvable", "capture", stray);
  p.cairn(["outside", stray, "Not this commitment's work."]);

  // A Consequential decision: queued, agent continues; built after acceptance.
  const decisionId = /id ([0-9A-Z]{26})/.exec(p.cairn(["decide", "--consequential", "--title", "Export add as default too", "--because", "callers import default", "--wrong-if", "no caller does", "--body", "Add a default export of add."]).stdout)[1];
  await p.wakeIs("Resolvable", "review", "fixture");
  return { itemSha: item, decisionId };
}

test("work loop: implement, capture, fix, escalation, scope, decision", async () => {
  const p = buildProject();
  await tail(p);
  await work(p);
});
```

- [ ] **Step 2: Run test to verify it fails, then passes**

Run: `node --test tests/fixture.test.mjs`
Expected: FAIL first at an output format assertion (`cairn: item <sha>` and `id <ulid>`), then PASS once the assertion matches the owning plan's printed line.

- [ ] **Step 3: Commit**

```bash
git add tests/fixture.test.mjs
git commit -m "Play the work loop through the fixture"
```

---

### Task 4: Review, brief, fake adversary report, resolve, accept, build, accept, done

**Files:**
- Modify: `tests/fixture.test.mjs`

**Interfaces:**
- Consumes: Task 3's `work`; `cairn review`, `brief`, `report`, `resolve`, `accept`, `realize`, `done`, `decisions`.
- Produces: `finish(p, decisionId)`.

- [ ] **Step 1: Write the failing test**

```js
const REVIEW = {
  examined: ["src/add.mjs", "tests/req.test.mjs"],
  answers: {
    "Q1:tests": { status: "observed", text: "add returning undefined; receipt from the declare step; printed cairn: REQ-001: fail and REQ-002: fail" },
    "Q2:tests": { status: "observed", text: "the stub returned undefined, so both lines failed for the violation, not setup" },
    "Q3:REQ-001": { status: "observed", text: "add returns a + b for numbers; node tests/req.test.mjs prints pass" },
    "Q3:REQ-002": { status: "observed", text: "a non-number throws TypeError before the sum" },
    "Q4:REQ-001": { status: "observed", text: "nothing else; git diff shows src/add.mjs only" },
    "Q4:REQ-002": { status: "observed", text: "the NaN check; covered by the same test" },
    "Q5:fixture": { status: "observed", text: "the test passes with any numbers summing to 5 for 2 and 3" },
    "Q6:fixture": { status: "not-checked", text: "overflow and bigint" },
  },
  findings: [],
};

export async function finish(p, decisionId) {
  p.write("review.json", JSON.stringify(REVIEW)); p.cairn(["review", "fixture", "--file", "review.json"]); p.remove("review.json");
  assert.equal((await p.kinds()).at(-1), "review");
  await p.wakeIs("Resolvable", "report", "fixture");
  const briefOut = p.cairn(["brief", "fixture"], { env: { CLAUDE_CODE: "1" } }).stdout;
  const briefSha = sha(briefOut, "brief"), projection = /projection ([^\s]+)/.exec(briefOut)[1];
  assert.equal(existsSync(join(projection, ".git")), false);
  assert.equal(existsSync(join(projection, "src/add.mjs")), true);
  const report = {
    brief: briefSha, model: "claude-fable-5-1", transport: "remote", boundary: "unenforced",
    attempts: Object.keys(REVIEW.answers).map((q) => ({ question: q, attempt: "tried the inverse input; no escape" })),
    interfaces: [], findings: [{ n: 1, text: "add(2, 3.5) is accepted; the falsifier of REQ-001 says numbers, but the sum of an integer and a float is not specified." }],
  };
  p.write("report.json", JSON.stringify(report)); p.cairn(["report", "fixture", "--file", "report.json", "--model", "claude-fable-5-1", "--transport", "remote"]); p.remove("report.json");
  await p.wakeIs("Resolvable", "resolve", "fixture 1");
  p.write("docs/spec/glossary.md", "# Glossary\n\n- sum: the result of add, for any finite numbers.\n");
  p.commit("Say that any finite numbers are summed");
  p.cairn(["resolve", "fixture", "1", "The glossary now says any finite numbers; the requirement text is unchanged."]);
  await p.wakeIs("Resolvable", "accept", "fixture");
  const acceptance1 = { accepted: [1], rejected: [], findings: [] };
  p.write("accept.json", JSON.stringify(acceptance1)); p.cairn(["accept", "fixture", "--file", "accept.json"]); p.remove("accept.json");
  await p.wakeIs("Resolvable", "build", decisionId);
  p.cairn(["begin", "build", decisionId]);
  p.write("src/add.mjs", readFileSync(join(p.dir, "src/add.mjs"), "utf8") + "export default add;\n");
  p.commit("Add the default export"); p.cairn(["end"]); p.cairn(["check", "REQ-001"]);
  p.cairn(["realize", decisionId, "--subject", "default export added"]);
  const adr = readFileSync(join(p.dir, "docs/decisions.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.deepEqual(adr.map((l) => l.kind), ["decision", "answered", "realized"]);
  await p.wakeIs("Resolvable", "accept", "fixture");
  p.write("accept.json", JSON.stringify({ accepted: [], rejected: [], findings: [] })); p.cairn(["accept", "fixture", "--file", "accept.json"]); p.remove("accept.json");
  await p.wakeIs("Resolvable", "done", "fixture");
  p.cairn(["done", "fixture"]);
  assert.equal((await p.kinds()).at(-1), "done");
}

test("review, report, resolve, accept, build, accept, done", async () => {
  const p = buildProject();
  await tail(p);
  const { decisionId } = await work(p);
  await finish(p, decisionId);
});
```

Add `existsSync` to the `node:fs` import.

- [ ] **Step 2: Run test to verify it fails, then passes**

Run: `node --test tests/fixture.test.mjs`
Expected: FAIL at the first shape mismatch between this review, report or acceptance JSON and plan 10's file schema; align the JSON to plan 10's schema (its field names are plan 10's; the content here is what matters), then PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/fixture.test.mjs
git commit -m "Play review, report, resolution, acceptance, realization and done through the fixture"
```

---

### Task 5: Promote, second start, supersede, and the record-kind assertions

**Files:**
- Modify: `tests/fixture.test.mjs`

**Interfaces:**
- Consumes: Tasks 2 to 4; `cairn promote`, `supersede`; `KINDS` from `lib/records.mjs`.
- Produces: the complete fixture.

- [ ] **Step 1: Write the failing test**

```js
import { KINDS } from "../lib/records.mjs";

const EVALUATOR = ["evaluation-intent", "evaluation-call", "evaluation", "calibration"];
// Kinds the full fixture cannot reach, and why.
const UNREACHABLE = {
  "command-abort": "written only when a multi-store command dies before any planned write; the crash fixture variant B reaches it",
  read: "excluded by the task: the developer's queue read is a developer-authenticated act tested in plan 03",
};

test("full loop: promote, second start, supersede; exact kind sequence and coverage", async () => {
  const p = buildProject();
  await tail(p);
  const { itemSha, decisionId } = await work(p);
  await finish(p, decisionId);
  await p.wakeIs("Resolvable", "promote", itemSha);
  p.cairn(["promote", itemSha]);
  const roadmap = readFileSync(join(p.dir, "docs/spec/roadmap.md"), "utf8");
  assert.match(roadmap, /^Current: fixture-2$/m);
  assert.match(roadmap, /^## fixture-2\n\nRequirements: REQ-002$/m);
  await p.wakeIs("Resolvable", "review", "fixture-2");   // REQ-002 already has a current pass and binding
  p.cairn(["supersede", "fixture-3", "--quote", "Developer: fold fixture-2 into a wider change; supersede it."]);
  const w = await (await import("../lib/wake.mjs")).wake(p.dir);
  assert.equal(w.exit, 3); assert.match(w.line, /pending (transition|supersession).*existing-project/);

  const kinds = await p.kinds();
  assert.deepEqual(kinds, [
    "init", "receipt", "authorization", "command-intent", "start",
    "receipt", "item", "outside", "item", "receipt", "fix",
    "escalation", "answer", "reply", "answer",
    "scope-breach", "item", "scope", "outside",
    "review", "brief", "report", "resolution", "acceptance", "receipt", "acceptance", "done",
    "command-intent", "promotion", "start",
    "command-intent", "superseded",
  ]);
  const written = new Set(kinds);
  for (const k of KINDS) {
    if (EVALUATOR.includes(k) || k === "read") continue;
    if (k in UNREACHABLE) { assert.ok(!written.has(k), k); continue; }
    assert.ok(written.has(k), `kind ${k} never written`);
  }
  // The authority remote received both durable refs and the branch in order.
  p.cairn(["push"]);
  const remoteRefs = spawnSync("git", ["--git-dir", p.remote, "for-each-ref", "--format=%(refname)"], { encoding: "utf8" }).stdout;
  for (const r of ["refs/cairn/log", "refs/cairn/snapshots", "refs/heads/main"]) assert.ok(remoteRefs.includes(r), r);
  assert.equal(remoteRefs.includes("refs/cairn/in-progress"), false);
});
```

Add `import { spawnSync } from "node:child_process";`.

Where the kind sequence differs by exactly one kind, that is a defect in the owning plan or in this expectation; the reason for each entry: the two `receipt`s after `start` are the implement check and the fix check, the `receipt` before the second `acceptance` is the realization check, and the `escalation`'s answer pair is `answer`(ask), `reply`, `answer`(ok). The supersede `command-intent` exists because supersede writes the ADR and the log.

- [ ] **Step 2: Run test to verify it fails, then passes**

Run: `node --test tests/fixture.test.mjs`
Expected: FAIL on the sequence until every plan's writes match; then PASS. A kind that the loop writes and this list omits is added here with its reason in the comment; a kind this list names that no command wrote is a defect in its owning plan, captured with `cairn item --defect` in this repository, not papered over.

- [ ] **Step 3: Commit**

```bash
git add tests/fixture.test.mjs
git commit -m "Assert the full loop's record sequence and kind coverage"
```

---

### Task 6: The shadow-mode fixture

**Files:**
- Create: `tests/fixture-shadow.test.mjs`

**Interfaces:**
- Consumes: Task 1 to 4 helpers (`tail`, `work`, `finish` exported from `tests/fixture.test.mjs`); `evaluate(cwd, draft, {transport})` from `lib/evaluate.mjs`; the CLI's `--transport-module <path>` on `escalate` and `decide` (plan 11 registers it for tests: a module whose default export is the injected transport; the fixture's module returns fixed answers).
- Produces: nothing new.

- [ ] **Step 1: Write the failing test**

```js
// tests/fixture-shadow.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { buildProject, assertFlags } from "./helpers/fixture.mjs";
import { tail, work, finish } from "./fixture.test.mjs";

const TRANSPORT = `export default async function transport(request) {
  const q = request.questions.map((x) => x.id);
  const answers = {};
  for (const id of q) answers[id] = id === "owner" ? { agent: 0.9, developer: 0.1 } : id.startsWith("contradicts") ? 0.05 : 0.95;
  return { status: 200, body: JSON.stringify({ model: "jev-1.13.0", answers, usage: { input_tokens: 100, output_tokens: 20 } }) };
}
`;

test("shadow mode: intent, call and evaluation records; authority stays with the developer", async () => {
  assertFlags("escalate", ["--transport-module"]);
  const settings = JSON.parse(JSON.stringify((await import("./helpers/fixture.mjs")).SETTINGS ?? {}));
  const p = buildProject({ settings: { ...settings, typesafeai: { ...settings.typesafeai, enabled: true, mode: "shadow" } } });
  const mod = join(mkdtempSync(join(tmpdir(), "cairn-transport-")), "transport.mjs");
  writeFileSync(mod, TRANSPORT);
  await tail(p);
  p.cairn(["begin", "implement", "REQ-001"]);
  p.write("src/add.mjs", "export function add(a, b) {\n  if (typeof a !== \"number\" || typeof b !== \"number\") throw new TypeError(\"add needs numbers\");\n  return a + b;\n}\n");
  p.commit("Implement add"); p.cairn(["end"]); p.cairn(["check", "REQ-001"]);
  const before = (await p.kinds()).length;
  p.cairn(["escalate", "--slug", "shadowed", "--concerns", "REQ-002", "--question", "Should add refuse NaN?", "--recommendation", "Yes", "--because", "node tests/req.test.mjs shows NaN passes the typeof check", "--if-wrong", "callers relying on NaN break", "--instead", "let NaN through", "--transport-module", mod], { env: { TYPESAFEAI_API_KEY: "test-key" } });
  const log = await p.readLog();
  const tailKinds = log.slice(before).map((r) => r.kind);
  assert.deepEqual(tailKinds, ["evaluation-intent", "evaluation-call", "evaluation-call", "evaluation", "escalation"]);
  const evaluation = log.findLast((r) => r.kind === "evaluation").payload;
  assert.equal(evaluation.route, "developer");
  assert.equal(evaluation.would_route, "agent");
  for (const c of log.filter((r) => r.kind === "evaluation-call")) assert.equal(c.payload.outcome, "response");
  const w = await (await import("../lib/wake.mjs")).wake(p.dir);
  assert.equal(w.verdict, "Waiting");
  await p.developer.answer("shadowed", "ok", "");
  await p.wakeIs("Resolvable", "review", "fixture");
  // The evaluator never reads the key from settings and the intent names no excluded path.
  const intent = log.findLast((r) => r.kind === "evaluation-intent").payload;
  assert.ok(!JSON.stringify(intent).includes("test-key"));
  assert.ok(!JSON.stringify(intent).includes("private/"));
});
```

Export `SETTINGS` from `tests/helpers/fixture.mjs` (add `export` before `const SETTINGS`).

- [ ] **Step 2: Run test to verify it fails, then passes**

Run: `node --test tests/fixture-shadow.test.mjs`
Expected: FAIL when plan 11 names the outcome or route fields differently; align to plan 11's schema table names from section 4 (`not_sent|response|failure|indeterminate`, `route`, `would_route`), then PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/fixture-shadow.test.mjs tests/helpers/fixture.mjs
git commit -m "Play the loop with the evaluator in shadow mode"
```

---

### Task 7: The crash fixture

**Files:**
- Create: `tests/fixture-crash.test.mjs`

**Interfaces:**
- Consumes: `recover(cwd, txId)` and `pendingTransaction(cwd, log)` from `lib/tx.mjs`; `readRef(cwd, ref)` from `lib/gitx.mjs`; Task 2's `tail` up to authorization. `lib/gitx.mjs` spawns `git` by name, so a `git` earlier on PATH intercepts it.
- Produces: nothing new.

The fake `git` counts `update-ref` calls on `refs/cairn/log` and `refs/cairn/snapshots` in a file and, at the configured call, kills its parent process (the running `cairn start`) with SIGKILL instead of running the command. Variant A kills at the second `refs/cairn/log` update (the start record, after the snapshot ref and the intent have been written): recovery must complete forward. Variant B kills at the first `refs/cairn/snapshots` update after the intent exists: no planned write has occurred, so recovery may abort with a `command-abort`, or complete forward; either is correct, and the assertion accepts both while requiring the outcome record.

- [ ] **Step 1: Write the failing test**

```js
// tests/fixture-crash.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildProject, KERNEL } from "./helpers/fixture.mjs";
import { recover, pendingTransaction } from "../lib/tx.mjs";
import { readRef } from "../lib/gitx.mjs";
import { wake } from "../lib/wake.mjs";

function fakeGit(dir, { killRef, killAt }) {
  const bin = join(dir, "fakebin"); mkdirSync(bin, { recursive: true });
  const counter = join(dir, "fakebin", "count");
  writeFileSync(counter, "0");
  writeFileSync(join(bin, "git"), `#!/bin/sh
if [ "$1" = "update-ref" ] && [ "$2" = "${killRef}" ]; then
  n=$(cat "${counter}"); n=$((n+1)); printf '%s' "$n" > "${counter}"
  if [ "$n" -eq ${killAt} ]; then kill -9 $PPID; sleep 5; exit 1; fi
fi
exec /usr/bin/git "$@"
`);
  chmodSync(join(bin, "git"), 0o755);
  return `${bin}:${process.env.PATH}`;
}

async function prepared() {
  const p = buildProject();
  const { tail } = await import("./fixture.test.mjs");
  // Run the tail up to the authorization but not the start.
  await p.developer.init();
  p.write("docs/spec/add.md", readFileSync(join(p.dir, "docs/spec/add.md"), "utf8").replaceAll("Status: Draft", "Status: Agreed 2026-09-19"));
  p.commit("Agree");
  p.cairn(["declare", "tests", "--command", "node tests/req.test.mjs", "--input", "src", "--input", "tests", "--requirement", "REQ-001", "--requirement", "REQ-002", "--results", "per-requirement", "--identity", `node=${process.version}`]);
  p.commit("Declare");
  p.write("AGENTS.md", "# Working agreement\n"); p.commit("Agreement");
  await p.developer.authorize();
  void tail;
  return p;
}

for (const [name, cfg, expectForward] of [
  ["A: killed at the start record after the snapshot ref advanced", { killRef: "refs/cairn/log", killAt: 2 }, true],
  ["B: killed at the snapshot ref right after the intent", { killRef: "refs/cairn/snapshots", killAt: 1 }, false],
]) {
  test(`crash ${name}: recover completes and wake resumes`, async () => {
    const p = await prepared();
    const PATH = fakeGit(p.dir, cfg);
    const r = spawnSync(process.execPath, [KERNEL, "start", "fixture"], { cwd: p.dir, encoding: "utf8", env: { ...process.env, PATH } });
    assert.equal(r.signal, "SIGKILL", `expected a kill, got exit ${r.status}: ${r.stderr}`);
    const intent = pendingTransaction(p.dir, await p.readLog());
    assert.ok(intent, "an intent record exists");
    const w = await wake(p.dir);
    assert.equal(w.exit, 3); assert.match(w.line, new RegExp(`recover ${intent.payload.transaction}`));
    const out = await recover(p.dir, intent.payload.transaction);
    const kinds = (await p.kinds());
    if (expectForward) {
      assert.equal(out.completed, "forward");
      assert.deepEqual(kinds.slice(-2), ["command-intent", "start"]);
      await p.wakeIs("Resolvable", "implement", "REQ-001");
      assert.ok(await readRef(p.dir, "refs/cairn/snapshots"));
    } else {
      assert.ok(["forward", "abort"].includes(out.completed));
      assert.deepEqual(kinds.slice(-2), out.completed === "forward" ? ["command-intent", "start"] : ["command-intent", "command-abort"]);
      if (out.completed === "abort") {
        const w2 = await wake(p.dir);
        assert.equal(w2.exit, 3); assert.match(w2.line, /start fixture/);
        p.cairn(["start", "fixture"]);
        await p.wakeIs("Resolvable", "implement", "REQ-001");
      }
    }
    // Recovery is idempotent: a second call reports the same outcome and appends nothing.
    const settled = await p.kinds();
    const again = await recover(p.dir, intent.payload.transaction);
    assert.equal(again.completed, out.completed);
    assert.deepEqual(await p.kinds(), settled);
  });
}
```

If `/usr/bin/git` is not the real git on the machine, replace it in the fake with the output of `command -v git` captured before the fake directory is prepended.

- [ ] **Step 2: Run test to verify it fails, then passes**

Run: `node --test tests/fixture-crash.test.mjs`
Expected: FAIL if `cairn start` does not die with SIGKILL (then gitx does not call `git update-ref <ref> <new> <old>` as overview.md says; fix plan 01) or if recovery leaves the log without a terminal record; then PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/fixture-crash.test.mjs
git commit -m "Kill cairn start between two stores and recover"
```

---

### Task 8: The 1.x cut list

**Files:**
- Create: `scripts/cutlist.mjs`
- Create: `tests/cutlist.test.mjs`
- Create: `docs/cutover/cut-list.md` (generated by the script from the 1.x spec files)

**Interfaces:**
- Consumes: `parseDomainFile(text)` from `lib/spec.mjs` (the 1.x block grammar is a superset of v2's for the identifier line, which is all the script needs; it falls back to a regex when a 1.x file does not parse).
- Produces: `cutlist(specDir) -> {families: [{prefix, file, count, ids}], rows}` and the generated table.

Reading `/home/shawn/workspace2/cairn-dev/docs/spec/` gives five families: `AUTO` (autonomy.md, 18 blocks), `DEC` (decisions.md, 23), `LOOP` (loop.md, 141), `PKG` (package.md, 44), `SPEC` (specification.md, 29); glossary.md, overview.md and roadmap.md hold no blocks. Every 1.x identifier is disposed by family and section, from section 12 and the section 5 tables:

| Family | 1.x file | Blocks | Disposition | Reason |
|---|---|---|---|---|
| LOOP | loop.md | 141 | replaced-by-predicate | verdicts, freshness, escalation, scope, review, completion and the "bad records are repairs" sections are the section 5 predicates, precedence and Done rule; markdown record parsing, findings sweeps, stop records, `explain`, `present`, `reword` are removed (section 12) |
| SPEC | specification.md | 29 | kept | agreement per block, falsifiers before Agreed, lint as the grammar's falsifier, the spec-phase tail; "Promoted from the backlog" and "Between loops" are replaced by decisions 9 and 21 |
| PKG | package.md | 44 | replaced-by-predicate | hooks (section 6) and distribution (section 11) keep the intent; stop-hook refusal (PKG-018, PKG-043, PKG-044), refusal counting, kernel-digest freshness (PKG-033), package lint and line ceilings are removed as "product requirements for this repository's release process" |
| DEC | decisions.md | 23 | kept | two kernel levels (13.3), the ADR as canonical JSONL, queue by read lines, supersession with four causes; the four-level scale and decision files at Judged are removed |
| AUTO | autonomy.md | 18 | removed | "The autonomy and former Jev modes that were Agreed but never built" (section 12); the evaluator in section 10 replaces the idea with a different contract |

The script writes one row per identifier with the family disposition and the 1.x section heading it sits under, so the developer reads the per-identifier list once, at cutover, and corrects any row by hand in the generated file before committing it.

- [ ] **Step 1: Write the failing test**

```js
// tests/cutlist.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cutlist, render, FAMILY } from "../scripts/cutlist.mjs";

test("cutlist reads every family and disposes each identifier by family", () => {
  const dir = mkdtempSync(join(tmpdir(), "cairn-cut-")); mkdirSync(join(dir, "docs/spec"), { recursive: true });
  writeFileSync(join(dir, "docs/spec/loop.md"), "Prefix: LOOP\n\n## Verdicts\n\n[LOOP-001] The wake prints a verdict.\nFalsifier: none printed.\nStatus: Agreed 2026-01-01\n\n[LOOP-002] x\nFalsifier: y\nStatus: Agreed 2026-01-01\n");
  writeFileSync(join(dir, "docs/spec/autonomy.md"), "Prefix: AUTO\n\n## Mode\n\n[AUTO-001] x\nFalsifier: y\nStatus: Agreed 2026-01-01\n");
  writeFileSync(join(dir, "docs/spec/overview.md"), "# x\n");
  const c = cutlist(join(dir, "docs/spec"));
  assert.deepEqual(c.families.map((f) => [f.prefix, f.count]), [["AUTO", 1], ["LOOP", 2]]);
  assert.deepEqual(c.rows.find((r) => r.id === "LOOP-001"), { id: "LOOP-001", section: "Verdicts", disposition: "replaced-by-predicate", file: "loop.md" });
  assert.equal(c.rows.find((r) => r.id === "AUTO-001").disposition, "removed");
  const md = render(c);
  assert.match(md, /^\| LOOP-001 \| loop\.md \| Verdicts \| replaced-by-predicate \|$/m);
  assert.deepEqual(Object.keys(FAMILY).sort(), ["AUTO", "DEC", "LOOP", "PKG", "SPEC"]);
});

test("an unknown family is refused, never silently kept", () => {
  const dir = mkdtempSync(join(tmpdir(), "cairn-cut-")); mkdirSync(join(dir, "docs/spec"), { recursive: true });
  writeFileSync(join(dir, "docs/spec/x.md"), "Prefix: NEW\n\n[NEW-001] x\nFalsifier: y\nStatus: Draft\n");
  assert.throws(() => cutlist(join(dir, "docs/spec")), /unknown 1\.x family NEW/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/cutlist.test.mjs`
Expected: FAIL, cannot find module `scripts/cutlist.mjs`.

- [ ] **Step 3: Write the script**

```js
#!/usr/bin/env node
// scripts/cutlist.mjs: read the 1.x spec files and write the cut list.
//   node scripts/cutlist.mjs <1.x docs/spec dir> > docs/cutover/cut-list.md
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const FAMILY = {
  LOOP: ["replaced-by-predicate", "the section 5 predicates, precedence and Done rule replace the loop requirements; markdown records, stop records, explain, present and reword are removed (section 12)"],
  SPEC: ["kept", "agreement per block, falsifiers before Agreed, lint as the grammar's falsifier and the spec-phase tail continue; promotion never Agrees text (13.9)"],
  PKG: ["replaced-by-predicate", "hooks (section 6) and distribution (section 11) keep the intent; stop-hook refusal, refusal counts, kernel-digest freshness and package lint are removed (section 12)"],
  DEC: ["kept", "two kernel levels, the canonical ADR, the read queue and supersession causes continue; the four-level scale and Judged files are removed (section 12)"],
  AUTO: ["removed", "the autonomy and former Jev modes were Agreed but never built (section 12); section 10's evaluator is a different contract"],
};

export function cutlist(specDir) {
  const families = [], rows = [];
  for (const file of readdirSync(specDir).filter((f) => f.endsWith(".md")).sort()) {
    const text = readFileSync(join(specDir, file), "utf8");
    const prefix = /^Prefix:\s*([A-Z]+)/m.exec(text)?.[1];
    const ids = [];
    let section = "";
    for (const line of text.split("\n")) {
      const h = /^##+\s+(.*)$/.exec(line); if (h) { section = h[1].trim(); continue; }
      const m = /^\[([A-Z]+)-(\d+)\]/.exec(line); if (!m) continue;
      const fam = m[1];
      if (!FAMILY[fam]) throw new Error(`unknown 1.x family ${fam} in ${file}`);
      ids.push(`${fam}-${m[2]}`);
      rows.push({ id: `${fam}-${m[2]}`, file, section, disposition: FAMILY[fam][0] });
    }
    if (ids.length) families.push({ prefix: prefix ?? ids[0].split("-")[0], file, count: ids.length, ids });
  }
  families.sort((a, b) => (a.prefix < b.prefix ? -1 : 1));
  return { families, rows };
}

export function render({ families, rows }) {
  const out = ["# Cairn 1.x cut list", "", "Generated by scripts/cutlist.mjs from the 1.x docs/spec files. Section 12 of docs/spec/cairn-v2.md is the authority; a row corrected by hand says so in its reason column.", "", "## Families", "", "| Family | 1.x file | Blocks | Disposition | Reason |", "|---|---|---|---|---|"];
  for (const f of families) out.push(`| ${f.prefix} | ${f.file} | ${f.count} | ${FAMILY[f.prefix][0]} | ${FAMILY[f.prefix][1]} |`);
  out.push("", "## Identifiers", "", "| Identifier | File | 1.x section | Disposition |", "|---|---|---|---|");
  for (const r of rows) out.push(`| ${r.id} | ${r.file} | ${r.section} | ${r.disposition} |`);
  return out.join("\n") + "\n";
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(render(cutlist(process.argv[2])));
}
```

- [ ] **Step 4: Run test to verify it passes, then generate the list**

Run: `node --test tests/cutlist.test.mjs`
Expected: PASS.

Run: `mkdir -p docs/cutover && node scripts/cutlist.mjs /home/shawn/workspace2/cairn-dev/docs/spec > docs/cutover/cut-list.md && grep -c '^| [A-Z]*-[0-9]* |' docs/cutover/cut-list.md`
Expected: `255` (18 + 23 + 141 + 44 + 29).

- [ ] **Step 5: Commit**

```bash
git add scripts/cutlist.mjs tests/cutlist.test.mjs docs/cutover/cut-list.md
git commit -m "Generate the 1.x cut list from the 1.x specification"
```

---

### Task 9: The cutover checklist (developer-run)

**Files:**
- Create: `docs/cutover/checklist.md`

**Interfaces:**
- Consumes: the first v2 Done (a `done` record on this repository's `refs/cairn/log`), Task 8's cut list, plan 13's release script.
- Produces: the archived 1.x line and `main` pointing at v2. The agent writes this file; the developer runs the commands. No step here is the agent's to run.

- [ ] **Step 1: Write the checklist**

```markdown
# Cutover: archive 1.x, make v2 main

Run by the developer, in /home/shawn/workspace2/cairn-dev, after the
first v2 Done (section 14, step 5; decision 13.7). The agent prepares
nothing else; every command below is yours.

Privacy: eas4ai/cairn-dev is private and may hold v2. eas4ai/cairn
(the `public` remote) never receives `v2`, `refs/cairn/*` or
docs/plans/ until you say so; the local pre-push hook refuses such a
push. Nothing in this checklist pushes to `public`.

## Before

- [ ] `cairn wake` on the v2 worktree prints `Done:`.
- [ ] `node --test tests/*.test.mjs` passes on v2, fixtures included.
- [ ] docs/cutover/cut-list.md is committed and every row read.
- [ ] `git -C /home/shawn/workspace2/cairn-dev status --porcelain` is empty
      and `git -C /home/shawn/workspace2/cairn-dev branch --show-current` is `main`.

## Archive the 1.x line

    cd /home/shawn/workspace2/cairn-dev
    git fetch origin
    git tag -a v1-final -m "Final commit of the Cairn 1.x line before v2 became main" main
    git push origin v1-final

Add this note to the top of README.md on main and commit it as the last
1.x commit, then move the tag to it:

    Cairn 1.x ends at tag v1-final. Cairn 2 continues on main; its
    records are commits on refs/cairn/log and refs/cairn/snapshots and
    1.x records under .cairn/ are not read (docs/spec/cairn-v2.md,
    section 12).

    git add README.md
    git commit -m "Close the 1.x line with a README note"
    git tag -f -a v1-final -m "Final commit of the Cairn 1.x line before v2 became main"
    git push --force origin v1-final
    git branch v1-archive v1-final
    git push origin v1-archive

## Make v2 main

    git checkout v2
    git merge --no-ff main -m "Merge the archived 1.x line so its history stays reachable from main"
    git branch -f main v2
    git checkout main
    git push origin main
    git push origin 'refs/cairn/log:refs/cairn/log' 'refs/cairn/snapshots:refs/cairn/snapshots'

Only if the merge conflicts (it should not: v2 replaced every 1.x
file), resolve by taking v2's side for every path and keep the README
note from the 1.x commit at the end of README.md.

## After

- [ ] `git log --oneline -1 main` shows the merge commit.
- [ ] `git describe --tags v1-final` prints `v1-final`.
- [ ] `node --test tests/*.test.mjs` passes on main.
- [ ] `cairn wake` on main prints `Done:`; `cairn push` succeeds against origin.
- [ ] The production checkout at /home/shawn/workspace2/cairn is not
      touched by this checklist; it fast-forwards from cairn-dev main
      only on your word, and eas4ai/cairn receives v2 only then.
- [ ] Remove the `v2` branch locally: `git branch -d v2` (the worktree at
      /home/shawn/workspace2/cairn-v2 must be removed first with
      `git worktree remove /home/shawn/workspace2/cairn-v2`).
```

- [ ] **Step 2: Verify the checklist names no agent-run step and no public push**

Run: `grep -n "public" docs/cutover/checklist.md; grep -c "git push" docs/cutover/checklist.md`
Expected: the `public` lines are the privacy paragraph and the last checkbox only; five `git push` lines, each to `origin`.

- [ ] **Step 3: Run the whole suite and commit**

Run: `node --test tests/*.test.mjs`
Expected: PASS.

```bash
git add docs/cutover/checklist.md
git commit -m "Write the developer's cutover checklist"
```

---

## Spec coverage

| Spec sentence | Task |
|---|---|
| 3 Work loop: "Wake names one action and its predicate; the agent performs that action until the predicate holds ... then wakes again" | 2 to 5 (`wakeIs` after every step, predicate text from section 5) |
| 3 Work loop: "An unanswered escalation is Waiting and the agent stops" | 3 |
| 3 Work loop: "When the Done rule holds, wake names `done`. `cairn done` writes the done record" | 4 |
| 3 Work loop: "With a backlog item waiting, the next wake names `promote` rather than Done" | 5 |
| 3 Spec tail: `cairn start` refuses without authorization; installs refspecs on the authority remote | 2 |
| 5 Done: every frozen requirement current and bound; review and report at the reviewed snapshot; latest acceptance at the final snapshot; nothing unanswered, undisposed, unfixed, incomplete, stale or unrealized | 4 (the `done` wake), 3 (each obstacle cleared first) |
| 5 Precedence order | 3 to 5 (each `wakeIs` asserts the first unmet predicate) |
| 5 Scope is monotonic: breach recorded before the requested work; restore closes it | 3 |
| 5 "The report is written once at the candidate snapshot. Every later fix is a resolution." | 4 (one report, two acceptances) |
| 9: one adversary per commitment; brief and projection without `.git`; acceptance examines the post-report delta including the realization | 4 |
| 9: `cairn report` records model and transport | 4 |
| 10 shadow mode: intent before call, call records, evaluation with `would_route`, authority with the developer | 6 |
| 4 Crash recovery: intent, forward completion, abort only when no planned write occurred, idempotent recovery, wake names `recover` first | 7 |
| 4 Travel: `cairn push` sends both durable refs and the branch; the lease never travels | 5 |
| 8 Deferral: defect against the commitment's requirement is worked (13.1) | 3 |
| 8 Capture: item from the commitment's own requirement needs an outside record | 3 |
| 8 Decisions: Consequential queued, agent continues, `build` after acceptance, realized line | 3, 4 |
| 2 Superseded: closes without Done, names transition and successor slug, wake exits 3 naming the pending transition | 5 |
| 12 and 13.5: 1.x records not read; identifier-by-identifier cut list produced with the v2 requirements | 8 |
| 13.7 and 14.5: archive 1.x at cutover; v2 becomes main | 9 |
| 13.21: backlog items do not block Done; the next wake promotes at most one | 5 |
| 14.4: administrative-cycle fixtures (fourth same-target, twenty-eighth transition) | plan 08 (`lib/cycle.mjs` regression tests) |

Left to other plans: the cycle-bound fixture of section 14 step 4 (plan 08); the developer's queue read (`read` kind, plan 03); the calibration record and route mode (plan 11); the exact printed line formats this fixture asserts (`cairn: receipt ...`, `cairn: item ...`, `id <ulid>`, `cairn: lint: clean`) are set by plans 05, 06, 02 and 08 and this plan's assertions are corrected to them, never the reverse, when a plan's own tests pin a different line.
