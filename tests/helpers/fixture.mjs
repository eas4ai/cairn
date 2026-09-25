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
import { loadSettings } from "../../lib/settings.mjs";
import { answer } from "../../lib/escalate.mjs";
import { supersede } from "../../lib/commitment.mjs";

export const ROOT = resolve(new URL("../..", import.meta.url).pathname);
export const KERNEL = join(ROOT, "bin/sudus.mjs");

// Section 5's own table is normative and does carry backticks around `resolve`, `Current:` and
// `ask` in the accept/promote/reply rows (docs/spec/sudus-v2.md, confirmed by direct reading).
// lib/wake.mjs's real PREDICATES strings for exactly those three actions used to print the same
// words without the backticks (a kernel defect found by this fixture and recorded in the plan 14
// report, with the spec-vs-implementation comparison as its own isolated test below; fixed in the
// kernel fix round named in that report's own follow-up). This table matches the real printed
// text, backticks included, so the main fixture flow can assert against it; SPEC_PREDICATE
// (below) carries the section 5 table's own exact wording for the isolated defect-comparison
// test, and the two are now identical for these three rows.
export const PREDICATE = {
  repair: "the named hand-written file reads under its grammar and no unrelated byte changed",
  recover: "the intent has one terminal domain or abort record and every store matches its resulting identity",
  reconcile: "the local action lease is gone and the action it named finished or was explicitly abandoned",
  scope: "every scope-breach record for the path has a developer-approved keep disposition or a restore snapshot equal to its allowed base; an unanswered escalation that concerns the breach is Waiting instead",
  fix: "a fix record names the item and a workspace snapshot that changes no protected contract of the commitment open when it was recorded (between commitments no contract is frozen and none is measured); its requirement has a current pass at or after it, whether or not the last commitment owns that requirement",
  record: "the action lease covers the path through its target's declared inputs, or the path is clean",
  commit: "the path is clean, or the action lease covers it; docs/decisions.jsonl is named here whenever it has uncommitted lines",
  declare: "a mechanism definition names the requirement and no pre-existing undeclared delta was legalized",
  run: "a current receipt carries a result for the requirement",
  implement: "a current receipt says pass and review metadata binds the requirement to the current detection and text digests with a fail receipt",
  escalate: "after three distinct attempts without a pass, an escalation concerns the requirement before a fourth; a receipt where another requirement of the commitment also failed is not an attempt",
  "review mechanism": "review metadata binds the requirement to the current detection and text digests with a fail receipt",
  capture: "an outside record names the item, or an escalation concerns it",
  review: "a review names the current workspace snapshot and answers every fixed question for every target",
  report: "a report names the reviewed snapshot through the latest brief and attempts every lens for every target and every interface obligation; a report that stopped on a Sudus bug is not one",
  resolve: "a resolution, or a decline with its reason, names finding N of its exact source record",
  build: "a realized ADR line names the decision's base and resulting snapshots and the realization check passed",
  done: "a done record names the commitment and final workspace snapshot",
  promote: "no commitment is open; one promotion names a backlog item and decision; `Current:` and a one-item successor start were written transactionally",
  reply: "a reply record names the open `ask` escalation",
};

// docs/spec/sudus-v2.md section 5's exact table text for the three rows where it differs from
// lib/wake.mjs's real PREDICATES strings (backticks around `resolve`, `Current:` and `ask`).
export const SPEC_PREDICATE = {
  promote: "no commitment is open; one promotion names a backlog item and decision; `Current:` and a one-item successor start were written transactionally",
  reply: "a reply record names the open `ask` escalation",
};

