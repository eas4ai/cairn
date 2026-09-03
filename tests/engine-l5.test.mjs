import { test, expect } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseYaml } from "../skills/new-project/scripts/engine/yaml.ts";

// Every test here spawns the scripts or the engine as child
// processes, so a loaded machine makes them slow rather than wrong.
// The timeout is generous on purpose: a red suite must mean a defect.
const TEST_TIMEOUT = 120_000;

// Same Page Conformance, layer L5 (iteration 006): sensitivity
// mechanisms. A validator declares challenges: deliberate attempts to
// realize the confirmed falsifier, each with a reviewable artifact.
// A challenge the validator notices makes the record `challenged` with
// its mechanism named; a challenge the validator passes is weak
// sensitivity, reported, and no challenged claim of that validator
// stands. A challenge never proves the validator equals the
// requirement. Each test names the requirement whose falsifier state it
// produces. The engine is exercised through its command line.

const ENGINE = new URL("../skills/new-project/scripts/engine/same-page.ts", import.meta.url).pathname;

function sh(cmd, args, cwd, env = {}) {
  return spawnSync(cmd, args, { cwd, encoding: "utf8", env: { ...process.env, ...env } });
}

function run(args, p, extra = {}) {
  const r = sh("node", ["--disable-warning=ExperimentalWarning", ENGINE, ...args], p.root, { SAME_PAGE_HOME: p.home, ...extra });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

const OVERVIEW = "# Proj -- System Overview\n\nStatus: Agreed\nAgreed: 2026-09-03\nPrefix: PRJ\n\n## Purpose\n\nA fixture.\n";
const DOMAIN = [
  "# Proj -- 01 Broker",
  "",
  "Status: Agreed",
  "Agreed: 2026-09-03",
  "Prefix: BRK",
  "",
  "## Capabilities",
  "",
  "[BRK-001] When a request arrives, the broker MUST log the request",
  "before dispatch.",
  "Falsifier: a request arrives and the log has no entry for it.",
  "",
  "[BRK-003] The broker MUST NOT serve an error response from the cache.",
  "Falsifier: an error response is served from the cache.",
  "",
].join("\n");

function git(root, args) {
  const r = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
}

function layout(withGit) {
  const base = mkdtempSync(join(tmpdir(), "same-page-l5-"));
  const root = join(base, "repo");
  const home = join(base, "home");
  mkdirSync(join(root, "docs", "specs", "proj"), { recursive: true });
  mkdirSync(home);
  writeFileSync(join(root, "docs", "specs", "proj", "00-overview.md"), OVERVIEW);
  writeFileSync(join(root, "docs", "specs", "proj", "01-broker.md"), DOMAIN);
  writeFileSync(join(root, "src.txt"), "source v1\n");
  writeFileSync(join(root, "tool.lock"), "tool 1.0\n");
  if (withGit) {
    git(root, ["init", "-q", "-b", "main"]);
    git(root, ["config", "user.name", "Fixture Dev"]);
    git(root, ["config", "user.email", "dev@example.test"]);
  }
  const p = { root, home, base, specs: join(root, "docs", "specs", "proj") };
  run(["elaborate"], p, { SAME_PAGE_SPECS_DIR: "" });
  if (withGit) commit(p, "init");
  return p;
}

// A project with a clean git tree, its spec set, and a trust home
// outside the repository. Obligations are elaborated and committed.
function project() {
  return layout(true);
}

function commit(p, msg) {
  git(p.root, ["add", "-A"]);
  git(p.root, ["commit", "-q", "-m", msg]);
  return git(p.root, ["rev-parse", "HEAD"]);
}

function validatorFile(p, name, text) {
  mkdirSync(join(p.root, ".same-page", "validators"), { recursive: true });
  writeFileSync(join(p.root, ".same-page", "validators", `${name}.yaml`), text);
}

// A validator with its environment declaration: each item is
// { command: [...] } or { file: path }; [] declares none.
function validator(p, name, command, environment = [], extra = "") {
  const cmd = command.map((c) => `  - ${JSON.stringify(c)}`).join("\n");
  const env = environment.length
    ? "environment:\n" + environment.map((e) => ("command" in e ? `  - command:\n${e.command.map((c) => `      - ${JSON.stringify(c)}`).join("\n")}` : `  - file: ${e.file}`)).join("\n") + "\n"
    : "environment: []\n";
  validatorFile(p, name, `kind: test\ncommand:\n${cmd}\n${env}${extra}`);
}

function bind(p, id, name, attest = "") {
  const path = join(p.root, ".same-page", "obligations", `${id}.yaml`);
  const text = readFileSync(path, "utf8");
  const item = attest ? `  - name: ${name}\n    attested_by: ${attest}\n` : `  - name: ${name}\n`;
  const next = text.includes("validators: []\n") ? text.replace("validators: []\n", `validators:\n${item}`) : text.replace("validators:\n", `validators:\n${item}`);
  writeFileSync(path, next);
}

function policy(p) {
  return join(p.root, ".same-page", "policy.yaml");
}

function setDefaultAny(p, kinds) {
  writeFileSync(policy(p), readFileSync(policy(p), "utf8").replace(/      any:\n(?:        - kind: \w+\n)+/, "      any:\n" + kinds.map((k) => `        - kind: ${k}\n`).join("")));
}

function recordFiles(p, id) {
  const dir = join(p.root, ".same-page", "evidence", id);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => n.endsWith(".yaml") && !n.startsWith("disproof"))
    .sort()
    .map((n) => join(dir, n));
}

