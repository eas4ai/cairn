// The adapter capability registry (ENG-055 through ENG-057). Every
// trust-sensitive evidence axis is set by the engine from this table,
// never from a validator's output (ENG-051, ENG-052, ENG-054). An
// adapter with no registration produces no record, and a claim whose
// capability the registration lacks is refused (ENG-056).
//
// Three adapters are built in. `command` and `manual` hold no
// capability: they record what a command or a person did, and nothing
// about dependencies. `tsc-closure` holds
// can_establish_complete_dependencies: a TypeScript compiler run with
// --listFiles prints every file the program reads, and a change outside
// that set cannot change the check's verdict. Further adapters are
// registered by the developer outside the repository, in
// $SAME_PAGE_HOME/adapters.yaml, because a repository cannot grant
// itself a capability (ENG-061, ENG-064).

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { trustHome } from "./trust.ts";
import { parseYaml, type YamlMap, type YamlValue } from "./yaml.ts";
import type { Finding } from "./policy.ts";

export const CAPABILITIES = [
  "can_establish_binding",
  "can_establish_complete_dependencies",
  "can_establish_challenge",
  "can_establish_formal_result",
  "can_establish_model_result",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

export type AdapterName = string;

export type Adapter = { name: string; version: string; capabilities: readonly Capability[]; command: string[] | null; builtin: boolean };

export const BUILTIN: Record<string, Adapter> = {
  command: { name: "command", version: "2", capabilities: [], command: null, builtin: true },
  manual: { name: "manual", version: "2", capabilities: [], command: null, builtin: true },
  "tsc-closure": { name: "tsc-closure", version: "1", capabilities: ["can_establish_complete_dependencies"], command: null, builtin: true },
};

export function registrationPath(): string {
  return join(trustHome(), "adapters.yaml");
}

function isMap(v: YamlValue | undefined): v is YamlMap {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

// Registrations the developer keeps outside the repository. A malformed
// entry is a finding, never a silent capability.
export function readRegistry(): { adapters: Record<string, Adapter>; findings: Finding[] } {
  const adapters: Record<string, Adapter> = { ...BUILTIN };
  const findings: Finding[] = [];
  const path = registrationPath();
  if (!existsSync(path)) return { adapters, findings };
  let raw: YamlValue;
  try {
    raw = parseYaml(readFileSync(path, "utf8"));
  } catch (e) {
    return { adapters, findings: [{ where: path, message: (e as Error).message, rule: "ENG-055" }] };
  }
  if (!isMap(raw) || !Array.isArray(raw["adapters"])) return { adapters, findings };
  for (const entry of raw["adapters"]) {
    if (!isMap(entry) || typeof entry["name"] !== "string" || entry["name"] === "") {
      findings.push({ where: path, message: "an adapter registration names the adapter, its version, and its capabilities", rule: "ENG-055" });
      continue;
    }
    const name = entry["name"];
    if (BUILTIN[name]) {
      findings.push({ where: path, message: `${name} is a built-in adapter; a registration cannot replace it`, rule: "ENG-055" });
      continue;
    }
    const version = entry["version"];
    if (typeof version !== "string" && typeof version !== "number") {
      findings.push({ where: path, message: `adapter ${name} declares no version`, rule: "ENG-055" });
      continue;
    }
    const caps = entry["capabilities"];
    if (!Array.isArray(caps) || !caps.every((c) => typeof c === "string" && (CAPABILITIES as readonly string[]).includes(c))) {
      findings.push({ where: path, message: `adapter ${name} declares a capability outside ${CAPABILITIES.join(", ")}`, rule: "ENG-055" });
      continue;
    }
    const command = entry["command"];
    if (command !== undefined && (!Array.isArray(command) || command.length === 0 || !command.every((c) => typeof c === "string"))) {
      findings.push({ where: path, message: `adapter ${name} declares a command that is not a list of arguments (argv)`, rule: "ENG-055" });
      continue;
    }
    adapters[name] = { name, version: String(version), capabilities: caps as Capability[], command: (command as string[]) ?? null, builtin: false };
  }
  return { adapters, findings };
}

export function adapterHas(adapters: Record<string, Adapter>, name: string, capability: Capability): boolean {
  const a = adapters[name];
  return a !== undefined && a.capabilities.includes(capability);
}

export function adapterVersion(name: string, adapters: Record<string, Adapter> = BUILTIN): string {
  return adapters[name]?.version ?? "unregistered";
}
