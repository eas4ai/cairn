import { test, expect } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseYaml } from "../skills/new-project/scripts/engine/yaml.ts";

// Same Page Conformance, layer L3 (iteration 004): conservative
// freshness. Every record stores its identity inputs as one block; a
// known difference is `stale`, an input that cannot be computed is
// `unknown`; the dependency chain is recorded and stops at the
// repository; validators declare their environment and the engine
// fingerprints exactly that; the boundary and the residual risk outside
// it are on every record and every `verify` entry. Each test names the
// requirement whose falsifier state it produces. The engine is exercised
// through its command line.

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
  const base = mkdtempSync(join(tmpdir(), "same-page-l3-"));
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

// A trusted validator bound to BRK-001 whose environment is one
// command reading a file outside the repository and one file inside it,
// with a record at a clean commit.
function withEnvironment(p) {
  writeFileSync(join(p.home, "tool-version"), "tool 1.0\n");
  validator(p, "envv", ["true"], [{ command: ["cat", join(p.home, "tool-version")] }, { file: "tool.lock" }]);
  bind(p, "BRK-001", "envv");
  const sha = commit(p, "validator");
  run(["trust", "envv"], p);
  const r = run(["run"], p);
  return { sha, run: r };
}

test("a validator declares its environment; without the declaration it produces no record; the fingerprint holds exactly the declared inputs; drift outside them is residual risk (ENG-150, ENG-151, ENG-152)", () => {
  const p = project();
  validatorFile(p, "bare", 'kind: test\ncommand:\n  - "true"\n');
  bind(p, "BRK-001", "bare");
  const bare = run(["run", "bare", "--as-developer"], p);
  expect(bare.stdout).toContain("no environment declaration; environment declares the inputs the result depends on");
  expect(bare.stdout).toContain("(ENG-150)");
  expect(bare.stdout).toContain("0 validator(s) executed, 0 record(s) written");
  expect(records(p, "BRK-001")).toEqual([]);
  // Malformed declarations are findings, not guesses.
  validatorFile(p, "bad1", 'kind: test\ncommand:\n  - "true"\nenvironment: PATH\n');
  validatorFile(p, "bad2", 'kind: test\ncommand:\n  - "true"\nenvironment:\n  - variable: PATH\n');
  const bad = run(["run", "bad1", "bad2", "--as-developer"], p);
  expect(bad.stdout).toContain("environment must be a list");
  expect(bad.stdout).toContain("unknown environment input key variable");
  // Declared inputs are recorded, and nothing else.
  const { run: r } = withEnvironment(p);
  expect(r.stdout).toContain("ran envv: pass (exit 0) under trust-record; 1 record(s) at git:");
  expect(r.stdout).toContain(`environment command cat ${join(p.home, "tool-version")} = tool 1.0, file tool.lock = sha256:`);
  const [rec] = records(p, "BRK-001");
  expect(rec.identity.environment.map((e) => e.input)).toEqual([`command cat ${join(p.home, "tool-version")}`, "file tool.lock"]);
  expect(rec.identity.environment[0].value).toBe("tool 1.0");
  expect(rec.identity.environment[1].value).toMatch(/^sha256:/);
  expect(rec.identity.environment.every((e) => e.error === null)).toBe(true);
  expect(JSON.stringify(rec.identity)).not.toMatch(/PATH|HOME|platform|arch/);
  expect(rec.boundary.environment).toEqual([`command cat ${join(p.home, "tool-version")}`, "file tool.lock"]);
  expect(rec.residual_risk.some((x) => x.startsWith("environment drift outside the declared inputs (command cat"))).toBe(true);
  const e = entry(run(["verify"], p).stdout, "BRK-001");
  expect(e).toContain("BRK-001  SUFFICIENT");
  expect(e).toContain(`Environment: envv: command cat ${join(p.home, "tool-version")} = tool 1.0, file tool.lock = sha256:`);
  expect(e).toContain("Residual risk: inputs outside the repository root");
  expect(e).toContain("environment drift outside the declared inputs");
  // An empty declaration is explicit: no inputs, and the residual risk says so.
  validator(p, "none", ["true"], []);
  bind(p, "BRK-003", "none");
  run(["run", "none", "--as-developer"], p);
  const [none] = records(p, "BRK-003");
  expect(none.identity.environment).toEqual([]);
  expect(none.residual_risk).toContain("environment drift: no environment inputs are declared, so no drift is detected");
});