function records(p, id) {
  return recordFiles(p, id).map((f) => parseYaml(readFileSync(f, "utf8")));
}

// Edit the newest record for a requirement by hand, as a tampered or
// foreign record would look.
function editRecord(p, id, fn) {
  const files = recordFiles(p, id);
  const file = files[files.length - 1];
  writeFileSync(file, fn(readFileSync(file, "utf8")));
}

function entry(stdout, id) {
  const m = stdout.split("\n\n").find((block) => block.startsWith(`${id}  `));
  return m ?? "";
}


function policyText(p) {
  return readFileSync(policy(p), "utf8");
}

function setDefaultRequire(p, block) {
  writeFileSync(policy(p), policyText(p).replace(/    require:\n(?:.*\n)*?(?=domains:)/, block));
}

// A validator with a challenges: block, written as YAML text.
function challenger(p, name, command, challenges, extra = "") {
  const cmd = command.map((c) => `  - ${JSON.stringify(c)}`).join("\n");
  const blocks = challenges
    .map((c) => {
      const lines = [`  - mechanism: ${c.mechanism}`];
      if (c.artifact !== undefined) lines.push(`    artifact: ${c.artifact}`);
      if (c.command) lines.push("    command:\n" + c.command.map((x) => `      - ${JSON.stringify(x)}`).join("\n"));
      if (c.from_falsifier !== undefined) lines.push(`    from_falsifier: ${c.from_falsifier}`);
      if (c.requirement) lines.push(`    requirement: ${c.requirement}`);
      if (c.requirements) lines.push("    requirements:\n" + c.requirements.map((r) => `      - ${r}`).join("\n"));
      return lines.join("\n");
    })
    .join("\n");
  validatorFile(p, name, `kind: test\ncommand:\n${cmd}\nenvironment: []\n${blocks ? `challenges:\n${blocks}\n` : ""}${extra}`);
}

function artifact(p, rel, body = "a reviewable challenge artifact\n") {
  const path = join(p.root, rel);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, body);
  return rel;
}

// A trusted validator bound to BRK-001 with one falsifier-derived
// challenge that the validator notices: the challenge command exits
// non-zero, the way the validator would under the violating state.
function noticed(p, name = "ok") {
  artifact(p, "challenges/broker-001.fixture");
  challenger(p, name, ["true"], [{ mechanism: "negative-fixture", artifact: "challenges/broker-001.fixture", command: ["false"], from_falsifier: true, requirement: "BRK-001" }]);
  bind(p, "BRK-001", name);
  commit(p, "validator and challenge artifact");
  run(["trust", name], p);
  run(["run"], p);
  return run(["challenge"], p);
}

