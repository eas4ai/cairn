// tests/fixture.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { readFileSync, existsSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { buildProject, assertFlags, ROOT, REPORT_FLAGS, MECH_DEFINITION, SPEC_PREDICATE } from "./helpers/fixture.mjs";
import { wake, PREDICATES } from "../lib/wake.mjs";
import { KINDS } from "../lib/records.mjs";

test("the CLI registers every flag the fixture uses", () => {
  // Deviation from the plan text, recorded in the plan 14 report: lib/cli.mjs's real command
  // table (Task 1's own reading of it) uses different flag spellings than the plan guessed for
  // three commands, and has no per-command `--help` at all (assertFlags reads the one global
  // `cairn --help` usage line per command instead; see tests/helpers/fixture.mjs).
  //   declare: the real command is `declare <name> --file <path>` (one JSON file), not five
  //     separate --command/--input/--requirement/--results/--identity flags.
  //   escalate: the real commitment flag is --commitment (not --slug) and the concern flag is
  //     singular --concern (not --concerns).
  //   decide: the real "why" flag is --rests-on (not --because).
  //   report: --model and --transport are fields inside the --file JSON body, not CLI flags.
  assertFlags("declare", ["--file"]);
  assertFlags("item", ["--backlog", "--defect", "--next-feature", "--slug", "--from", "--body"]);
  assertFlags("escalate", ["--commitment", "--concern", "--question", "--recommendation", "--because", "--if-wrong", "--instead"]);
  assertFlags("decide", ["--consequential", "--title", "--rests-on", "--wrong-if", "--body"]);
  assertFlags("realize", ["--subject"]);
  assertFlags("review", ["--file"]);
  assertFlags("report", REPORT_FLAGS);
  assertFlags("accept", ["--file"]);
  assertFlags("supersede", ["--quote"]);
  assertFlags("scope", ["restore", "keep"]);
});

// Kernel defect found by this fixture (recorded in full, with reproduction, in the plan 14
// report): lib/travel.mjs's validateAfterFetch runs on every wake() call, not only after a real
// fetch, and one of its cross-reference checks compares docs/spec/roadmap.md's Current: line
// against the log for a matching 'start' record. Between `cairn init` and the project's first
// `cairn start` -- the ordinary, expected state of any project still in its spec-authoring phase,
// including this fixture's own roadmap.md, which is written with "Current: fixture" from the
// start -- no such 'start' record exists yet, so this reads as a missing cross-reference and wake
// prints a nonsensical repair ("cairn push (in the clone that wrote the start record for
// fixture)") instead of naming the real next step. No clone and no push can fix this; the only
// real next step is to finish the spec tail and run `cairn start`. This blocks `cairn wake` (and
// the session-start hook, which calls it) for the entire spec-authoring window of every project,
// not just this fixture's. Not fixed here (lib/travel.mjs is off limits to this plan); left
// failing here as its own isolated test so it does not block the rest of the fixture, which never
// calls wake() again until after `cairn start` has actually run.
//
// Fixed by the kernel fix round named in the plan 14 report's own follow-up: wake() no longer
// calls validateAfterFetch on its ordinary path (lib/wake.mjs), and validateAfterFetch itself no
// longer reads a Current: line with no start record anywhere in the log -- the ordinary
// spec-phase state this test builds -- as a dangling reference (lib/travel.mjs). This test's own
// assertions already named the correct behavior, not the defect, so no expected value changed;
// it now passes.
test("kernel defect: wake demands a nonsensical push before the roadmap's Current: commitment ever starts", async () => {
  const p = buildProject();
  await p.developer.init();
  const w = await wake(p.dir);
  assert.equal(w.exit, 3);
  assert.match(w.line, /\/new-project or \/existing-project/);
});

// Kernel defect found by this fixture (minor; recorded in the plan 14 report), fixed in the
// kernel fix round named in that report's own follow-up: section 5's own predicate table
// (docs/spec/cairn-v2.md) carries backticks around `resolve`, `Current:` and `ask` in the
// accept/promote/reply rows; lib/wake.mjs's real PREDICATES strings for exactly those three
// actions used to print the same words with the backticks stripped. Restored verbatim; this test
// now confirms the two agree instead of demonstrating their drift.
test("kernel defect: three predicate strings drop the spec's own backticks", () => {
  for (const [action, specText] of Object.entries(SPEC_PREDICATE)) {
    assert.equal(PREDICATES[action], specText, `${action} predicate text`);
  }
});

