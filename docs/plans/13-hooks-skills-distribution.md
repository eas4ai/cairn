# Hooks, skills and distribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ship the three read-only hooks, the four skills that follow the six digraphs, the working-agreement template, the three plugin manifests sharing one version, and the release script's attribution check.

**Architecture:** hooks are POSIX shell scripts that run `cairn wake` and print what it printed; they never write. Skills are Markdown whose headings carry the digraph node ids so a shape test checks them against `docs/diagrams/*.dot`, and whose `cairn` commands are checked against `cairn --help`. Manifests are JSON checked for one shared version. The release script scans a commit range for attribution lines and refuses before writing.

**Tech Stack:** Node 24 ES modules, `node --test`, `node:assert/strict`, `node:child_process`, POSIX sh, Git.

**Spec:** `docs/spec/cairn-v2.md` revision 5, sections 3 (Install, Project initialization, New project, Existing project, Next feature, The shared spec-phase tail, The work loop), 6 (Hooks), 11 (Distribution), 12 (removed: stop-hook refusal, refusal counts, stop records, `explain`, `present`, `reword`), section 13 decisions 2, 4 and 12. The six digraphs in `docs/diagrams/` are part of the spec; the text is normative where they disagree.

## Global Constraints

See `docs/plans/overview.md`. Specific to this plan, quoted from the spec:

- "No hook refuses a stop, counts refusals, creates a record, edits a file, commits, pushes, calls a model, or completes an action." (section 6)
- "The session-start hook prints the current state and, in one line, any missing command link, PATH entry or durable ref. It writes nothing" (section 6)
- "Installation is global and never asks for a project remote. It is complete when `cairn --help` prints." (section 3)
- "Claude Code, Codex and Muse manifests share one version." (section 11)
- "The term `next-feature` replaces 1.x's `next-iteration` everywhere: skill, item kind and flag." (section 2)
- "Hooks prompt and never block or write." (13.2) "Global install makes the command link and hooks. Project initialization, not install, configures a repository." (13.12)
- Shipped text is ASCII. No AI attribution anywhere; the release script refuses a range that carries any.

Depends on plan 08 (wake). Hook tests use a fake `cairn` on PATH so they run without the kernel; skill tests use the real `bin/cairn.mjs --help`.

---

## File structure

```
hooks/session-start.sh  hooks/turn.sh  hooks/stop.sh  hooks/hooks.json (Claude Code registration)
.claude-plugin/plugin.json  .claude-plugin/marketplace.json  .codex-plugin/plugin.json  .muse-plugin/plugin.json
skills/install-cairn/SKILL.md  skills/new-project/SKILL.md  skills/new-project/templates/AGENTS.md
skills/existing-project/SKILL.md  skills/next-feature/SKILL.md
scripts/release.mjs     release with the attribution check
tests/helpers/hookenv.mjs  tests/hooks.test.mjs  tests/manifests.test.mjs  tests/skills.test.mjs  tests/release.test.mjs
```

---

### Task 1: Hook test environment and the session-start wake line

**Files:**
- Create: `tests/helpers/hookenv.mjs`, `tests/hooks.test.mjs`, `hooks/session-start.sh`

**Interfaces:**
- Consumes: nothing from earlier plans; the fake `cairn` stands in for plan 08's `wake`.
- Produces: `throwawayRepo() -> {dir, git(...args) -> stdout}`; `fakeCairn(binDir, {stdout, exit}) -> path`; `fingerprint(dir) -> hex` (digest of every file below `dir`, the Git directory included, except `index.lock`); `runHook(name, {cwd, env, stdin}) -> {stdout, stderr, status}`; `RESOLVABLE`, a canned verdict; `ROOT`.

- [ ] **Step 1: Write the helper**

```js
// tests/helpers/hookenv.mjs
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export const ROOT = resolve(new URL("../..", import.meta.url).pathname);

export function throwawayRepo() {
  const dir = mkdtempSync(join(tmpdir(), "cairn-hook-"));
  const git = (...args) => {
    const r = spawnSync("git", args, { cwd: dir, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
    return r.stdout;
  };
  git("init", "-q", "-b", "main"); git("config", "user.email", "t@example.invalid"); git("config", "user.name", "t");
  writeFileSync(join(dir, "README.md"), "throwaway\n"); git("add", "README.md"); git("commit", "-q", "-m", "first");
  return { dir, git };
}

export function fakeCairn(binDir, { stdout, exit = 0 }) {
  mkdirSync(binDir, { recursive: true });
  const p = join(binDir, "cairn");
  writeFileSync(p, `#!/bin/sh\nprintf '%s' '${stdout.replace(/'/g, "'\\''")}'\nexit ${exit}\n`);
  chmodSync(p, 0o755);
  return p;
}

function walk(dir, out) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.name === "index.lock") continue;
    if (e.isDirectory()) walk(p, out); else out.push([p, readFileSync(p)]);
  }
  return out;
}

export function fingerprint(dir) {
  const h = createHash("sha256");
  for (const [p, bytes] of walk(dir, []).sort((a, b) => (a[0] < b[0] ? -1 : 1))) h.update(p).update("\0").update(bytes).update("\0");
  return h.digest("hex");
}

export function runHook(name, { cwd, env = {}, stdin = "{}" }) {
  const r = spawnSync("sh", [join(ROOT, "hooks", name)], { cwd, input: stdin, encoding: "utf8", env: { HOME: cwd, PATH: "/usr/bin:/bin", ...env } });
  return { stdout: r.stdout, stderr: r.stderr, status: r.status };
}

export const RESOLVABLE = "Resolvable: implement REQ-001\nreason: the current receipt for REQ-001 says fail\npredicate: a current receipt says pass and review metadata binds the requirement to the current definition and text digests with a fail receipt\n";
```

- [ ] **Step 2: Write the failing test**

```js
// tests/hooks.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, throwawayRepo, fakeCairn, fingerprint, runHook, RESOLVABLE } from "./helpers/hookenv.mjs";

function env(dir, verdict) {
  const bin = join(dir, "fakebin");
  fakeCairn(bin, { stdout: verdict });
  return { PATH: `${bin}:/usr/bin:/bin`, HOME: join(dir, "home") };
}

