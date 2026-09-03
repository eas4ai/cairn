// Validator definitions (ENG-161 through ENG-165): one YAML file per
// validator under .same-page/validators/, naming the method it produces,
// an argv command, and the environment inputs its result depends on
// (ENG-150). No shell unless the definition says `shell: true`; either
// way the engine runs it only under an execution trust context
// (trust.ts). A definition's digest is over its canonical
// serialization, environment declaration included, so a changed
// definition is a different identity.

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { digest } from "./digest.ts";
import { METHODS, type Finding, type Method } from "./policy.ts";
import { parseYaml, stringifyYaml, type YamlMap, type YamlValue } from "./yaml.ts";

// One declared environment input: a command whose output is the
// fingerprint, or a file whose digest is. The engine fingerprints
// exactly these and nothing else (ENG-151).
export type EnvironmentDecl = { command: string[] } | { file: string };

// A challenge is any deliberate attempt to realize or expose the
// confirmed falsifier (ENG-170): no mechanism ranks above another, and
// mutation is one of seven, not the definition. A declaration names a
// reviewable artifact (ENG-171, ENG-172) and the command that realizes
// the violating state and runs the validator; that command's exit
// status is the validator's under the violation.
export const MECHANISMS = ["mutation", "fault-injection", "negative-fixture", "double", "counterexample-search", "adversarial-input", "harness"] as const;
export type Mechanism = (typeof MECHANISMS)[number];

export type ChallengeDecl = {
  mechanism: Mechanism;
  artifact: string;
  command: string[];
  from_falsifier: boolean;
  requirement: string | null; // named when from_falsifier is true (ENG-037)
  timeout: number;
};

export type ValidatorDef = {
  name: string;
  kind: Method;
  command: string[];
  cwd: string;
  shell: boolean;
  timeout: number; // seconds
  environment: EnvironmentDecl[];
  challenges: ChallengeDecl[];
};

const FIELDS = ["name", "kind", "command", "cwd", "shell", "timeout", "environment", "challenges"];
const ENVIRONMENT_TIMEOUT_MS = 60_000;

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

function isArgv(v: YamlValue | undefined): v is string[] {
  return Array.isArray(v) && v.length > 0 && v.every((c) => typeof c === "string");
}

const ENVIRONMENT_HELP = "environment declares the inputs the result depends on: a list of `- command: [argv]` (its output is the fingerprint) or `- file: path` (its digest is), or [] when there are none";

function parseEnvironment(raw: YamlValue | undefined, where: string, findings: Finding[]): EnvironmentDecl[] {
  if (raw === undefined) {
    findings.push({ where, message: `no environment declaration; ${ENVIRONMENT_HELP}`, rule: "ENG-150" });
    return [];
  }
  if (!Array.isArray(raw)) {
    findings.push({ where, message: `environment must be a list; ${ENVIRONMENT_HELP}`, rule: "ENG-150" });
    return [];
  }
  const out: EnvironmentDecl[] = [];
  raw.forEach((item, i) => {
    const at = `${where}:environment[${i}]`;
    if (!isMap(item) || Object.keys(item).length !== 1) {
      findings.push({ where: at, message: `an environment input is a mapping with exactly one key, command or file; ${ENVIRONMENT_HELP}`, rule: "ENG-150" });
      return;
    }
    if (item["command"] !== undefined) {
      if (!isArgv(item["command"])) findings.push({ where: at, message: "command must be a non-empty list of arguments (argv)", rule: "ENG-150" });
      else out.push({ command: item["command"] });
      return;
    }
    if (item["file"] !== undefined) {
      if (typeof item["file"] !== "string" || item["file"] === "") findings.push({ where: at, message: "file must be a path relative to the project root", rule: "ENG-150" });
      else out.push({ file: item["file"] });
      return;
    }
    findings.push({ where: at, message: `unknown environment input key ${Object.keys(item)[0]}; ${ENVIRONMENT_HELP}`, rule: "ENG-150" });
  });
  return out;
}

const CHALLENGE_KEYS = ["mechanism", "artifact", "command", "from_falsifier", "requirement", "timeout"];
const CHALLENGE_HELP = `a challenge declares a mechanism (${MECHANISMS.join(", ")}), an artifact path that exists, a command (argv) that realizes the violating state and runs the validator, and from_falsifier; when from_falsifier is true it names the requirement whose falsifier it realizes`;

