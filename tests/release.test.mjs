// The version and the release: cairn --version prints package.json's
// version (PKG-039); scripts/release.mjs cuts one tagged commit and refuses
// everything short of that (PKG-040).
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { repo as base, cairn, commit, review, passing, git } from "./helpers.mjs";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const RELEASE = here("../scripts/release.mjs");
const version = JSON.parse(readFileSync(here("../package.json"), "utf8")).version;

test("cairn --version prints the package.json version outside a repository, and help lists it (PKG-039)", () => {
  const plain = mkdtempSync(join(tmpdir(), "cairn-version-"));
  let r = cairn(plain, "--version"); assert.equal(r.status, 0, r.stderr); assert.equal(r.stdout, `cairn ${version}\n`);
  r = cairn(plain, "--version", "check"); assert.equal(r.status, 0); assert.equal(r.stdout, `cairn ${version}\n`, "wins over a command, like --help");
  assert.match(cairn(plain, "--help").stdout, /^  --version /m);
  assert.match(readFileSync(here("../CHANGELOG.md"), "utf8"), new RegExp(`^## ${version.replace(/\\./g, "\\\\.")} - \\d{4}-\\d{2}-\\d{2}$`, "m"), "the changelog has this version's entry");
});

// A green Cairn project at Done whose mechanism declares the version files, at 0.1.0, with a changelog with entries up to 0.2.0.
const manifest = (v) => `{ "name": "cairn", "version": "${v}" }\n`;
const fixture = () => {
  const root = base({
    ".cairn/mechanisms/m": passing("R-001", "R-002").replace("  - src/other", "  - src/other\n  - package.json\n  - .claude-plugin/\n  - .codex-plugin/\n  - .muse-plugin/\n  - CHANGELOG.md"),
    "package.json": manifest("0.1.0"), ".claude-plugin/plugin.json": manifest("0.1.0"), ".codex-plugin/plugin.json": manifest("0.1.0"), ".muse-plugin/plugin.json": manifest("0.1.0"),
    ".claude-plugin/marketplace.json": `{ "name": "cairn", "plugins": [{ "name": "cairn", "source": "./", "version": "0.1.0" }] }\n`,
    "CHANGELOG.md": "# Changelog\n\n## 0.2.0 - 2026-09-15\n\n- The second version.\n\n## 0.1.0 - 2026-09-04\n\n- The first.\n",
  });
  cairn(root, "check"); review(root); commit(root, "green at 0.1.0");
  assert.match(cairn(root, "wake").stdout, /^Done: /);
  return root;
};
const release = (root, ...a) => spawnSync(process.execPath, [RELEASE, ...a], { cwd: root, encoding: "utf8" });
// A refusal is exit 3 with one line, and leaves HEAD, the tags and the working tree as they were.
const state = (root) => git(root, "rev-parse", "HEAD").stdout + git(root, "tag", "-l").stdout + git(root, "status", "--porcelain", "--untracked-files=no").stdout;
const refused = (root, why, ...a) => { const before = state(root); const r = release(root, ...a); assert.equal(r.status, 3, r.stdout + r.stderr); assert.equal(r.stderr.trim().split("\n").length, 1, r.stderr); assert.match(r.stderr, why); assert.equal(state(root), before, "nothing committed, tagged or written"); };

test("a release is one commit setting one version in the five files, with the changelog entry, tagged v<version> (PKG-040)", () => {
  const root = fixture();
  const r = release(root, "0.2.0");
  assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /^release: 0\.2\.0 committed as [0-9a-f]+ and tagged v0\.2\.0$/m);
  for (const f of ["package.json", ".claude-plugin/plugin.json", ".claude-plugin/marketplace.json", ".codex-plugin/plugin.json", ".muse-plugin/plugin.json"]) assert.match(readFileSync(join(root, f), "utf8"), /"version": "0\.2\.0"/, f);
  assert.equal(git(root, "log", "-1", "--format=%s").stdout.trim(), "Release 0.2.0");
  assert.equal(git(root, "cat-file", "-t", "v0.2.0").stdout.trim(), "tag", "an annotated tag");
  assert.match(git(root, "tag", "-l", "-n1", "v0.2.0").stdout, /0\.2\.0 - 2026-09-15/, "the entry is the tag message");
  assert.equal(git(root, "status", "--porcelain", "--untracked-files=no").stdout, "", "the tree is clean after the release");
  assert.match(cairn(root, "wake").stdout, /^Resolvable: run R-00/, "the version files are declared inputs, so their evidence is stale at the release commit");
});