// Task 2: the spec tail -- init, declare, fail receipt, mechanism review, authorize, start.
export async function tail(p) {
  // Before cairn init: the fixture's own buildProject has already run `git init` and written
  // .cairn/settings.json with authority_remote "origin" pointing at the bare remote (Task 1's own
  // Interfaces note: "the fixture writes .cairn/settings.json first, so init validates it and
  // takes origin from confirmRemote"). Deviation from the plan text, recorded as a kernel defect
  // in the plan 14 report ("Kernel defects found by the fixture", item 1): with a Git repository,
  // a configured remote and a pre-written settings.json already on disk but no `cairn init` yet
  // run, wake() does not say "outside a project; run /new-project or /existing-project" (the
  // plan's own assumption); lib/travel.mjs's missingRefsLine cannot distinguish "never
  // initialized" from "an existing project's fresh clone" once a remote is configured, so it
  // always recommends the clone's fetch repair -- which fails against this brand-new, empty
  // remote (reproduced separately; see the report).
  const w0 = await wake(p.dir);
  assert.equal(w0.exit, 3);
  assert.match(w0.line, /^git fetch origin 'refs\/cairn\/log:refs\/cairn\/log'/);
  // Carried item (c): cairn show and cairn wake print the missing-refs line with different
  // framing. lib/cli.mjs's requireRefs (used by `show`) wraps lib/travel.mjs's missingRefsLine in
  // "durable refs missing; run: <command>" and reports it as a NoVerdict (exit 3, on stdout,
  // prefixed "cairn: "); lib/wake.mjs's wake() returns the exact same missingRefsLine text bare,
  // with no prefix or wrapper, as its own `line`. Confirmed: same underlying condition, two
  // different printed sentences.
  const showOut = p.cairn(["show", "a".repeat(40)], { expectExit: 3 });
  assert.equal(showOut.stdout.trim(), `cairn: durable refs missing; run: ${w0.line}`);
  await p.developer.init();
  assert.deepEqual(await p.kinds(), ["init"]);
  // Deviation from the plan text, NOT re-checked here: the plan expected wake() to print
  // "run /new-project or /existing-project" at this exact point (durable refs present, no
  // commitment started yet). It does carry that message in general (lib/wake.mjs's own
  // 'supersession' predicate, when no start record exists at all) -- but this fixture's own
  // roadmap.md already names "Current: fixture" from project setup, before any `cairn start`
  // has run, and that alone makes wake() return something else entirely: see the kernel defect
  // "wake demands a nonsensical push before the roadmap's Current: commitment ever starts",
  // demonstrated as its own isolated test below and in the plan 14 report. Asserting the plan's
  // original expectation here would just fail on that defect and block every later step of the
  // whole fixture; the correct message is exercised in isolation instead.

  // Agree the blocks (the developer confirmed them at the gate; the file edit is the agent's).
  p.write("docs/spec/add.md", readFileSync(join(p.dir, "docs/spec/add.md"), "utf8").replaceAll("Status: Draft", "Status: Agreed 2026-09-19"));
  p.commit("Agree the two requirements");
  const lintOut = p.cairn(["lint", "docs/spec"]);
  assert.equal(lintOut.stdout, ""); // Deviation: a clean lint prints nothing, not "cairn: lint: clean" (lib/cli.mjs's lintCommand only ever prints findings).

  p.cairn(["declare", "tests", "--file", p.outFile("mech-tests.json", MECH_DEFINITION)]);
  p.commit("Declare the tests mechanism");
  const checkOut = p.cairn(["check", "REQ-001"]);
  // Deviation: the real check command prints "check <sha> <REQ>\n" (lib/cli.mjs's checkCommand),
  // not "cairn: receipt <sha> REQ-001: fail REQ-002: fail" -- the mechanism's own per-requirement
  // pass/fail lines are captured into the receipt's payload, never echoed to cairn check's stdout.
  assert.match(checkOut.stdout, /^check [0-9a-f]{40} REQ-001\n$/);
  const receipt = checkOut.stdout.trim().split(" ")[1];
  assert.deepEqual(await p.kinds(), ["init", "receipt"]);
  const receiptPayload = (await p.readLog()).at(-1).payload;
  assert.deepEqual(receiptPayload.results.map((r) => [r.requirement, r.result]), [["REQ-001", "fail"], ["REQ-002", "fail"]]);

  p.cairn(["review", "mechanism", "REQ-001", receipt]);
  p.cairn(["review", "mechanism", "REQ-002", receipt]);
  p.commit("Bind the mechanism review to the fail receipt");
  p.write("AGENTS.md", readFileSync(join(ROOT, "skills/new-project/templates/AGENTS.md"), "utf8"));   // plan 13's template is the working agreement
  p.commit("Add the working agreement");
  p.cairn(["start", "fixture"], { expectExit: 1 });   // refused: no authorization
  await p.developer.authorize();
  // Deviation: authorize() itself runs as a transaction (lib/auth.mjs), so it writes a
  // command-intent record before its own authorization record -- the plan assumed authorize
  // wrote no command-intent at all.
  assert.deepEqual(await p.kinds(), ["init", "receipt", "command-intent", "authorization"]);
  p.cairn(["start", "fixture"]);
  assert.deepEqual(await p.kinds(), ["init", "receipt", "command-intent", "authorization", "command-intent", "start"]);
  assert.equal(p.git("config", "--get-all", "remote.origin.fetch").includes("refs/cairn/log:refs/cairn/log"), true);
  await p.wakeIs("Resolvable", "implement", "REQ-001");
}