test("a challenge is any deliberate attempt to realize the falsifier, not only mutation; a mechanism outside the seven is refused (ENG-170)", () => {
  const p = project();
  const r = noticed(p);
  expect(r.stdout).toContain("challenged ok with negative-fixture challenges/broker-001.fixture (falsifier-derived, BRK-001): the validator noticed (exit 1)");
  expect(r.stdout).toContain("1 challenged record(s), 0 weak-sensitivity record(s), 0 cleared, 0 finding(s)");
  expect(r.status).toBe(0);
  const rec = records(p, "BRK-001").find((x) => x.sensitivity === "challenged");
  expect(rec.challenge.mechanism).toBe("negative-fixture");
  // Every listed mechanism is accepted, and no mechanism ranks above another.
  for (const mechanism of ["mutation", "fault-injection", "negative-fixture", "double", "counterexample-search", "adversarial-input", "harness"]) {
    challenger(p, "ok", ["true"], [{ mechanism, artifact: "challenges/broker-001.fixture", command: ["false"], from_falsifier: false, requirements: ["BRK-001"] }]);
    run(["trust", "ok"], p);
    const c = run(["challenge"], p);
    expect(c.stdout).toContain(`challenged ok with ${mechanism} challenges/broker-001.fixture:`);
    expect(c.status).toBe(0);
  }
  challenger(p, "ok", ["true"], [{ mechanism: "code-review", artifact: "challenges/broker-001.fixture", command: ["false"], from_falsifier: false, requirements: ["BRK-001"] }]);
  const bad = run(["challenge", "ok", "--as-developer"], p);
  expect(bad.stdout).toContain("mechanism must be one of mutation, fault-injection, negative-fixture, double, counterexample-search, adversarial-input, harness; no mechanism ranks above another");
  expect(bad.stdout).toContain("(ENG-170)");
  expect(bad.stdout).toContain("0 challenge(s) run");
}, TEST_TIMEOUT);

test("a challenged record cites a reviewable artifact; without one there is no challenged record (ENG-171, ENG-172)", () => {
  const p = project();
  challenger(p, "ok", ["true"], [{ mechanism: "mutation", command: ["false"], from_falsifier: false, requirements: ["BRK-001"] }]);
  bind(p, "BRK-001", "ok");
  let r = run(["challenge", "ok", "--as-developer"], p);
  expect(r.stdout).toContain("a challenge cites a reviewable artifact");
  expect(r.stdout).toContain("(ENG-171)");
  expect(r.stdout).toContain("0 challenged record(s)");
  expect(records(p, "BRK-001")).toEqual([]);
  // An artifact that is not in the snapshot is not reviewable.
  challenger(p, "ok", ["true"], [{ mechanism: "mutation", artifact: "challenges/absent.fixture", command: ["false"], from_falsifier: false, requirements: ["BRK-001"] }]);
  r = run(["challenge", "ok", "--as-developer"], p);
  expect(r.stdout).toContain("challenge artifact challenges/absent.fixture does not exist in the snapshot");
  expect(r.stdout).toContain("(ENG-171)");
  expect(records(p, "BRK-001")).toEqual([]);
  // A hand-written record claiming challenged with no challenge block is refused.
  noticed(p, "ok2");
  editRecord(p, "BRK-001", (t) => t.replace(/^challenge:\n(?:  .*\n)+/m, "challenge: null\n"));
  const v = run(["verify"], p);
  expect(v.stdout).toContain("a challenged record names its challenge mechanism and artifact");
  expect(v.stdout).toContain("(ENG-035)");
}, TEST_TIMEOUT);

