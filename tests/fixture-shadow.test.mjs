// tests/fixture-shadow.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { buildProject, assertFlags, SETTINGS } from "./helpers/fixture.mjs";
import { tail } from "./fixture.test.mjs";
import { wake } from "../lib/wake.mjs";

// Deviation from the plan text throughout this file, recorded in the plan 14 report:
//   - request.questions is a plain object keyed by question id (lib/evaluate.mjs's
//     buildOptionRequest/buildOwnerRequest), not an array of {id, ...} the plan's own transport
//     iterated with .map.
//   - An answer's shape depends on the question's own type: a noul question (sufficient,
//     reversible_n, contradicts_n, outside_n, observed) needs {type: "noul", noul: <0..1>}; the
//     owner question (the only "choice"-type one) needs {type: "choice", choice: "agent"|
//     "developer", probabilities: {agent, developer} summing to 1, confidence: <0..1>} --
//     lib/evaluate.mjs's parseAnswers/validOwner refuse anything else. The plan's own transport
//     answered every question with a bare number or {agent, developer}, neither of which parses.
//   - bin/typesafeai.mjs's real post() (the transport this module replaces) lifts the response
//     body's own `model` field to the top of its return value ({status, body, model}); a custom
//     transport must do the same, or lib/evaluate.mjs's attemptCall reads res.model as undefined
//     and treats every call as a model_mismatch failure before parsing the body at all.
const TRANSPORT = `export default async function transport(request) {
  const model = "jev-1.13.0";
  const answers = {};
  for (const [id, q] of Object.entries(request.questions)) {
    answers[id] = q.type === "noul"
      ? { type: "noul", noul: id.startsWith("contradicts") ? 0.05 : 0.95 }
      : { type: "choice", choice: "agent", probabilities: { agent: 0.9, developer: 0.1 }, confidence: 0.95 };
  }
  const body = JSON.stringify({ model, answers, usage: { input_tokens: 100, output_tokens: 20 } });
  return { status: 200, body, model };
}
`;

test("shadow mode: intent, call and evaluation records; authority stays with the developer", async () => {
  assertFlags("escalate", ["--transport-module"]);
  const settings = { ...SETTINGS, typesafeai: { ...SETTINGS.typesafeai, enabled: true, mode: "shadow" } };
  const p = buildProject({ settings });
  const mod = join(mkdtempSync(join(tmpdir(), "cairn-transport-")), "transport.mjs");
  writeFileSync(mod, TRANSPORT);
  await tail(p);
  p.cairn(["begin", "implement", "REQ-001"]);
  p.write("src/add.mjs", "export function add(a, b) {\n  if (typeof a !== \"number\" || typeof b !== \"number\") throw new TypeError(\"add needs numbers\");\n  return a + b;\n}\n");
  p.commit("Implement add"); p.cairn(["end"]); p.cairn(["check", "REQ-001"]);
  const before = (await p.kinds()).length;
  // Deviation: --commitment (the currently open commitment's own slug), not the plan's invented
  // --slug "shadowed"; every escalation is addressed by the commitment slug (see
  // tests/fixture.test.mjs's work()).
  p.cairn(["escalate", "--commitment", "fixture", "--concern", "REQ-002", "--question", "Should add refuse NaN?", "--recommendation", "Yes", "--because", "node tests/req.test.mjs shows NaN passes the typeof check", "--if-wrong", "callers relying on NaN break", "--instead", "let NaN through", "--transport-module", mod], { env: { TYPESAFEAI_API_KEY: "test-key" } });
  const log = await p.readLog();
  const tailKinds = log.slice(before).map((r) => r.kind);
  assert.deepEqual(tailKinds, ["evaluation-intent", "evaluation-call", "evaluation-call", "evaluation", "escalation"]);
  const evaluation = log.findLast((r) => r.kind === "evaluation").payload;
  assert.equal(evaluation.route, "developer");
  assert.equal(evaluation.would_route, "agent");
  for (const c of log.filter((r) => r.kind === "evaluation-call")) assert.equal(c.payload.outcome, "response");
  const w = await wake(p.dir);
  assert.equal(w.verdict, "Waiting");
  await p.developer.answer("fixture", "ok", "");
  await p.wakeIs("Resolvable", "review", "fixture");
  // The evaluator never reads the key from settings and the intent names no excluded path.
  const intent = log.findLast((r) => r.kind === "evaluation-intent").payload;
  assert.ok(!JSON.stringify(intent).includes("test-key"));
  assert.ok(!JSON.stringify(intent).includes("private/"));
});