test("spec tail: init, declare, fail receipt, mechanism review, authorize, start", async () => {
  const p = buildProject();
  await tail(p);
});

// Task 3: the work loop -- implement, capture, defect, escalation, scope breach, decision.
const ADD_OK = "export function add(a, b) {\n  if (typeof a !== \"number\" || typeof b !== \"number\") throw new TypeError(\"add needs numbers\");\n  return a + b;\n}\n";
const sha = (out, kind) => new RegExp(`^${kind} ([0-9a-f]{40})`, "m").exec(out)[1];

export async function work(p) {
  // implement REQ-001 under a lease; both requirements pass on one receipt (ADD_OK's typeof
  // check already satisfies REQ-002's stated falsifier too).
  p.cairn(["begin", "implement", "REQ-001"]);
  p.write("src/add.mjs", ADD_OK); p.commit("Implement add");
  p.cairn(["end"]);
  p.cairn(["check", "REQ-001"]);
  assert.equal((await p.kinds()).at(-1), "receipt");
  await p.wakeIs("Resolvable", "review", "fixture");

  // A backlog item from the commitment's own requirement needs an outside record.
  const item = sha(p.cairn(["item", "--backlog", "--slug", "fixture-2", "--from", "REQ-002", "--body", "Report which argument was not a number."]).stdout, "item");
  await p.wakeIs("Resolvable", "capture", "fixture-2");
  // Deviation: outside's real usage is `outside <item-sha> --reason <text>` (lib/cli.mjs), not a
  // bare positional reason string.
  p.cairn(["outside", item, "--reason", "The message text is not in either falsifier."]);
  await p.wakeIs("Resolvable", "review", "fixture");

  // A defect against the commitment's requirement is worked, not captured (13.1).
  const defect = sha(p.cairn(["item", "--defect", "--slug", "add-nan", "--from", "REQ-002", "--body", "add(NaN, 1) returns NaN instead of throwing."]).stdout, "item");
  await p.wakeIs("Resolvable", "fix", "add-nan");
  p.cairn(["begin", "fix", defect]);
  p.write("src/add.mjs", ADD_OK.replace("typeof b !== \"number\")", "typeof b !== \"number\" || Number.isNaN(a) || Number.isNaN(b))"));
  p.commit("Refuse NaN"); p.cairn(["end"]);
  // Deviation from the plan text, recorded in the report: the fix predicate ("its requirement has
  // a current pass at or after it", section 5) reads "at or after" literally -- the pass receipt
  // must sit at or after the fix record in the log, not before it. `cairn fix` must run before
  // the confirming `cairn check`, the reverse of the plan's own order.
  p.cairn(["fix", defect]);
  p.cairn(["check", "REQ-002"]);
  assert.equal((await p.kinds()).at(-1), "receipt");
  await p.wakeIs("Resolvable", "review", "fixture");

  // Escalation: Waiting, ask, reply, ok. Deviation from the plan text: an escalation's `slug` is
  // the open commitment's own slug (lib/escalate.mjs: `checkConcerns`/`openRange` resolve
  // `d.commitment` against the currently open commitment), never a separate escalation-chosen
  // name -- the plan's own "--slug nan-policy" naming has no real counterpart; every escalate,
  // answer and reply below addresses the commitment slug "fixture" directly.
  p.cairn(["escalate", "--commitment", "fixture", "--concern", "REQ-002", "--question", "Should add refuse NaN?", "--recommendation", "Yes", "--because", "NaN is a number type but not a sum.", "--if-wrong", "Callers relying on NaN propagation break.", "--instead", "Let NaN through."]);
  const waiting = await p.wakeIs("Waiting");
  assert.equal(waiting.escalation.slug, "fixture");
  await p.developer.answer("fixture", "ask", "Which callers?");
  await p.wakeIs("Resolvable", "reply", "fixture");
  p.cairn(["reply", "fixture", "No caller in src passes NaN today."]);
  await p.wakeIs("Waiting");
  await p.developer.answer("fixture", "ok", "ok");
  await p.wakeIs("Resolvable", "review", "fixture");

  // Scope breach: an undeclared, non-outside file observed by the next state-changing command.
  // Deviation: the mechanism's own inputs must name the literal file src/add.mjs, not the whole
  // src/ directory (tests/helpers/fixture.mjs's MECH_DEFINITION), or lib/scope.mjs's isDeclared
  // treats every path under a declared directory as declared forever and no breach is ever
  // possible for a stray file under it.
  p.write("src/extra.mjs", "export const extra = 1;\n"); p.commit("Stray file");
  p.cairn(["item", "--backlog", "--slug", "stray", "--from", "REQ-001", "--body", "stray"]);
  const breach = (await p.readLog()).findLast((r) => r.kind === "scope-breach");
  assert.ok(breach); assert.equal(breach.payload.path, "src/extra.mjs");
  await p.wakeIs("Resolvable", "scope", "src/extra.mjs");
  p.remove("src/extra.mjs"); p.commit("Remove the stray file");
  p.cairn(["scope", breach.sha, "restore"]);
  assert.equal((await p.kinds()).at(-1), "scope");
  const strayItem = (await p.readLog()).findLast((r) => r.kind === "item");
  await p.wakeIs("Resolvable", "capture", "stray");
  p.cairn(["outside", strayItem.sha, "--reason", "Not this commitment's work."]);
  await p.wakeIs("Resolvable", "review", "fixture");
  return { itemSha: item, defectSha: defect };
}

