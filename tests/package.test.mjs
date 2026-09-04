import { test, expect } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The package's own rules, and the rules the engine keeps about the
// vocabulary and the layers it does not own. Each test produces the
// state its requirement's falsifier names and shows the package
// refusing it. These run against this repository, because that is what
// the requirements are about.

const TEST_TIMEOUT = 120_000;

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

function tracked(patterns = []) {
  const r = spawnSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" });
  const files = r.stdout.split("\0").filter((p) => p !== "");
  return patterns.length ? files.filter((p) => patterns.some((x) => p.includes(x))) : files;
}

// Markdown prose wraps, so a sentence spans lines. A paragraph, the run
// of non-blank lines between blanks, is the smallest unit that holds a
// whole sentence, and it is what a prose rule has to read.
function paragraphs(text) {
  const out = [];
  let start = 0;
  let buffer = [];
  text.split("\n").forEach((line, i) => {
    if (line.trim() === "") {
      if (buffer.length) out.push({ text: buffer.join(" "), line: start + 1 });
      buffer = [];
      return;
    }
    if (buffer.length === 0) start = i;
    buffer.push(line.trim());
  });
  if (buffer.length) out.push({ text: buffer.join(" "), line: start + 1 });
  return out;
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

test("the ASCII gate passes on this repository and reports a file that breaks it (PKG-003)", () => {
  const gate = join(ROOT, "scripts", "checks", "ascii-gate.mjs");
  const clean = spawnSync("node", [gate, ROOT], { encoding: "utf8" });
  expect(clean.status).toBe(0);
  expect(clean.stdout).toContain("all ASCII");
  // The falsifier state: a tracked text file with a character outside ASCII.
  const base = mkdtempSync(join(tmpdir(), "same-page-ascii-"));
  spawnSync("git", ["init", "-q", "-b", "main"], { cwd: base });
  // The fixture writes the character by escape: this file is tracked,
  // and the gate it tests reads tracked files.
  writeFileSync(join(base, "spec.md"), "an em dash \u2014 here\n");
  spawnSync("git", ["add", "-A"], { cwd: base });
  const dirty = spawnSync("node", [gate, base], { encoding: "utf8" });
  expect(dirty.status).toBe(1);
  expect(dirty.stdout).toContain("spec.md:1: non-ASCII");
  expect(dirty.stdout).toContain("1 non-ASCII character(s)");
}, TEST_TIMEOUT);

// A placeholder a scaffold is meant to replace: [project name], <your
// project>, {{name}}, TBD. A markdown link is not one.
function placeholders(text, rel = "fixture") {
  const out = [];
  text.split("\n").forEach((line, i) => {
    const m = /\[[a-z][a-z ]*(name|here|project|domain|path|date|tool)[a-z ]*\]|\{\{[^}]+\}\}|<your [^>]+>|\bTBD\b|\bFILL ?ME\b|\bXXX\b/.exec(line);
    if (m && !/\]\(/.test(line)) out.push(`${rel}:${i + 1}: ${m[0]}`);
  });
  return out;
}

test("no shipped template carries a bracketed placeholder (PKG-004)", () => {
  // The falsifier state, and the check that finds it.
  expect(placeholders("Write the overview for [project name] here.\n")).toEqual(["fixture:1: [project name]"]);
  expect(placeholders("See [the manual](docs/MANUAL.md) for the broker.\n")).toEqual([]);
  const templates = tracked(["/templates/"]).filter((p) => p.endsWith(".md"));
  expect(templates.length).toBeGreaterThan(0);
  const offenders = templates.flatMap((rel) => placeholders(readFileSync(join(ROOT, rel), "utf8"), rel));
  expect(offenders).toEqual([]);
}, TEST_TIMEOUT);

