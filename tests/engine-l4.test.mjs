import { test, expect } from "bun:test";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseYaml } from "../skills/new-project/scripts/engine/yaml.ts";

// Same Page Conformance, layer L4 (iteration 005): verification
// authority and map comparison. The policy names whose evidence counts
// (ci, local, or a named environment), the default follows the
// repository's CI configuration, evidence of another authority is shown
// and never passes, each authority's evidence lives in its own place,
// and `verify` compares its machine view of coverage with the evidence
// map while `sync-map` is the one engine write to it. Each test names
// the requirement whose falsifier state it produces. The engine is
// exercised through its command line.

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
  const base = mkdtempSync(join(tmpdir(), "same-page-l4-"));
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


function setPolicy(p, fn) {
  writeFileSync(policy(p), fn(readFileSync(policy(p), "utf8")));
}

function ciConfig(p) {
  mkdirSync(join(p.root, ".github", "workflows"), { recursive: true });
  writeFileSync(join(p.root, ".github", "workflows", "ci.yml"), "name: ci\non: [push]\njobs: {}\n");
}

function recordFilesUnder(p, rel, id) {
  const dir = join(p.root, rel, id);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((n) => n.endsWith(".yaml")).sort().map((n) => join(dir, n));
}

function mapPath(p) {
  return join(p.specs, "conformance.md");
}

const MAP_HEAD = "# Evidence map\n\nOne row per Agreed identifier. Prose the engine never touches.\n\n## BRK\n\n| Requirement | Coverage | Method | Evidence |\n|---|---|---|---|\n";

test("the policy names the authority, a value outside the three is a finding, and the default follows the CI configuration (ENG-156, ENG-157, ENG-158)", () => {
  const p = project();
  expect(readFileSync(policy(p), "utf8")).toContain("authority: local\n");
  expect(run(["verify"], p).stdout).toContain("authority local (policy) @ git:");
  setPolicy(p, (t) => t.replace("authority: local\n", "authority: jenkins-box\n"));
  let v = run(["verify"], p);
  expect(v.stdout).toContain("authority must be one of ci, local, named-environment (ENG-156)");
  expect(v.stdout).toContain("finding(s) in the policy file");
  expect(v.stdout).not.toContain("BRK-001  ");
  expect(v.status).toBe(1);
  setPolicy(p, (t) => t.replace("authority: jenkins-box\n", "authority: named-environment\n"));
  expect(run(["verify"], p).stdout).toContain("a named-environment authority needs authority_name (ENG-156)");
  // No authority key: the default rule of ENG-157.
  setPolicy(p, (t) => t.replace("authority: named-environment\n", ""));
  v = run(["verify"], p);
  expect(v.stdout).toContain("Authority:   local @ git:");
  expect(v.stdout).toContain("authority local (default: no CI configuration) @");
  ciConfig(p);
  v = run(["verify"], p);
  expect(v.stdout).toContain("Authority:   ci @ workspace:");
  expect(v.stdout).toContain("authority ci (default: CI configuration at .github/workflows) @");
  // The first elaborate writes the default explicitly (no CI configuration: local).
  const fresh = layout(false);
  expect(readFileSync(policy(fresh), "utf8")).toContain("authority: local\n");
});

test("the first elaborate under CI configuration writes authority ci (ENG-157)", () => {
  const base = mkdtempSync(join(tmpdir(), "same-page-l4-ci-"));
  const root = join(base, "repo");
  mkdirSync(join(root, "docs", "specs", "proj"), { recursive: true });
  writeFileSync(join(root, "docs", "specs", "proj", "00-overview.md"), OVERVIEW);
  writeFileSync(join(root, "docs", "specs", "proj", "01-broker.md"), DOMAIN);
  const p = { root, home: join(base, "home"), specs: join(root, "docs", "specs", "proj") };
  mkdirSync(p.home);
  ciConfig(p);
  const r = run(["elaborate"], p, { SAME_PAGE_SPECS_DIR: "" });
  expect(r.stdout).toContain("authority ci, CI configuration at .github/workflows");
  expect(readFileSync(policy(p), "utf8")).toContain("authority: ci\n");
  expect(run(["verify"], p).stdout).toContain("Authority:   ci @");
});