test("every record stores its identity inputs as one block; a record lacking one is refused; policy is never among them (ENG-141, ENG-143)", () => {
  const p = project();
  const { sha } = withEnvironment(p);
  const [rec] = records(p, "BRK-001");
  expect(Object.keys(rec.identity).sort()).toEqual(["adapter", "adapter_version", "contracts", "dependency_fingerprint", "environment", "falsifier_digest", "obligation_digest", "requirement", "requirement_digest", "snapshot", "validator_digest"]);
  expect(rec.identity.snapshot).toBe(`git:${sha}`);
  expect(rec.identity.dependency_fingerprint).toBe(`git:${sha}`);
  expect(rec.identity.requirement).toBe("BRK-001");
  expect(rec.identity.requirement_digest).toMatch(/^sha256:/);
  expect(rec.identity.falsifier_digest).toMatch(/^sha256:/);
  expect(rec.identity.obligation_digest).toMatch(/^sha256:/);
  expect(rec.identity.validator_digest).toMatch(/^sha256:/);
  expect(rec.identity.adapter).toBe("command");
  expect(rec.identity.adapter_version).toBe("2");
  expect(rec.identity.contracts).toEqual([]);
  for (const k of ["policy", "profile", "required"]) expect(rec.identity[k]).toBeUndefined();
  // A record without the obligation digest is not evidence.
  editRecord(p, "BRK-001", (t) => t.replace(/^  obligation_digest: .*\n/m, ""));
  let v = run(["verify"], p);
  expect(v.stdout).toContain("record identity lacks input(s): obligation_digest (ENG-141)");
  expect(entry(v.stdout, "BRK-001")).toContain("BRK-001  INSUFFICIENT");
  expect(entry(v.stdout, "BRK-001")).toContain("Evidence:    none");
  // A record whose identity names a profile is refused.
  run(["run"], p);
  editRecord(p, "BRK-001", (t) => t.replace("  contracts: []\n", "  contracts: []\n  profile: default\n"));
  v = run(["verify"], p);
  expect(v.stdout).toContain("record identity carries policy (profile); policy is never an identity input (ENG-143)");
});

