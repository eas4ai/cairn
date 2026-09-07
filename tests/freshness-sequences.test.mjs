import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { repo, cairn, commit, review, records, fromFile, passing, git, CLI } from "./helpers.mjs";

const firstLine = (result) => result.stdout.split("\n")[0];
const valueOf = (text, key) => new RegExp(`^${key}: (.*)$`, "m").exec(text)?.[1];
const latest = (root) => records(root, "R-001").map((name) => join(root, ".cairn/evidence/R-001", name))
  .sort((a, b) => Number(valueOf(readFileSync(a, "utf8"), "sequence")) - Number(valueOf(readFileSync(b, "utf8"), "sequence"))).at(-1);
function restarted(root, expected, trace) {
  const one = cairn(root, "wake"), two = cairn(root, "wake");
  assert.equal(firstLine(one), expected, `${trace}\n${one.stdout}${one.stderr}`);
  assert.equal(one.stdout, two.stdout, `${trace}: restart changed the explanation`);
  assert.equal(one.status, two.status, `${trace}: restart changed the exit status`);
  return one.stdout;
}

// This model holds fixture values and observed test actions, not Cairn digests,
// receipt parsing, or imports from the kernel. A check succeeds only at value 0.
function expectedState(model) {
  const newest = model.runs.at(-1);
  const streak = [];
  for (let i = model.runs.length - 1; i >= 0 && model.runs[i] !== 0; i--) streak.push(model.runs[i]);
  const tried = new Set(streak);
  if (tried.size >= 3) return "Resolvable: escalate R-001";
  if (model.value !== newest || model.damaged) return "Resolvable: run R-001";
  if (newest !== 0) return "Resolvable: implement R-001";
  return "Done: first";
}

for (const seed of [7, 42, 913])
  test(`LOOP-080: deterministic freshness sequence seed=${seed}`, (t) => {
    const r = repo({ ".cairn/mechanisms/m": fromFile("R-001", "R-002") });
    t.after(() => rmSync(r, { recursive: true, force: true }));
    cairn(r, "check"); review(r); commit(r);
    const model = { value: 0, runs: [0], damaged: false }, trace = [];
    let random = seed, outputPath, outputBytes;
    const rememberOutput = () => {
      const text = readFileSync(latest(r), "utf8");
      outputPath = join(r, valueOf(text, "output")); outputBytes = readFileSync(outputPath);
    };
    rememberOutput();
    const events = ["edit-0", "edit-1", "edit-2", "check", "clock-check", "unrelated", "damage", "restore-output", "details"];
    // The prefix guarantees the key paths occur; the seeded suffix combines them.
    const chosen = ["edit-1", "details", "check", "clock-check", "damage", "restore-output", "edit-0", "check", "unrelated"];
    for (let i = 0; i < 18; i++) { random = (Math.imul(random, 1664525) + 1013904223) >>> 0; chosen.push(events[random % events.length]); }
    for (const event of chosen) {
      trace.push(event);
      if (event.startsWith("edit-")) {
        model.value = Number(event.slice(-1)); writeFileSync(join(r, "src/exit"), `${model.value}\n`); commit(r);
      } else if (event === "check" || event === "clock-check") {
        let result;
        if (event === "clock-check") {
          const preload = join(r, ".git/clock.cjs");
          writeFileSync(preload, "const D=Date;global.Date=class extends D{constructor(...a){super(...(a.length?a:['2000-01-01T00:00:00Z']));}static now(){return 946684800000;}};");
          result = spawnSync(process.execPath, [CLI, "check"], { cwd: r, encoding: "utf8", env: { ...process.env, NODE_OPTIONS: `--require=${preload}` } });
        } else result = cairn(r, "check");
        assert.match(result.stdout, /recorded .*: (pass|fail)/, `seed=${seed}: ${trace.join(" -> ")}\n${result.stdout}${result.stderr}`);
        model.runs.push(model.value); model.damaged = false; rememberOutput(); commit(r);
      } else if (event === "unrelated") { writeFileSync(join(r, "docs/note.md"), String(trace.length)); commit(r); }
      else if (event === "damage") { writeFileSync(outputPath, "damaged"); model.damaged = true; }
      else if (event === "restore-output") { writeFileSync(outputPath, outputBytes); model.damaged = false; }
      else {
        const name = valueOf(readFileSync(latest(r), "utf8"), "inputs_detail");
        assert.ok(name, `seed=${seed}: new runs retain optional details`);
        writeFileSync(join(r, name), "{invalid optional details");
      }
      const expected = expectedState(model);
      const output = restarted(r, expected, `seed=${seed}: ${trace.join(" -> ")}`);
      if (expected === "Resolvable: run R-001") {
        assert.ok(output.includes(latest(r).slice(r.length + 1)), output);
        assert.match(output, /Next: cairn check R-001/);
      }
    }
  });

test("LOOP-080: agreement changes, mechanism review, checks, and completion review retain priority", (t) => {
  const r = repo({ ".cairn/mechanisms/m": passing("R-001", "R-002") });
  t.after(() => rmSync(r, { recursive: true, force: true }));
  const trace = [], expect = (event, state) => { trace.push(event); return restarted(r, state, trace.join(" -> ")); };
  cairn(r, "check"); review(r); commit(r); expect("baseline", "Done: first");
  const spec = join(r, "docs/spec/test.md");
  writeFileSync(spec, readFileSync(spec, "utf8").replace("The thing MUST work.", "The thing MUST work offline.")); commit(r);
  const output = expect("change agreement", "Resolvable: review mechanism R-001");
  assert.ok(output.includes(latest(r).slice(r.length + 1)), output);
  assert.ok(!output.includes("Next: cairn check"));
  const entry = /R-001 sha256:[a-f0-9]{64}/.exec(output)?.[0]; assert.ok(entry);
  const declaration = join(r, ".cairn/mechanisms/m");
  writeFileSync(declaration, readFileSync(declaration, "utf8") + `reviewed:\n  - ${entry}\n`); commit(r);
  expect("record mechanism review", "Resolvable: run R-001");
  cairn(r, "check"); commit(r); expect("check revised agreement", "Resolvable: review first");
  review(r); commit(r); expect("completion review", "Done: first");
});

test("LOOP-080: imported receipt history demands a rerun without a false input explanation", (t) => {
  const r = repo({ ".cairn/mechanisms/m": passing("R-001", "R-002") });
  t.after(() => rmSync(r, { recursive: true, force: true }));
  git(r, "checkout", "-qb", "other"); cairn(r, "check"); commit(r);
  git(r, "checkout", "main"); cairn(r, "check"); commit(r); cairn(r, "check"); review(r); commit(r);
  restarted(r, "Done: first", "two main checks");
  assert.equal(git(r, "merge", "--no-ff", "-m", "import receipts", "other").status, 0);
  const output = restarted(r, "Resolvable: run R-001", "two main checks -> merge receipt history");
  assert.match(output, /history/); assert.match(output, /Next: cairn check R-001/);
  assert.ok(!output.includes("content-changed:"), output);
  cairn(r, "check"); commit(r); restarted(r, "Done: first", "import history -> incorporate history with check");
});