export const SETTINGS = {
  schema: 1, authority_remote: "origin", outside: ["README.md", "notes/**"], source: ["src/**"], interfaces: [], data: [],
  network_exclude: ["private/**"], signing_key: null, attribution: "forbidden", developer: "present",
  harness: { claude_code: { adversary_model: "claude-fable-5-1", adversary_transport: "remote" } },
  typesafeai: { enabled: false, model: "jev-1.13.0", weights: { evidence: 0.2, reach: 0.2, contract: 0.2, surface: 0.2, ambiguity: 0.2 }, agent_ceiling: 0.35, confidence_floors: { evidence: 0.2, reach: 0.2, contract: 0.2, surface: 0.2, ambiguity: 0.2 }, min_calibration_agent_predictions: 60, request_cap_bytes: 48000 },
};

export const SPEC = {
  "docs/spec/overview.md": "# Adder\n\nAdder adds two numbers. It is not a calculator.\n\n| File | Prefix |\n|---|---|\n| add.md | REQ |\n",
  "docs/spec/glossary.md": "# Glossary\n\n- sum: the result of add.\n",
  "docs/spec/add.md": "Prefix: REQ\n\n[REQ-001] The add function returns the sum of two numbers.\nFalsifier: add(2, 3) returns anything but 5.\nMechanism: tests\nStatus: Draft\n\n[REQ-002] The add function refuses a non-number argument by throwing a TypeError.\nFalsifier: add(\"2\", 3) returns a value instead of throwing.\nMechanism: tests\nStatus: Draft\n",
  "docs/spec/roadmap.md": "Current: fixture\n\n## fixture\n\nRequirements: REQ-001 REQ-002\n\nDelivers add. Done when both requirements have current passes and the adversary has accepted.\n",
};

export const MECH_TEST = `import { add } from "../src/add.mjs";
const say = (id, ok) => process.stdout.write("sudus: " + id + ": " + (ok ? "pass" : "fail") + "\\n");
let sum = false, refuses = false;
try { sum = add(2, 3) === 5; } catch {}
try { add("2", 3); } catch (e) { refuses = e instanceof TypeError; }
say("REQ-001", sum); say("REQ-002", refuses);
`;

// The mechanism definition JSON `sudus declare tests --file <path>` reads (lib/cli.mjs's
// declareCommand); the CLI names no argument syntax for the individual fields (deviation
// recorded in the plan 14 report: plan text assumed --command/--input/--requirement/--results/
// --identity flags that lib/cli.mjs never registers; declare instead takes one JSON file, the
// shape lib/mechanisms.mjs's normalizeDefinition validates).
// Inputs are the literal files the mechanism reads, not the "src" directory: a directory input
// declares every path under it forever (lib/scope.mjs's isDeclared treats a directory input as
// covering the whole subtree), so a later stray file under src/ would never breach scope. Naming
// the two files precisely keeps src/extra.mjs (added in the work loop's scope-breach step)
// genuinely undeclared.
export const MECH_DEFINITION = {
  command: `${process.execPath} tests/req.test.mjs`, cwd: null,
  inputs: ["src/add.mjs", "tests/req.test.mjs"], documents: [],
  requirements: ["REQ-001", "REQ-002"], results: "per-requirement",
  identity: { tools: { node: "node --version" }, env: [], image: null },
};