test("any identity input that differs ends current: environment, validator definition, obligation, adapter version, requirement text (ENG-140, ENG-142)", () => {
  const p = project();
  const { sha } = withEnvironment(p);
  expect(entry(run(["verify"], p).stdout, "BRK-001")).toContain("BRK-001  SUFFICIENT");
  // Environment drift outside the repository: the snapshot is unchanged, the record is stale.
  writeFileSync(join(p.home, "tool-version"), "tool 2.0\n");
  let e = entry(run(["verify"], p).stdout, "BRK-001");
  expect(e).toContain("BRK-001  INSUFFICIENT");
  expect(e).toContain(`Reason:      evidence is stale: environment input command cat ${join(p.home, "tool-version")} changed: tool 1.0 -> tool 2.0; run \`same-page run envv\` at this snapshot`);
  expect(e).toContain(`Authority:   local @ git:${sha}`);
  writeFileSync(join(p.home, "tool-version"), "tool 1.0\n");
  expect(entry(run(["verify"], p).stdout, "BRK-001")).toContain("BRK-001  SUFFICIENT");
  // The declared file inside the repository: stale by the file and by the snapshot.
  writeFileSync(join(p.root, "tool.lock"), "tool 1.1\n");
  e = entry(run(["verify"], p).stdout, "BRK-001");
  expect(e).toContain("BRK-001  INSUFFICIENT");
  expect(e).toContain("environment input file tool.lock changed: sha256:");
  writeFileSync(join(p.root, "tool.lock"), "tool 1.0\n");
  // The validator definition.
  validator(p, "envv", ["true"], [{ command: ["cat", join(p.home, "tool-version")] }, { file: "tool.lock" }], "timeout: 30\n");
  e = entry(run(["verify"], p).stdout, "BRK-001");
  expect(e).toContain("BRK-001  INSUFFICIENT");
  expect(e).toContain("(stale: validator envv definition changed;");
  validator(p, "envv", ["true"], [{ command: ["cat", join(p.home, "tool-version")] }, { file: "tool.lock" }]);
  expect(entry(run(["verify"], p).stdout, "BRK-001")).toContain("BRK-001  SUFFICIENT");
  // The obligation's validator names.
  validator(p, "other", ["true"], []);
  bind(p, "BRK-001", "other");
  e = entry(run(["verify"], p).stdout, "BRK-001");
  expect(e).toContain("BRK-001  INSUFFICIENT");
  expect(e).toContain("the obligation changed since the record (locator, keyword, or validator names)");
  // The adapter version.
  const q = project();
  withEnvironment(q);
  editRecord(q, "BRK-001", (t) => t.replace('  adapter_version: "2"', '  adapter_version: "1"'));
  e = entry(run(["verify"], q).stdout, "BRK-001");
  expect(e).toContain("BRK-001  INSUFFICIENT");
  expect(e).toContain("adapter command was version 1, now 2");
  // The requirement text: the obligation is invalid until elaboration, then the record is stale for the prior text.
  const r = project();
  withEnvironment(r);
  writeFileSync(join(r.specs, "01-broker.md"), DOMAIN.replace("the broker MUST log the request", "the broker MUST log the full request"));
  expect(entry(run(["verify"], r).stdout, "BRK-001")).toContain("BRK-001  BLOCKED");
  run(["elaborate"], r);
  e = entry(run(["verify"], r).stdout, "BRK-001");
  expect(e).toContain("BRK-001  INSUFFICIENT");
  expect(e).toContain("recorded for a prior requirement or falsifier text");
});

test("a policy change re-evaluates current evidence under the new profile and never stales it (ENG-144, ENG-145)", () => {
  const p = project();
  withEnvironment(p);
  expect(entry(run(["verify"], p).stdout, "BRK-001")).toContain("BRK-001  SUFFICIENT");
  setDefaultAny(p, ["property"]);
  run(["elaborate"], p);
  let e = entry(run(["verify"], p).stdout, "BRK-001");
  expect(e).toContain("BRK-001  INSUFFICIENT");
  expect(e).toContain("Required:    any of property; current freshness");
  expect(e).toContain("Evidence:    test envv pass (current;");
  expect(e).toContain("Freshness:   current");
  expect(e).not.toContain("stale");
  expect(e).not.toContain("unknown");
  // Back to a profile the evidence satisfies: incomparable with the last one, so confirmed, then SUFFICIENT on the same record.
  setDefaultAny(p, ["test"]);
  run(["elaborate"], p);
  run(["policy", "confirm"], p);
  e = entry(run(["verify"], p).stdout, "BRK-001");
  expect(e).toContain("BRK-001  SUFFICIENT");
  expect(e).toContain("Freshness:   current");
  expect(records(p, "BRK-001").length).toBe(1);
});