test("work loop: implement, capture, fix, escalation, scope, decision", async () => {
  const p = buildProject();
  await tail(p);
  await work(p);
});

// Task 4: review, brief, fake adversary report, resolve, accept, build, accept, done.
// Deviation from the plan text throughout this task, recorded in the report: lib/review.mjs's
// real `review` schema takes `answers` as an array of {question, target, status, text} (not an
// object keyed by "Q1:tests"); `report`'s real body needs `projection_digest` (from the brief)
// and a `model`/`transport` that match the brief's launch instruction; `accept`'s real body key
// is `resolutions: [{sha, verdict, reason}]` (not `accepted`/`rejected` arrays of plain shas).
const REVIEW = {
  examined: ["src/add.mjs", "tests/req.test.mjs"],
  answers: [
    { question: "Q1", target: "tests", status: "observed", text: "add returning undefined; receipt from the declare step; printed cairn: REQ-001: fail and REQ-002: fail" },
    { question: "Q2", target: "tests", status: "observed", text: "the stub returned undefined, so both lines failed for the violation, not setup" },
    { question: "Q3", target: "REQ-001", status: "observed", text: "add returns a + b for numbers; node tests/req.test.mjs prints pass" },
    { question: "Q4", target: "REQ-001", status: "observed", text: "nothing else; git diff shows src/add.mjs only" },
    { question: "Q3", target: "REQ-002", status: "observed", text: "a non-number throws TypeError before the sum" },
    { question: "Q4", target: "REQ-002", status: "observed", text: "the NaN check; covered by the same test" },
    { question: "Q5", target: "fixture", status: "observed", text: "the test passes with any numbers summing to 5 for 2 and 3" },
    { question: "Q6", target: "fixture", status: "not-checked", text: "overflow and bigint" },
  ],
  findings: [],
};

