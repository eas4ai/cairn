import { test, expect } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseYaml } from "../skills/new-project/scripts/engine/yaml.ts";

// Every test here spawns the scripts or the engine as child
// processes, so a loaded machine makes them slow rather than wrong.
// The timeout is generous on purpose: a red suite must mean a defect.
const TEST_TIMEOUT = 120_000;

// Same Page Conformance, layer L6 (iteration 007): ecosystem adapters
// and sound narrowing. Every adapter is registered with explicit
// capabilities, outside the repository; a closure adapter the developer
// trusted narrows a record's boundary below the repository and records
// the narrowing as a reviewable act; a supplemental trace widens a
// record's identity and never narrows it; a formal result carries the
// correspondence assumption. Each test names the requirement whose
// falsifier state it produces. The engine is exercised through its
// command line.

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
  const base = mkdtempSync(join(tmpdir(), "same-page-l6-"));
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


function registry(p, text) {
  writeFileSync(join(p.home, "adapters.yaml"), text);
}

function validatorWith(p, name, body) {
  validatorFile(p, name, body);
}

// A project whose closure a real compiler establishes: two TypeScript
// modules, one imported by the other, and a third the program never
// reads.
function tsProject(p) {
  const dir = join(p.root, "src");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "main.ts"), 'import { value } from "./dep.ts";\nexport const out: string = value;\n');
  writeFileSync(join(dir, "dep.ts"), 'export const value: string = "one";\n');
  writeFileSync(join(dir, "unused.ts"), 'export const other: string = "other";\n');
  writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({ compilerOptions: { noEmit: true, allowImportingTsExtensions: true, types: [], skipLibCheck: true, strict: true }, files: ["main.ts"] }, null, 2) + "\n");
  writeFileSync(join(p.root, "README.md"), "outside the closure\n");
  validatorWith(
    p,
    "typecheck",
    ["kind: static", "command:", '  - "bunx"', '  - "tsc"', '  - "--noEmit"', '  - "-p"', '  - "src"', "environment: []", "closure:", "  adapter: tsc-closure", "  runner:", '    - "bunx"', '    - "tsc"', "  project: src", ""].join("\n")
  );
  bind(p, "BRK-001", "typecheck");
  commit(p, "typescript project");
  run(["trust", "typecheck"], p);
  return p;
}

test("an adapter is registered with explicit capabilities, outside the repository; without a registration or the capability nothing narrows (ENG-055, ENG-056)", () => {
  const p = project();
  validatorWith(p, "closes", ["kind: test", "command:", '  - "true"', "environment: []", "closure:", "  adapter: ghost", "  runner:", '    - "echo"', "  project: src", ""].join("\n"));
  bind(p, "BRK-001", "closes");
  let r = run(["run", "closes", "--as-developer"], p);
  expect(r.stdout).toContain("closure adapter ghost is not registered; register it in");
  expect(r.stdout).toContain("(ENG-055)");
  let rec = records(p, "BRK-001")[0];
  expect(rec.dependency.scope).toBe("repository");
  expect(rec.dependency.narrowing).toBe("none");
  // Registered, but without the capability: still no narrowing.
  registry(p, 'version: 1\nadapters:\n  - name: ghost\n    version: "1"\n    capabilities: []\n    command:\n      - "echo"\n');
  r = run(["run", "closes", "--as-developer"], p);
  expect(r.stdout).toContain("adapter ghost is registered without can_establish_complete_dependencies, so it cannot establish a closure; the conservative floor stands");
  expect(r.stdout).toContain("(ENG-056)");
  expect(records(p, "BRK-001")[1].dependency.scope).toBe("repository");
  // A registration that claims a capability outside the five is refused.
  registry(p, 'version: 1\nadapters:\n  - name: ghost\n    version: "1"\n    capabilities:\n      - can_do_anything\n');
  r = run(["run", "closes", "--as-developer"], p);
  expect(r.stdout).toContain("adapter ghost declares a capability outside can_establish_binding, can_establish_complete_dependencies, can_establish_challenge, can_establish_formal_result, can_establish_model_result");
  // A registration cannot replace a built-in adapter.
  registry(p, 'version: 1\nadapters:\n  - name: manual\n    version: "9"\n    capabilities:\n      - can_establish_binding\n');
  r = run(["run", "closes", "--as-developer"], p);
  expect(r.stdout).toContain("manual is a built-in adapter; a registration cannot replace it");
  expect(records(p, "BRK-001").every((x) => x.binding_basis !== "backend")).toBe(true);
}, TEST_TIMEOUT);