test("the dependency scope comes from the chain, first step that succeeds, recorded with no narrowing; nothing hand-declared or traced decides freshness (ENG-122, ENG-123, ENG-124, ENG-125, ENG-128, ENG-129)", () => {
  const p = project();
  // A file or symbol list on a definition or an obligation is not a field.
  validator(p, "listed", ["true"], [], "files:\n  - src.txt\n");
  bind(p, "BRK-003", "listed");
  const l = run(["run", "listed", "--as-developer"], p);
  expect(l.stdout).toContain("unknown field files (ENG-161)");
  expect(records(p, "BRK-003")).toEqual([]);
  const ob = join(p.root, ".same-page", "obligations", "BRK-003.yaml");
  writeFileSync(ob, readFileSync(ob, "utf8") + "depends_on:\n  - src.txt\n");
  expect(run(["verify"], p).stdout).toContain("unknown field depends_on (ENG-015)");
  writeFileSync(ob, readFileSync(ob, "utf8").replace("depends_on:\n  - src.txt\n", ""));
  // A validator that reads one file is still invalidated by a change to another: the repository is the graph.
  writeFileSync(join(p.root, "a.txt"), "a\n");
  writeFileSync(join(p.root, "b.txt"), "b\n");
  validator(p, "reads-a", ["cat", "a.txt"], []);
  bind(p, "BRK-001", "reads-a");
  commit(p, "two files");
  run(["trust", "reads-a"], p);
  run(["run", "reads-a"], p);
  const [rec] = records(p, "BRK-001");
  expect(rec.dependency).toEqual({
    scope: "repository",
    step: 3,
    chain: [
      { step: 1, mechanism: "trusted adapter dependency closure", outcome: "no mechanism" },
      { step: 2, mechanism: "package or service boundary", outcome: "no mechanism" },
      { step: 3, mechanism: "repository boundary", outcome: `established: ${rec.identity.snapshot}` },
    ],
    narrowing: "none",
  });
  expect(rec.dependency_provenance).toBe("conservative");
  expect(entry(run(["verify"], p).stdout, "BRK-001")).toContain("BRK-001  SUFFICIENT");
  writeFileSync(join(p.root, "b.txt"), "b2\n");
  let e = entry(run(["verify"], p).stdout, "BRK-001");
  expect(e).toContain("BRK-001  INSUFFICIENT");
  expect(e).toContain("Freshness:   stale");
  expect(e).toContain("Dependency:  repository via chain step 3 (1 trusted adapter dependency closure: no mechanism; 2 package or service boundary: no mechanism; 3 repository boundary: established: git:");
  expect(e).toContain("narrowing: none");
  writeFileSync(join(p.root, "b.txt"), "b\n");
  // A record claiming a narrower scope with no mechanism, or a narrowing act, is refused.
  editRecord(p, "BRK-001", (t) => t.replace("  scope: repository\n  step: 3", "  scope: package\n  step: 3"));
  let v = run(["verify"], p);
  expect(v.stdout).toContain("dependency scope package is narrower than the repository and no registered mechanism established its completeness; the conservative floor is the repository (ENG-128)");
  expect(entry(v.stdout, "BRK-001")).toContain("Evidence:    none");
  run(["run", "reads-a"], p);
  editRecord(p, "BRK-001", (t) => t.replace("  narrowing: none", "  narrowing: symbols"));
  v = run(["verify"], p);
  expect(v.stdout).toContain("dependency narrowing symbols names no reviewable narrowing act");
  expect(v.stdout).toContain("(ENG-129)");
});

test("the boundary is a recorded structure and every entry states the residual risk outside it; nothing outside is claimed (ENG-130, ENG-132, ENG-133)", () => {
  const p = project();
  withEnvironment(p);
  const [rec] = records(p, "BRK-001");
  expect(rec.boundary).toEqual({ scope: "repository", root: p.root, validator: "envv", environment: [`command cat ${join(p.home, "tool-version")}`, "file tool.lock"] });
  expect(rec.assumptions).toEqual(["the declared environment inputs are the inputs that decide this validator's result"]);
  expect(rec.residual_risk).toEqual([
    "inputs outside the repository root: system packages, services, the network, and anything the snapshot does not contain",
    `environment drift outside the declared inputs (command cat ${join(p.home, "tool-version")}, file tool.lock)`,
  ]);
  const e = entry(run(["verify"], p).stdout, "BRK-001");
  expect(e).toContain(`Boundary:    repository at ${p.root}; envv (sha256:`);
  expect(e).toContain(`environment inputs: command cat ${join(p.home, "tool-version")}, file tool.lock`);
  expect(e).toContain("Residual risk: inputs outside the repository root: system packages, services, the network, and anything the snapshot does not contain; environment drift outside the declared inputs");
  expect(e).not.toMatch(/environment (is )?unchanged|environment tracked|everything tracked/);
  // A record with no boundary is refused.
  editRecord(p, "BRK-001", (t) => t.replace(/^boundary:\n(?:  .*\n)+/m, ""));
  const v = run(["verify"], p);
  expect(v.stdout).toContain("record has no recorded verification boundary (ENG-130)");
  expect(entry(v.stdout, "BRK-001")).toContain("Residual risk: everything; no evidence is inside any boundary");
});

