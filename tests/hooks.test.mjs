import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";

// PKG-005: every hook registration invokes node (ADR 0003), and the gate
// spawns nothing (ENG-067, ENG-233).
const ROOT = new URL("..", import.meta.url).pathname;

test("both hook registrations run the gate with node (PKG-005)", () => {
  const plugin = JSON.parse(readFileSync(`${ROOT}hooks/hooks.json`, "utf8"));
  const commands = [];
  for (const event of Object.values(plugin.hooks)) for (const group of event) for (const h of group.hooks) commands.push(h.command);
  expect(commands.length).toBe(2);
  for (const c of commands) expect(c.startsWith("node ")).toBe(true);
  const codex = JSON.parse(readFileSync(`${ROOT}.codex/hooks.json`, "utf8"));
  const codexCommand = codex.hooks.Stop[0].hooks[0].command;
  expect(codexCommand).toContain('then node "$f"; fi');
  expect(codexCommand).not.toMatch(/\b(bun|python3?|deno)\b/);
});

test("the drift gate spawns no process (ENG-067, ENG-233)", () => {
  const src = readFileSync(`${ROOT}skills/new-project/scripts/spec-drift-gate.mjs`, "utf8");
  expect(src).not.toContain("child_process");
  expect(src).not.toMatch(/\bspawn|\bexec/);
});
