// The spec lint against fixtures that realize each rule's falsifier, and
// against this repository's own specification.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const LINT = new URL("../scripts/spec-lint.mjs", import.meta.url).pathname;
const ROOT = new URL("..", import.meta.url).pathname;
const lint = (dir) => spawnSync("node", [LINT, dir], { encoding: "utf8" });
function fixture(text) { const d = mkdtempSync(join(tmpdir(), "lint-")); writeFileSync(join(d, "x.md"), text); return d; }
const AGREED = "# X\n\nStatus: Agreed 2026-09-04\nPrefix: X\n\n";

test("a two-obligation sentence is named (PKG-007)", () => {
  const r = lint(fixture(AGREED + "[X-001] The agent MUST do this and MUST NOT do that.\nFalsifier: it does.\n"));
  assert.equal(r.status, 1); assert.match(r.stdout, /X-001 states 2 obligations.*PKG-007/);
});

test("an obligation with no actor is named (PKG-010)", () => {
  const r = lint(fixture(AGREED + "[X-001] MUST be fast.\nFalsifier: it is slow.\n"));
  assert.equal(r.status, 1); assert.match(r.stdout, /X-001 states an obligation with no actor.*PKG-010/);
});

test("a leading condition clause is not the actor, and the actor after it counts", () => {
  const r = lint(fixture(AGREED + "[X-001] When it rains, the agent MUST stay in.\nFalsifier: it goes out.\n"));
  assert.equal(r.status, 0, r.stdout);
});

test("an Agreed requirement with no falsifier is named (SPEC-002); a Draft one is not", () => {
  let r = lint(fixture(AGREED + "[X-001] The agent MUST act.\n\n[X-002] The agent MUST wait.\nFalsifier: it acts.\n"));
  assert.equal(r.status, 1); assert.match(r.stdout, /X-001 is Agreed and carries no Falsifier.*SPEC-002/); assert.doesNotMatch(r.stdout, /X-002/);
  r = lint(fixture("# X\n\nStatus: Draft\nPrefix: X\n\n[X-001] The agent MUST act.\n"));
  assert.equal(r.status, 0, r.stdout);
});

test("prose after a Draft requirement with no falsifier is not scanned as requirement text", () => {
  const r = lint(fixture("# X\n\nStatus: Draft\nPrefix: X\n\n[X-001] The agent MUST act.\n\nThis prose says MUST and MUST NOT freely, because it is prose.\n"));
  assert.equal(r.status, 0, r.stdout);
});

test("a spec declaring a prefix with no requirement is named (SPEC-001)", () => {
  const r = lint(fixture(AGREED + "## Nothing here\n"));
  assert.equal(r.status, 1); assert.match(r.stdout, /declares Prefix: X and holds no requirement.*SPEC-001/);
});

test("a keyword in backticks or quotes is a mention, not an obligation", () => {
  const r = lint(fixture(AGREED + "[X-001] The agent MUST write `MUST` or \"MUST NOT\" exactly once.\nFalsifier: it writes two.\n"));
  assert.equal(r.status, 0, r.stdout);
});

test("this repository's own specification passes the lint", () => {
  const r = lint(join(ROOT, "docs", "spec"));
  assert.equal(r.status, 0, r.stdout);
});

test("duplicate identifiers are rejected within a file and across files (SPEC-020)", () => {
  const block = "[X-001] The service MUST reject an empty request.\nFalsifier: An empty request succeeds.\n";
  const dir = fixture(AGREED + block + "\n" + block);
  assert.match(lint(dir).stdout, /X-001.*duplicate/i);
  writeFileSync(join(dir, "x.md"), AGREED + block);
  writeFileSync(join(dir, "y.md"), AGREED + block);
  const r = lint(dir);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /y.md:.*X-001.*duplicate.*x.md:/i);
});

test("references resolve across files; missing references name their source (SPEC-021)", () => {
  const dir = fixture(AGREED + "[X-001] The service MUST follow X-999.\nFalsifier: It ignores the rule.\n");
  let r = lint(dir);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /x.md:.*X-999.*unresolved/i);
  writeFileSync(join(dir, "y.md"), AGREED + "[X-999] The service MUST reject empty requests.\nFalsifier: An empty request succeeds.\n");
  assert.equal(lint(dir).status, 0);
});

test("code examples and quoted mentions are neither definitions nor references", () => {
  const dir = fixture(AGREED + '[X-001] The service MUST write `X-999` or "X-998".\nFalsifier: It writes another value.\n\n```md\n[X-001] Example only.\nSee X-997.\n```\n\n~~~~md\n[X-001] Another example.\n~~~\nSee X-996.\n~~~~\n');
  const r = lint(dir);
  assert.equal(r.status, 0, r.stdout);
});

