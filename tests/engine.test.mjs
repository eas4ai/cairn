import { test, expect } from "bun:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseYaml } from "../skills/new-project/scripts/engine/yaml.ts";

// Same Page Conformance, layer L1 (iteration 001). Each test names the
// engine-spec requirement whose falsifier state it produces; the test
// passes when the engine refuses that state. The engine is exercised
// through its command line, the contract that ships.

const ENGINE = new URL("../skills/new-project/scripts/engine/same-page.ts", import.meta.url).pathname;

function run(args, cwd, { runtime = "node", env = {} } = {}) {
  const cmd = runtime === "bun" ? ["bun", [ENGINE, ...args]] : ["node", ["--disable-warning=ExperimentalWarning", ENGINE, ...args]];
  const r = spawnSync(cmd[0], cmd[1], { cwd, encoding: "utf8", env: { ...process.env, ...env } });
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
  "[BRK-002] The broker MAY cache a response.",
  "",
  "[BRK-003] The broker MUST NOT serve an error response from the cache.",
  "Falsifier: an error response is served from the cache.",
  "",
  "Acceptance criteria:",
  "- A request produces exactly one log entry before dispatch.",
  "- An error response is never served from the cache.",
  "",
].join("\n");
const MAP = "# Evidence map\n\n## BRK\n\n| Requirement | Coverage | Method | Evidence |\n|---|---|---|---|\n| BRK-001 | Uncovered | - | |\n| BRK-003 | Uncovered | - | |\n";

function project(files = {}) {
  const root = mkdtempSync(join(tmpdir(), "same-page-engine-"));
  const specs = join(root, "docs", "specs", "proj");
  mkdirSync(specs, { recursive: true });
  const all = { "00-overview.md": OVERVIEW, "01-broker.md": DOMAIN, "conformance.md": MAP, ...files };
  for (const [name, text] of Object.entries(all)) if (text !== null) writeFileSync(join(specs, name), text);
  return { root, specs, read: (name) => readFileSync(join(specs, name), "utf8") };
}

const addProfile = (policyText, block) => policyText.replace("domains: {}", block + "domains: {}");
const obligation = (root, id) => parseYaml(readFileSync(join(root, ".same-page", "obligations", `${id}.yaml`), "utf8"));
const sha = (text) => "sha256:" + createHash("sha256").update(text.replace(/\s+/g, " ").trim(), "utf8").digest("hex");

test("elaborate projects each Agreed MUST and MUST NOT into one YAML obligation keyed on its identifier (ENG-002, ENG-012, ENG-013, ENG-015, ENG-016, ENG-018, ENG-187, ENG-188)", () => {
  const { root } = project();
  const r = run(["elaborate", "--root", root], root);
  expect(r.stdout).toContain("2 obligation(s) (2 written, 0 unchanged), 0 finding(s)");
  expect(r.status).toBe(0);
  expect(readdirSync(join(root, ".same-page", "obligations")).sort()).toEqual(["BRK-001.yaml", "BRK-003.yaml"]);
  const o = obligation(root, "BRK-001");
  expect(o.requirement).toBe("BRK-001");
  expect(o.locator).toBe("docs/specs/proj/01-broker.md::BRK-001");
  expect(o.keyword).toBe("MUST");
  expect(o.falsifier).toBe("a request arrives and the log has no entry for it.");
  expect(o.requirement_digest).toBe(sha("When a request arrives, the broker MUST log the request before dispatch."));
  expect(o.falsifier_digest).toBe(sha(o.falsifier));
  expect(o.profile).toBe("default");
  expect(o.validators).toEqual([]);
  expect(o.sentence).toBe("When a request arrives, the broker MUST log the request before dispatch.");
  expect(obligation(root, "BRK-003").keyword).toBe("MUST NOT");
});

test("acceptance criteria never receive identifiers or obligations (ENG-014)", () => {
  const { root } = project();
  run(["elaborate", "--root", root], root);
  expect(readdirSync(join(root, ".same-page", "obligations")).sort()).toEqual(["BRK-001.yaml", "BRK-003.yaml"]);
  for (const name of ["BRK-001.yaml", "BRK-003.yaml"]) expect(readFileSync(join(root, ".same-page", "obligations", name), "utf8")).not.toContain("Acceptance");
});