function parseChallenges(root: string, raw: YamlValue | undefined, where: string, findings: Finding[]): ChallengeDecl[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    findings.push({ where, message: `challenges must be a list; ${CHALLENGE_HELP}`, rule: "ENG-170" });
    return [];
  }
  const out: ChallengeDecl[] = [];
  raw.forEach((item, i) => {
    const at = `${where}:challenges[${i}]`;
    if (!isMap(item)) {
      findings.push({ where: at, message: `a challenge is a mapping; ${CHALLENGE_HELP}`, rule: "ENG-170" });
      return;
    }
    for (const k of Object.keys(item)) if (!CHALLENGE_KEYS.includes(k)) findings.push({ where: at, message: `unknown challenge field ${k}`, rule: "ENG-170" });
    const mechanism = item["mechanism"];
    // ENG-170: every listed mechanism is a challenge; nothing outside the list is.
    if (typeof mechanism !== "string" || !(MECHANISMS as readonly string[]).includes(mechanism)) {
      findings.push({ where: at, message: `mechanism must be one of ${MECHANISMS.join(", ")}; no mechanism ranks above another`, rule: "ENG-170" });
      return;
    }
    // ENG-171, ENG-172: no reviewable artifact, no challenged record.
    const artifact = item["artifact"];
    if (typeof artifact !== "string" || artifact === "") {
      findings.push({ where: at, message: "a challenge cites a reviewable artifact: the path of the fixture, harness, mutation, or double it uses", rule: "ENG-171" });
      return;
    }
    if (!existsSync(join(root, artifact))) {
      findings.push({ where: at, message: `challenge artifact ${artifact} does not exist in the snapshot; a challenged record cites a reviewable artifact`, rule: "ENG-171" });
      return;
    }
    if (!isArgv(item["command"])) {
      findings.push({ where: at, message: "a challenge command is a list of arguments (argv) that realizes the violating state and runs the validator", rule: "ENG-170" });
      return;
    }
    const from = item["from_falsifier"];
    if (from !== true && from !== false) {
      findings.push({ where: at, message: "from_falsifier must be true or false: whether the challenge derives from the confirmed falsifier", rule: "ENG-036" });
      return;
    }
    const requirement = item["requirement"];
    if (from === true && (typeof requirement !== "string" || requirement === "")) {
      findings.push({ where: at, message: "a falsifier-derived challenge names the requirement whose confirmed falsifier it realizes", rule: "ENG-037" });
      return;
    }
    const timeout = item["timeout"];
    if (timeout !== undefined && (typeof timeout !== "number" || timeout <= 0)) {
      findings.push({ where: at, message: "timeout must be a positive number of seconds", rule: "ENG-170" });
      return;
    }
    out.push({ mechanism: mechanism as Mechanism, artifact, command: item["command"], from_falsifier: from, requirement: typeof requirement === "string" && requirement !== "" ? requirement : null, timeout: typeof timeout === "number" ? timeout : 600 });
  });
  return out;
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
  if (!isArgv(command)) findings.push({ where, message: "command must be a list of arguments (argv), not a string", rule: "ENG-162" });
  const shell = raw["shell"];
  if (shell !== undefined && shell !== true && shell !== false) findings.push({ where, message: "shell must be true or false", rule: "ENG-164" });
  const cwd = raw["cwd"];
  if (cwd !== undefined && typeof cwd !== "string") findings.push({ where, message: "cwd must be a path", rule: "ENG-161" });
  const timeout = raw["timeout"];
  if (timeout !== undefined && (typeof timeout !== "number" || timeout <= 0)) findings.push({ where, message: "timeout must be a positive number of seconds", rule: "ENG-161" });
  const nameField = raw["name"];
  if (nameField !== undefined && nameField !== name) findings.push({ where, message: `name ${String(nameField)} does not match the file name ${name}`, rule: "ENG-161" });
  // ENG-122: no field of a definition is a freshness graph. A list of
  // files or symbols is an unknown field, and the environment inputs
  // are fingerprints that can only widen invalidation, never narrow it.
  for (const k of Object.keys(raw)) if (!FIELDS.includes(k)) findings.push({ where, message: `unknown field ${k}`, rule: "ENG-161" });
  const environment = parseEnvironment(raw["environment"], where, findings);
  const challenges = parseChallenges(root, raw["challenges"], where, findings);
  if (findings.length) return { def: null, findings };
  return {
    def: { name, kind: kind as Method, command: command as string[], cwd: typeof cwd === "string" ? cwd : ".", shell: shell === true, timeout: typeof timeout === "number" ? timeout : 600, environment, challenges },
    findings,
  };
}

