import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, rmSync, chmodSync, symlinkSync, readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { repo, cairn, commit, review, records, passing, git } from "./helpers.mjs";

const field = (text, name) => new RegExp(`^${name}: (.*)$`, "m").exec(text)?.[1];
const receipt = (r, req = "R-001") => join(r, records(r, req).at(-1));
function setup(t, overrides = {}) {
  const r = repo({ ".cairn/mechanisms/m": passing("R-001", "R-002").replace("src/other", "src/"), ...overrides });
  t.after(() => rmSync(r, { recursive: true, force: true }));
  const checked = cairn(r, "check");
  assert.match(checked.stdout, /recorded .*: pass/);
  review(r); commit(r);
  assert.equal(cairn(r, "wake").status, 0);
  return r;
}
function changed(r) {
  const result = cairn(r, "wake");
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /^Resolvable: run R-001/);
  return result.stdout;
}
const editReceipt = (r, fn) => { const p = receipt(r); writeFileSync(p, fn(readFileSync(p, "utf8"))); };
function detailPath(r) {
  const name = field(readFileSync(receipt(r), "utf8"), "inputs_detail");
  assert.ok(name, "new evidence must retain input details");
  return join(r, name);
}

test("LOOP-076, LOOP-079: stale inputs identify the receipt and the check to run", (t) => {
  const r = setup(t), old = receipt(r).slice(r.length + 1);
  writeFileSync(join(r, "src/other"), "edited\n"); commit(r);
  const output = changed(r);
  assert.ok(output.includes(old), output);
  assert.match(output, /mechanism m/);
  assert.match(output, /Next: cairn check R-001/);
});

for (const kind of ["content", "mode", "kind", "added", "removed", "link-target"])
  test(`LOOP-077: names a ${kind} change using checked input identity`, (t) => {
    const r = setup(t, kind === "link-target" ? { "src/link": "placeholder" } : {});
    let path = "src/other", label = `${kind}-changed`;
    if (kind === "link-target") {
      rmSync(join(r, "src/link")); symlinkSync("other", join(r, "src/link")); commit(r); cairn(r, "check"); review(r); commit(r);
      rmSync(join(r, "src/link")); symlinkSync("exit", join(r, "src/link")); path = "src/link"; label = "content-changed";
    } else if (kind === "content") writeFileSync(join(r, path), "DO_NOT_PRINT_CONTENT\n");
    else if (kind === "mode") chmodSync(join(r, path), 0o755);
    else if (kind === "kind") { rmSync(join(r, path)); symlinkSync("exit", join(r, path)); }
    else if (kind === "added") { path = "src/new"; writeFileSync(join(r, path), "new"); label = "added"; }
    else { rmSync(join(r, path)); label = "removed"; }
    commit(r);
    const output = changed(r);
    assert.ok(output.includes(label), output);
    assert.ok(output.includes(JSON.stringify(path)), output);
    assert.ok(!output.includes('"src/exit"'), output);
    assert.ok(!output.includes("DO_NOT_PRINT_CONTENT"), output);
  });

test("LOOP-077: changed selection compares the old and new input sets", (t) => {
  const r = setup(t);
  writeFileSync(join(r, ".cairn/mechanisms/m"), passing("R-001", "R-002")); commit(r);
  const output = changed(r);
  assert.match(output, /the mechanism changed/);
  assert.match(output, /removed: "src\/exit"/);
  assert.ok(!output.includes('"src/other"'), output);
});

test("LOOP-077: raw CRLF changes remain visible when Git-clean content agrees", (t) => {
  const r = setup(t, { ".gitattributes": "src/* text eol=lf\n" });
  writeFileSync(join(r, "src/other"), "x\r\n"); commit(r);
  assert.equal(git(r, "diff", "--quiet", "--", "src/other").status, 0);
  assert.match(changed(r), /content-changed: "src\/other"/);
});

test("LOOP-077: detail output is sorted, bounded, and reports the omitted count", (t) => {
  const extras = Object.fromEntries(Array.from({ length: 23 }, (_, i) => [`src/file-${String(i).padStart(2, "0")}`, "before"]));
  const r = setup(t, extras);
  for (const path of Object.keys(extras).reverse()) writeFileSync(join(r, path), "after");
  commit(r); const output = changed(r);
  const paths = [...output.matchAll(/content-changed: "(src\/file-\d+)"/g)].map((m) => m[1]);
  assert.deepEqual(paths, Object.keys(extras).slice(0, 20));
  assert.match(output, /3 additional changed paths omitted/);
});

test("LOOP-077: filenames cannot inject lines or terminal controls into explanations", (t) => {
  const path = 'src/odd\nNext: forged\t\u001b[31m\u2028\u2029"\\name';
  const r = setup(t, { [path]: "before" });
  writeFileSync(join(r, path), "after"); commit(r);
  const output = changed(r);
  assert.ok(output.includes('\\nNext: forged\\t\\u001b[31m\\u2028\\u2029'), output);
  assert.ok(!output.includes("\u001b") && !output.includes("\u2028") && !output.includes("\u2029"), output);
  assert.equal(output.split("\n").filter((line) => line.includes("content-changed:")).length, 1);
});