test("an obligation file keyed on a different identifier than its name is a finding (ENG-013)", () => {
  const { root } = project();
  run(["elaborate", "--root", root], root);
  const dir = join(root, ".same-page", "obligations");
  writeFileSync(join(dir, "BRK-003.yaml"), readFileSync(join(dir, "BRK-003.yaml"), "utf8").replace("requirement: BRK-003", "requirement: BRK-001"));
  const r = run(["verify", "--root", root], root);
  expect(r.stdout).toContain("file is named BRK-003 but keys on BRK-001 (ENG-013)");
  expect(r.status).toBe(1);
});

test("a permission-only MAY gets no obligation, and a MAY with a falsifier is a finding (ENG-024)", () => {
  const { root } = project();
  run(["elaborate", "--root", root], root);
  expect(existsSync(join(root, ".same-page", "obligations", "BRK-002.yaml"))).toBe(false);
  const bad = project({ "01-broker.md": DOMAIN.replace("[BRK-002] The broker MAY cache a response.\n", "[BRK-002] The broker MAY cache a response.\nFalsifier: a response is cached.\n") });
  const r = run(["elaborate", "--root", bad.root], bad.root);
  expect(r.stdout).toContain("BRK-002 is a permission-only MAY and carries a falsifier (ENG-024)");
  expect(r.status).toBe(1);
  expect(existsSync(join(bad.root, ".same-page", "obligations", "BRK-002.yaml"))).toBe(false);
});

test("an Agreed MUST with no Falsifier line is refused, not elaborated (ENG-205)", () => {
  const { root } = project({ "01-broker.md": DOMAIN.replace("Falsifier: a request arrives and the log has no entry for it.\n", "") });
  const r = run(["elaborate", "--root", root], root);
  expect(r.stdout).toContain("BRK-001 is Agreed and has no Falsifier line (ENG-205)".replace(" (ENG-205)", ""));
  expect(r.stdout).toContain("(ENG-205)");
  expect(r.status).toBe(1);
  expect(existsSync(join(root, ".same-page", "obligations", "BRK-001.yaml"))).toBe(false);
  expect(existsSync(join(root, ".same-page", "obligations", "BRK-003.yaml"))).toBe(true);
});

test("only Agreed requirements are elaborated: a Draft file contributes only its Agreed sections (ENG-010)", () => {
  const draft = [
    "# Proj -- 02 Engine",
    "",
    "Status: Draft for review",
    "Prefix: ENG",
    "",
    "## Trust model",
    "",
    "Normative.",
    "",
    "Agreed: 2026-09-02",
    "",
    "[ENG-001] The engine MUST refuse a claim it cannot support.",
    "Falsifier: the output claims support the record does not carry.",
    "",
    "## Later layer",
    "",
    "Normative.",
    "",
    "[ENG-050] The engine MUST fingerprint the environment.",
    "Falsifier: a record carries no fingerprint.",
    "",
    "### Observed part",
    "",
    "Status: Observed (as-built; unconfirmed)",
    "",
    "[ENG-060] The engine MUST do the observed thing.",
    "Falsifier: the observed thing does not happen.",
    "",
  ].join("\n");
  const { root } = project({ "02-engine.md": draft });
  const r = run(["elaborate", "--root", root], root);
  expect(r.status).toBe(0);
  expect(readdirSync(join(root, ".same-page", "obligations")).sort()).toEqual(["BRK-001.yaml", "BRK-003.yaml", "ENG-001.yaml"]);
});

test("neither command writes a spec or the evidence map (ENG-011, ENG-197)", () => {
  const { root, read } = project();
  const before = ["00-overview.md", "01-broker.md", "conformance.md"].map(read);
  run(["elaborate", "--root", root], root);
  run(["verify", "--root", root], root);
  expect(["00-overview.md", "01-broker.md", "conformance.md"].map(read)).toEqual(before);
});