export async function finish(p) {
  p.cairn(["review", "fixture", "--file", p.outFile("review.json", REVIEW)]);
  assert.equal((await p.kinds()).at(-1), "review");
  await p.wakeIs("Resolvable", "report", "fixture");

  // Deviation: the harness-detection env var is CLAUDECODE (lib/review.mjs's HARNESS_ENV), not
  // CLAUDE_CODE.
  const briefOut = p.cairn(["brief", "fixture"], { env: { CLAUDECODE: "1" } }).stdout;
  const briefSha = /^cairn: brief \S+ ([0-9a-f]{40})/m.exec(briefOut)[1];
  const projection = /^projection: (.+)$/m.exec(briefOut)[1];
  const projectionDigest = /^projection digest: (\S+)$/m.exec(briefOut)[1];
  assert.equal(existsSync(join(projection, ".git")), false);
  assert.equal(existsSync(join(projection, "src/add.mjs")), true);
  await p.wakeIs("Resolvable", "report", "fixture");

  const report = {
    brief: briefSha, model: "claude-fable-5-1", transport: "remote", projection_digest: projectionDigest,
    attempts: [
      { question: "Q1", target: "tests", text: "tried making it pass without the behavior; it still requires add(2,3)===5" },
      { question: "Q2", target: "tests", text: "tried an input the mechanism reads but does not declare; none found" },
      { question: "Q3", target: "REQ-001", text: "tried add(2, 3.5); no escape from the falsifier as written" },
      { question: "Q4", target: "REQ-001", text: "checked for touched paths the claim omitted; none" },
      { question: "Q3", target: "REQ-002", text: "tried add(\"2\", 3); throws as claimed" },
      { question: "Q4", target: "REQ-002", text: "checked for touched paths the claim omitted; none" },
      { question: "Q5", target: "fixture", text: "looked where the builder said not to; overflow and bigint untested" },
      { question: "Q6", target: "fixture", text: "confirmed not-checked areas: overflow, bigint" },
    ],
    interface_attempts: [],
    findings: [{ n: 1, text: "add(2, 3.5) is accepted; the falsifier of REQ-001 says numbers, but the sum of an integer and a float is not specified." }],
  };
  p.cairn(["report", "fixture", "--file", p.outFile("report.json", report)]);
  await p.wakeIs("Resolvable", "resolve", "fixture 1");

  // The resolution edits docs/spec/glossary.md, a developer-owned protected path (section 2).
  // Deviation from the plan text, recorded in the report: an in-flight protected-path edit is a
  // scope breach unless it is covered by a fresh `cairn authorize` first (preflight's own
  // `authorized(path, digests, log)` exemption) -- the plan's own resolve step edited glossary.md
  // and called resolve directly, which breaches scope on the very next state-changing command.
  // Re-authorizing first is the spec-correct way to fold a protected-path change into an open
  // commitment (section 2: "an accepted version of one needs a developer authorization that names
  // its before and after digests"); it is not a workaround for a defect.
  p.write("docs/spec/glossary.md", "# Glossary\n\n- sum: the result of add, for any finite numbers.\n");
  p.commit("Say that any finite numbers are summed");
  await p.developer.authorize();

  // A Consequential decision: queued in the ADR, agent continues; built after acceptance.
  // Deviation from the plan text, recorded in the report: the CLI's own flag is --rests-on
  // (comma-separated), not --wrong-if paired with a plan-invented --because; the printed line is
  // "decide <ulid>\n", not "... id <ulid>". Also a deviation in placement: the plan calls decide
  // at the end of the work loop (before review/report/resolve). lib/adr.mjs's decide() captures
  // its own base_snap from the CURRENT workspace at the moment it runs, and lib/commitment.mjs's
  // realize() later refuses when anything protected changed since that base_snap. Calling decide
  // before the glossary.md resolution above would let that unrelated protected-path edit into the
  // decision's own delta and make realize refuse "touches docs/spec/glossary.md (protected); the
  // decision is the developer's" -- correct behavior, not a defect, but it means decide must run
  // after every protected-path edit this commitment still intends to make, not before.
  const decideOut = p.cairn(["decide", "--consequential", "--title", "Export add as default too", "--rests-on", "callers import default", "--wrong-if", "no caller does", "--body", "Add a default export of add."]);
  const decisionId = /^decide ([0-9A-Z]{26})/.exec(decideOut.stdout)[1];

  const resolveOut = p.cairn(["resolve", "fixture", "1", "The glossary now says any finite numbers; the requirement text is unchanged."]);
  const resolutionSha = /^cairn: resolution fixture ([0-9a-f]{40})/.exec(resolveOut.stdout)[1];
  // Carried item (a): confirm the Done outcome still agrees end to end while this resolution is
  // "submitted" (unjudged). lib/wake.mjs's own openFindings() and lib/review.mjs's ledger()
  // disagree on whether an unjudged resolution counts as "resolved" (wake's looser helper says
  // yes; review's ledger says "submitted"), but wake's 'resolve' precedence still correctly
  // proceeds to 'accept' rather than skipping ahead to Done, because doneRule's own acceptance
  // check separately requires every resolution to be judged (accepted or rejected) before Done.
  await p.wakeIs("Resolvable", "accept", "fixture");

  const acceptance1 = { resolutions: [{ sha: resolutionSha, verdict: "accepted", reason: "the glossary now bounds sum to finite numbers" }], findings: [] };
  p.cairn(["accept", "fixture", "--file", p.outFile("accept1.json", acceptance1)]);
  await p.wakeIs("Resolvable", "build", decisionId);

  p.cairn(["begin", "build", decisionId]);
  p.write("src/add.mjs", readFileSync(join(p.dir, "src/add.mjs"), "utf8") + "export default add;\n");
  p.commit("Add the default export"); p.cairn(["end"]); p.cairn(["check", "REQ-001"]);
  p.cairn(["realize", decisionId, "--subject", "default export added"]);
  const adr = readFileSync(join(p.dir, "docs/decisions.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  // Deviation from the plan text: the ADR already carries the nan-policy escalation's "ok"
  // answer's `answered` line (written before `cairn decide` ran, in work()), so the full sequence
  // is ["answered", "decision", "realized"], not the plan's ["decision", "answered", "realized"].
  assert.deepEqual(adr.map((l) => l.kind), ["answered", "decision", "realized"]);
  await p.wakeIs("Resolvable", "accept", "fixture");
  p.cairn(["accept", "fixture", "--file", p.outFile("accept2.json", { resolutions: [], findings: [] })]);
  await p.wakeIs("Resolvable", "done", "fixture");
  p.cairn(["done", "fixture"]);
  assert.equal((await p.kinds()).at(-1), "done");
}

test("review, report, resolve, accept, build, accept, done", async () => {
  const p = buildProject();
  await tail(p);
  await work(p);
  await finish(p);
});

// Task 5: promote, second start, supersede; exact record-kind sequence and coverage.
const EVALUATOR = ["evaluation-intent", "evaluation-call", "measurement", "calibration"];
// Kinds the full fixture cannot reach, and why.
const UNREACHABLE = {
  "command-abort": "written only when a multi-store command dies before any planned write; the crash fixture variant B reaches it",
  read: "excluded by the task: the developer's queue read is a developer-authenticated act tested in plan 03",
  // Spec revision 6, "Direction": `cairn authorize instead|ask` writes this instead of an
  // ordinary authorization -- a developer-authenticated act this state-changing work-loop
  // fixture never runs (the same reason `read`, above, is excluded); covered directly by
  // tests/auth.test.mjs's own direction() tests.
  direction: "the developer's redirect or question through cairn authorize instead|ask is a developer-authenticated act tested in tests/auth.test.mjs",
};

// Carried item (b): a dangling answer (an 'answer' log record with no matching 'answered' ADR
// line -- the state a crash between escalate.mjs's two writes would leave) is completed by the
// next `cairn answer` for that slug, and wake neither crashes nor acts on it.
test("carried item (b): a dangling answer is completed by the next cairn answer; wake does not act on it", async () => {
  const p = buildProject();
  await tail(p);
  p.cairn(["escalate", "--commitment", "fixture", "--concern", "REQ-001", "--question", "Ship as is?", "--recommendation", "Yes", "--because", "REQ-001 already passes.", "--if-wrong", "a later review finds a gap.", "--instead", "hold for another pass."]);
  const escSha = (await p.readLog()).findLast((r) => r.kind === "escalation").sha;

  // Fabricate the dangling state directly: a real 'ok' answer record on the log, with no
  // corresponding 'answered' line ever written to docs/decisions.jsonl (appendDecision is never
  // called here, matching what a crash between escalate.mjs's two writes would leave behind).
  const { appendRecord } = await import("../lib/records.mjs");
  const evidence = { mode: "unsigned-local", purpose: "answer", subject: escSha, nonce: "n", author: { name: "dev", email: "dev@example.invalid" }, confirmed: true };
  await appendRecord(p.dir, "answer", "fixture", { escalation: escSha, kind: "ok", text: "", owner: null, evidence });
  assert.equal(existsSync(join(p.dir, "docs/decisions.jsonl")), false); // no ADR file yet at all: nothing has ever appended to it

  // wake does not crash and does not treat the missing ADR line as unsettled: the escalation
  // reads as answered straight from the log record, so wake proceeds past 'waiting' normally
  // (this fixture only ran tail(), not work(), so REQ-001's own receipt still says fail and the
  // next action is 'implement', unrelated to the escalation).
  const w = await wake(p.dir);
  assert.notEqual(w.verdict, "Waiting");
  await p.wakeIs("Resolvable", "implement", "REQ-001");

  // The next cairn answer for the slug completes the dangling ADR line and refuses THIS call
  // (lib/escalate.mjs's own contract: there is nothing left for this call to decide, only the
  // missing line to write), rather than silently succeeding or crashing. Called through the lib
  // directly (like every other developer-only command in this fixture; a raw CLI spawn needs a
  // real controlling terminal it does not have here).
  await assert.rejects(p.developer.answer("fixture", "ok", "ok"), /completed the dangling answer .* for fixture; run the command again/);
  const adrAfter = readFileSync(join(p.dir, "docs/decisions.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.deepEqual(adrAfter.map((l) => l.kind), ["answered"]);
  assert.equal(adrAfter[0].escalation, escSha);

  // Running the command again now finds nothing dangling and refuses the ordinary way (already
  // answered), not the dangling-completion way a second time.
  await assert.rejects(p.developer.answer("fixture", "ok", "ok"), /no unanswered escalation for fixture/);
  await p.wakeIs("Resolvable", "implement", "REQ-001");
});

test("full loop: promote, second start, supersede; exact kind sequence and coverage", async () => {
  const p = buildProject();
  await tail(p);
  const { itemSha, defectSha } = await work(p);
  await finish(p);

  // Deviation from the plan text, recorded in the report: lib/commitment.mjs's promote() moves
  // the roadmap's Current: line but never fabricates a new roadmap section from the backlog
  // item -- that is the agent's own spec-authoring work (matching the working agreement's own
  // description of promotion: "add the roadmap section"). The section must exist, naming the
  // item's own requirements, before `cairn promote` can resolve a frozen set for it.
  const roadmapBefore = readFileSync(join(p.dir, "docs/spec/roadmap.md"), "utf8");
  p.write("docs/spec/roadmap.md", roadmapBefore + "\n## fixture-2\n\nRequirements: REQ-002\n\nReport which argument was not a number.\n");
  p.commit("Add the fixture-2 roadmap section ahead of promotion");
  await p.wakeIs("Resolvable", "promote", "fixture-2");
  p.cairn(["promote", itemSha]);
  const roadmap = readFileSync(join(p.dir, "docs/spec/roadmap.md"), "utf8");
  assert.match(roadmap, /^Current: fixture-2$/m);
  assert.match(roadmap, /^## fixture-2\n\nRequirements: REQ-002$/m);
  // Deviation from the plan text, recorded in the report: REQ-002's earlier defect fix (in
  // work()) carries a workspace snapshot from well before fixture-2 started; the 'fix' predicate
  // (lib/wake.mjs) and fix() itself (lib/commitment.mjs) both measure "changes no protected
  // contract" against the CURRENTLY open commitment's own start snapshot, and a lot of protected
  // content (docs/spec/glossary.md, the roadmap's Current: line) legitimately changed between
  // that old fix and fixture-2's start. This is not a dead end: re-running `cairn fix` for the
  // same item under the new commitment re-attests it against the current baseline (empty delta,
  // since nothing has happened yet in fixture-2) and satisfies the predicate immediately.
  await p.wakeIs("Resolvable", "fix", "add-nan");
  p.cairn(["fix", defectSha]);
  // Same "at or after" ordering as the first fix (see work()): the confirming check must be
  // recorded after this fresh fix record too.
  p.cairn(["check", "REQ-002"]);
  await p.wakeIs("Resolvable", "review", "fixture-2");

  // supersede is developer-only; run through the lib directly (see tests/helpers/fixture.mjs).
  await p.developer.supersede("fixture-3", "Developer: fold fixture-2 into a wider change; supersede it.");
  const w = await wake(p.dir);
  assert.equal(w.exit, 3); assert.match(w.line, /pending (transition|supersession).*existing-project/);

  // Restored per review-1 finding 4: the plan's Task 5 wants the exact, ordered kind sequence
  // asserted (each entry explained), not only coverage. The sequence below is real, captured by
  // running this fixture, not the plan's own guessed list; every place it differs from the plan's
  // literal array is called out in the comment where that difference happens.
  const kinds = await p.kinds();
  assert.deepEqual(kinds, [
    // tail(): init, then the fail receipt, then authorize (itself transactional: command-intent
    // before authorization -- the plan's own list had one command-intent total, not two; see
    // tail()'s own deviation comment), then start (also transactional).
    "init", "receipt", "command-intent", "authorization", "command-intent", "start",
    // work(): the implement check; the fixture-2 backlog item and its outside record; the
    // add-nan defect item, its fix record, and the confirming check -- fix before its confirming
    // check, the reverse of the plan's own "receipt, fix" order (see work()'s "at or after"
    // deviation comment).
    "receipt", "item", "outside", "item", "fix", "receipt",
    // work(): the nan-policy escalation, ask, reply, ok.
    "escalation", "answer", "reply", "answer",
    // work(): the stray-file scope breach (recorded by the very next state-changing command's own
    // preflight, before that command's own record), its restore, and its own outside record.
    "scope-breach", "item", "scope", "outside",
    // finish(): review, brief, report.
    "review", "brief", "report",
    // finish(): re-authorizing before the glossary.md resolution -- transactional, like the first
    // authorize -- is not in the plan's own list at all (the plan never accounted for the
    // protected-path re-authorization finish() needs; see finish()'s own deviation comment).
    "command-intent", "authorization",
    // finish(): the resolution and its acceptance.
    "resolution", "acceptance",
    // finish(): the build check (confirms REQ-001 after the default-export edit).
    "receipt",
    // finish(): the second acceptance (examining the realize commit's delta) and done.
    "acceptance", "done",
    // promote(): transactional (command-intent), the promotion record, and the successor start.
    "command-intent", "promotion", "start",
    // full-loop test: re-attesting the carried-over add-nan fix under fixture-2 (see this test's
    // own "fix predicate" deviation comment), and the confirming check.
    "fix", "receipt",
    // supersede(): transactional (command-intent), then the superseded record.
    "command-intent", "superseded",
  ]);
  const written = new Set(kinds);
  for (const k of KINDS) {
    if (EVALUATOR.includes(k) || k === "read") continue;
    if (k in UNREACHABLE) { assert.ok(!written.has(k), k); continue; }
    assert.ok(written.has(k), `kind ${k} never written`);
  }

  // Travel: the authority remote receives both durable refs and the branch, in order (carried
  // item (d), first half).
  p.cairn(["push"]);
  const remoteRefs = spawnSync("/usr/bin/git", ["--git-dir", p.remote, "for-each-ref", "--format=%(refname)"], { encoding: "utf8" }).stdout;
  for (const r of ["refs/cairn/log", "refs/cairn/snapshots", "refs/heads/main"]) assert.ok(remoteRefs.includes(r), r);
  assert.equal(remoteRefs.includes("refs/cairn/in-progress"), false);

  // Carried item (d), second half: validation after fetch in a second clone. An ordinary `git
  // clone` fetches only refs/heads/*; the durable refs need the installed refspecs (lib/travel.mjs
  // installRefspecs) fetched explicitly, the same repair line wake would print for a fresh clone.
  const { installRefspecs, validateAfterFetch } = await import("../lib/travel.mjs");
  const cloneDir = join(p.dir, "..", `cairn-clone-${Date.now()}`);
  const clone = spawnSync("/usr/bin/git", ["clone", "-q", p.remote, cloneDir], { encoding: "utf8" });
  assert.equal(clone.status, 0, clone.stderr);
  spawnSync("/usr/bin/git", ["-C", cloneDir, "config", "user.email", "dev@example.invalid"]);
  spawnSync("/usr/bin/git", ["-C", cloneDir, "config", "user.name", "dev"]);
  await installRefspecs(cloneDir, "origin");
  const fetched = spawnSync("/usr/bin/git", ["-C", cloneDir, "fetch", "origin", "refs/cairn/log:refs/cairn/log", "refs/cairn/snapshots:refs/cairn/snapshots"], { encoding: "utf8" });
  assert.equal(fetched.status, 0, fetched.stderr);
  const repairs = await validateAfterFetch(cloneDir);
  assert.deepEqual(repairs, []);
  const cloneWake = await wake(cloneDir);
  assert.equal(cloneWake.exit, 3);
  assert.match(cloneWake.line, /pending (transition|supersession).*existing-project/);
  rmSync(cloneDir, { recursive: true, force: true });
});