test("the drift gate, the language check, and the engine live under skills/new-project/scripts/ (PKG-006)", () => {
  const dir = join(ROOT, "skills", "new-project", "scripts");
  expect(existsSync(join(dir, "spec-drift-gate.mjs"))).toBe(true);
  expect(existsSync(join(dir, "language-check.mjs"))).toBe(true);
  expect(existsSync(join(dir, "engine", "same-page.ts"))).toBe(true);
  // And nowhere else: no second copy anywhere in the tree.
  const copies = tracked().filter((p) => /(^|\/)(spec-drift-gate|language-check)\.mjs$/.test(p) || /(^|\/)engine\/same-page\.ts$/.test(p));
  expect(copies.sort()).toEqual([
    "skills/new-project/scripts/engine/same-page.ts",
    "skills/new-project/scripts/language-check.mjs",
    "skills/new-project/scripts/spec-drift-gate.mjs",
  ]);
}, TEST_TIMEOUT);

// A layer named in the same sentence as a word that puts it outside the
// build. A rule forbidding that, a falsifier describing it, and a
// sentence about the check that looks for it all name the words without
// doing it: those are mentions, the way the language check treats a
// keyword inside backticks. The blind spot this leaves is stated
// plainly: a sentence that both describes a check and puts a layer out
// of scope reads as a mention here, and the spec review is what catches
// that.
function layersOutOfScope(text, rel = "fixture") {
  const out = [];
  for (const { text: p, line } of paragraphs(text)) {
    if (!/\bL[1-6]\b|\blayer\b/i.test(p)) continue;
    if (!/\b(optional|out of scope|never built|will not be built|not planned|abandoned)\b/i.test(p)) continue;
    if (/\bnever\b|\bmust not\b|\bFalsifier:/i.test(p)) continue;
    if (/\b(scans?|scanned|searche?[sd]?|detects?|flags?|reports?|checks?)\b/i.test(p)) continue;
    out.push(`${rel}:${line}: ${p.slice(0, 100)}`);
  }
  return out;
}

test("no spec, contract, or doc describes a construction layer as optional or out of scope (ENG-240)", () => {
  // The falsifier state, and the check that finds it.
  expect(layersOutOfScope("Layer L5 is optional for small projects.\n")).toEqual(["fixture:1: Layer L5 is optional for small projects."]);
  expect(layersOutOfScope("Layer L4 is out of scope for this project.\n")).toHaveLength(1);
  // A sentence that wraps across lines is still one sentence.
  expect(layersOutOfScope("A test scans the specs, the\ncontracts, and the docs for a layer\ndescribed as optional.\n")).toEqual([]);
  expect(layersOutOfScope("The developer decided that layer\nL6 is optional here.\n")).toHaveLength(1);
  expect(layersOutOfScope("Never describe any layer as absent, deferred, or optional.\n")).toEqual([]);
  expect(layersOutOfScope("A test scans the docs for a layer described as optional.\n")).toEqual([]);
  const files = tracked([".md"]).filter((p) => p.endsWith(".md") && !p.startsWith("reference/"));
  const offenders = files.flatMap((rel) => layersOutOfScope(readFileSync(join(ROOT, rel), "utf8"), rel));
  expect(offenders).toEqual([]);
}, TEST_TIMEOUT);

test("every layer an iteration contract includes has its dependency layers built or included (ENG-241)", () => {
  const dir = join(ROOT, "docs", "specs", "same-page", "iterations");
  const depends = { L1: [], L2: ["L1"], L3: ["L2"], L4: ["L2"], L5: ["L2"], L6: ["L3"] };
  const built = new Set();
  const failures = [];
  for (const name of readdirSync(dir).filter((n) => /^\d+\.md$/.test(n)).sort()) {
    const text = readFileSync(join(dir, name), "utf8");
    const inSection = text.slice(text.indexOf("\n## In"), text.indexOf("\n## Out"));
    const named = [...new Set([...inSection.matchAll(/\bL([1-6])\b/g)].map((m) => `L${m[1]}`))];
    const title = text.split("\n")[0] ?? name;
    const declared = [...new Set([...title.matchAll(/\bL([1-6])\b/g)].map((m) => `L${m[1]}`))];
    for (const layer of [...new Set([...named, ...declared])]) {
      for (const need of depends[layer] ?? []) {
        // The contract presupposes it, or an earlier contract built it.
        const presupposed = /presupposes/.test(text) && text.includes(need);
        if (!built.has(need) && !named.includes(need) && !presupposed) failures.push(`${name}: ${layer} needs ${need}`);
      }
      built.add(layer);
    }
  }
  expect(failures).toEqual([]);
}, TEST_TIMEOUT);