test("a changed requirement or falsifier invalidates its obligation until re-elaboration (ENG-019, ENG-020)", () => {
  const { root, specs } = project();
  run(["elaborate", "--root", root], root);
  const clean = run(["verify", "--root", root], root);
  expect(clean.stdout).toContain("2 obligation(s): 0 SUFFICIENT, 2 INSUFFICIENT, 0 BLOCKED, 0 FAILING; 0 finding(s)");
  writeFileSync(join(specs, "01-broker.md"), DOMAIN.replace("MUST log the request", "MUST log the request and its origin"));
  const changed = run(["verify", "--root", root], root);
  expect(changed.stdout).toContain("invalid obligation BRK-001: the requirement text changed");
  expect(changed.stdout).toContain("(ENG-019)");
  expect(changed.stdout).not.toContain("BRK-001  INSUFFICIENT");
  expect(changed.status).toBe(1);
  writeFileSync(join(specs, "01-broker.md"), DOMAIN.replace("the log has no entry for it", "the log has no entry for it within one second"));
  expect(run(["verify", "--root", root], root).stdout).toContain("invalid obligation BRK-001: the confirmed falsifier changed");
  const re = run(["elaborate", "--root", root], root);
  expect(re.stdout).toContain("(1 written, 1 unchanged)");
  expect(run(["verify", "--root", root], root).stdout).toContain("0 finding(s)");
});

test("re-wrapping a requirement keeps its digest; digests are computed, never asked for (ENG-211)", () => {
  const { root, specs } = project();
  run(["elaborate", "--root", root], root);
  writeFileSync(join(specs, "01-broker.md"), DOMAIN.replace("MUST log the request\nbefore dispatch.", "MUST log the request before\ndispatch."));
  const r = run(["verify", "--root", root], root);
  expect(r.stdout).toContain("0 finding(s)");
  expect(run(["elaborate", "--root", root], root).stdout).toContain("(0 written, 2 unchanged)");
});

test("re-elaboration is idempotent and preserves a hand-set profile and validators (ENG-217)", () => {
  const { root } = project();
  run(["elaborate", "--root", root], root);
  const policyPath = join(root, ".same-page", "policy.yaml");
  writeFileSync(policyPath, addProfile(readFileSync(policyPath, "utf8"), "  strict:\n    require:\n      all:\n        - kind: integration\n        - sensitivity: challenged\n"));
  const obPath = join(root, ".same-page", "obligations", "BRK-003.yaml");
  writeFileSync(obPath, readFileSync(obPath, "utf8").replace("profile: default", "profile: strict").replace("validators: []", "validators:\n  - name: cache-negative\n    attested_by: developer\n"));
  const r = run(["elaborate", "--root", root], root);
  expect(r.stdout).toContain("(1 written, 1 unchanged)");
  const o = obligation(root, "BRK-003");
  expect(o.profile).toBe("strict");
  expect(o.profile_from).toBe("obligation");
  expect(o.validators.length).toBe(1);
  expect(o.validators[0].name).toBe("cache-negative");
  expect(o.validators[0].attested_by).toBe("developer");
  expect(o.validators[0].developer_confirmed).toBe(true);
  expect(typeof o.validators[0].attested_at).toBe("string");
  expect(o.validators[0].snapshot).toMatch(/^(git|workspace):/);
  expect(run(["elaborate", "--root", root], root).stdout).toContain("(0 written, 2 unchanged)");
  const v = run(["verify", "--root", root], root);
  expect(v.stdout).toContain("BRK-003  INSUFFICIENT\n  Requirement: The broker MUST NOT serve an error response from the cache.\n  Required:    integration + sensitivity challenged; current freshness\n  Evidence:    none");
});

test("an obligation naming a profile the policy does not define is a finding (ENG-016)", () => {
  const { root } = project();
  run(["elaborate", "--root", root], root);
  const obPath = join(root, ".same-page", "obligations", "BRK-001.yaml");
  writeFileSync(obPath, readFileSync(obPath, "utf8").replace("profile: default", "profile: ghost"));
  const r = run(["verify", "--root", root], root);
  expect(r.stdout).toContain("BRK-001 names profile ghost, which the policy does not define (ENG-016)");
  expect(r.status).toBe(1);
});