test("only evidence of the configured authority at its exact snapshot counts; other evidence is shown with its authority, never passes, and lives only in its own place (ENG-155, ENG-159, ENG-160, ENG-194)", () => {
  const p = project();
  ciConfig(p);
  setPolicy(p, (t) => t.replace("authority: local\n", "authority: ci\n"));
  validator(p, "ok", ["true"], []);
  validator(p, "fail", ["false"], []);
  bind(p, "BRK-001", "ok");
  const sha = commit(p, "ci config and validators");
  run(["trust", "ok"], p);
  // A local run under ci authority: current locally, not authoritative.
  expect(run(["run"], p).stdout).toContain("under trust-record; 1 record(s) at git:" + sha + ", authority local");
  let e = entry(run(["verify"], p).stdout, "BRK-001");
  expect(e).toContain("BRK-001  INSUFFICIENT");
  expect(e).toContain("Reason:      current under local; not yet established by authoritative ci");
  expect(e).toContain("test ok pass (current; authority local, non-authoritative; binding none;");
  expect(e).toContain("Authority:   ci @ git:" + sha);
  // The same validator in CI: an artifact under its own directory, authoritative.
  const ci = run(["run"], p, { CI: "true", GITHUB_ACTIONS: "true", GITHUB_REPOSITORY: "acme/proj", GITHUB_RUN_ID: "77" });
  expect(ci.stdout).toContain("under ci; 1 record(s) at git:" + sha + ", authority ci");
  expect(recordFilesUnder(p, ".same-page/artifacts/ci", "BRK-001").length).toBe(1);
  expect(recordFilesUnder(p, ".same-page/evidence", "BRK-001").length).toBe(1);
  const [ciRec] = recordFilesUnder(p, ".same-page/artifacts/ci", "BRK-001").map((f) => parseYaml(readFileSync(f, "utf8")));
  expect(ciRec.authority).toBe("ci");
  expect(ciRec.execution_trust).toEqual({ context: "ci", actor: "github-actions acme/proj run 77" });
  expect(ciRec.run.startsWith(".same-page/artifacts/ci/runs/")).toBe(true);
  e = entry(run(["verify"], p).stdout, "BRK-001");
  expect(e).toContain("BRK-001  SUFFICIENT");
  expect(e).toContain("authority local, non-authoritative");
  expect(e).toContain("test ok pass (current; binding none;");
  // ENG-155: the CI record is authoritative for its snapshot only.
  writeFileSync(join(p.root, "src.txt"), "source v2\n");
  e = entry(run(["verify"], p).stdout, "BRK-001");
  expect(e).toContain("BRK-001  INSUFFICIENT");
  expect(e).toContain("evidence is stale: recorded at git:" + sha + ", current snapshot workspace:");
  writeFileSync(join(p.root, "src.txt"), "source v1\n");
  // ENG-194: a record stored where another authority's evidence is read is refused.
  const [localFile] = recordFilesUnder(p, ".same-page/evidence", "BRK-001");
  mkdirSync(join(p.root, ".same-page", "artifacts", "ci", "BRK-003"), { recursive: true });
  copyFileSync(localFile, join(p.root, ".same-page", "artifacts", "ci", "BRK-003", "copied-local.yaml"));
  const [ciFile] = recordFilesUnder(p, ".same-page/artifacts/ci", "BRK-001");
  mkdirSync(join(p.root, ".same-page", "evidence", "BRK-003"), { recursive: true });
  copyFileSync(ciFile, join(p.root, ".same-page", "evidence", "BRK-003", "copied-ci.yaml"));
  let v = run(["verify"], p);
  expect(v.stdout).toContain("record states authority local but lies where ci evidence is read");
  expect(v.stdout).toContain("record states authority ci but lies where local evidence is read");
  expect(v.stdout).toContain("(ENG-194)");
  expect(entry(v.stdout, "BRK-003")).toContain("Evidence:    none");
  expect(entry(v.stdout, "BRK-003")).not.toContain("BRK-003  SUFFICIENT");
  // A current failing result of any authority is FAILING.
  bind(p, "BRK-003", "fail");
  run(["trust", "fail"], p);
  run(["run", "fail"], p);
  const f = entry(run(["verify"], p).stdout, "BRK-003");
  expect(f).toContain("BRK-003  FAILING");
  expect(f).toContain("; authority local)");
  // CI set with no CI configuration anchors nothing.
  const q = project();
  validator(q, "ok", ["true"], []);
  bind(q, "BRK-001", "ok");
  const noCi = run(["run"], q, { CI: "true" });
  expect(noCi.stdout).toContain("CI is set in the environment but the repository carries no CI configuration at a recognized path");
  expect(noCi.stdout).toContain("(ENG-060)");
  expect(noCi.status).toBe(1);
  expect(recordFilesUnder(q, ".same-page/artifacts/ci", "BRK-001")).toEqual([]);
  expect(recordFilesUnder(q, ".same-page/evidence", "BRK-001")).toEqual([]);
});