test("when no chain step succeeds freshness is unknown, and unknown is BLOCKED while stale is INSUFFICIENT (ENG-084, ENG-085, ENG-121, ENG-126)", () => {
  // A tree without git whose directory the engine cannot read: git
  // establishes nothing, the walk cannot complete, no snapshot exists.
  const p = layout(false);
  mkdirSync(join(p.root, "locked"));
  writeFileSync(join(p.root, "locked", "f.txt"), "x\n");
  validator(p, "ok", ["true"], []);
  bind(p, "BRK-001", "ok");
  chmodSync(join(p.root, "locked"), 0o000);
  try {
    const r = run(["run", "ok", "--as-developer"], p);
    expect(r.stdout).toContain("the repository snapshot cannot be computed");
    expect(r.stdout).toContain("(ENG-126)");
    expect(r.stdout).toContain("1 record(s) at unknown (no snapshot)");
    const [rec] = records(p, "BRK-001");
    expect(rec.freshness).toBe("unknown");
    expect(rec.identity.snapshot).toBeNull();
    expect(rec.identity.dependency_fingerprint).toBeNull();
    expect(rec.dependency.scope).toBe("unknown");
    expect(rec.dependency.step).toBe(4);
    expect(rec.dependency.chain[3]).toEqual({ step: 4, mechanism: "none", outcome: "freshness unknown" });
    expect(rec.boundary.scope).toBe("unknown");
    expect(rec.residual_risk[0]).toBe("no dependency scope was established; nothing is inside a boundary");
    let v = run(["verify"], p);
    let e = entry(v.stdout, "BRK-001");
    expect(e).toContain("BRK-001  BLOCKED");
    expect(e).toContain("Reason:      freshness cannot be established: recorded with no snapshot: no chain step established a boundary at run time");
    expect(e).toContain("Freshness:   unknown");
    expect(e).toContain("Authority:   local @ unknown (no snapshot)");
    expect(v.stdout).toContain("(ENG-126)");
  } finally {
    chmodSync(join(p.root, "locked"), 0o755);
  }
  // Readable again: the old record stays unknown forever; a new run is current.
  let e = entry(run(["verify"], p).stdout, "BRK-001");
  expect(e).toContain("BRK-001  BLOCKED");
  expect(e).toContain("recorded with no snapshot");
  run(["run", "ok", "--as-developer"], p);
  e = entry(run(["verify"], p).stdout, "BRK-001");
  expect(e).toContain("BRK-001  SUFFICIENT");
  expect(e).toContain("Authority:   local @ workspace:");
  // An environment input that cannot be computed is unknown: BLOCKED with the reason.
  const q = project();
  validator(q, "notool", ["true"], [{ command: ["/nonexistent/tool", "--version"] }]);
  bind(q, "BRK-001", "notool");
  const r = run(["run", "notool", "--as-developer"], q);
  expect(r.stdout).toContain("environment input command /nonexistent/tool --version cannot be computed (");
  expect(r.stdout).toContain("(ENG-126)");
  const [nrec] = records(q, "BRK-001");
  expect(nrec.freshness).toBe("unknown");
  expect(nrec.identity.environment[0].value).toBeNull();
  expect(nrec.identity.environment[0].error).not.toBeNull();
  e = entry(run(["verify"], q).stdout, "BRK-001");
  expect(e).toContain("BRK-001  BLOCKED");
  expect(e).toContain("Reason:      freshness cannot be established: environment input command /nonexistent/tool --version was not computed at run time (");
  // A source edit is a known difference: stale, INSUFFICIENT, never BLOCKED.
  const s = project();
  withEnvironment(s);
  writeFileSync(join(s.root, "src.txt"), "source v2\n");
  e = entry(run(["verify"], s).stdout, "BRK-001");
  expect(e).toContain("BRK-001  INSUFFICIENT");
  expect(e).not.toContain("BLOCKED");
  expect(e).toContain("Freshness:   stale");
  expect(e).toContain("Reason:      evidence is stale: recorded at git:");
  expect(e).toContain("run `same-page run envv` at this snapshot");
});