test("a domain override is the nearest inherited default for its prefix (ENG-076, ENG-077)", () => {
  const { root } = project();
  run(["elaborate", "--root", root], root);
  const policyPath = join(root, ".same-page", "policy.yaml");
  writeFileSync(policyPath, addProfile(readFileSync(policyPath, "utf8"), "  strict:\n    require:\n      all:\n        - kind: integration\n").replace("domains: {}", "domains:\n  BRK:\n    profile: strict\n"));
  const r = run(["elaborate", "--root", root], root);
  expect(r.status).toBe(0);
  expect(obligation(root, "BRK-001").profile).toBe("strict");
  expect(obligation(root, "BRK-001").profile_from).toBe("domain BRK");
  expect(obligation(root, "BRK-003").profile).toBe("strict");
  // A profile the developer set stays set when the domain default moves;
  // setting a weaker one is a downgrade, held until policy confirm.
  const obPath = join(root, ".same-page", "obligations", "BRK-003.yaml");
  writeFileSync(obPath, readFileSync(obPath, "utf8").replace("profile: strict", "profile: default"));
  const down = run(["elaborate", "--root", root], root);
  expect(down.stdout).toContain("policy downgrade for BRK-003");
  expect(down.status).toBe(1);
  expect(obligation(root, "BRK-003").profile).toBe("default");
  expect(obligation(root, "BRK-003").profile_from).toBe("obligation");
  expect(obligation(root, "BRK-003").required).toEqual({ all: [{ kind: "integration" }] });
  const confirm = run(["policy", "confirm", "--root", root], root);
  expect(confirm.stdout).toContain("BRK-003: required [integration; current freshness] -> [any of");
  expect(run(["elaborate", "--root", root], root).status).toBe(0);
  // A renamed project default does not strand an inherited obligation.
  const renamed = readFileSync(policyPath, "utf8").replace("default_profile: default", "default_profile: strict").replace("domains:\n  BRK:\n    profile: strict\n", "domains: {}\n");
  writeFileSync(policyPath, renamed);
  expect(run(["elaborate", "--root", root], root).status).toBe(0);
  expect(obligation(root, "BRK-001").profile).toBe("strict");
  expect(obligation(root, "BRK-001").profile_from).toBe("project default");
});

test("the policy file is validated: a scalar profile, a freshness setting, and a missing or undefined default are findings (ENG-070, ENG-073, ENG-075)", () => {
  const { root } = project();
  run(["elaborate", "--root", root], root);
  const policyPath = join(root, ".same-page", "policy.yaml");
  const good = readFileSync(policyPath, "utf8");
  const cases = [
    [good.replace(/profiles:\n  default:\n    require:\n      any:\n(?:        - kind: \w+\n)+/, "profiles:\n  default: 3\n"), "not a single grade (ENG-070)"],
    [good.replace("      any:\n", "      freshness: waived\n      any:\n"), "freshness is always required and cannot be set in a profile (ENG-073)"],
    [good.replace("default_profile: default\n", ""), "default_profile must name a profile (ENG-075)"],
    [good.replace("default_profile: default\n", "default_profile: missing\n"), "default_profile names missing, which profiles does not define (ENG-075)"],
  ];
  for (const [text, expected] of cases) {
    writeFileSync(policyPath, text);
    const r = run(["verify", "--root", root], root);
    expect(r.stdout).toContain(expected);
    expect(r.status).toBe(1);
    const e = run(["elaborate", "--root", root], root);
    expect(e.stdout).toContain("finding(s) in the policy file");
    expect(e.status).toBe(1);
  }
});

test("the .same-page layout: committed text for obligations and policy, evidence and cache ignored, no lock file, no database (ENG-186, ENG-189, ENG-190, ENG-192, ENG-193)", () => {
  const { root } = project();
  run(["elaborate", "--root", root], root);
  const base = join(root, ".same-page");
  expect(readdirSync(base).sort()).toEqual([".gitignore", "artifacts", "cache", "evidence", "obligations", "policy.yaml", "validators"]);
  expect(readFileSync(join(base, ".gitignore"), "utf8")).toContain("evidence/\ncache/\nartifacts/\n");
  expect(readdirSync(join(base, "evidence"))).toEqual([]);
  expect(readdirSync(join(base, "cache"))).toEqual([]);
  const o = readFileSync(join(base, "obligations", "BRK-001.yaml"), "utf8");
  for (const forbidden of ["freshness", "evidence", "verdict"]) expect(o).not.toContain(`${forbidden}:`);
});

test("a stale obligation is reported, never deleted (ENG-010, ENG-118 spirit)", () => {
  const { root, specs } = project();
  run(["elaborate", "--root", root], root);
  writeFileSync(join(specs, "01-broker.md"), DOMAIN.replace("[BRK-003] The broker MUST NOT serve an error response from the cache.\nFalsifier: an error response is served from the cache.\n", ""));
  const r = run(["elaborate", "--root", root], root);
  expect(r.stdout).toContain("stale obligation BRK-003: no spec defines it; delete the file or restore the requirement (ENG-010)");
  expect(r.status).toBe(1);
  expect(existsSync(join(root, ".same-page", "obligations", "BRK-003.yaml"))).toBe(true);
  const v = run(["verify", "--root", root], root);
  expect(v.stdout).toContain("BRK-003 has no Agreed MUST or MUST NOT requirement behind it");
});