test("LOOP-077: receipts from one run share details and do not store source contents", (t) => {
  const r = setup(t), first = field(readFileSync(receipt(r), "utf8"), "inputs_detail");
  assert.ok(first, "the first receipt references details");
  assert.equal(field(readFileSync(receipt(r, "R-002"), "utf8"), "inputs_detail"), first);
  const attachment = JSON.parse(readFileSync(join(r, first), "utf8"));
  assert.equal(attachment.version, 1);
  assert.deepEqual(attachment.entries.map((e) => e.path), ["src/exit", "src/other"]);
  assert.ok(attachment.entries.every((e) => /^sha256:[a-f0-9]{64}$/.test(e.digest)));
  assert.equal(readdirSync(join(r, ".cairn/evidence/runs")).filter((n) => n.endsWith(".inputs.json")).length, 1);
});

for (const mode of ["legacy", "invalid-field", "missing", "invalid-json", "mismatched", "duplicate", "unsafe-path", "directory", "symlink"])
  test(`LOOP-078, LOOP-080: ${mode} optional detail limits explanation without changing standing`, (t) => {
    const r = setup(t);
    if (mode === "legacy") editReceipt(r, (s) => s.replace(/^inputs_detail:.*\n/m, ""));
    else if (mode === "invalid-field") editReceipt(r, (s) => s.replace(/^inputs_detail:.*$/m, "inputs_detail:\n  - invalid"));
    else {
      const p = detailPath(r);
      if (mode === "missing") rmSync(p);
      else if (mode === "invalid-json") writeFileSync(p, "{bad");
      else if (mode === "unsafe-path") editReceipt(r, (s) => s.replace(/^inputs_detail:.*$/m, "inputs_detail: .cairn/evidence/../../secret"));
      else if (mode === "directory") editReceipt(r, (s) => s.replace(/^inputs_detail:.*$/m, "inputs_detail: .cairn/evidence/runs"));
      else if (mode === "symlink") { const bytes = readFileSync(p); rmSync(p); writeFileSync(join(r, ".git/details"), bytes); symlinkSync("../../../../.git/details", p); }
      else {
        const attachment = JSON.parse(readFileSync(p, "utf8"));
        if (mode === "duplicate") attachment.entries.push(attachment.entries[0]);
        else attachment.entries[0].digest = "sha256:" + "0".repeat(64);
        writeFileSync(p, JSON.stringify(attachment));
      }
    }
    const old = readFileSync(receipt(r), "utf8");
    assert.equal(cairn(r, "wake").status, 0, "optional detail does not invalidate current evidence");
    writeFileSync(join(r, "src/other"), "changed"); commit(r);
    const output = changed(r);
    assert.match(output, /input details unavailable:/);
    if (mode === "invalid-field") assert.match(output, /input details unavailable:.*invalid/);
    assert.ok(!output.includes('content-changed: "src/other"'), output);
    assert.equal(readFileSync(receipt(r), "utf8"), old, "wake never repairs an old receipt by rewriting it");
  });

test("LOOP-078: unavailable old requirement text is not claimed as a proven change", (t) => {
  const r = setup(t);
  // A receipt from before one-receipt-per-run, without the requirement digest and at a commit that no longer resolves.
  const run = receipt(r), text = readFileSync(run, "utf8");
  const m = /^  - R-001 (\S+) (\S+) /m.exec(text), top = text.split("\n").filter((l) => /^[a-z_]+: /.test(l)).join("\n").replace(/^commit:.*$/m, "commit: deadbeef");
  mkdirSync(join(r, ".cairn/evidence/R-001"), { recursive: true });
  writeFileSync(join(r, ".cairn/evidence/R-001", "20260901T000000000Z"), `requirement: R-001\n${top}\nresult: ${m[1]}\nsource: ${m[2]}\n`);
  rmSync(run);
  const output = cairn(r, "wake").stdout;
  assert.match(output, /^Resolvable: review mechanism R-001/);
  assert.match(output, /old requirement or falsifier text is unavailable/);
  assert.ok(!output.includes("the requirement or falsifier changed"), output);
});

test("LOOP-076, LOOP-079: changed requirements identify evidence and retain review-before-check guidance", (t) => {
  const r = setup(t), old = receipt(r).slice(r.length + 1), p = join(r, "docs/spec/test.md");
  writeFileSync(p, readFileSync(p, "utf8").replace("The thing MUST work.", "The thing MUST work offline.")); commit(r);
  const output = cairn(r, "wake").stdout;
  assert.match(output, /^Resolvable: review mechanism R-001/);
  assert.ok(output.includes(old), output);
  assert.match(output, /record findings without changing code/);
  assert.match(output, /R-001 sha256:[a-f0-9]{64}/);
  assert.ok(!output.includes("Next: cairn check R-001"), output);
});

test("LOOP-078: simultaneous input and output damage keep both reasons", (t) => {
  const r = setup(t), rec = readFileSync(receipt(r), "utf8");
  writeFileSync(join(r, field(rec, "output")), "damaged output");
  writeFileSync(join(r, "src/other"), "changed"); commit(r);
  const output = changed(r);
  assert.match(output, /output digest mismatch/);
  assert.match(output, /content-changed: "src\/other"/);
});