test("a repository cannot grant itself an adapter; the grant lives outside it and binds the version (ENG-061, ENG-064, ENG-065)", () => {
  const p = project();
  tsProject(p);
  // Registered and capable, but no grant: the floor stands, and the entry names the grant to write.
  let r = run(["run", "typecheck"], p);
  expect(r.stdout).toContain("adapter tsc-closure 1 is not trusted for this repository; run `same-page trust --adapter tsc-closure`. Until then the boundary stays the repository");
  expect(r.stdout).toContain("(ENG-064)");
  expect(records(p, "BRK-001")[0].dependency.scope).toBe("repository");
  // A repository-side marker grants nothing.
  writeFileSync(join(p.root, "TRUSTED-ADAPTERS"), "tsc-closure\n");
  r = run(["run", "typecheck"], p);
  expect(r.stdout).toContain("is not trusted for this repository");
  const t = run(["trust", "--adapter", "tsc-closure"], p);
  expect(t.stdout).toContain("trusted adapter tsc-closure 1 (can_establish_complete_dependencies) for");
  expect(readFileSync(join(p.home, "trust.yaml"), "utf8")).toContain("adapter: tsc-closure");
  expect(readdirSync(p.root).some((n) => n.includes("trust.yaml"))).toBe(false);
  expect(run(["trust", "--adapter", "nope"], p).status).toBe(2);
}, TEST_TIMEOUT);

test("a trusted closure adapter narrows the boundary below the repository, records the narrowing as a reviewable act, and binds the record to its inputs (ENG-124, ENG-127, ENG-128, ENG-129, ENG-131)", () => {
  const p = project();
  tsProject(p);
  run(["trust", "--adapter", "tsc-closure"], p);
  const r = run(["run", "typecheck"], p);
  expect(r.stdout).toContain("ran typecheck: pass");
  const rec = records(p, "BRK-001").at(-1);
  expect(rec.dependency.scope).toBe("package");
  expect(rec.dependency.step).toBe(1);
  expect(rec.dependency.chain[0].outcome).toContain("established: tsc-closure 1 over src");
  expect(rec.dependency.narrowing).toContain("tsc-closure 1 established a complete closure of");
  expect(rec.dependency.narrowing).toContain("trusted for this repository by Fixture Dev <dev@example.test>");
  expect(rec.dependency.inputs).toBeGreaterThan(1);
  expect(rec.dependency_provenance).toBe("adapter_derived");
  expect(rec.boundary.scope).toBe("package");
  expect(rec.boundary.project).toBe("src");
  expect(rec.identity.dependency_fingerprint).toMatch(/^sha256:/);
  expect(rec.identity.dependency_fingerprint).not.toBe(rec.identity.snapshot);
  let e = entry(run(["verify"], p).stdout, "BRK-001");
  expect(e).toContain("BRK-001  SUFFICIENT");
  expect(e).toContain("Boundary:    package src (");
  expect(e).toContain("Dependency:  package via chain step 1 (1 trusted adapter dependency closure: established: tsc-closure 1 over src");
  expect(e).toContain("narrowing: tsc-closure 1 established a complete closure of");
  expect(e).toContain("Residual risk: inputs outside the");
  expect(e).toContain("input closure the adapter established, and the assumption that the runner it drove is the tool it claims to be");
  // A change outside the closure leaves the narrowed record current.
  writeFileSync(join(p.root, "README.md"), "edited outside the closure\n");
  writeFileSync(join(p.root, "src", "unused.ts"), 'export const other: string = "changed";\n');
  e = entry(run(["verify"], p).stdout, "BRK-001");
  expect(e).toContain("BRK-001  SUFFICIENT");
  expect(e).toContain("Freshness:   current");
  // A change inside the closure makes it stale.
  writeFileSync(join(p.root, "src", "dep.ts"), 'export const value: string = "two";\n');
  e = entry(run(["verify"], p).stdout, "BRK-001");
  expect(e).toContain("BRK-001  INSUFFICIENT");
  expect(e).toContain("the adapter closure changed:");
  expect(e).toContain("Freshness:   stale");
}, TEST_TIMEOUT);

