import { test, expect } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseYaml } from "../skills/new-project/scripts/engine/yaml.ts";

// Same Page Conformance, layer L2 (iteration 002): validators run under
// execution trust, evidence records carry the six axes and a snapshot,
// policy evaluation yields the verdict lattice, downgrades are held, a
// standing disproof survives revision until acknowledged, manual
// evidence expires. Each test names the requirement whose falsifier
// state it produces. The engine is exercised through its command line.

const ENGINE = new URL("../skills/new-project/scripts/engine/same-page.ts", import.meta.url).pathname;

function sh(cmd, args, cwd, env = {}) {
  return spawnSync(cmd, args, { cwd, encoding: "utf8", env: { ...process.env, ...env } });
}

function run(args, p, extra = {}) {
  const r = sh("node", ["--disable-warning=ExperimentalWarning", ENGINE, ...args], p.root, { SAME_PAGE_HOME: p.home, ...extra });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

const OVERVIEW = "# Proj -- System Overview\n\nStatus: Agreed\nAgreed: 2026-09-02\nPrefix: PRJ\n\n## Purpose\n\nA fixture.\n";
const DOMAIN = [
  "# Proj -- 01 Broker",
  "",
  "Status: Agreed",
  "Agreed: 2026-09-02",
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

// A project with a clean git tree, its spec set, and a trust home
// outside the repository. Obligations are elaborated and committed.
function project() {
  const base = mkdtempSync(join(tmpdir(), "same-page-l2-"));
  const root = join(base, "repo");
  const home = join(base, "home");
  mkdirSync(join(root, "docs", "specs", "proj"), { recursive: true });
  mkdirSync(home);
  writeFileSync(join(root, "docs", "specs", "proj", "00-overview.md"), OVERVIEW);
  writeFileSync(join(root, "docs", "specs", "proj", "01-broker.md"), DOMAIN);
  writeFileSync(join(root, "src.txt"), "source v1\n");
  git(root, ["init", "-q", "-b", "main"]);
  git(root, ["config", "user.name", "Fixture Dev"]);
  git(root, ["config", "user.email", "dev@example.test"]);
  const p = { root, home, specs: join(root, "docs", "specs", "proj") };
  run(["elaborate"], p, { SAME_PAGE_SPECS_DIR: "" });
  commit(p, "init");
  return p;
}

function commit(p, msg) {
  git(p.root, ["add", "-A"]);
  git(p.root, ["commit", "-q", "-m", msg]);
  return git(p.root, ["rev-parse", "HEAD"]);
}

function validator(p, name, command, extra = "") {
  mkdirSync(join(p.root, ".same-page", "validators"), { recursive: true });
  const cmd = command.map((c) => `  - ${JSON.stringify(c)}`).join("\n");
  writeFileSync(join(p.root, ".same-page", "validators", `${name}.yaml`), `kind: test\ncommand:\n${cmd}\nenvironment: []\n${extra}`);
}

function bind(p, id, name, attest = "") {
  const path = join(p.root, ".same-page", "obligations", `${id}.yaml`);
  const text = readFileSync(path, "utf8");
  const item = attest ? `  - name: ${name}\n    attested_by: ${attest}\n` : `  - name: ${name}\n`;
  const next = text.includes("validators: []\n") ? text.replace("validators: []\n", `validators:\n${item}`) : text.replace("validators:\n", `validators:\n${item}`);
  writeFileSync(path, next);
}

function addProfile(p, block) {
  writeFileSync(policy(p), readFileSync(policy(p), "utf8").replace("domains: {}", block + "domains: {}"));
}

function setDefaultAny(p, kinds) {
  writeFileSync(policy(p), readFileSync(policy(p), "utf8").replace(/      any:\n(?:        - kind: \w+\n)+/, "      any:\n" + kinds.map((k) => `        - kind: ${k}\n`).join("")));
}

function policy(p) {
  return join(p.root, ".same-page", "policy.yaml");
}

function records(p, id) {
  const dir = join(p.root, ".same-page", "evidence", id);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => n.endsWith(".yaml") && !n.startsWith("disproof"))
    .sort()
    .map((n) => parseYaml(readFileSync(join(dir, n), "utf8")));
}

function entry(stdout, id) {
  const m = stdout.split("\n\n").find((block) => block.startsWith(`${id}  `));
  return m ?? "";
}

test("a validator runs only under execution trust; configuration alone is not permission (ENG-058, ENG-059, ENG-064)", () => {
  const p = project();
  validator(p, "marker", ["sh", "-c", "touch ran.marker"]);
  bind(p, "BRK-001", "marker");
  writeFileSync(join(p.root, "TRUSTED"), "marker: trusted\n");
  commit(p, "validator and a repository-side trust marker");
  const r = run(["run"], p);
  expect(r.stdout).toContain("marker is not trusted for this repository at its current definition");
  expect(r.stdout).toContain("(ENG-058)");
  expect(r.stdout).toContain("0 validator(s) executed");
  expect(r.status).toBe(1);
  expect(existsSync(join(p.root, "ran.marker"))).toBe(false);
  expect(records(p, "BRK-001")).toEqual([]);
});

test("the trust record lives outside the repository and binds the definition digest (ENG-061, ENG-062, ENG-065)", () => {
  const p = project();
  validator(p, "marker", ["sh", "-c", "touch ran.marker"]);
  bind(p, "BRK-001", "marker");
  const inside = run(["trust", "marker"], p, { SAME_PAGE_HOME: join(p.root, ".same-page-home") });
  expect(inside.stderr).toContain("inside the repository it would authorize");
  expect(inside.stderr).toContain("(ENG-062)");
  expect(inside.status).toBe(2);
  const t = run(["trust", "marker"], p);
  expect(t.status).toBe(0);
  expect(existsSync(join(p.home, "trust.yaml"))).toBe(true);
  expect(readdirSync(p.root).some((n) => n.includes("trust"))).toBe(false);
  const grant = parseYaml(readFileSync(join(p.home, "trust.yaml"), "utf8")).grants[0];
  expect(grant.validator).toBe("marker");
  expect(grant.digest).toMatch(/^sha256:/);
  expect(grant.actor).toBe("Fixture Dev <dev@example.test>");
  // The definition changes: the grant no longer covers it.
  validator(p, "marker", ["sh", "-c", "touch ran.marker; touch changed.marker"]);
  const r = run(["run"], p);
  expect(r.stdout).toContain("marker is not trusted for this repository at its current definition");
  expect(existsSync(join(p.root, "changed.marker"))).toBe(false);
});

test("a run records its trust context, and only the four contexts exist (ENG-060, ENG-165)", () => {
  const p = project();
  validator(p, "ok", ["true"]);
  bind(p, "BRK-001", "ok");
  run(["trust", "ok"], p);
  expect(run(["run"], p).stdout).toContain("ran ok: pass (exit 0) under trust-record");
  let [rec] = records(p, "BRK-001");
  expect(rec.execution_trust).toEqual({ context: "trust-record", actor: "Fixture Dev <dev@example.test>" });
  validator(p, "shelly", ["true"], "shell: true\n");
  bind(p, "BRK-003", "shelly");
  const dev = run(["run", "shelly", "--as-developer"], p);
  expect(dev.stdout).toContain("ran shelly: pass (exit 0) under developer-invocation");
  [rec] = records(p, "BRK-003");
  expect(rec.execution_trust.context).toBe("developer-invocation");
  expect(["developer-invocation", "trust-record", "ci", "named-environment"]).toContain(rec.execution_trust.context);
});

test("argv execution: no shell unless declared (ENG-162, ENG-163, ENG-164)", () => {
  const p = project();
  validator(p, "literal", ["echo", "$HOME"]);
  validator(p, "expanded", ["echo", "$HOME"], "shell: true\n");
  bind(p, "BRK-001", "literal");
  bind(p, "BRK-003", "expanded");
  run(["trust", "literal"], p);
  run(["trust", "expanded"], p);
  run(["run"], p);
  const runs = readdirSync(join(p.root, ".same-page", "evidence", "runs")).map((n) => parseYaml(readFileSync(join(p.root, ".same-page", "evidence", "runs", n), "utf8")));
  const literal = runs.find((r) => r.validator === "literal");
  const expanded = runs.find((r) => r.validator === "expanded");
  expect(literal.stdout.trim()).toBe("$HOME");
  expect(expanded.stdout.trim()).not.toBe("$HOME");
  expect(expanded.shell).toBe(true);
  // A string command is not argv.
  writeFileSync(join(p.root, ".same-page", "validators", "stringy.yaml"), 'kind: test\ncommand: "echo hi"\nenvironment: []\n');
  bind(p, "BRK-001", "stringy");
  const r = run(["run", "stringy", "--as-developer"], p);
  expect(r.stdout).toContain("command must be a list of arguments (argv), not a string (ENG-162)");
});

test("the engine owns every trust axis; validator output sets nothing (ENG-051, ENG-052, ENG-054, ENG-057)", () => {
  const p = project();
  validator(p, "liar", ["sh", "-c", "echo 'binding_basis: backend'; echo 'sensitivity: challenged'; echo 'freshness: current'; echo 'dependency_provenance: adapter_derived'; echo 'can_establish_binding: true'"]);
  bind(p, "BRK-001", "liar");
  run(["trust", "liar"], p);
  run(["run"], p);
  const [rec] = records(p, "BRK-001");
  expect(rec.binding_basis).toBe("none");
  expect(rec.sensitivity).toBe("unchallenged");
  expect(rec.dependency_provenance).toBe("conservative");
  expect(rec.adapter).toBe("command");
  const runFile = readFileSync(join(p.root, rec.run), "utf8");
  expect(runFile).toContain("binding_basis: backend");
});

test("an evidence record carries the six axes, closed value sets, and a commit snapshot on a clean tree (ENG-026, ENG-027, ENG-029, ENG-034, ENG-038, ENG-040, ENG-046, ENG-047)", () => {
  const p = project();
  validator(p, "ok", ["true"]);
  bind(p, "BRK-001", "ok");
  const sha = commit(p, "validator");
  run(["trust", "ok"], p);
  run(["run"], p);
  const [rec] = records(p, "BRK-001");
  for (const axis of ["kind", "binding_basis", "sensitivity", "freshness", "dependency_provenance", "assumptions"]) expect(rec[axis]).toBeDefined();
  expect(rec.kind).toBe("test");
  expect(rec.binding_basis).toBe("none");
  expect(rec.sensitivity).toBe("unchallenged");
  expect(rec.freshness).toBe("current");
  expect(rec.dependency_provenance).toBe("conservative");
  expect(rec.assumptions).toEqual(["the declared environment inputs are the inputs that decide this validator's result"]);
  expect(rec.identity.snapshot).toBe(`git:${sha}`);
  expect(rec.authority).toBe("local");
  expect(rec.boundary.scope).toBe("repository");
  expect(rec.identity.validator_digest).toMatch(/^sha256:/);
});

test("an attested binding records actor, actor type, timestamp, snapshot, and confirmation (ENG-017, ENG-030)", () => {
  const p = project();
  validator(p, "ok", ["true"]);
  bind(p, "BRK-001", "ok", "developer");
  bind(p, "BRK-003", "ok");
  run(["trust", "ok"], p);
  run(["run"], p);
  const [attested] = records(p, "BRK-001");
  expect(attested.binding_basis).toBe("attested");
  expect(attested.binding.actor).toBe("Fixture Dev <dev@example.test>");
  expect(attested.binding.actor_type).toBe("developer");
  expect(typeof attested.binding.timestamp).toBe("string");
  expect(attested.binding.snapshot).toMatch(/^git:/);
  expect(attested.binding.developer_confirmed).toBe(true);
  const [bare] = records(p, "BRK-003");
  expect(bare.binding_basis).toBe("none");
  expect(bare.binding).toBeNull();
});

test("the verdict lattice: SUFFICIENT, FAILING over any profile, BLOCKED on error, INSUFFICIENT with nothing (ENG-080 through ENG-086)", () => {
  const p = project();
  validator(p, "pass", ["true"]);
  validator(p, "fail", ["false"]);
  validator(p, "broken", ["/nonexistent/validator"]);
  bind(p, "BRK-001", "pass");
  bind(p, "BRK-003", "fail");
  for (const v of ["pass", "fail", "broken"]) run(["trust", v], p);
  run(["run"], p);
  let v = run(["verify"], p);
  expect(entry(v.stdout, "BRK-001")).toContain("BRK-001  SUFFICIENT");
  expect(entry(v.stdout, "BRK-003")).toContain("BRK-003  FAILING");
  expect(entry(v.stdout, "BRK-003")).toContain("Reason:      fail demonstrated the falsifier at git:");
  expect(v.stdout).toContain("1 SUFFICIENT, 0 INSUFFICIENT, 0 BLOCKED, 1 FAILING");
  expect(v.status).toBe(1);
  // ENG-083: a profile that does not require the failing method still fails.
  setDefaultAny(p, ["property", "formal"]);
  run(["elaborate"], p);
  v = run(["verify"], p);
  expect(entry(v.stdout, "BRK-003")).toContain("BRK-003  FAILING");
  expect(entry(v.stdout, "BRK-001")).toContain("BRK-001  INSUFFICIENT");
  expect(entry(v.stdout, "BRK-001")).toContain("test pass pass (current");
  // BLOCKED: a validator that did not complete.
  bind(p, "BRK-001", "broken");
  run(["run", "broken"], p);
  v = run(["verify"], p);
  expect(entry(v.stdout, "BRK-001")).toContain("BRK-001  BLOCKED");
  expect(entry(v.stdout, "BRK-001")).toContain("Reason:      validator broken did not complete");
  // INSUFFICIENT: nothing recorded.
  const q = project();
  const w = run(["verify"], q);
  expect(entry(w.stdout, "BRK-001")).toContain("BRK-001  INSUFFICIENT");
  expect(entry(w.stdout, "BRK-001")).toContain("Evidence:    none");
});

test("no method ranks above another, and confirmation does not strengthen a mechanism (ENG-028, ENG-031)", () => {
  const p = project();
  validator(p, "ok", ["true"]);
  bind(p, "BRK-001", "ok", "developer");
  writeFileSync(policy(p), readFileSync(policy(p), "utf8").replace(/      any:\n(?:        - kind: \w+\n)+/, "      any:\n        - kind: property\n"));
  run(["elaborate"], p);
  run(["trust", "ok"], p);
  run(["run"], p);
  const v = run(["verify"], p);
  expect(entry(v.stdout, "BRK-001")).toContain("BRK-001  INSUFFICIENT");
  expect(entry(v.stdout, "BRK-001")).toContain("binding attested");
});

test("a change anywhere in the source makes evidence stale and the verdict INSUFFICIENT; a re-run at the new snapshot restores it (ENG-007, ENG-008, ENG-039, ENG-048, ENG-050)", () => {
  const p = project();
  validator(p, "ok", ["true"]);
  bind(p, "BRK-001", "ok");
  const sha = commit(p, "validator");
  run(["trust", "ok"], p);
  run(["run"], p);
  expect(entry(run(["verify"], p).stdout, "BRK-001")).toContain("BRK-001  SUFFICIENT");
  writeFileSync(join(p.root, "src.txt"), "source v2\n");
  let v = run(["verify"], p);
  const e = entry(v.stdout, "BRK-001");
  expect(e).toContain("BRK-001  INSUFFICIENT");
  expect(e).toContain(`Reason:      evidence is stale: recorded at git:${sha}, current snapshot workspace:`);
  expect(e).toContain("Freshness:   stale");
  expect(e).toContain("Authority:   local @ workspace:");
  // Workspace evidence is not commit evidence: a record at a workspace snapshot does not become current on commit.
  run(["run"], p);
  expect(entry(run(["verify"], p).stdout, "BRK-001")).toContain("BRK-001  SUFFICIENT");
  const sha2 = commit(p, "source v2");
  v = run(["verify"], p);
  expect(entry(v.stdout, "BRK-001")).toContain("BRK-001  INSUFFICIENT");
  expect(entry(v.stdout, "BRK-001")).toContain(`current snapshot git:${sha2}`);
  run(["run"], p);
  expect(entry(run(["verify"], p).stdout, "BRK-001")).toContain("BRK-001  SUFFICIENT");
  expect(records(p, "BRK-001").length).toBe(3);
});

test("two workspaces that differ in a dirty file have different identities (ENG-049)", () => {
  const p = project();
  writeFileSync(join(p.root, "src.txt"), "a\n");
  const a = run(["verify"], p).stdout.match(/authority local \(policy\) @ (workspace:\w+)/)[1];
  writeFileSync(join(p.root, "src.txt"), "b\n");
  const b = run(["verify"], p).stdout.match(/authority local \(policy\) @ (workspace:\w+)/)[1];
  expect(a).not.toBe(b);
  writeFileSync(join(p.root, "src.txt"), "a\n");
  expect(run(["verify"], p).stdout.match(/authority local \(policy\) @ (workspace:\w+)/)[1]).toBe(a);
});

test("a policy edit to the engine's own directory does not stale evidence (ENG-186, acceptance: policy-only change re-evaluates)", () => {
  const p = project();
  validator(p, "ok", ["true"]);
  bind(p, "BRK-001", "ok");
  commit(p, "validator");
  run(["trust", "ok"], p);
  run(["run"], p);
  addProfile(p, "  extra:\n    require:\n      all:\n        - kind: test\n");
  const v = run(["verify"], p);
  expect(entry(v.stdout, "BRK-001")).toContain("BRK-001  SUFFICIENT");
  expect(v.stdout).toContain("authority local (policy) @ git:");
});

test("a validator no definition names does not run (ENG-003, ENG-161)", () => {
  const p = project();
  const r = run(["run", "ghost", "--as-developer"], p);
  expect(r.stdout).toContain("no validator definition named ghost (ENG-161)");
  expect(r.stdout).toContain("0 validator(s) executed");
});

test("partial evidence is shown with method and freshness, never discarded (ENG-087, ENG-088)", () => {
  const p = project();
  validator(p, "ok", ["true"]);
  bind(p, "BRK-001", "ok");
  run(["trust", "ok"], p);
  run(["run"], p);
  writeFileSync(policy(p), readFileSync(policy(p), "utf8").replace(/      any:\n(?:        - kind: \w+\n)+/, "      all:\n        - kind: property\n        - kind: test\n"));
  run(["elaborate"], p);
  const v = run(["verify"], p);
  const e = entry(v.stdout, "BRK-001");
  expect(e).toContain("BRK-001  INSUFFICIENT");
  expect(e).toContain("Required:    property + test; current freshness");
  expect(e).toContain("Evidence:    test ok pass (current;");
  expect(records(p, "BRK-001").length).toBe(1);
});

test("a policy downgrade is surfaced with old, new, and effect, held until confirmed (ENG-101, ENG-102, ENG-103, ENG-105)", () => {
  const p = project();
  validator(p, "ok", ["true"]);
  bind(p, "BRK-001", "ok");
  run(["trust", "ok"], p);
  run(["run"], p);
  // Widen the any-set: more ways to satisfy is less assurance.
  writeFileSync(policy(p), readFileSync(policy(p), "utf8").replace("        - kind: manual\n", "        - kind: manual\n        - kind: inspected\n"));
  const v = run(["verify"], p);
  expect(v.stdout).toContain("policy downgrade for BRK-001: required was [any of formal, model, property, integration, test, static, manual; current freshness], the policy now requires [any of formal, model, property, integration, test, static, manual, inspected; current freshness]; the verdict below is under the old requirement");
  expect(v.stdout).toContain("(ENG-102)");
  expect(entry(v.stdout, "BRK-001")).toContain("Required:    any of formal, model, property, integration, test, static, manual; current freshness");
  expect(v.status).toBe(1);
  const e = run(["elaborate"], p);
  expect(e.stdout).toContain("policy downgrade for BRK-001");
  const c = run(["policy", "confirm"], p);
  expect(c.stdout).toContain("BRK-001: required [any of formal, model, property, integration, test, static, manual; current freshness] -> [any of formal, model, property, integration, test, static, manual, inspected; current freshness]");
  const after = run(["verify"], p);
  expect(after.stdout).not.toContain("policy downgrade");
  expect(entry(after.stdout, "BRK-001")).toContain("inspected; current freshness");
  // A stronger change is taken without ceremony.
  writeFileSync(policy(p), readFileSync(policy(p), "utf8").replace("        - kind: inspected\n", ""));
  expect(run(["elaborate"], p).stdout).not.toContain("downgrade");
});

test("a standing disproof survives a revision until the developer acknowledges it, and never inherits sufficiency (ENG-111 through ENG-120)", () => {
  const p = project();
  validator(p, "fail", ["false"]);
  bind(p, "BRK-003", "fail");
  commit(p, "validator");
  run(["trust", "fail"], p);
  run(["run"], p);
  let v = run(["verify"], p);
  expect(entry(v.stdout, "BRK-003")).toContain("BRK-003  FAILING");
  expect(existsSync(join(p.root, ".same-page", "evidence", "BRK-003", "disproof.yaml"))).toBe(true);
  expect(entry(v.stdout, "BRK-003")).toContain("Standing disproof: FAILING at git:");
  // Revise the requirement in the spec.
  const revised = DOMAIN.replace("[BRK-003] The broker MUST NOT serve an error response from the cache.", "[BRK-003] The broker MUST NOT serve a stale error response from the cache.");
  writeFileSync(join(p.specs, "01-broker.md"), revised);
  const e = run(["elaborate"], p);
  expect(e.stdout).toContain("disproof-clearing revision of BRK-003.");
  expect(e.stdout).toContain("Prior requirement: The broker MUST NOT serve an error response from the cache.");
  expect(e.stdout).toContain("Prior falsifier: an error response is served from the cache.");
  expect(e.stdout).toContain("Prior verdict: FAILING at git:");
  expect(e.stdout).toContain("Proposed requirement: The broker MUST NOT serve a stale error response from the cache.");
  expect(e.stdout).toContain("Reason: the revision changes the requirement the disproof was recorded against");
  expect(e.stdout).toContain("(ENG-112)");
  expect(e.stdout).toContain("1 held");
  expect(e.status).toBe(1);
  // Held: the obligation keeps the prior digests, so it cannot evaluate SUFFICIENT.
  v = run(["verify"], p);
  expect(entry(v.stdout, "BRK-003")).toContain("BRK-003  BLOCKED");
  expect(entry(v.stdout, "BRK-003")).toContain("obligation digest mismatch");
  // Acknowledge, then elaborate regenerates under the same identifier.
  const a = run(["acknowledge", "BRK-003"], p);
  expect(a.stdout).toContain("acknowledged: the revision of BRK-003 clears or changes the standing disproof");
  expect(a.status).toBe(0);
  expect(run(["elaborate"], p).stdout).toContain("(1 written, 1 unchanged)");
  expect(readdirSync(join(p.root, ".same-page", "obligations")).sort()).toEqual(["BRK-001.yaml", "BRK-003.yaml"]);
  // History stays; the prior failing record is not current for the revised text and grants nothing.
  expect(existsSync(join(p.root, ".same-page", "evidence", "BRK-003", "disproof.yaml"))).toBe(true);
  v = run(["verify"], p);
  const en = entry(v.stdout, "BRK-003");
  expect(en).not.toContain("BRK-003  SUFFICIENT");
  expect(en).not.toContain("BRK-003  FAILING");
  expect(en).toContain("recorded for a prior requirement or falsifier text");
  expect(records(p, "BRK-003").length).toBe(1);
  // Acknowledging with nothing standing is refused.
  expect(run(["acknowledge", "BRK-001"], p).status).toBe(1);
});

test("manual evidence: accepted with its six fields, expiry enforced, bound paths must exist, inspection alone is inspected (ENG-180, ENG-181, ENG-183, ENG-185, ENG-209)", () => {
  const p = project();
  const missing = run(["attest", "BRK-001", "--expires", "2099-01-01", "--description", "x"], p);
  expect(missing.status).toBe(2);
  const bad = run(["attest", "BRK-001", "--by", "Dev", "--expires", "2099-01-01", "--description", "x", "--bindings", "nope.txt"], p);
  expect(bad.stdout).toContain("bound path does not exist in the snapshot (ENG-209)");
  expect(bad.status).toBe(1);
  const ok = run(["attest", "BRK-001", "--by", "Dev", "--expires", "2099-01-01", "--description", "sent a request and read the log", "--bindings", "src.txt", "--addresses-falsifier"], p);
  expect(ok.status).toBe(0);
  const [rec] = records(p, "BRK-001");
  expect(rec.kind).toBe("manual");
  expect(rec.manual).toEqual({ actor: "Dev", description: "sent a request and read the log", bindings: ["src.txt"], expires: "2099-01-01", addresses_falsifier: true });
  expect(rec.binding_basis).toBe("attested");
  expect(rec.binding.developer_confirmed).toBe(true);
  expect(rec.sensitivity).toBe("not_applicable");
  let v = run(["verify"], p);
  expect(entry(v.stdout, "BRK-001")).toContain("BRK-001  SUFFICIENT");
  expect(entry(v.stdout, "BRK-001")).toContain("manual manual by Dev pass (current");
  // Expired manual evidence satisfies nothing.
  run(["attest", "BRK-003", "--by", "Dev", "--expires", "2000-01-01", "--description", "old", "--addresses-falsifier"], p);
  v = run(["verify"], p);
  expect(entry(v.stdout, "BRK-003")).toContain("BRK-003  INSUFFICIENT");
  expect(entry(v.stdout, "BRK-003")).toContain("(expired: manual evidence expired 2000-01-01;");
  // Inspection alone is inspected and does not satisfy the default profile.
  const q = project();
  run(["attest", "BRK-001", "--by", "Dev", "--expires", "2099-01-01", "--description", "read the code", "--inspection-only"], q);
  expect(records(q, "BRK-001")[0].kind).toBe("inspected");
  expect(entry(run(["verify"], q).stdout, "BRK-001")).toContain("BRK-001  INSUFFICIENT");
  // A bound surface change makes it stale (ENG-182).
  writeFileSync(join(p.root, "src.txt"), "changed\n");
  const changed = entry(run(["verify"], p).stdout, "BRK-001");
  expect(changed).toContain("BRK-001  INSUFFICIENT");
  expect(changed).toContain("(stale: recorded at git:");
});

test("verify prints the seven fields and the assumptions, and a BLOCKED entry states its reason (ENG-044, ENG-045, ENG-215, ENG-218, ENG-219)", () => {
  const p = project();
  validator(p, "ok", ["true"]);
  bind(p, "BRK-001", "ok");
  run(["trust", "ok"], p);
  run(["run"], p);
  const e = entry(run(["verify"], p).stdout, "BRK-001");
  for (const line of ["BRK-001  SUFFICIENT", "Requirement: ", "Required:    ", "Evidence:    ", "Freshness:   current", "Authority:   local @ git:", "Boundary:    repository at ", "Assumptions: the declared environment inputs are the inputs that decide this validator's result"]) expect(e).toContain(line);
  // A definition the engine cannot read now leaves freshness unknown: BLOCKED, with the reason.
  writeFileSync(join(p.root, ".same-page", "validators", "ok.yaml"), "kind: nope\n");
  const b = entry(run(["verify"], p).stdout, "BRK-001");
  expect(b).toContain("BRK-001  BLOCKED");
  expect(b).toContain("Reason:      freshness cannot be established: validator ok definition is invalid now");
});