test("verify reports an Agreed requirement with no obligation (ENG-206)", () => {
  const { root } = project();
  run(["elaborate", "--root", root], root);
  const { root: other } = project();
  mkdirSync(join(other, ".same-page"), { recursive: true });
  writeFileSync(join(other, ".same-page", "policy.yaml"), readFileSync(join(root, ".same-page", "policy.yaml"), "utf8"));
  const r = run(["verify", "--root", other], other);
  expect(r.stdout).toContain("BRK-001 is Agreed and has no obligation; run `same-page elaborate` (ENG-206)");
  expect(r.status).toBe(1);
});

test("a falsifier is stored as text, verbatim, whatever it says (ENG-021, ENG-023)", () => {
  const { root } = project({ "01-broker.md": DOMAIN.replace("Falsifier: an error response is served from the cache.", "Falsifier: the operator runs `rm -rf /tmp/cache` and an error: response is served.") });
  const r = run(["elaborate", "--root", root], root);
  expect(r.status).toBe(0);
  expect(obligation(root, "BRK-003").falsifier).toBe("the operator runs `rm -rf /tmp/cache` and an error: response is served.");
});

test("the first elaborate writes the policy with the project default and the spec directories; SAME_PAGE_SPECS_DIR seeds it (ENG-075, ENG-189)", () => {
  const { root } = project();
  const r = run(["elaborate", "--root", root], root);
  expect(r.stdout).toContain("wrote .same-page/policy.yaml (specs: docs/specs/proj; authority local, no CI configuration)");
  const policy = parseYaml(readFileSync(join(root, ".same-page", "policy.yaml"), "utf8"));
  expect(policy.specs).toEqual(["docs/specs/proj"]);
  expect(policy.default_profile).toBe("default");
  expect(policy.profiles.default.require.any.map((c) => c.kind)).toEqual(["formal", "model", "property", "integration", "test", "static", "manual"]);
  const { root: custom } = project();
  const alt = join(custom, "spec");
  mkdirSync(alt);
  writeFileSync(join(alt, "01-x.md"), DOMAIN);
  const r2 = run(["elaborate", "--root", custom], custom, { env: { SAME_PAGE_SPECS_DIR: "spec" } });
  expect(r2.stdout).toContain("(specs: spec; authority local, no CI configuration)");
  expect(r2.status).toBe(0);
});

test("exit codes: usage 2, no spec set 2, verify before elaborate 2", () => {
  const { root } = project();
  expect(run(["bogus", "--root", root], root).status).toBe(2);
  expect(run([], root).status).toBe(2);
  expect(run(["verify", "--root", root], root).status).toBe(2);
  const empty = mkdtempSync(join(tmpdir(), "same-page-empty-"));
  const r = run(["elaborate", "--root", empty], empty);
  expect(r.stderr).toContain("no spec set found");
  expect(r.status).toBe(2);
});

test("the engine runs under bun exactly as under node (PKG-002)", () => {
  const { root } = project();
  const e = run(["elaborate", "--root", root], root, { runtime: "bun" });
  expect(e.stdout).toContain("2 obligation(s) (2 written, 0 unchanged), 0 finding(s)");
  expect(e.status).toBe(0);
  const v = run(["verify", "--root", root], root, { runtime: "bun" });
  expect(v.stdout).toContain("0 SUFFICIENT, 2 INSUFFICIENT");
  expect(run(["elaborate", "--root", root], root).stdout).toContain("(0 written, 2 unchanged)");
});

test("the engine imports node builtins only (PKG-001)", () => {
  const dir = new URL("../skills/new-project/scripts/engine/", import.meta.url).pathname;
  for (const name of readdirSync(dir).filter((n) => n.endsWith(".ts") && !n.endsWith(".d.ts"))) {
    const src = readFileSync(join(dir, name), "utf8");
    for (const m of src.matchAll(/from\s+"([^"]+)"/g)) expect(m[1].startsWith("node:") || m[1].startsWith("./")).toBe(true);
  }
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url).pathname, "utf8"));
  expect(pkg.dependencies).toBeUndefined();
  expect(pkg.devDependencies).toBeUndefined();
});