export function buildProject({ settings = SETTINGS } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "sudus-fixture-"));
  const remote = mkdtempSync(join(tmpdir(), "sudus-remote-"));
  const sh = (cwd, cmd, args, opts = {}) => spawnSync(cmd, args, { cwd, encoding: "utf8", ...opts });
  const git = (...a) => { const r = sh(dir, "/usr/bin/git", a); assert.equal(r.status, 0, `git ${a.join(" ")}: ${r.stderr}`); return r.stdout; };
  spawnSync("/usr/bin/git", ["init", "-q", "--bare", remote]);
  git("init", "-q", "-b", "main"); git("config", "user.email", "dev@example.invalid"); git("config", "user.name", "dev");
  git("remote", "add", "origin", remote);
  for (const [p, text] of Object.entries(SPEC)) { mkdirSync(join(dir, p, ".."), { recursive: true }); writeFileSync(join(dir, p), text); }
  mkdirSync(join(dir, ".sudus")); writeFileSync(join(dir, ".sudus/settings.json"), JSON.stringify(settings, null, 2) + "\n");
  mkdirSync(join(dir, "tests")); writeFileSync(join(dir, "tests/req.test.mjs"), MECH_TEST);
  mkdirSync(join(dir, "src")); writeFileSync(join(dir, "src/add.mjs"), "export function add() { return undefined; }\n");
  writeFileSync(join(dir, "README.md"), "adder\n"); writeFileSync(join(dir, ".gitignore"), ".sudus/output/\n");
  git("add", "-A"); git("commit", "-q", "-m", "Prepare the fixture project");
  const sudus = (args, { stdin, env, expectExit = 0 } = {}) => {
    const r = sh(dir, process.execPath, [KERNEL, ...args], { input: stdin, env: { ...process.env, ...env } });
    assert.equal(r.status, expectExit, `sudus ${args.join(" ")} exited ${r.status}: ${r.stderr}${r.stdout}`);
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
  // supersede is developer-only, exactly like authorize/answer: run as a raw child process (via
  // p.sudus) with no injected --quote, lib/cli.mjs's supersedeCommand refuses "needs --quote"
  // with none -- called through the lib directly here, the same pattern already used for
  // init/authorize/answer. Spec revision 6: the developer's quoted words (--quote) are both the
  // record's own text and, in attested mode (no signing_key here), the developer evidence itself.
  const developer = {
    // Settings are already on disk (written above), so this adopts them: --adopt <digest> is the
    // flag that matters (lib/init.mjs's own comment on init()).
    init: async () => init(dir, { adopt: (await loadSettings(dir)).digest, quote: "ok", env: {} }),
    authorize: () => authorize(dir, { quote: "ok", env: {} }),
    answer: (slug, kind, text) => answer(dir, slug, kind, { quote: text, env: {} }),
    supersede: (successor, quote) => supersede(dir, successor, { quote, env: {} }),
  };
  const write = (p, text) => { mkdirSync(join(dir, p, ".."), { recursive: true }); writeFileSync(join(dir, p), text); };
  const commit = (msg) => { git("add", "-A"); git("commit", "-q", "-m", msg); return git("rev-parse", "HEAD").trim(); };
  // A `--file <path>` argument (review, report, accept) is read by the CLI itself, never
  // committed; writing it inside the project's own working tree makes it an untracked path that
  // the very next STATE_CHANGING command's own preflight (lib/scope.mjs's preflight runs before
  // every state-changing command, not only ones that touch the file) records as a scope breach
  // even when it is removed again right after the command that reads it. outFile keeps every such
  // scratch file in a directory outside the project entirely, matching how the brief's own
  // projection directory (lib/review.mjs's brief()) already lives outside the repository.
  const scratchDir = mkdtempSync(join(tmpdir(), "sudus-fixture-files-"));
  const outFile = (name, obj) => { const p = join(scratchDir, name); writeFileSync(p, JSON.stringify(obj)); return p; };
  return { dir, remote, git, sudus, wakeIs, kinds, developer, write, commit, outFile, readLog: () => readLog(dir), remove: (p) => rmSync(join(dir, p), { force: true }) };
}

// `sudus <command> --help` prints the same usage line `usage()` in lib/cli.mjs lists for the
// command (since 2.1.6); assertFlags reads the global help text once and checks each flag is a
// substring of that command's own line, which is that line without a spawn per command.
export function assertFlags(cmd, flags) {
  const help = spawnSync(process.execPath, [KERNEL, "--help"], { encoding: "utf8" }).stdout;
  const name = cmd.split(" ")[0];
  const line = help.split("\n").find((l) => l.trim().startsWith(`sudus ${name} `) || l.trim() === `sudus ${name}`);
  assert.ok(line, `sudus --help does not list a usage line for ${name}`);
  for (const f of flags) assert.ok(line.includes(f), `sudus ${name} usage line does not list ${f}: ${line}`);
}

export const REPORT_FLAGS = ["--file"];