export function environmentLabel(d: EnvironmentDecl): string {
  return "command" in d ? `command ${d.command.join(" ")}` : `file ${d.file}`;
}

export function validatorText(def: ValidatorDef): string {
  const map: YamlMap = { name: def.name, kind: def.kind, command: [...def.command], cwd: def.cwd };
  if (def.shell) map["shell"] = true;
  if (def.timeout !== 600) map["timeout"] = def.timeout;
  map["environment"] = def.environment.map((d): YamlMap => ("command" in d ? { command: [...d.command] } : { file: d.file }));
  if (def.challenges.length)
    map["challenges"] = def.challenges.map((c): YamlMap => ({ mechanism: c.mechanism, artifact: c.artifact, command: [...c.command], from_falsifier: c.from_falsifier, requirement: c.requirement, timeout: c.timeout }));
  return stringifyYaml(map);
}

export function validatorDigest(def: ValidatorDef): string {
  return digest(validatorText(def));
}

// One fingerprinted environment input as recorded on evidence: the
// declared input's label, its value, or the reason it could not be
// computed (which makes the record's freshness unknown, ENG-126).
export type EnvironmentInput = { input: string; value: string | null; error: string | null };

// ENG-150, ENG-151: fingerprint exactly the declared inputs. A command
// runs as argv (never a shell) and its trimmed output is the value; a
// file's digest is the value. A missing file, a failing command, or a
// command that cannot start is a failure to compute, not a value.
// A command input is repository content, so it runs only under an
// execution trust context (ENG-059), the same one the validator holds;
// without one it is not computed, and the record's freshness is
// unknown. A file digest is a read and needs no trust.
export function fingerprintEnvironment(root: string, def: ValidatorDef, execute: boolean): EnvironmentInput[] {
  const cwd = join(root, def.cwd);
  return def.environment.map((d) => {
    const input = environmentLabel(d);
    if ("command" in d) {
      if (!execute) return { input, value: null, error: `not run: ${def.name} holds no execution trust at its current definition; run \`same-page trust ${def.name}\` or \`same-page verify --as-developer\`` };
      const r = spawnSync(d.command[0]!, d.command.slice(1), { cwd, encoding: "utf8", timeout: ENVIRONMENT_TIMEOUT_MS, maxBuffer: 1024 * 1024 });
      if (r.error) return { input, value: null, error: r.error.code === "ETIMEDOUT" ? "timed out" : r.error.message };
      if (r.status !== 0) return { input, value: null, error: `exit ${r.status ?? `signal ${r.signal ?? "unknown"}`}` };
      const out = (r.stdout ?? "").trim() || (r.stderr ?? "").trim();
      return { input, value: out, error: null };
    }
    const path = join(root, d.file);
    try {
      if (!existsSync(path) || !statSync(path).isFile()) return { input, value: null, error: "no such file" };
      return { input, value: digest(readFileSync(path, "utf8")), error: null };
    } catch (e) {
      return { input, value: null, error: (e as Error).message };
    }
  });
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
  return runArgv(root, def.cwd, def.command, def.shell, def.timeout);
}

// A challenge runs the same way, as argv, under the same trust: the
// command realizes the violating state and runs the validator, so a
// nonzero status means the validator noticed (ENG-173).
export function runChallenge(root: string, def: ValidatorDef, c: ChallengeDecl): RunResult {
  return runArgv(root, def.cwd, c.command, false, c.timeout);
}

function runArgv(root: string, cwdRel: string, command: string[], shell: boolean, timeoutSeconds: number): RunResult {
  const started = new Date();
  const cwd = join(root, cwdRel);
  const opts = { cwd, encoding: "utf8" as const, timeout: timeoutSeconds * 1000, maxBuffer: 64 * 1024 * 1024 };
  const r = shell
    ? spawnSync(command.join(" "), [], { ...opts, shell: true })
    : spawnSync(command[0]!, command.slice(1), opts);
  const duration = Date.now() - started.getTime();
  const base = { exit_code: r.status, signal: r.signal, stdout: r.stdout ?? "", stderr: r.stderr ?? "", started_at: started.toISOString(), duration_ms: duration };
  if (r.error) return { ...base, result: "error", error: `${r.error.code === "ETIMEDOUT" ? "timed out" : r.error.message}` };
  if (r.status === null) return { ...base, result: "error", error: `terminated by signal ${r.signal ?? "unknown"}` };
  return { ...base, result: r.status === 0 ? "pass" : "fail", error: null };
}