test("a challenged record names its mechanism, states whether it derives from the falsifier, and cites that falsifier's digest (ENG-033, ENG-035, ENG-036, ENG-037)", () => {
  const p = project();
  noticed(p);
  const ob = parseYaml(readFileSync(join(p.root, ".same-page", "obligations", "BRK-001.yaml"), "utf8"));
  const rec = records(p, "BRK-001").find((x) => x.sensitivity === "challenged");
  expect(rec.challenge).toEqual({ mechanism: "negative-fixture", artifact: "challenges/broker-001.fixture", from_falsifier: true, falsifier_digest: ob.falsifier_digest });
  expect(rec.kind).toBe("test");
  expect(rec.execution_trust.context).toBe("trust-record");
  // A falsifier-derived challenge speaks for the requirement it names, and no other.
  expect(records(p, "BRK-003")).toEqual([]);
  // No validator output sets the sensitivity axis.
  artifact(p, "challenges/liar.fixture");
  challenger(p, "liar", ["true"], [{ mechanism: "harness", artifact: "challenges/liar.fixture", command: ["sh", "-c", "echo 'sensitivity: challenged'; echo 'from_falsifier: true'; exit 1"], from_falsifier: false, requirements: ["BRK-003"] }]);
  bind(p, "BRK-003", "liar");
  commit(p, "liar");
  run(["trust", "liar"], p);
  run(["challenge", "liar"], p);
  const liar = records(p, "BRK-003")[0];
  expect(liar.challenge.mechanism).toBe("harness");
  expect(liar.challenge.from_falsifier).toBe(false);
  expect(liar.challenge.falsifier_digest).toBeNull();
  // A falsifier-derived challenge naming a requirement that does not list the validator is refused.
  challenger(p, "liar", ["true"], [{ mechanism: "harness", artifact: "challenges/liar.fixture", command: ["false"], from_falsifier: true, requirement: "BRK-001" }]);
  const r = run(["challenge", "liar", "--as-developer"], p);
  expect(r.stdout).toContain("names requirement BRK-001, which does not list validator liar");
  expect(r.stdout).toContain("(ENG-037)");
}, TEST_TIMEOUT);

test("a challenge the validator passes is weak sensitivity: reported, and no challenged claim of that validator stands (ENG-173, ENG-174)", () => {
  const p = project();
  noticed(p);
  let e = entry(run(["verify"], p).stdout, "BRK-001");
  expect(e).toContain("Sensitivity: challenged (negative-fixture challenges/broker-001.fixture, falsifier-derived)");
  // The same validator, a challenge it passes: exit 0 under the violating state.
  challenger(p, "ok", ["true"], [{ mechanism: "mutation", artifact: "challenges/broker-001.fixture", command: ["true"], from_falsifier: true, requirement: "BRK-001" }]);
  run(["trust", "ok"], p);
  const c = run(["challenge"], p);
  expect(c.stdout).toContain("the validator passed under the violating state (exit 0)");
  expect(c.stdout).toContain("weak sensitivity: ok passed the mutation challenge challenges/broker-001.fixture, which realizes the confirmed falsifier of BRK-001; the mechanism does not notice that violating state, so no challenged claim of ok stands");
  expect(c.stdout).toContain("(ENG-173)");
  expect(c.stdout).toContain("0 challenged record(s), 1 weak-sensitivity record(s), 0 cleared");
  expect(c.status).toBe(1);
  expect(existsSync(join(p.root, ".same-page", "evidence", "_mechanisms", "ok.yaml"))).toBe(true);
  const v = run(["verify"], p);
  e = entry(v.stdout, "BRK-001");
  expect(v.stdout).toContain("weak sensitivity: ok passed the mutation challenge");
  expect(v.stdout).toContain("(ENG-173)");
  expect(e).toContain("Sensitivity: weak: ok passed the mutation challenge challenges/broker-001.fixture, which realizes a confirmed falsifier; no challenged claim of this validator stands");
  // The earlier challenged record is kept and shown, and counts as unchallenged.
  expect(records(p, "BRK-001").some((r) => r.sensitivity === "challenged")).toBe(true);
  expect(e).toContain("unchallenged;");
  expect(e).not.toContain("; challenged;");
}, TEST_TIMEOUT);