// The four words in a string the engine writes out, not in a comment
// about them.
function workflowWords(text, rel = "fixture") {
  const out = [];
  text.split("\n").forEach((line, i) => {
    if (/^\s*\/\//.test(line)) return;
    if (/["`'][^"`']*\b(Holds|Drifted|Still Observed|Missing)\b/.test(line)) out.push(`${rel}:${i + 1}: ${line.trim().slice(0, 90)}`);
  });
  return out;
}

test("no engine surface prints the four words the workflow owns (ENG-229)", () => {
  // The falsifier state, and the check that finds it.
  expect(workflowWords('  lines.push(`  Section: Holds`);\n')).toHaveLength(1);
  expect(workflowWords("// The engine never reports Holds or Drifted.\n")).toEqual([]);
  const engine = walk(join(ROOT, "skills", "new-project", "scripts", "engine")).filter((p) => p.endsWith(".ts"));
  const offenders = engine.flatMap((path) => workflowWords(readFileSync(path, "utf8"), path.slice(ROOT.length + 1)));
  expect(offenders).toEqual([]);
}, TEST_TIMEOUT);

test("the drift gate's output carries no validator result and no verdict (ENG-232)", () => {
  const gate = join(ROOT, "skills", "new-project", "scripts", "spec-drift-gate.mjs");
  const base = mkdtempSync(join(tmpdir(), "same-page-gate-"));
  const r = spawnSync("node", [gate], {
    cwd: ROOT,
    encoding: "utf8",
    input: JSON.stringify({ hook_event_name: "Stop" }),
    env: { ...process.env, SAME_PAGE_STATE_DIR: base },
  });
  const output = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  expect(output).toContain("audit this session against the spec set");
  for (const verdict of ["SUFFICIENT", "INSUFFICIENT", "BLOCKED", "FAILING", "Covered by", "exit 0"]) expect(output).not.toContain(verdict);
  expect(/\b(passed|failed)\b/.test(output)).toBe(false);
}, TEST_TIMEOUT);

// A step that hands the developer machine-shaped work. A sentence
// forbidding it is a mention.
function handAuthoringSteps(text, rel = "fixture") {
  const out = [];
  for (const { text: p, line } of paragraphs(text)) {
    if (!/\b(write|author|edit|fill in|compute|type)\b/i.test(p)) continue;
    if (!/\b(digest|obligation file|dependency provenance|evidence record)\b/i.test(p)) continue;
    if (!/\bby hand\b|\byourself\b|\bmanually\b/i.test(p)) continue;
    if (/\bnever\b|\bmust not\b|\bdo not\b|\bFalsifier:/i.test(p)) continue;
    out.push(`${rel}:${line}: ${p.slice(0, 100)}`);
  }
  return out;
}

test("no documented or prompted step tells the developer to write a digest, an obligation, a provenance, or a record by hand (ENG-216)", () => {
  // The falsifier state, and the check that finds it.
  expect(handAuthoringSteps("Then write the requirement digest by hand into the obligation.\n")).toHaveLength(1);
  expect(handAuthoringSteps("The developer never writes a digest by hand.\n")).toEqual([]);
  const files = tracked([".md"]).filter((p) => p.endsWith(".md") && !p.startsWith("reference/") && !p.startsWith("docs/specs/") && !p.startsWith("docs/superpowers/"));
  const offenders = files.flatMap((rel) => handAuthoringSteps(readFileSync(join(ROOT, rel), "utf8"), rel));
  expect(offenders).toEqual([]);
}, TEST_TIMEOUT);