test("machine-local paths are findings in prose, links, quotes, and examples (SPEC-019)", () => {
  for (const path of ["/home/alex/project/src/main.rs", "~/project/src/main.rs", "~alex/project", "~alex", "[/tmp/input]", '"/tmp/input"', '`/tmp/input`', "[input](/tmp/input)", "```sh\ncat /tmp/input\n```", "/tmp"]) {
    const r = lint(fixture(AGREED + `[X-001] The agent MUST read input.\nFalsifier: It reads nothing.\n\nRead ${path}.\n`));
    assert.equal(r.status, 1, path); assert.match(r.stdout, /absolute path.*SPEC-019/);
  }
});

test("relative paths, URLs, slash commands, and character mentions are not absolute path findings", () => {
  const text = 'Read src/main.rs and ../shared/config.json. See [manual](https://example.test/docs/guide). Use /new-project or /existing-project. The slash `/` and tilde `~` are characters.\n';
  const r = lint(fixture(AGREED + '[X-001] The agent MUST act.\nFalsifier: It waits.\n\n' + text));
  assert.equal(r.status, 0, r.stdout);
});

test("a slash after a placeholder continues the template (SPEC-019)", () => {
  const text = "The socket is `<runtime-directory>/suprnova.sock`; tags are `suprnova/<run>/v<version>`.\nUse <system-temp>/suprnova-<UID> and <repository>/.suprnova/config.toml.\n";
  const r = lint(fixture(AGREED + "[X-001] The agent MUST act.\nFalsifier: It waits.\n\n" + text));
  assert.equal(r.status, 0, r.stdout);
  assert.match(lint(fixture(AGREED + "Read </tmp/input>.\n")).stdout, /absolute path \/tmp\/input/);
});

test("a host path is a finding until the file declares it (SPEC-019, SPEC-024)", () => {
  const body = "[X-001] The agent MUST act.\nFalsifier: It waits.\n\nTask Bash requires `/usr/bin/bwrap` and reads `~/.suprnova/config.toml`.\n";
  let r = lint(fixture(AGREED + body));
  assert.equal(r.status, 1); assert.match(r.stdout, /absolute path \/usr\/bin\/bwrap/);
  r = lint(fixture(AGREED + "Host paths: /usr/bin/bwrap, ~/.suprnova/config.toml\n" + body));
  assert.equal(r.status, 0, r.stdout);
});

test("declared host paths cover children with a slash boundary and stay file-local", () => {
  const body = "[X-001] The agent MUST act.\nFalsifier: It waits.\n\n";
  const header = AGREED + "Host paths: /run/, ~/.config/app\n";
  let r = lint(fixture(header + body + 'Read /run, `/run/app/socket`, "~/.config/app/config.toml", and </run/app>.\n```sh\ncat /run/app/socket\n```\n'));
  assert.equal(r.status, 0, r.stdout);
  r = lint(fixture(header + body + "Read /run-other/socket, ~/.config/application/config.toml, and /tmp/input.\n"));
  assert.equal(r.status, 1); assert.match(r.stdout, /absolute path \/run-other\/socket/);
  assert.match(r.stdout, /absolute path ~\/\.config\/application\/config.toml/);
  assert.match(r.stdout, /absolute path \/tmp\/input/);
  const dir = fixture(header + body);
  writeFileSync(join(dir, "y.md"), "Read /run/app/socket.\n");
  assert.match(lint(dir).stdout, /y.md:1: absolute path \/run\/app\/socket/);
});

test("a host-path declaration inside a requirement or example grants no exception", () => {
  const body = "[X-001] The agent MUST act.\nFalsifier: It waits.\n";
  for (const text of [body + "Host paths: /tmp\n", "```md\nHost paths: /tmp\n```\n" + body, "~~~~md\nHost paths: /tmp\n~~~~\n" + body]) {
    const r = lint(fixture(AGREED + text + "\nRead /tmp/input.\n"));
    assert.equal(r.status, 1); assert.match(r.stdout, /absolute path \/tmp\/input/);
  }
});

test("host-path declarations require absolute or home-relative entries", () => {
  for (const value of ["", "relative/path", "/tmp,", "https://example.test/tmp", "/tmp extra"]) {
    const r = lint(fixture(AGREED + `Host paths: ${value}\n[X-001] The agent MUST act.\nFalsifier: It waits.\n`));
    assert.equal(r.status, 1, value); assert.match(r.stdout, /Host paths:.*SPEC-024/);
  }
});