test("a standing disproof on stale evidence stays standing, and manual evidence carries the same identity block (ENG-111, ENG-141, ENG-180)", () => {
  const p = project();
  validator(p, "fail", ["false"], []);
  bind(p, "BRK-003", "fail");
  commit(p, "validator");
  run(["trust", "fail"], p);
  run(["run"], p);
  expect(entry(run(["verify"], p).stdout, "BRK-003")).toContain("BRK-003  FAILING");
  writeFileSync(join(p.root, "src.txt"), "source v2\n");
  const e = entry(run(["verify"], p).stdout, "BRK-003");
  expect(e).toContain("BRK-003  INSUFFICIENT");
  expect(e).toContain("test fail fail (stale: recorded at git:");
  expect(e).toContain("Standing disproof: FAILING at git:");
  // Manual evidence: the manual adapter, no validator, no environment inputs, the same chain.
  run(["attest", "BRK-001", "--by", "Dev", "--expires", "2099-01-01", "--description", "sent a request and read the log", "--addresses-falsifier"], p);
  const [m] = records(p, "BRK-001");
  expect(m.identity.adapter).toBe("manual");
  expect(m.identity.adapter_version).toBe("2");
  expect(m.identity.validator_digest).toBeNull();
  expect(m.identity.environment).toEqual([]);
  expect(m.identity.snapshot).toMatch(/^workspace:/);
  expect(m.boundary).toEqual({ scope: "repository", root: p.root, validator: null, environment: [] });
  expect(m.dependency.scope).toBe("repository");
  expect(m.residual_risk).toContain("environment drift: manual evidence declares no environment inputs, so no drift is detected");
  const me = entry(run(["verify"], p).stdout, "BRK-001");
  expect(me).toContain("BRK-001  SUFFICIENT");
  expect(me).toContain("Environment: none recorded (manual evidence)");
  expect(me).toContain("Residual risk: inputs outside the repository root");
});

test("verify runs a declared environment command only under the validator's trust grant or --as-developer; otherwise the input is unknown (ENG-059, ENG-126)", () => {
  const p = project();
  withEnvironment(p);
  expect(entry(run(["verify"], p).stdout, "BRK-001")).toContain("BRK-001  SUFFICIENT");
  // The grant is gone: the file digest is still read, the command is not run.
  rmSync(join(p.home, "trust.yaml"));
  let e = entry(run(["verify"], p).stdout, "BRK-001");
  expect(e).toContain("BRK-001  BLOCKED");
  expect(e).toContain(`Reason:      freshness cannot be established: environment input command cat ${join(p.home, "tool-version")} cannot be computed now (not run: envv holds no execution trust at its current definition; run \`same-page trust envv\` or \`same-page verify --as-developer\`)`);
  expect(e).not.toContain("file tool.lock cannot be computed");
  e = entry(run(["verify", "--as-developer"], p).stdout, "BRK-001");
  expect(e).toContain("BRK-001  SUFFICIENT");
  run(["trust", "envv"], p);
  expect(entry(run(["verify"], p).stdout, "BRK-001")).toContain("BRK-001  SUFFICIENT");
});