test("a profile that requires challenged sensitivity is satisfied only by a live challenged claim (ENG-034, ENG-074)", () => {
  const p = project();
  noticed(p);
  setDefaultRequire(p, "    require:\n      all:\n        - kind: test\n        - sensitivity: challenged\n");
  run(["elaborate"], p);
  let v = run(["verify"], p);
  expect(entry(v.stdout, "BRK-001")).toContain("BRK-001  SUFFICIENT");
  expect(entry(v.stdout, "BRK-001")).toContain("Required:    test + sensitivity challenged; current freshness");
  expect(entry(v.stdout, "BRK-003")).toContain("BRK-003  INSUFFICIENT");
  expect(entry(v.stdout, "BRK-003")).toContain("Sensitivity: no evidence");
  // The same validator misses a challenge: the claim stops satisfying the profile.
  challenger(p, "ok", ["true"], [{ mechanism: "mutation", artifact: "challenges/broker-001.fixture", command: ["true"], from_falsifier: true, requirement: "BRK-001" }]);
  run(["trust", "ok"], p);
  run(["challenge"], p);
  v = run(["verify"], p);
  expect(entry(v.stdout, "BRK-001")).toContain("BRK-001  INSUFFICIENT");
}, TEST_TIMEOUT);

test("a challenge is not proof that the validator equals the requirement (ENG-001, ENG-175)", () => {
  const p = project();
  noticed(p);
  const v = run(["verify"], p);
  const e = entry(v.stdout, "BRK-001");
  expect(e).toContain("BRK-001  SUFFICIENT");
  expect(e).toContain("Assumptions: the declared environment inputs are the inputs that decide this validator's result; a challenge raises sensitivity; the correspondence between the requirement sentence and the validator stays an assumption");
  expect(e).not.toMatch(/proven|proves|correct\b|equivalent|guarantee/i);
  expect(v.stdout).not.toMatch(/proven|equivalent/i);
}, TEST_TIMEOUT);

test("a miss clears when the same challenge is noticed again, and the cleared miss stays as history (ENG-173, ENG-174)", () => {
  const p = project();
  noticed(p);
  expect(entry(run(["verify"], p).stdout, "BRK-001")).toContain("Sensitivity: challenged (negative-fixture");
  // The mechanism goes blind: the same challenge now passes.
  challenger(p, "ok", ["true"], [{ mechanism: "negative-fixture", artifact: "challenges/broker-001.fixture", command: ["true"], from_falsifier: true, requirement: "BRK-001" }]);
  run(["trust", "ok"], p);
  expect(run(["challenge"], p).stdout).toContain("1 weak-sensitivity record(s), 0 cleared");
  let v = run(["verify"], p);
  expect(entry(v.stdout, "BRK-001")).toContain("Sensitivity: weak:");
  expect(v.stdout).toContain("(ENG-173)");
  // The mechanism is fixed: the same challenge is noticed again.
  challenger(p, "ok", ["true"], [{ mechanism: "negative-fixture", artifact: "challenges/broker-001.fixture", command: ["false"], from_falsifier: true, requirement: "BRK-001" }]);
  run(["trust", "ok"], p);
  const c = run(["challenge"], p);
  expect(c.stdout).toContain("cleared the weak sensitivity ok carried since");
  expect(c.stdout).toContain("1 challenged record(s), 0 weak-sensitivity record(s), 1 cleared, 0 finding(s)");
  expect(c.status).toBe(0);
  v = run(["verify"], p);
  const e = entry(v.stdout, "BRK-001");
  expect(e).toContain("Sensitivity: challenged (negative-fixture challenges/broker-001.fixture, falsifier-derived)");
  expect(v.stdout).not.toContain("(ENG-173)");
  // The miss is history, not a deletion.
  expect(e).toContain("Prior weak sensitivity: ok passed the negative-fixture challenge challenges/broker-001.fixture at ");
  expect(e).toContain("; cleared ");
  const file = readFileSync(join(p.root, ".same-page", "evidence", "_mechanisms", "ok.yaml"), "utf8");
  expect(file).toContain("cleared_at:");
  expect(parseYaml(file).misses.length).toBe(1);
}, TEST_TIMEOUT);

