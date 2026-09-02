// Validator definitions (ENG-161 through ENG-165): one YAML file per
// validator under .same-page/validators/, naming the method it produces
// and an argv command. No shell unless the definition says `shell:
// true`; either way the engine runs it only under an execution trust
// context (trust.ts). A definition's digest is over its canonical
// serialization, so a changed definition is a different identity.

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { digest } from "./digest.ts";
import { METHODS, type Finding, type Method } from "./policy.ts";
import { parseYaml, stringifyYaml, type YamlMap, type YamlValue } from "./yaml.ts";

export type ValidatorDef = {
  name: string;
  kind: Method;
  command: string[];
  cwd: string;
  shell: boolean;
  timeout: number; // seconds
};

export function validatorsDir(root: string): string {
  return join(root, ".same-page", "validators");
}

export function listValidators(root: string): string[] {
  const dir = validatorsDir(root);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => n.endsWith(".yaml"))
    .map((n) => n.slice(0, -5))
    .sort();
}

function isMap(v: YamlValue | undefined): v is YamlMap {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export function readValidator(root: string, name: string): { def: ValidatorDef | null; findings: Finding[] } {
  const where = `.same-page/validators/${name}.yaml`;
  const path = join(validatorsDir(root), `${name}.yaml`);
  if (!existsSync(path)) return { def: null, findings: [{ where, message: `no validator definition named ${name}`, rule: "ENG-161" }] };
  let raw: YamlValue;
  try {
    raw = parseYaml(readFileSync(path, "utf8"));
  } catch (e) {
    return { def: null, findings: [{ where, message: (e as Error).message, rule: "ENG-189" }] };
  }
  const findings: Finding[] = [];
  if (!isMap(raw)) return { def: null, findings: [{ where, message: "a validator definition is a mapping", rule: "ENG-161" }] };
  const kind = raw["kind"];
  if (typeof kind !== "string" || !(METHODS as readonly string[]).includes(kind) || kind === "inspected" || kind === "manual")
    findings.push({ where, message: `kind must be one of ${METHODS.filter((m) => m !== "inspected" && m !== "manual").join(", ")}`, rule: "ENG-161" });
  const command = raw["command"];
  if (!Array.isArray(command) || command.length === 0 || !command.every((c) => typeof c === "string"))
    findings.push({ where, message: "command must be a list of arguments (argv), not a string", rule: "ENG-162" });
  const shell = raw["shell"];
  if (shell !== undefined && shell !== true && shell !== false) findings.push({ where, message: "shell must be true or false", rule: "ENG-164" });
  const cwd = raw["cwd"];
  if (cwd !== undefined && typeof cwd !== "string") findings.push({ where, message: "cwd must be a path", rule: "ENG-161" });
  const timeout = raw["timeout"];
  if (timeout !== undefined && (typeof timeout !== "number" || timeout <= 0)) findings.push({ where, message: "timeout must be a positive number of seconds", rule: "ENG-161" });
  const nameField = raw["name"];
  if (nameField !== undefined && nameField !== name) findings.push({ where, message: `name ${String(nameField)} does not match the file name ${name}`, rule: "ENG-161" });
  for (const k of Object.keys(raw)) if (!["name", "kind", "command", "cwd", "shell", "timeout"].includes(k)) findings.push({ where, message: `unknown field ${k}`, rule: "ENG-161" });
  if (findings.length) return { def: null, findings };
  return {
    def: { name, kind: kind as Method, command: command as string[], cwd: typeof cwd === "string" ? cwd : ".", shell: shell === true, timeout: typeof timeout === "number" ? timeout : 600 },
    findings,
  };
}

export function validatorText(def: ValidatorDef): string {
  const map: YamlMap = { name: def.name, kind: def.kind, command: [...def.command], cwd: def.cwd };
  if (def.shell) map["shell"] = true;
  if (def.timeout !== 600) map["timeout"] = def.timeout;
  return stringifyYaml(map);
}

export function validatorDigest(def: ValidatorDef): string {
  return digest(validatorText(def));
}

export type RunResult = {
  result: "pass" | "fail" | "error";
  exit_code: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  started_at: string;
  duration_ms: number;
  error: string | null;
};

// ENG-162, ENG-163: argv by default; a shell only when declared. The
// output is captured and stored; it is never parsed for evidence axes.
export function runValidator(root: string, def: ValidatorDef): RunResult {
  const started = new Date();
  const cwd = join(root, def.cwd);
  const opts = { cwd, encoding: "utf8" as const, timeout: def.timeout * 1000, maxBuffer: 64 * 1024 * 1024 };
  const r = def.shell
    ? spawnSync(def.command.join(" "), [], { ...opts, shell: true })
    : spawnSync(def.command[0]!, def.command.slice(1), opts);
  const duration = Date.now() - started.getTime();
  const base = { exit_code: r.status, signal: r.signal, stdout: r.stdout ?? "", stderr: r.stderr ?? "", started_at: started.toISOString(), duration_ms: duration };
  if (r.error) return { ...base, result: "error", error: `${r.error.code === "ETIMEDOUT" ? "timed out" : r.error.message}` };
  if (r.status === null) return { ...base, result: "error", error: `terminated by signal ${r.signal ?? "unknown"}` };
  return { ...base, result: r.status === 0 ? "pass" : "fail", error: null };
}