test("a named environment is trusted outside the repository, writes its own artifact, and is authoritative only when configured (ENG-060, ENG-156, ENG-160)", () => {
  const p = project();
  validator(p, "ok", ["true"], []);
  bind(p, "BRK-001", "ok");
  const missing = run(["run", "--environment", "rig"], p);
  expect(missing.stdout).toContain("environment rig is not trusted for this repository; run `same-page trust --environment rig`");
  expect(missing.stdout).toContain("(ENG-058)");
  expect(missing.status).toBe(1);
  const t = run(["trust", "--environment", "rig"], p);
  expect(t.stdout).toContain("trusted environment rig for");
  expect(readFileSync(join(p.home, "trust.yaml"), "utf8")).toContain("environment: rig");
  expect(readdirSync(p.root).some((n) => n.includes("trust"))).toBe(false);
  const r = run(["run", "--environment", "rig"], p);
  expect(r.stdout).toContain("under named-environment; 1 record(s) at git:");
  expect(r.stdout).toContain("authority named-environment rig");
  const [rec] = recordFilesUnder(p, ".same-page/artifacts/environments/rig", "BRK-001").map((f) => parseYaml(readFileSync(f, "utf8")));
  expect(rec.authority).toBe("named-environment");
  expect(rec.authority_name).toBe("rig");
  expect(rec.execution_trust.context).toBe("named-environment");
  expect(rec.execution_trust.actor).toBe("rig (Fixture Dev <dev@example.test>)");
  let e = entry(run(["verify"], p).stdout, "BRK-001");
  expect(e).toContain("BRK-001  INSUFFICIENT");
  expect(e).toContain("Reason:      current under named-environment rig; not yet established by authoritative local");
  expect(e).toContain("authority named-environment rig, non-authoritative");
  setPolicy(p, (t) => t.replace("authority: local\n", "authority: named-environment\nauthority_name: rig\n"));
  e = entry(run(["verify"], p).stdout, "BRK-001");
  expect(e).toContain("BRK-001  SUFFICIENT");
  expect(e).toContain("Authority:   named-environment rig @ git:");
  setPolicy(p, (t) => t.replace("authority_name: rig\n", "authority_name: other\n"));
  e = entry(run(["verify"], p).stdout, "BRK-001");
  expect(e).toContain("BRK-001  INSUFFICIENT");
  expect(e).toContain("not yet established by authoritative named-environment other");
});