test("the release script refuses a bad version, no increase, a dirty tree, a missing entry, a taken tag, a disagreeing file, and a loop not at Done, each in one line with nothing written (PKG-040)", () => {
  const root = fixture();
  refused(root, /usage/, "1.2"); refused(root, /usage/, "0.2.0", "extra"); refused(root, /usage/);
  const sub = spawnSync(process.execPath, [RELEASE, "0.2.0"], { cwd: join(root, "src"), encoding: "utf8" });
  assert.equal(sub.status, 3, sub.stderr); assert.equal(sub.stderr.trim().split("\n").length, 1, sub.stderr); assert.match(sub.stderr, /cannot read package\.json .*run from the checkout root/);
  refused(root, /not an increase/, "0.1.0"); refused(root, /not an increase/, "0.0.9");
  writeFileSync(join(root, "src/other"), "changed\n"); refused(root, /dirty.*src\/other/, "0.2.0"); git(root, "checkout", "--", "src/other");
  refused(root, /no entry "## 0\.3\.0/, "0.3.0");
  git(root, "tag", "v0.2.0"); refused(root, /tag v0\.2\.0 exists/, "0.2.0"); git(root, "tag", "-d", "v0.2.0");
  writeFileSync(join(root, ".codex-plugin/plugin.json"), manifest("9.9.9")); refused(root, /codex-plugin\/plugin\.json does not carry/, "0.2.0"); git(root, "checkout", "--", ".codex-plugin/plugin.json");
  writeFileSync(join(root, ".cairn/in-progress"), "action: implement\ntarget: R-001\nbase: x\nstarted: now\n"); refused(root, /not at Done: Resolvable: reconcile/, "0.2.0"); unlinkSync(join(root, ".cairn/in-progress"));
  writeFileSync(join(root, "CHANGELOG.md"), readFileSync(join(root, "CHANGELOG.md"), "utf8").replace("# Changelog\n", "# Changelog\n\n## 0.3.0 - 2026-09-16\n\n- Next.\n"));
  refused(root, /dirty.*CHANGELOG\.md/, "0.3.0");   // the entry is committed first: the changelog is a declared input
  commit(root, "the 0.3.0 entry"); cairn(root, "check"); review(root); commit(root, "green again");
  const r = release(root, "0.3.0"); assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.equal(git(root, "status", "--porcelain", "--untracked-files=no").stdout, ""); assert.equal(git(root, "cat-file", "-t", "v0.3.0").stdout.trim(), "tag");
});

test("a version file written as compact JSON is released, and nothing else in any version file changes (PKG-042)", () => {
  const root = fixture();
  const compact = (v) => `{"name":"cairn","capabilities":{"skills":[]},"version":"${v}"}\n`;
  writeFileSync(join(root, ".muse-plugin/plugin.json"), compact("0.1.0")); commit(root, "the Muse manifest, compact");
  cairn(root, "check"); review(root); commit(root, "green again");
  assert.match(cairn(root, "wake").stdout, /^Done: /);
  const r = release(root, "0.2.0");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(readFileSync(join(root, ".muse-plugin/plugin.json"), "utf8"), compact("0.2.0"), "compact stays compact");
  for (const f of ["package.json", ".claude-plugin/plugin.json", ".codex-plugin/plugin.json"]) assert.equal(readFileSync(join(root, f), "utf8"), manifest("0.2.0"), f);
  assert.equal(readFileSync(join(root, ".claude-plugin/marketplace.json"), "utf8"), `{ "name": "cairn", "plugins": [{ "name": "cairn", "source": "./", "version": "0.2.0" }] }\n`);
  assert.equal(git(root, "tag", "-l", "v0.2.0").stdout.trim(), "v0.2.0");
});