test("session-start prints verdict, action, reason and predicate and exits 0", () => {
  const { dir } = throwawayRepo();
  const r = runHook("session-start.sh", { cwd: dir, env: env(dir, RESOLVABLE) });
  assert.equal(r.status, 0);
  assert.ok(r.stdout.includes(RESOLVABLE), r.stdout);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test tests/hooks.test.mjs` -- Expected: FAIL, `sh: hooks/session-start.sh: No such file`, status not 0.

- [ ] **Step 4: Write the hook**

```sh
#!/bin/sh
# hooks/session-start.sh: print the current verdict and, in one line, any missing
# command link, PATH entry or durable ref. Writes nothing. Exit 0.
cat >/dev/null 2>&1 || true
here=$(cd "$(dirname "$0")/.." && pwd)
link="${HOME:-/nonexistent}/.local/bin/cairn"
missing=""
if command -v cairn >/dev/null 2>&1; then run="cairn"
elif [ -x "$link" ]; then run="$link"; missing="$missing PATH entry ~/.local/bin"
else run="node $here/bin/cairn.mjs"; missing="$missing command link ~/.local/bin/cairn"
fi
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  for ref in refs/cairn/log refs/cairn/snapshots; do
    git rev-parse -q --verify "$ref" >/dev/null 2>&1 || missing="$missing durable ref $ref"
  done
fi
[ -n "$missing" ] && printf 'cairn: missing%s\n' "$missing"
out=$($run wake 2>&1); code=$?
printf '%s\n' "$out"
[ "$code" -eq 0 ] || [ "$code" -eq 3 ] || printf 'cairn: wake exited %s\n' "$code"
exit 0
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/hooks.test.mjs` -- Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/helpers/hookenv.mjs tests/hooks.test.mjs hooks/session-start.sh
git commit -m "Add the session-start hook and its test environment"
```

---

### Task 2: The diagnostic line and the exit-3 line

**Files:**
- Modify: `tests/hooks.test.mjs`

**Interfaces:** consumes Task 1; produces nothing new.

- [ ] **Step 1: Write the tests**

```js
test("session-start names a missing link and durable refs in one line", () => {
  const { dir } = throwawayRepo();
  const r = runHook("session-start.sh", { cwd: dir, env: { PATH: "/usr/bin:/bin", HOME: join(dir, "home") } });
  const line = r.stdout.split("\n").find((l) => l.startsWith("cairn: missing"));
  assert.ok(line, r.stdout);
  for (const s of ["command link ~/.local/bin/cairn", "durable ref refs/cairn/log", "durable ref refs/cairn/snapshots"]) assert.ok(line.includes(s), line);
  assert.equal(r.status, 0);
});

test("session-start names a missing PATH entry when only the link exists", () => {
  const { dir } = throwawayRepo();
  const home = join(dir, "home");
  fakeCairn(join(home, ".local", "bin"), { stdout: RESOLVABLE });
  const r = runHook("session-start.sh", { cwd: dir, env: { PATH: "/usr/bin:/bin", HOME: home } });
  assert.ok(r.stdout.includes("cairn: missing PATH entry ~/.local/bin"), r.stdout);
  assert.ok(r.stdout.includes(RESOLVABLE));
});

test("session-start prints the exit-3 line verbatim and still exits 0", () => {
  const { dir } = throwawayRepo();
  const bin = join(dir, "fakebin");
  fakeCairn(bin, { stdout: "cairn: not a Cairn project; run /new-project or /existing-project\n", exit: 3 });
  const r = runHook("session-start.sh", { cwd: dir, env: { PATH: `${bin}:/usr/bin:/bin`, HOME: join(dir, "home") } });
  assert.equal(r.status, 0);
  assert.ok(r.stdout.includes("run /new-project or /existing-project"), r.stdout);
  assert.ok(!r.stdout.includes("wake exited"), r.stdout);
});
```

- [ ] **Step 2: Run tests**

Run: `node --test tests/hooks.test.mjs` -- Expected: PASS with the Task 1 script (it already treats exit 3 as a verdict exit). A failure means the script drifted from Task 1 Step 4; restore it.

- [ ] **Step 3: Commit**

```bash
git add tests/hooks.test.mjs
git commit -m "Test the session-start diagnostic and exit-3 lines"
```

---

### Task 3: turn.sh, stop.sh and one test per prohibition

**Files:**
- Create: `hooks/turn.sh`, `hooks/stop.sh`
- Modify: `tests/hooks.test.mjs`

**Interfaces:** consumes Task 1; produces the two remaining hooks, which print exactly what `cairn wake` printed and exit 0.

- [ ] **Step 1: Write the failing tests**

```js
for (const name of ["session-start.sh", "turn.sh", "stop.sh"]) {
  test(`${name} prints the wake line and exits 0`, () => {
    const { dir } = throwawayRepo();
    const r = runHook(name, { cwd: dir, env: env(dir, RESOLVABLE) });
    assert.equal(r.status, 0); assert.ok(r.stdout.includes(RESOLVABLE), r.stdout);
  });
  test(`${name} does not refuse a stop: no JSON decision on a Resolvable verdict`, () => {
    const { dir } = throwawayRepo();
    const r = runHook(name, { cwd: dir, env: env(dir, RESOLVABLE), stdin: JSON.stringify({ hook_event_name: "Stop", cwd: dir }) });
    assert.equal(r.status, 0);
    assert.ok(!/"decision"\s*:\s*"block"/.test(r.stdout), r.stdout);
    assert.ok(!r.stdout.trimStart().startsWith("{"), r.stdout);
  });
  test(`${name} does not count refusals: nothing appears below the Git directory after four runs`, () => {
    const { dir, git } = throwawayRepo();
    const gitDir = join(dir, git("rev-parse", "--git-dir").trim());
    const before = fingerprint(gitDir);
    for (let i = 0; i < 4; i++) runHook(name, { cwd: dir, env: env(dir, RESOLVABLE), stdin: JSON.stringify({ session_id: "s1" }) });
    assert.equal(fingerprint(gitDir), before);
  });
  test(`${name} does not create a record: refs/cairn/* stay absent`, () => {
    const { dir, git } = throwawayRepo();
    runHook(name, { cwd: dir, env: env(dir, RESOLVABLE) });
    assert.equal(git("for-each-ref", "refs/cairn").trim(), "");
  });
  test(`${name} does not edit a file: the worktree fingerprint is unchanged`, () => {
    const { dir } = throwawayRepo();
    const before = fingerprint(dir);
    runHook(name, { cwd: dir, env: env(dir, RESOLVABLE) });
    assert.equal(fingerprint(dir), before);
  });
  test(`${name} does not commit: HEAD unchanged, index clean`, () => {
    const { dir, git } = throwawayRepo();
    const head = git("rev-parse", "HEAD");
    runHook(name, { cwd: dir, env: env(dir, RESOLVABLE) });
    assert.equal(git("rev-parse", "HEAD"), head); assert.equal(git("status", "--porcelain").trim(), "");
  });
  test(`${name} does not push: a bare remote's refs are unchanged`, () => {
    const { dir, git } = throwawayRepo();
    const remote = throwawayRepo();
    git("remote", "add", "origin", remote.dir);
    const before = remote.git("for-each-ref");
    runHook(name, { cwd: dir, env: env(dir, RESOLVABLE) });
    assert.equal(remote.git("for-each-ref"), before);
  });
  test(`${name} does not call a model: the script names no network file, tool or key`, () => {
    const text = readFileSync(join(ROOT, "hooks", name), "utf8");
    for (const s of ["typesafeai", "curl", "wget", "fetch(", "TYPESAFEAI_API_KEY", "https://"]) assert.ok(!text.includes(s), `${name} mentions ${s}`);
  });
  test(`${name} does not complete an action: wake prints the same verdict before and after`, () => {
    const { dir } = throwawayRepo();
    const e = env(dir, RESOLVABLE);
    const first = runHook(name, { cwd: dir, env: e }).stdout, second = runHook(name, { cwd: dir, env: e }).stdout;
    assert.equal(second, first); assert.ok(first.includes("Resolvable: implement REQ-001"));
  });
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/hooks.test.mjs` -- Expected: every `turn.sh` and `stop.sh` test fails with `No such file`; session-start tests pass.

- [ ] **Step 3: Write the two hooks**

```sh
#!/bin/sh
# hooks/turn.sh: run wake before a turn and print what it printed. Writes nothing. Exit 0.
cat >/dev/null 2>&1 || true
here=$(cd "$(dirname "$0")/.." && pwd)
link="${HOME:-/nonexistent}/.local/bin/cairn"
if command -v cairn >/dev/null 2>&1; then run="cairn"
elif [ -x "$link" ]; then run="$link"
else run="node $here/bin/cairn.mjs"; fi
out=$($run wake 2>&1); code=$?
printf '%s\n' "$out"
[ "$code" -eq 0 ] || [ "$code" -eq 3 ] || printf 'cairn: wake exited %s\n' "$code"
exit 0
```

`hooks/stop.sh` is the same script; its comment line reads `# hooks/stop.sh: the fallback wake line at stop for a harness without a per-turn hook. Writes nothing; never refuses. Exit 0.` Run `chmod +x hooks/*.sh`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/hooks.test.mjs` -- Expected: PASS, 4 + 27 tests.

- [ ] **Step 5: Commit**

```bash
git add hooks/turn.sh hooks/stop.sh tests/hooks.test.mjs
git commit -m "Add the turn and stop hooks with one test per hook prohibition"
```

---

### Task 4: Hook registration and the three manifests sharing one version

**Files:**
- Create: `hooks/hooks.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `.codex-plugin/plugin.json`, `.muse-plugin/plugin.json`, `tests/manifests.test.mjs`
- Modify: `package.json` (add `files`; version stays `2.0.0-dev`)

**Interfaces:** consumes plan 01's `package.json`; produces the manifests Task 9 rewrites.

Verified against the 1.x manifests in `/home/shawn/workspace2/cairn-dev`: Claude Code uses `.claude-plugin/plugin.json` plus `hooks/hooks.json` with event arrays of `{hooks:[{type:"command",command}]}` and `${CLAUDE_PLUGIN_ROOT}`; the marketplace lists one plugin with `source: "./"`; the Codex manifest carries `skills: "./skills/"` and an `interface` block and registers no hooks (1.x wrote `$HOME/.codex/hooks.json` from the install skill); the Muse manifest is one JSON object with `capabilities.hooks[]` entries `{id, event, command:[...]}` for `SessionStart` and `Stop` and `capabilities.skills[]` entries `{id, path}`. Not verifiable here: whether Codex reads hooks from a plugin manifest at all, whether Codex or Muse expose a per-turn event, and the Muse `schemaVersion` accepted today. Claude Code's per-turn event is `UserPromptSubmit`. A harness without a per-turn event gets `SessionStart` and `Stop` only, and section 6's fallback applies.

- [ ] **Step 1: Write the failing test**

```js
// tests/manifests.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./helpers/hookenv.mjs";

const read = (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));
const MANIFESTS = [".claude-plugin/plugin.json", ".claude-plugin/marketplace.json", ".codex-plugin/plugin.json", ".muse-plugin/plugin.json"];
const SKILLS = ["install-cairn", "new-project", "existing-project", "next-feature"];

test("every manifest carries package.json's version exactly once", () => {
  const v = read("package.json").version;
  for (const m of MANIFESTS) {
    const text = readFileSync(join(ROOT, m), "utf8");
    assert.equal((text.match(/"version"\s*:\s*"[^"]+"/g) ?? []).length, 1, m);
    assert.ok(new RegExp(`"version"\\s*:\\s*"${v}"`).test(text), `${m} lacks ${v}`);
  }
});
test("Claude Code registers session-start, turn and stop", () => {
  const h = read("hooks/hooks.json").hooks;
  assert.ok(h.SessionStart[0].hooks[0].command.endsWith('/hooks/session-start.sh"'));
  assert.ok(h.UserPromptSubmit[0].hooks[0].command.endsWith('/hooks/turn.sh"'));
  assert.ok(h.Stop[0].hooks[0].command.endsWith('/hooks/stop.sh"'));
});
test("Muse registers the hooks it supports and lists the four skills", () => {
  const m = read(".muse-plugin/plugin.json");
  assert.deepEqual(m.capabilities.hooks.map((x) => x.event).sort(), ["SessionStart", "Stop"]);
  for (const x of m.capabilities.hooks) assert.equal(x.command[0], "sh");
  assert.deepEqual(m.capabilities.skills.map((s) => s.id), SKILLS);
});
test("Codex lists the skills directory and the four skills exist", () => {
  assert.equal(read(".codex-plugin/plugin.json").skills, "./skills/");
  for (const s of SKILLS) assert.ok(existsSync(join(ROOT, "skills", s, "SKILL.md")), s);
});
test("no manifest, hook file or skill names next-iteration", () => {
  for (const p of [...MANIFESTS, "hooks/hooks.json", ...SKILLS.map((s) => `skills/${s}/SKILL.md`)]) {
    if (existsSync(join(ROOT, p))) assert.ok(!readFileSync(join(ROOT, p), "utf8").includes("next-iteration"), p);
  }
});
test("docs/plans is not shipped", () => {
  const files = read("package.json").files;
  assert.ok(Array.isArray(files) && !files.some((f) => f.startsWith("docs/plans")));
  for (const f of ["bin/", "lib/", "hooks/", "skills/"]) assert.ok(files.includes(f), f);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/manifests.test.mjs` -- Expected: FAIL, `ENOENT` on `.claude-plugin/plugin.json`.

- [ ] **Step 3: Write the files**

```json
// hooks/hooks.json
{ "hooks": {
  "SessionStart":     [{ "hooks": [{ "type": "command", "command": "sh \"${CLAUDE_PLUGIN_ROOT}/hooks/session-start.sh\"" }] }],
  "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "sh \"${CLAUDE_PLUGIN_ROOT}/hooks/turn.sh\"" }] }],
  "Stop":             [{ "hooks": [{ "type": "command", "command": "sh \"${CLAUDE_PLUGIN_ROOT}/hooks/stop.sh\"" }] }] } }
```

```json
// .claude-plugin/plugin.json
{ "name": "cairn", "version": "2.0.0-dev",
  "description": "The referee for agent-led software development: reads the repository, names the next action.",
  "author": { "name": "eas4ai" }, "license": "UNLICENSED",
  "keywords": ["agent", "specification", "requirements", "review", "hooks"] }
```

```json
// .claude-plugin/marketplace.json
{ "name": "cairn", "description": "Cairn, the referee for agent-led software development", "owner": { "name": "eas4ai" },
  "plugins": [{ "name": "cairn", "source": "./", "version": "2.0.0-dev",
    "description": "The referee for agent-led software development: reads the repository, names the next action.",
    "category": "development", "keywords": ["agent", "specification", "requirements", "review", "hooks"] }] }
```

```json
// .codex-plugin/plugin.json
{ "name": "cairn", "version": "2.0.0-dev",
  "description": "The referee for agent-led software development: reads the repository, names the next action.",
  "author": { "name": "eas4ai" }, "license": "UNLICENSED",
  "keywords": ["agent", "specification", "requirements", "review", "hooks"], "skills": "./skills/",
  "interface": { "displayName": "Cairn", "shortDescription": "The referee for agent-led software development",
    "longDescription": "Cairn reads the repository and names the agent's next action. The plugin carries the command, the four skills and the hooks that print the wake verdict; no hook blocks or writes.",
    "developerName": "eas4ai", "category": "Productivity" } }
```

```json
// .muse-plugin/plugin.json
{ "schemaVersion": 1, "name": "cairn", "displayName": "Cairn", "version": "2.0.0-dev",
  "description": "The referee for agent-led software development: reads the repository, names the next action.",
  "compat": { "manifestDir": ".muse-plugin", "source": "native" },
  "capabilities": { "commands": [], "mcpServers": [], "reminders": [],
    "hooks": [ { "id": "session-start", "event": "SessionStart", "command": ["sh", "hooks/session-start.sh"] },
               { "id": "stop", "event": "Stop", "command": ["sh", "hooks/stop.sh"] } ],
    "skills": [ { "id": "install-cairn", "path": "skills/install-cairn/SKILL.md" }, { "id": "new-project", "path": "skills/new-project/SKILL.md" },
                { "id": "existing-project", "path": "skills/existing-project/SKILL.md" }, { "id": "next-feature", "path": "skills/next-feature/SKILL.md" } ] } }
```

Strip the `// path` comment lines; they name the file. In `package.json` add `"files": ["bin/", "lib/", "hooks/", "skills/", "scripts/release.mjs", "README.md"]`. Until Tasks 5 to 8 replace them, create each `skills/<name>/SKILL.md` as the one-line stub `# <name>` so this task's tests run.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/manifests.test.mjs` -- Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add hooks/hooks.json .claude-plugin .codex-plugin .muse-plugin package.json skills tests/manifests.test.mjs
git commit -m "Register the hooks and add the three plugin manifests on one version"
```

---

### Task 5: The skill shape test and the install-cairn skill

**Files:**
- Create: `tests/skills.test.mjs`, `skills/install-cairn/SKILL.md` (replaces the stub)

**Interfaces:**
- Consumes: `bin/cairn.mjs --help` (plan 08's `lib/cli.mjs` command table prints every command name; that text is the observable).
- Produces: `nodeIds(dot)`, `cairnCommands(text)`, `checkSkill(name, dots)`, `skill(name)` for Tasks 6 to 8.

Every heading that implements a digraph node carries the node id in backticks (`### \`link\``). A decision node's body says its edges. Commands appear as `` `cairn <name> ...` ``; the test takes the word after `cairn ` (plus `mechanism` for `review mechanism`) and requires it as a word in `--help`.

- [ ] **Step 1: Write the failing test**

```js
// tests/skills.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./helpers/hookenv.mjs";

export const nodeIds = (dot) => [...readFileSync(join(ROOT, "docs/diagrams", dot), "utf8").matchAll(/^\s*([a-z][a-z_]*)\s*\[/gm)].map((m) => m[1]);
export const cairnCommands = (text) => [...new Set([...text.matchAll(/`cairn ([a-z][a-z-]*)(?: (mechanism))?/g)].map((m) => (m[2] ? `${m[1]} ${m[2]}` : m[1])))];
export const skill = (name) => readFileSync(join(ROOT, "skills", name, "SKILL.md"), "utf8");
const help = spawnSync(process.execPath, [join(ROOT, "bin/cairn.mjs"), "--help"], { encoding: "utf8" }).stdout;

export function checkSkill(name, dots) {
  const text = skill(name);
  for (const dot of dots) for (const id of nodeIds(dot)) assert.ok(new RegExp("^#+ .*`" + id + "`", "m").test(text), `${name} lacks node ${id} of ${dot}`);
  for (const cmd of cairnCommands(text)) assert.ok(new RegExp("(^|\\s)" + cmd.split(" ")[0] + "(\\s|$)").test(help), `${name} names cairn ${cmd}, absent from --help`);
  assert.ok(/^---\nname: [a-z-]+\ndescription: .+\n(disable-model-invocation: true\n)?---\n/.test(text), `${name} front matter`);
  assert.ok(!/[^\x00-\x7f]/.test(text), `${name} is not ASCII`);
  assert.ok(!text.includes("next-iteration"), name);
}

test("--help prints", () => assert.ok(help.length > 0));
test("install-cairn follows install.dot and names only real commands", () => checkSkill("install-cairn", ["install.dot"]));
test("install-cairn never asks for a project remote", () => {
  const t = skill("install-cairn");
  assert.ok(!/authority_remote|project remote|git remote add/.test(t)); assert.ok(t.includes("~/.local/bin/cairn"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/skills.test.mjs` -- Expected: FAIL, `install-cairn lacks node start of install.dot`.

- [ ] **Step 3: Write the skill**

```markdown
---
name: install-cairn
description: Make the cairn command available to this agent once, globally, and register the hooks the harness supports. Never initializes or changes a project. Use when cairn is missing, the link is broken, or the developer asks to set Cairn up.
---

# Install Cairn

Global setup only. Nothing here touches a repository: `cairn init` belongs to the new-project and existing-project skills.

### `start`
A harness with no Cairn. Follow the nodes in order.

### `prereq`
Run `node --version` and `git --version`: Node 24 and Git 2.40 or later. Either missing: `missing`. Both present: `harness`.

### `missing`
Stop and name the missing prerequisite. Do not install it silently.

### `harness`
Claude Code or Codex: `cc`. Muse: `muse`. Anything else: `other`.

### `cc`
Install the Cairn plugin from its marketplace. The plugin registers the hooks in `hooks/hooks.json` (Claude Code: SessionStart, UserPromptSubmit, Stop). Do not also write hook entries by hand; two registrations run a hook twice. Continue at `link`.

### `muse`
Install the plugin with `muse plugins install <plugin root>`; its manifest registers SessionStart and Stop. Continue at `link`.

### `other`
Install the four skills with the skills CLI (`npx skills add eas4ai/cairn --skill install-cairn new-project existing-project next-feature --global`), then run this skill. Register `hooks/session-start.sh`, `hooks/turn.sh` and `hooks/stop.sh` under the harness's own event names where it has them. No hook system: `nohooks`.

### `nohooks`
Instruction-only: the working agreement in AGENTS.md is the enforcement and the agent runs `cairn wake` itself. Continue at `link`.

### `link`
Link the command once, only when nothing is there, and never replace an existing file. No project remote is selected here.

    mkdir -p ~/.local/bin
    [ -e ~/.local/bin/cairn ] || ln -s "<plugin root>/bin/cairn.mjs" ~/.local/bin/cairn

### `path`
Is `~/.local/bin` on PATH? `command -v cairn` answers. Yes: `help`. No: `addpath`.

### `addpath`
Tell the developer to add `export PATH="$HOME/.local/bin:$PATH"` to their shell startup file. No hook edits the shell. Until a new shell, use the absolute path `~/.local/bin/cairn`. Then `help`.

### `help`
Run `cairn --help`. It prints the commands and exit codes: `project`. It does not: `broken`.

### `broken`
Stop and name the failure exactly as observed: link target, PATH or node.

### `project`
Is this an initialized Cairn project? `cairn wake` exits 0 with a verdict when it is (`wake`) and 3 with one line naming the skill that continues when it is not (`choose`).

### `wake`
The session-start hook prints the verdict and predicate. Hand the developer to the working agreement.

### `choose`
Choose `/new-project` or `/existing-project`; the chosen flow runs `cairn init`. Installation never does.

### `done`
Report where the command is linked, which hooks are registered, and that the four skills are available.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/skills.test.mjs` -- Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/skills.test.mjs skills/install-cairn/SKILL.md
git commit -m "Add the install-cairn skill and the digraph shape test"
```

---

### Task 6: The new-project skill, the shared spec-phase tail and the AGENTS.md template

**Files:**
- Create: `skills/new-project/SKILL.md` (replaces the stub), `skills/new-project/templates/AGENTS.md`
- Modify: `tests/skills.test.mjs`

**Interfaces:**
- Consumes: Task 5; the commands `cairn init`, `lint`, `declare`, `check`, `review mechanism`, `decide`, `authorize`, `start`, `recover`, `wake`, `begin`, `end`, `item`, `outside`, `fix`, `escalate`, `answer`, `reply`, `review`, `brief`, `report`, `resolve`, `accept`, `realize`, `decisions`, `done`, `promote`, `scope`, `push` from plans 03 to 12, as `--help` lists them.
- Produces: the section `## Spec-phase tail`, which Tasks 7 and 8 copy byte for byte (the test asserts identity), and `tail(name)`.

- [ ] **Step 1: Write the failing tests**

```js
export const tail = (name) => { const t = skill(name), i = t.indexOf("## Spec-phase tail"); assert.ok(i >= 0, name); return t.slice(i); };

test("new-project follows new-project.dot and spec-phase.dot", () => checkSkill("new-project", ["new-project.dot", "spec-phase.dot"]));
test("new-project names the four gates in order", () => {
  const t = skill("new-project"), at = ["Gate 1", "Gate 2", "Gate 3", "Gate 4"].map((g) => t.indexOf(g));
  assert.ok(at.every((i, k) => i >= 0 && (k === 0 || i > at[k - 1])), at);
});
test("the AGENTS.md template states a move for every verdict and action", () => {
  const t = readFileSync(join(ROOT, "skills/new-project/templates/AGENTS.md"), "utf8");
  for (const v of ["Resolvable", "Waiting", "Done"]) assert.ok(new RegExp("^- " + v + ":", "m").test(t), v);
  for (const a of ["repair PATH", "recover TRANSACTION", "reconcile ACTION", "scope PATH", "fix ITEM", "record PATH", "commit PATH", "declare REQ", "run REQ", "implement REQ", "escalate REQ", "review mechanism REQ", "capture ITEM", "review SLUG", "report SLUG", "resolve SLUG N", "accept SLUG", "build DECISION", "done SLUG", "promote", "reply SLUG"]) assert.ok(t.includes("`" + a + "`"), a);
  assert.ok(t.includes("`cairn push`"));
  for (const gone of ["explain", "present", "reword", "next-iteration", "refus"]) assert.ok(!t.includes(gone), gone);
  assert.ok(!/[^\x00-\x7f]/.test(t));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/skills.test.mjs` -- Expected: FAIL, `new-project lacks node start of new-project.dot`.

- [ ] **Step 3: Write the skill**

```markdown
---
name: new-project
description: Start new software under Cairn from an empty directory: initialize, ask what it is for, write the keystone, glossary, domains and Draft requirements through four developer gates, then run the shared spec-phase tail to the first work-loop action.
disable-model-invocation: true
---

# New project

### `start`
`/new-project` was invoked. Follow the nodes in order.

### `exists`
Does source code or `docs/spec/overview.md` exist here? A README, a license and a `.git` directory do not count. Yes: `switch`. No: `init`.

### `switch`
Stop and switch to `/existing-project`.

### `init`
Initialize Git if there is none (`git init -b main`). Run `cairn init`: the developer confirms settings, the authority remote or explicit local-only operation, and signed or unsigned-local developer authentication; it writes the init record and the ref roots. Rerunning it with the same answers is idempotent.

### `ask`
One open question, verbatim: "What is the software for?"

### `restate`
Gate 1: restate the answer in your own words; the developer corrects it. Continue only on a correction or an explicit yes.

### `keystone`
Write `docs/spec/overview.md`: what it is, its problem, what it is not, and the spec map with one row per domain file and its prefix.

### `glossary`
Gate 2: write `docs/spec/glossary.md` with five to fifteen terms as one set; the developer corrects by exception.

### `partition`
Gate 3: derive the domains from the keystone; the developer confirms the partition.

### `draft`
For each domain write `docs/spec/<domain>.md` with `Prefix: <PREFIX>` and one block per requirement: `[PREFIX-nnn]`, one obligation with the actor named, `Falsifier:`, `Mechanism:`, `Status: Draft`.

### `more`
More domains? Yes: `draft`. No: `roadmap`.

### `roadmap`
Write `docs/spec/roadmap.md`: `Current: <slug>` naming the first commitment and its section (heading, `Requirements:`, delivery prose, done-when prose).

### `tail`
Gate 4: the spec-phase tail below.

## Spec-phase tail

### `falsifiers`
Propose the falsifiers as one set and name the mechanism that will observe each.

### `review`
Self-review for contradictions, falsifiers that would miss their violation, and requirements no mechanism can check. Performed, not recorded.

### `lint`
Run `cairn lint docs/spec`. Findings: `falsifiers`. Clean: `present`.

### `present`
Present by exception. End with: "If this isn't clear, ask me to explain it another way before you decide."

### `outcome`
The developer asks: `explain`. Corrects: `correct`. Confirms or rules: `agreed`.

### `explain`
Explain another way, then `present` again.

### `correct`
Apply the corrections, then `review` again.

### `agreed`
Set `Status: Agreed <date>` on each confirmed block. A ruling instead of a confirmation is a deference decision: `cairn decide --consequential --quote "<the developer's words>"`.

### `commitment`
Write the roadmap section with the Agreed requirements, delivery and done-when. `Current:` moves inside the start transaction, not by hand.

### `declare`
For this commitment only: `cairn declare <name> --command <cmd> --input <path> --requirement <REQ> --results per-requirement`. Show the violating example fails: `cairn check <REQ>` must record a fail receipt, then `cairn review mechanism <REQ> <receipt>` binds it.

### `agreement`
Copy `templates/AGENTS.md` from this skill to `AGENTS.md` for developer authorization. Do not edit it after authorization.

### `authorize`
The developer runs `cairn authorize`: one record binding the final spec, agreement and settings digests. The agent never runs it.

### `startintent`
Run `cairn start <slug>`. It verifies the authorization, writes the command intent, and commits the prepared contract, agreement and mechanisms.

### `startrec`
The same command finishes the transaction: workspace snapshot, frozen set and digests, `from_superseded` when resuming, and exact refspecs on the authority remote when one is configured. If it was interrupted, `cairn wake` names `recover <transaction>`; run `cairn recover <transaction>`.

### `done`
Run `cairn wake`; it names the first work-loop action. Consequential decisions wait in the queue. Hand over to AGENTS.md.
```

- [ ] **Step 4: Write the template**

```markdown
# Working agreement

This repository runs under Cairn. `docs/spec/` is the contract, the roadmap names the current commitment, and `cairn` reads the repository and names the next action. This file states the move for each verdict and action. The kernel does not parse it; it is protected and changes only between commitments, by developer authorization.

## The agent

Run `cairn wake` first, every session, and act on the verdict only. With hooks the verdict is printed before every turn; this agreement holds without them.

- Resolvable: do the one action named until its predicate holds, leave the required trace (branch commit, snapshot or log record), then run `cairn wake` again.
- Waiting: an escalation is unanswered and wake printed its five fields verbatim. Add nothing and stop; the developer answers.
- Done: a done record exists and nothing waits. Report it and stop. Backlog waiting: wake names `promote` instead.

Before changing a declared input: `cairn begin <action> <target>` (`--touch <path>` declares a new file). After the commit: `cairn end`. Commit before `cairn check`; a check refuses a dirty declared input. Push with `cairn push`: it pushes the branch and both durable refs atomically where the remote allows and in the safe order otherwise. Never push `refs/cairn/*` with plain `git push`.

The move for each action wake can name:

- `repair PATH`: make the hand-written file read under its grammar; change no unrelated byte.
- `recover TRANSACTION`: run `cairn recover <transaction>`.
- `reconcile ACTION`: finish the leased action and `cairn end`, or abandon it with `cairn end --abandon`.
- `scope PATH`: restore the path to its allowed base and run `cairn scope <breach> restore`, or ask the developer to keep it with `cairn escalate` and, after `ok`, `cairn scope <breach> keep`.
- `fix ITEM`: write a test that fails, make it pass, commit, check, then `cairn fix <item>`.
- `record PATH` and `commit PATH`: put the change under a lease with `cairn begin`, commit it, or revert it.
- `declare REQ`: `cairn declare` a mechanism naming REQ; show it fail on a violating example before trusting it.
- `run REQ`: `cairn check REQ`.
- `implement REQ`: read the latest receipt and its output, change the code under a lease, commit, `cairn end`, `cairn check REQ`.
- `escalate REQ`: three attempts failed; `cairn escalate` with the five fields before any fourth attempt.
- `review mechanism REQ`: `cairn review mechanism REQ <fail-receipt>` after checking the failure was the stated violation.
- `capture ITEM`: `cairn outside <item> "<why it is not this commitment's work>"`, or escalate.
- `review SLUG`: `cairn review SLUG` answering Q1 to Q6 for every target with observed commands, paths or outputs.
- `report SLUG`: `cairn brief SLUG`; start one adversary with none of your context on the brief and projection only; wait; `cairn report SLUG --file <its report>`.
- `resolve SLUG N`: fix finding N as its own work, commit, then `cairn resolve SLUG N "<how>"`; or dispute it with `cairn escalate`.
- `accept SLUG`: give the adversary the report, the resolutions and the cumulative delta; `cairn accept SLUG --file <its acceptance>`.
- `build DECISION`: build what the decision says, commit, then `cairn realize <id> --subject "<what was built>"`.
- `done SLUG`: `cairn done SLUG`.
- `promote`: choose one backlog item by judgment; `cairn promote <item>`. Promotion never Agrees text.
- `reply SLUG`: `cairn reply SLUG "<explanation>"`; an `ask` answer authorizes an explanation only.

Out of scope is captured, never built: `cairn item --backlog`, `--next-feature --changes <REQ>`, or `--defect --from <REQ>`. A defect against this commitment's requirement is worked here, not captured. Decide by level: Routine and Judged leave no record; Consequential is `cairn decide --consequential` and continues; Blocking is `cairn escalate` and stops.

## The developer

Answer an escalation with `cairn answer <slug> ok | instead <text> | ask <text>`. Read the queue with `cairn decisions` and mark each with `cairn decisions --read <id>`. Run `cairn authorize` after changing `docs/spec/`, `AGENTS.md` or `.cairn/settings.json` between commitments. After Done, open the next work with `/next-feature`.
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test tests/skills.test.mjs` -- Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add skills/new-project tests/skills.test.mjs
git commit -m "Add the new-project skill, the spec-phase tail and the working agreement template"
```

---

### Task 7: The existing-project skill

**Files:**
- Create: `skills/existing-project/SKILL.md` (replaces the stub)
- Modify: `tests/skills.test.mjs`

**Interfaces:** consumes Task 5's `checkSkill` and Task 6's `tail`; produces nothing new.

- [ ] **Step 1: Write the failing tests**

```js
test("existing-project follows existing-project.dot and spec-phase.dot", () => checkSkill("existing-project", ["existing-project.dot", "spec-phase.dot"]));
test("existing-project carries the same spec-phase tail as new-project", () => assert.equal(tail("existing-project"), tail("new-project")));
test("existing-project names supersession as two phases", () => {
  const t = skill("existing-project");
  assert.ok(t.includes("`cairn supersede ")); assert.ok(/does not move `Current:`/.test(t)); assert.ok(/points back to the superseded record/.test(t));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/skills.test.mjs` -- Expected: FAIL, `existing-project lacks node start of existing-project.dot`.

- [ ] **Step 3: Write the skill**

```markdown
---
name: existing-project
description: Bring an existing codebase under Cairn, reconcile a drifted spec, or resume a pending supersession. Reads the code before asking anything, writes a cited recon report, and prepares one commitment through the shared spec-phase tail. Observed is not Agreed.
disable-model-invocation: true
---

# Existing project

### `start`
`/existing-project` was invoked. Follow the nodes in order.

### `state`
Run `cairn wake`. Done: `tonext`. Resolvable or Waiting with an open commitment: `fits`. Exit 3 naming a pending successor: `pending`. Exit 3 naming this skill because the project is not initialized: `init`. A verdict with no open range: `hasspec`.

### `tonext`
Stop and switch to `/next-feature`; this work is a later commitment.

### `fits`
Does the request belong to the open commitment? Yes: `continue`. No: `midway`.

### `continue`
Return to the work loop under AGENTS.md.

### `midway`
A commitment is open. The developer chooses: finish it (`finish`) or supersede it (`supersede`). State both and what each changes.

### `finish`
Capture the request: `cairn item --backlog --slug <slug> --from <REQ> --body "<what>"`, or `--next-feature --changes <REQ>` when it would change Agreed text. Return to the work loop.

### `supersede`
Run `cairn supersede <successor-slug> --quote "<the developer's words>"`. It writes the developer-quoted Consequential decision and the superseded record: old range closed with a transition id and intended slug; open escalations, unresolved findings and unfixed defects carried. It does not move `Current:` and cannot name a start that does not exist. Then `pending`.

### `pending`
A pending successor: resume the transition. Everything below prepares the successor; its later start points back to the superseded record. Continue at `readspec`.

### `init`
Run `cairn init`; the developer confirms settings, the authority remote or local-only, and the developer-authentication mode. Settings without refs are adopted only after the developer confirms their digest; refs without settings refuse and name the repair. Then `hasspec`.

### `hasspec`
Does `docs/spec/overview.md` exist? Yes, Path B: `readspec`. No, Path A: `recon`.

### `readspec`
Path B: read the glossary, keystone, domains, roadmap, `cairn decisions` and the items first. Then `recon`.

### `recon`
Recon before questions: manifests, entry points, data, tests, CI, scripts, non-spec docs and recent history. Path B covers every commit since the newest Agreed date.

### `report`
Write `docs/recon.md`: every claim as Exists, Documented, Contradicted or Unverified with a citation; carry unresolved earlier findings.

### `corrects`
Present it; the developer corrects the reading.

### `ask`
One open question: a feature to add, or a defect to fix?

### `radius`
Trace and cite the blast radius: modules, tests and spec sections. Path A: `pathA`. Path B: `pathB`.

### `pathA`
Glossary from code identifiers; Observed specs inside the radius; one-line map rows outside it. Then `confirm`.

### `pathB`
Verify every spec section inside the radius. Then `verdict`.

### `verdict`
Per section: Holds or Still Observed: `confirm`. Drifted: `drift`. Missing: `missing`.

### `drift`
Raise both sides with citations; the developer rules.

### `rule`
Which side is wrong? Spec: `specwrong`. Code: `codewrong`.

### `specwrong`
Revise the spec by the developer's ruling before the successor start; no commitment is open, so the text may change now. Then `confirm`.

### `codewrong`
The spec stands: `cairn item --defect --slug <slug> --from <REQ> --body "<what the code does instead>"`. Then `confirm`.

### `missing`
Write the missing behavior as Observed. Then `confirm`.

### `confirm`
Observed sections the developer confirms become Draft with falsifiers; the rest remain Observed and are not contract.

### `roadmap`
Prepare the roadmap section. A defect commitment names the violated requirement and a mechanism that reproduces it.

### `tail`
The spec-phase tail below; `cairn start` includes the supersession link when a transition is pending.

## Spec-phase tail
```

After that last heading paste the rest of the `## Spec-phase tail` section from Task 6 Step 3 byte for byte, from `### \`falsifiers\`` to the end. The identity test enforces it.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/skills.test.mjs` -- Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add skills/existing-project/SKILL.md tests/skills.test.mjs
git commit -m "Add the existing-project skill"
```

---

### Task 8: The next-feature skill

**Files:**
- Create: `skills/next-feature/SKILL.md` (replaces the stub)
- Modify: `tests/skills.test.mjs`

**Interfaces:** consumes Task 5's `checkSkill` and Task 6's `tail`; produces nothing new.

- [ ] **Step 1: Write the failing tests**

```js
test("next-feature follows next-feature.dot and spec-phase.dot", () => checkSkill("next-feature", ["next-feature.dot", "spec-phase.dot"]));
test("next-feature carries the same spec-phase tail", () => assert.equal(tail("next-feature"), tail("new-project")));
test("next-feature runs from Done only", () => assert.ok(/says Done\?[\s\S]*Stop/.test(skill("next-feature"))));
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/skills.test.mjs` -- Expected: FAIL, `next-feature lacks node start of next-feature.dot`.

- [ ] **Step 3: Write the skill**

```markdown
---
name: next-feature
description: After a commitment is Done, take the waiting items or a new request, trace and cite each change's blast radius, revise or add Draft requirements with the developer, and run the shared spec-phase tail to the next start. Runs from Done only.
disable-model-invocation: true
---

# Next feature

### `start`
`/next-feature` was invoked. Follow the nodes in order.

### `isdone`
Does `cairn wake` say Done? No: `notdone`. Yes: `read`.

### `notdone`
Stop and hand the verdict to AGENTS.md. Anything else is the loop's.

### `read`
Read the spec set, the finished roadmap section, the Consequential queue (`cairn decisions`), the unpromoted next-feature items and the backlog (`cairn show items`).

### `ask`
One open question: the waiting items, a new feature, or both? Then, for each requested change, `radius`.

### `radius`
Trace and cite the blast radius: requirements, mechanisms, code and documents.

### `restate`
Restate what changes for whom; quote any affected Agreed text; give the alternative and your recommendation.

### `corrects`
The developer corrects the reading.

### `fits`
Covered by the current Agreed requirements? Yes: `covered`. No: `revise`.

### `covered`
Put it into the commitment; write no new contract text. Then `next`.

### `revise`
Revise under the same identifier, or add a Draft block, with at most one `Rationale:` line. No commitment is open, so confirmed text may change before the new start. Then `next`.

### `next`
More changes? Yes: `radius`. No: `tail`.

### `tail`
The spec-phase tail below.

## Spec-phase tail
```

After that last heading paste the rest of the `## Spec-phase tail` section from Task 6 Step 3 byte for byte.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/skills.test.mjs` -- Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add skills/next-feature/SKILL.md tests/skills.test.mjs
git commit -m "Add the next-feature skill"
```

---

### Task 9: The release script and its attribution check

**Files:**
- Create: `scripts/release.mjs`, `tests/release.test.mjs`

**Interfaces:**
- Consumes: `loadSettings(cwd)` from `lib/settings.mjs` (`attribution`); `wake(cwd)` from `lib/wake.mjs` (the Done gate, injectable for tests); Task 4's manifests.
- Produces: `scanAttribution(cwd, range) -> [{sha, line}]`; `release(cwd, version, {wake}) -> {sha, tag}`; `node scripts/release.mjs <version>` runs `release` on `process.cwd()` and exits 3 with one line on refusal.

The check runs when settings say `attribution: forbidden`: every commit from the newest `v*` tag (or the root when none) to HEAD is scanned, and any message line matching one of these patterns, case-insensitive, refuses the release before anything is written: `^Co-Authored-By:.*\b(claude|codex|chatgpt|gpt|copilot|gemini|muse|openai|anthropic)\b`, `Generated with \[?Claude Code`, `^Claude-Session:`, `claude\.ai/code/session`, `^Signed-off-by:.*\bnoreply@anthropic\.com`.

- [ ] **Step 1: Write the failing test**

```js
// tests/release.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { throwawayRepo } from "./helpers/hookenv.mjs";
import { scanAttribution, release } from "../scripts/release.mjs";

const SETTINGS = { schema: 1, authority_remote: null, outside: [], source: [], interfaces: [], data: [], network_exclude: [], signing_key: null, attribution: "forbidden", harness: {},
  typesafeai: { enabled: false, mode: "shadow", model: "jev-1.13.0", route_confidence: 0.8, sufficient_threshold: 0.7, outside_threshold: 0.8, contradicts_ceiling: 0.3, reversible_floor: 0.7, observed_floor: 0.6, max_false_downgrade: 0.05, min_calibration_agent_predictions: 60, request_cap_bytes: 48000 } };

function releasable() {
  const r = throwawayRepo();
  mkdirSync(join(r.dir, ".cairn")); writeFileSync(join(r.dir, ".cairn/settings.json"), JSON.stringify(SETTINGS) + "\n");
  writeFileSync(join(r.dir, "package.json"), '{"name":"x","version":"2.0.0"}\n');
  for (const d of [".claude-plugin", ".codex-plugin", ".muse-plugin"]) { mkdirSync(join(r.dir, d)); writeFileSync(join(r.dir, d, "plugin.json"), '{"version":"2.0.0"}\n'); }
  writeFileSync(join(r.dir, ".claude-plugin/marketplace.json"), '{"plugins":[{"version":"2.0.0"}]}\n');
  writeFileSync(join(r.dir, "CHANGELOG.md"), "## 2.0.1 - 2026-09-19\n\n- a change\n");
  r.git("add", "-A"); r.git("commit", "-q", "-m", "Prepare the release files");
  return r;
}
const tainted = (r, body) => { writeFileSync(join(r.dir, "a.txt"), "a\n"); r.git("add", "a.txt"); r.git("commit", "-q", "-m", `Add a\n\n${body}`); };
const done = { wake: async () => ({ verdict: "Done" }) };

test("scanAttribution finds an attribution trailer and names its commit", () => {
  const r = releasable(); tainted(r, "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>");
  const found = scanAttribution(r.dir, "HEAD~1..HEAD");
  assert.equal(found.length, 1); assert.equal(found[0].sha, r.git("rev-parse", "HEAD").trim()); assert.match(found[0].line, /^Co-Authored-By: Claude/);
});
test("release refuses the range and writes nothing", async () => {
  const r = releasable(); tainted(r, "Claude-Session: https://claude.ai/code/session_x");
  const head = r.git("rev-parse", "HEAD");
  await assert.rejects(release(r.dir, "2.0.1", done), /attribution/);
  assert.equal(r.git("rev-parse", "HEAD"), head); assert.equal(r.git("tag", "-l").trim(), "");
});
test("a clean range releases: one commit, one tag, every version file changed", async () => {
  const r = releasable();
  assert.equal((await release(r.dir, "2.0.1", done)).tag, "v2.0.1");
  assert.equal(r.git("tag", "-l").trim(), "v2.0.1");
  for (const f of ["package.json", ".muse-plugin/plugin.json", ".claude-plugin/marketplace.json"]) assert.ok(r.git("show", `HEAD:${f}`).includes('"version":"2.0.1"'), f);
});
test("release refuses when wake is not Done", async () => {
  const r = releasable();
  await assert.rejects(release(r.dir, "2.0.1", { wake: async () => ({ verdict: "Resolvable", action: "review", target: "x" }) }), /not at Done/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/release.test.mjs` -- Expected: FAIL, cannot find module `scripts/release.mjs`.

- [ ] **Step 3: Write the script**

```js
#!/usr/bin/env node
// scripts/release.mjs: one commit that sets one version in package.json and the manifests,
// tagged v<version>, at Done, with no AI attribution since the last release. Refuses before writing.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { loadSettings } from "../lib/settings.mjs";

const FILES = ["package.json", ".claude-plugin/plugin.json", ".claude-plugin/marketplace.json", ".codex-plugin/plugin.json", ".muse-plugin/plugin.json"];
const PATTERNS = [
  /^Co-Authored-By:.*\b(claude|codex|chatgpt|gpt|copilot|gemini|muse|openai|anthropic)\b/i,
  /Generated with \[?Claude Code/i, /^Claude-Session:/i, /claude\.ai\/code\/session/i, /^Signed-off-by:.*\bnoreply@anthropic\.com/i,
];
const git = (cwd, ...a) => { const r = spawnSync("git", a, { cwd, encoding: "utf8" }); if (r.status !== 0) throw new Error(`git ${a[0]} failed: ${r.stderr.trim().split("\n")[0]}`); return r.stdout; };

export function scanAttribution(cwd, range) {
  const found = [];
  for (const entry of git(cwd, "log", "--format=%H%x00%B%x01", range).split("\x01")) {
    const [sha, body] = entry.split("\x00");
    if (!sha?.trim()) continue;
    for (const line of (body ?? "").split("\n")) if (PATTERNS.some((p) => p.test(line.trim()))) found.push({ sha: sha.trim(), line: line.trim() });
  }
  return found;
}

export async function release(cwd, next, { wake } = {}) {
  const refuse = (why) => { throw new Error(`release: ${why}`); };
  if (!/^\d+\.\d+\.\d+$/.test(next ?? "")) refuse("usage: node scripts/release.mjs <major.minor.patch>");
  const read = (f) => readFileSync(join(cwd, f), "utf8");
  const current = JSON.parse(read("package.json")).version;
  const field = () => new RegExp(`"version"\\s*:\\s*"${current.replace(/[.+-]/g, "\\$&")}"`, "g");
  const texts = FILES.map((f) => [f, read(f)]);
  for (const [f, t] of texts) if ((t.match(field()) ?? []).length !== 1) refuse(`${f} does not carry "version": "${current}" exactly once`);
  const log = read("CHANGELOG.md"), at = log.search(new RegExp(`^## ${next.replace(/\./g, "\\.")} - \\d{4}-\\d{2}-\\d{2}$`, "m"));
  if (at < 0) refuse(`CHANGELOG.md has no entry "## ${next} - <date>"`);
  const end = log.indexOf("\n## ", at + 1), entry = log.slice(at, end < 0 ? undefined : end).trim();
  if (git(cwd, "tag", "-l", `v${next}`).trim()) refuse(`tag v${next} exists`);
  if (git(cwd, "status", "--porcelain", "--untracked-files=no").trim()) refuse("the tree is dirty");
  const { settings } = loadSettings(cwd);
  if (settings.attribution === "forbidden") {
    const last = git(cwd, "tag", "-l", "v*", "--sort=-v:refname").split("\n").find(Boolean);
    const found = scanAttribution(cwd, last ? `${last}..HEAD` : "HEAD");
    if (found.length) refuse(`attribution forbidden; found in ${found.map((f) => f.sha.slice(0, 7) + ": " + f.line).join("; ")}`);
  }
  const w = await (wake ?? (await import("../lib/wake.mjs")).wake)(cwd);
  if (w.verdict !== "Done") refuse(`the loop is not at Done: ${[w.verdict ?? w.line, w.action, w.target].filter(Boolean).join(" ")}`);
  for (const [f, t] of texts) writeFileSync(join(cwd, f), t.replace(field(), (m) => m.replace(`"${current}"`, `"${next}"`)));
  git(cwd, "add", "--", ...FILES);
  git(cwd, "commit", "-q", "-m", `Release ${next}`);
  git(cwd, "tag", "-a", `v${next}`, "-m", entry.replace(/^## /, ""));
  return { sha: git(cwd, "rev-parse", "HEAD").trim(), tag: `v${next}` };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  release(process.cwd(), process.argv[2]).then(
    ({ sha, tag }) => process.stdout.write(`release: ${tag} at ${sha.slice(0, 7)}; next: cairn check --stale, the review, cairn push, then git push origin ${tag}\n`),
    (e) => { process.stderr.write(`${e.message}\n`); process.exit(3); },
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/release.test.mjs` -- Expected: PASS. If plan 02's `loadSettings` refuses the test's settings object, the object is wrong, not the script: make it the full section 2 shape.

- [ ] **Step 5: Run the whole suite and commit**

Run: `node --test tests/*.test.mjs` -- Expected: PASS.

```bash
git add scripts/release.mjs tests/release.test.mjs
git commit -m "Add the release script with the attribution check"
```

---

## Spec coverage

| Spec sentence | Task |
|---|---|
| 3 Install: begins with Node and Git; a missing one stops and is named | 5 (`prereq`, `missing`) |
| 3 Install: links `~/.local/bin/cairn`, registers hooks where supported, lists the four skills; a harness without hooks is instruction-only | 4, 5 (`link`, `cc`, `muse`, `other`, `nohooks`, `done`) |
| 3 Install: global, never asks for a project remote, complete when `cairn --help` prints | 5 (`link`, `help`, remote test) |
| 3 Install: inside a project the session-start hook prints the verdict; elsewhere it names `/new-project` or `/existing-project` | 1, 2 |
| 3 Project initialization: init before settings, remote, key, idempotent; adopt settings on confirmed digest; refuse refs without settings | 6 (`init`), 7 (`init`); the command is plan 03 |
| 3 New project: empty-directory rule, one open question, four gates, roadmap before the tail | 6 |
| 3 Existing project: Done switches; finish or supersede; two-phase supersession; recon; Paths A and B; `docs/recon.md`; drift ruling; defect commitment | 7 |
| 3 Next feature: from Done only; read set and queue; one question; blast radius; covered or revised | 8 |
| 3 Shared tail: falsifiers as one set, self-review, lint, present by exception, Agreed, roadmap, declare and demonstrate, agreement, `cairn authorize`, `cairn start`, wake | 6 (tail, shared with 7 and 8) |
| 3 Work loop: verdicts and moves; Waiting stops; done; promote | 6 (AGENTS.md template) |
| 6: per-turn hook runs wake and prints verdict, action, reason, predicate; stop hook is the fallback | 3 |
| 6: session-start prints state and one line naming a missing link, PATH entry or durable ref; writes nothing | 1, 2 |
| 6: no hook refuses a stop, counts refusals, creates a record, edits a file, commits, pushes, calls a model, or completes an action | 3 (one test each) |
| 6: install skill makes the link and registers hooks once | 5 |
| 11: one plugin: command, hooks, four skills; manifests share one version; skills install through the skills CLI | 4, 5 |
| 11: release and attribution check belong to this repository's process | 9 |
| 12: stop-hook refusal, refusal counts, stop records, `explain`, `present`, `reword` removed | 3, 6 (template test forbids the words) |
| 13.2, 13.4, 13.12 | 3; 4 to 8 (old name forbidden); 5 |

Left to other plans: `cairn init` (plan 03); the `cairn start` transaction and refspecs (plans 04, 06, 12); `cairn push` (plan 12); the wake output format the hooks print (plan 08); `cairn brief` reading the harness from its environment or `--harness` (plan 10); the evaluator module shipped with the plugin (plan 11).