test("a miss withdraws that validator's challenged claims on every requirement it serves (ENG-174)", () => {
  const p = project();
  artifact(p, "challenges/one.fixture");
  artifact(p, "challenges/three.fixture");
  const both = (first) => [
    { mechanism: "negative-fixture", artifact: "challenges/one.fixture", command: [first], from_falsifier: true, requirement: "BRK-001" },
    { mechanism: "negative-fixture", artifact: "challenges/three.fixture", command: ["false"], from_falsifier: true, requirement: "BRK-003" },
  ];
  challenger(p, "ok", ["true"], both("false"));
  bind(p, "BRK-001", "ok");
  bind(p, "BRK-003", "ok");
  commit(p, "two challenges");
  run(["trust", "ok"], p);
  run(["run"], p);
  run(["challenge"], p);
  let v = run(["verify"], p);
  expect(entry(v.stdout, "BRK-001")).toContain("Sensitivity: challenged (negative-fixture challenges/one.fixture");
  expect(entry(v.stdout, "BRK-003")).toContain("Sensitivity: challenged (negative-fixture challenges/three.fixture");
  // One challenge goes blind. The claim on the other requirement falls too:
  // sensitivity is a property of the mechanism, not of one requirement.
  challenger(p, "ok", ["true"], both("true"));
  run(["trust", "ok"], p);
  run(["challenge"], p);
  v = run(["verify"], p);
  expect(entry(v.stdout, "BRK-001")).toContain("Sensitivity: weak:");
  const three = entry(v.stdout, "BRK-003");
  expect(three).toContain("Sensitivity: weak:");
  expect(three).toContain("recorded against BRK-001");
  expect(v.stdout).toContain("no challenged claim of ok stands, BRK-003 included");
}, TEST_TIMEOUT);

test("a challenge that does not derive from a confirmed falsifier names the requirements it speaks for, and claims nothing by default (ENG-036)", () => {
  const p = project();
  artifact(p, "challenges/generic.fixture");
  challenger(p, "ok", ["true"], [{ mechanism: "harness", artifact: "challenges/generic.fixture", command: ["false"], from_falsifier: false }]);
  bind(p, "BRK-001", "ok");
  bind(p, "BRK-003", "ok");
  commit(p, "generic challenge");
  let r = run(["challenge", "ok", "--as-developer"], p);
  expect(r.stdout).toContain("a challenge that does not derive from a confirmed falsifier names the requirements it speaks for, as a requirements list; it claims nothing by default");
  expect(r.stdout).toContain("(ENG-036)");
  expect(records(p, "BRK-001")).toEqual([]);
  expect(records(p, "BRK-003")).toEqual([]);
  // Named: it speaks for those requirements and no others.
  challenger(p, "ok", ["true"], [{ mechanism: "harness", artifact: "challenges/generic.fixture", command: ["false"], from_falsifier: false, requirements: ["BRK-003"] }]);
  r = run(["challenge", "ok", "--as-developer"], p);
  expect(r.stdout).toContain("1 record(s) at");
  expect(records(p, "BRK-001")).toEqual([]);
  expect(records(p, "BRK-003").filter((x) => x.sensitivity === "challenged").length).toBe(1);
  // A falsifier-derived challenge does not carry a list.
  challenger(p, "ok", ["true"], [{ mechanism: "harness", artifact: "challenges/generic.fixture", command: ["false"], from_falsifier: true, requirement: "BRK-001", requirements: ["BRK-003"] }]);
  r = run(["challenge", "ok", "--as-developer"], p);
  expect(r.stdout).toContain("a falsifier-derived challenge speaks for the one requirement whose falsifier it realizes; drop the requirements list");
  expect(r.stdout).toContain("(ENG-037)");
}, TEST_TIMEOUT);