test("verify compares the machine view with the map and names every disagreeing row; sync-map is the one engine write and touches nothing else (ENG-195, ENG-196, ENG-197, ENG-198, ENG-199, ENG-200)", () => {
  const p = project();
  validator(p, "ok", ["true"], []);
  bind(p, "BRK-001", "ok");
  run(["trust", "ok"], p);
  run(["run"], p);
  expect(run(["verify"], p).stdout).toContain("no evidence map under the spec directories");
  const rows = "| BRK-001 | Covered | test | tests/broker.test.mjs |\n| BRK-003 | Covered | test | tests/broker.test.mjs |\n";
  const tail = "\nProse after the table, with a | pipe | that is not a row.\n";
  writeFileSync(mapPath(p), MAP_HEAD + rows + tail);
  let v = run(["verify"], p);
  expect(v.stdout).toContain("docs/specs/proj/conformance.md:10\n  BRK-003: map says Covered by test; machine view: no evidence record; run `same-page sync-map` to write the machine view, or correct the map (ENG-199)");
  expect(v.stdout).not.toContain("BRK-001: map says");
  expect(v.stdout).toContain("1 map disagreement(s) with docs/specs/proj/conformance.md");
  expect(v.status).toBe(1);
  expect(readFileSync(mapPath(p), "utf8")).toBe(MAP_HEAD + rows + tail);
  // A method the machine view does not hold, a missing row, and Asserted against no records.
  writeFileSync(mapPath(p), MAP_HEAD + "| BRK-003 | Asserted | inspected | src.txt |\n" + tail);
  v = run(["verify"], p);
  expect(v.stdout).toContain("BRK-001: no map row; machine view: Covered by test (ok)");
  expect(v.stdout).not.toContain("BRK-003:");
  writeFileSync(mapPath(p), MAP_HEAD + "| BRK-001 | Covered | property | tests/broker.test.mjs |\n| BRK-003 | Uncovered | - |  |\n" + tail);
  v = run(["verify"], p);
  expect(v.stdout).toContain("BRK-001: map says Covered by property; machine view: Covered by test (ok)");
  expect(v.stdout).toContain("1 map disagreement(s)");
  // sync-map rewrites that row, keeps the citation, and leaves every other byte.
  let s = run(["sync-map"], p);
  expect(s.stdout).toContain("BRK-001: Covered property -> Covered test (tests/broker.test.mjs)");
  expect(s.stdout).toContain("same-page sync-map: 1 row(s) rewritten, 0 row(s) added, 0 finding(s)");
  expect(s.status).toBe(0);
  expect(readFileSync(mapPath(p), "utf8")).toBe(MAP_HEAD + "| BRK-001 | Covered | test | tests/broker.test.mjs |\n| BRK-003 | Uncovered | - |  |\n" + tail);
  expect(run(["verify"], p).stdout).toContain("0 map disagreement(s)");
  expect(run(["sync-map"], p).stdout).toContain("0 row(s) rewritten, 0 row(s) added");
  // A missing row is added in identifier order with the validator definition as its citation; a false Covered goes Uncovered.
  writeFileSync(mapPath(p), MAP_HEAD + "| BRK-003 | Covered | test | tests/broker.test.mjs |\n" + tail);
  s = run(["sync-map"], p);
  expect(s.stdout).toContain("BRK-001: no row -> Covered test (.same-page/validators/ok.yaml)");
  expect(s.stdout).toContain("BRK-003: Covered test -> Uncovered -");
  expect(s.stdout).toContain("1 row(s) rewritten, 1 row(s) added");
  const after = readFileSync(mapPath(p), "utf8");
  expect(after).toBe(MAP_HEAD + "| BRK-001 | Covered | test | .same-page/validators/ok.yaml |\n| BRK-003 | Uncovered | - |  |\n" + tail);
  expect(after).not.toMatch(/current|stale|SUFFICIENT|BLOCKED|FAILING/);
  // Manual evidence that addressed the falsifier is Covered by manual, cited by its bound surface.
  run(["attest", "BRK-003", "--by", "Dev", "--expires", "2099-01-01", "--description", "served an error and watched the cache", "--bindings", "src.txt", "--addresses-falsifier"], p);
  expect(run(["verify"], p).stdout).toContain("BRK-003: map says Uncovered; machine view: Covered by manual (manual by Dev)");
  run(["sync-map"], p);
  expect(readFileSync(mapPath(p), "utf8")).toContain("| BRK-003 | Covered | manual | src.txt |");
  // A failing record still counts as coverage: the mechanism exists.
  validator(p, "fail", ["false"], []);
  bind(p, "BRK-001", "fail");
  run(["trust", "fail"], p);
  run(["run", "fail"], p);
  expect(run(["verify"], p).stdout).toContain("0 map disagreement(s)");
});