test("a supplemental trace widens a record's identity and never narrows its scope (ENG-041, ENG-042)", () => {
  const p = project();
  writeFileSync(join(p.home, "outside.conf"), "one\n");
  const lister = join(p.root, "trace.sh");
  writeFileSync(lister, `#!/bin/sh\necho ${join(p.home, "outside.conf")}\n`);
  chmodSync(lister, 0o755);
  validatorWith(p, "traced", ["kind: test", "command:", '  - "true"', "environment: []", "trace:", "  command:", `    - ${JSON.stringify(lister)}`, ""].join("\n"));
  bind(p, "BRK-001", "traced");
  commit(p, "trace command");
  run(["trust", "traced"], p);
  run(["run", "traced"], p);
  const rec = records(p, "BRK-001").at(-1);
  // The trace names an input and changes nothing about the scope.
  expect(rec.dependency.scope).toBe("repository");
  expect(rec.dependency.narrowing).toBe("none");
  expect(rec.dependency_provenance).toBe("traced_supplemental");
  expect(rec.identity.traced).toEqual([join(p.home, "outside.conf")]);
  expect(rec.identity.traced_fingerprint).toMatch(/^sha256:/);
  expect(entry(run(["verify"], p).stdout, "BRK-001")).toContain("BRK-001  SUFFICIENT");
  // A traced input outside the repository is an input: changing it stales the record.
  writeFileSync(join(p.home, "outside.conf"), "two\n");
  const e = entry(run(["verify"], p).stdout, "BRK-001");
  expect(e).toContain("BRK-001  INSUFFICIENT");
  expect(e).toContain("a traced input changed:");
  expect(e).toContain("1 traced input(s)");
}, TEST_TIMEOUT);

test("a trace that could not be computed is recorded as such, and no record written under it is current (ENG-126, ENG-140, ENG-142)", () => {
  const p = project();
  validatorWith(p, "traced", ["kind: test", "command:", '  - "true"', "environment: []", "trace:", "  command:", '    - "/nonexistent/tracer"', ""].join("\n"));
  bind(p, "BRK-001", "traced");
  commit(p, "a trace whose command is not there");
  run(["trust", "traced"], p);
  const r = run(["run", "traced"], p);
  expect(r.stdout).toContain("the supplemental trace could not be computed (");
  expect(r.stdout).toContain("(ENG-041)");
  const rec = records(p, "BRK-001").at(-1);
  expect(rec.identity.traced).toEqual([]);
  expect(rec.identity.traced_fingerprint).toBeNull();
  expect(rec.identity.traced_error).not.toBeNull();
  expect(rec.freshness).toBe("unknown");
  expect(rec.dependency.scope).toBe("repository");
  // The engine cannot call that record current: inputs it declared were never captured.
  const e = entry(run(["verify"], p).stdout, "BRK-001");
  expect(e).toContain("BRK-001  BLOCKED");
  expect(e).toContain("Reason:      freshness cannot be established: the supplemental trace was not computed at run time (");
  expect(e).toContain("Freshness:   unknown");
  // With the tracer present the record is current again, and the traced input is an input.
  const tracer = join(p.root, "tracer.sh");
  writeFileSync(join(p.home, "outside.conf"), "one\n");
  writeFileSync(tracer, `#!/bin/sh\necho ${join(p.home, "outside.conf")}\n`);
  chmodSync(tracer, 0o755);
  validatorWith(p, "traced", ["kind: test", "command:", '  - "true"', "environment: []", "trace:", "  command:", `    - ${JSON.stringify(tracer)}`, ""].join("\n"));
  commit(p, "the tracer exists");
  run(["trust", "traced"], p);
  run(["run", "traced"], p);
  const ok = records(p, "BRK-001").at(-1);
  expect(ok.identity.traced_error).toBeNull();
  expect(ok.freshness).toBe("current");
  expect(entry(run(["verify"], p).stdout, "BRK-001")).toContain("BRK-001  SUFFICIENT");
}, TEST_TIMEOUT);

test("a formal result carries the correspondence assumption between the requirement and its model (ENG-166, ENG-167)", () => {
  const p = project();
  validatorWith(p, "prover", ["kind: formal", "command:", '  - "true"', "environment: []", ""].join("\n"));
  bind(p, "BRK-001", "prover");
  commit(p, "prover");
  run(["trust", "prover"], p);
  run(["run", "prover"], p);
  const rec = records(p, "BRK-001")[0];
  expect(rec.kind).toBe("formal");
  expect(rec.assumptions).toContain("a formal result establishes the formalized obligation under its declared preconditions, assumptions, and trusted computing base");
  expect(rec.assumptions).toContain("the correspondence between the requirement sentence and the formal model stays an assumption");
  const e = entry(run(["verify"], p).stdout, "BRK-001");
  expect(e).toContain("BRK-001  SUFFICIENT");
  expect(e).toContain("the correspondence between the requirement sentence and the formal model stays an assumption");
  expect(e).not.toMatch(/proven|proves|verified correct/i);
}, TEST_TIMEOUT);
