// The policy file, .same-page/policy.yaml: the spec directories the
// engine reads, the assurance profiles, the project default, and the
// domain overrides. Validation enforces the shape the engine spec
// fixes: a profile is a composition (ENG-070), freshness is always
// required and cannot be waived (ENG-072, ENG-073), a project default
// exists (ENG-075), a domain may override it (ENG-076).

import { parseYaml, stringifyYaml, type YamlMap, type YamlValue } from "./yaml.ts";

export const METHODS = ["formal", "model", "property", "integration", "test", "static", "inspected", "manual"] as const;
export type Method = (typeof METHODS)[number];
const SENSITIVITIES = ["challenged", "unchallenged"] as const;
const BINDING_BASES = ["none", "attested", "backend"] as const;
const REQUIRE_KEYS = ["all", "any", "binding", "authority", "assumptions"] as const;

export type Clause = { kind: Method } | { sensitivity: (typeof SENSITIVITIES)[number] };
export type Profile = {
  require: {
    all?: Clause[];
    any?: Clause[];
    binding?: { basis?: (typeof BINDING_BASES)[number]; developer_confirmed?: boolean };
    authority?: string;
    assumptions?: string[];
  };
};
export type Policy = {
  version: number;
  specs: string[];
  default_profile: string;
  profiles: Record<string, Profile>;
  domains: Record<string, { profile: string }>;
};

export type Finding = { where: string; message: string; rule: string };

export function defaultPolicy(specDirs: string[]): Policy {
  return {
    version: 1,
    specs: specDirs,
    default_profile: "default",
    profiles: {
      default: {
        require: {
          any: METHODS.filter((m) => m !== "inspected").map((kind) => ({ kind })),
        },
      },
    },
    domains: {},
  };
}

export const POLICY_HEADER = [
  "Same Page policy. Written by the first `same-page elaborate`; yours to edit.",
  "specs: the spec directories the engine reads, relative to the project root.",
  "default_profile: the assurance profile every obligation takes unless its",
  "domain (by prefix) overrides it under domains, or the developer sets one",
  "on the obligation. A profile is a composition of evidence properties;",
  "current freshness is always required and cannot be waived here.",
];

function isMap(v: YamlValue | undefined): v is YamlMap {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function policyToYaml(p: Policy): YamlMap {
  const profiles: YamlMap = {};
  for (const [name, prof] of Object.entries(p.profiles)) {
    const req: YamlMap = {};
    if (prof.require.all) req["all"] = prof.require.all.map((c) => ({ ...c }) as YamlMap);
    if (prof.require.any) req["any"] = prof.require.any.map((c) => ({ ...c }) as YamlMap);
    if (prof.require.binding) req["binding"] = { ...prof.require.binding } as YamlMap;
    if (prof.require.authority !== undefined) req["authority"] = prof.require.authority;
    if (prof.require.assumptions) req["assumptions"] = [...prof.require.assumptions];
    profiles[name] = { require: req };
  }
  const domains: YamlMap = {};
  for (const [k, v] of Object.entries(p.domains)) domains[k] = { profile: v.profile };
  return { version: p.version, specs: [...p.specs], default_profile: p.default_profile, profiles, domains };
}

export function policyText(p: Policy): string {
  return stringifyYaml(policyToYaml(p), POLICY_HEADER);
}

function findFreshness(v: YamlValue, path: string, out: string[]): void {
  if (isMap(v)) {
    for (const [k, val] of Object.entries(v)) {
      if (k === "freshness") out.push(`${path}.${k}`);
      findFreshness(val, `${path}.${k}`, out);
    }
  } else if (Array.isArray(v)) v.forEach((item, i) => findFreshness(item, `${path}[${i}]`, out));
}

function parseClauses(raw: YamlValue | undefined, where: string, findings: Finding[]): Clause[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) {
    findings.push({ where, message: "must be a list of clauses", rule: "ENG-070" });
    return undefined;
  }
  const out: Clause[] = [];
  raw.forEach((item, i) => {
    const at = `${where}[${i}]`;
    if (!isMap(item) || Object.keys(item).length !== 1) {
      findings.push({ where: at, message: "a clause is one key: kind or sensitivity", rule: "ENG-070" });
      return;
    }
    const key = Object.keys(item)[0]!;
    const val = item[key];
    if (key === "kind") {
      if (typeof val === "string" && (METHODS as readonly string[]).includes(val)) out.push({ kind: val as Method });
      else findings.push({ where: at, message: `kind must be one of ${METHODS.join(", ")}`, rule: "ENG-027" });
    } else if (key === "sensitivity") {
      if (typeof val === "string" && (SENSITIVITIES as readonly string[]).includes(val))
        out.push({ sensitivity: val as (typeof SENSITIVITIES)[number] });
      else findings.push({ where: at, message: `sensitivity must be one of ${SENSITIVITIES.join(", ")}`, rule: "ENG-034" });
    } else findings.push({ where: at, message: `unknown clause key ${key}`, rule: "ENG-070" });
  });
  return out;
}

export function validatePolicy(raw: YamlValue, where = ".same-page/policy.yaml"): { policy: Policy | null; findings: Finding[] } {
  const findings: Finding[] = [];
  if (!isMap(raw)) return { policy: null, findings: [{ where, message: "policy must be a mapping", rule: "ENG-189" }] };

  const version = raw["version"];
  if (typeof version !== "number") findings.push({ where: `${where}:version`, message: "version must be a number", rule: "ENG-189" });

  const specsRaw = raw["specs"];
  const specs: string[] = [];
  if (!Array.isArray(specsRaw) || specsRaw.length === 0 || !specsRaw.every((s) => typeof s === "string"))
    findings.push({ where: `${where}:specs`, message: "specs must be a non-empty list of directories", rule: "ENG-189" });
  else specs.push(...(specsRaw as string[]));

  const profilesRaw = raw["profiles"];
  const profiles: Record<string, Profile> = {};
  if (!isMap(profilesRaw) || Object.keys(profilesRaw).length === 0)
    findings.push({ where: `${where}:profiles`, message: "profiles must be a non-empty mapping", rule: "ENG-075" });
  else {
    for (const [name, prof] of Object.entries(profilesRaw)) {
      const at = `${where}:profiles.${name}`;
      if (!isMap(prof) || !isMap(prof["require"])) {
        findings.push({ where: at, message: "a profile is a composition: a mapping with a require block, not a single grade", rule: "ENG-070" });
        continue;
      }
      const fresh: string[] = [];
      findFreshness(prof, at, fresh);
      for (const f of fresh) findings.push({ where: f, message: "freshness is always required and cannot be set in a profile", rule: "ENG-073" });
      const req = prof["require"];
      for (const k of Object.keys(req))
        if (!(REQUIRE_KEYS as readonly string[]).includes(k))
          findings.push({ where: `${at}.require.${k}`, message: `unknown require key; use ${REQUIRE_KEYS.join(", ")}`, rule: "ENG-071" });
      const profile: Profile = { require: {} };
      const all = parseClauses(req["all"], `${at}.require.all`, findings);
      const any = parseClauses(req["any"], `${at}.require.any`, findings);
      if (all) profile.require.all = all;
      if (any) profile.require.any = any;
      if (req["binding"] !== undefined) {
        const b = req["binding"];
        if (!isMap(b)) findings.push({ where: `${at}.require.binding`, message: "binding must be a mapping", rule: "ENG-071" });
        else {
          const binding: Profile["require"]["binding"] = {};
          if (b["basis"] !== undefined) {
            if (typeof b["basis"] === "string" && (BINDING_BASES as readonly string[]).includes(b["basis"]))
              binding.basis = b["basis"] as (typeof BINDING_BASES)[number];
            else findings.push({ where: `${at}.require.binding.basis`, message: `basis must be one of ${BINDING_BASES.join(", ")}`, rule: "ENG-029" });
          }
          if (b["developer_confirmed"] !== undefined) {
            if (typeof b["developer_confirmed"] === "boolean") binding.developer_confirmed = b["developer_confirmed"];
            else findings.push({ where: `${at}.require.binding.developer_confirmed`, message: "must be true or false", rule: "ENG-071" });
          }
          profile.require.binding = binding;
        }
      }
      if (req["authority"] !== undefined) {
        if (typeof req["authority"] === "string") profile.require.authority = req["authority"];
        else findings.push({ where: `${at}.require.authority`, message: "authority must be a string", rule: "ENG-071" });
      }
      if (req["assumptions"] !== undefined) {
        const a = req["assumptions"];
        if (Array.isArray(a) && a.every((x) => typeof x === "string")) profile.require.assumptions = a as string[];
        else findings.push({ where: `${at}.require.assumptions`, message: "assumptions must be a list of names", rule: "ENG-071" });
      }
      if (!profile.require.all?.length && !profile.require.any?.length)
        findings.push({ where: `${at}.require`, message: "a profile requires at least one evidence method under all or any", rule: "ENG-070" });
      profiles[name] = profile;
    }
  }

  const def = raw["default_profile"];
  if (typeof def !== "string" || def === "")
    findings.push({ where: `${where}:default_profile`, message: "default_profile must name a profile", rule: "ENG-075" });
  else if (Object.keys(profiles).length && !profiles[def])
    findings.push({ where: `${where}:default_profile`, message: `default_profile names ${def}, which profiles does not define`, rule: "ENG-075" });

  const domainsRaw = raw["domains"] ?? {};
  const domains: Record<string, { profile: string }> = {};
  if (!isMap(domainsRaw)) findings.push({ where: `${where}:domains`, message: "domains must be a mapping of prefix to { profile }", rule: "ENG-076" });
  else {
    for (const [prefix, d] of Object.entries(domainsRaw)) {
      const at = `${where}:domains.${prefix}`;
      if (!/^[A-Z][A-Z0-9]*$/.test(prefix)) findings.push({ where: at, message: "a domain is keyed by its requirement prefix", rule: "ENG-076" });
      if (!isMap(d) || typeof d["profile"] !== "string") {
        findings.push({ where: at, message: "a domain override is { profile: name }", rule: "ENG-076" });
        continue;
      }
      if (Object.keys(profiles).length && !profiles[d["profile"]])
        findings.push({ where: `${at}.profile`, message: `names ${d["profile"]}, which profiles does not define`, rule: "ENG-076" });
      domains[prefix] = { profile: d["profile"] };
    }
  }

  if (findings.length) return { policy: null, findings };
  return {
    policy: { version: version as number, specs, default_profile: def as string, profiles, domains },
    findings,
  };
}

export function loadPolicy(text: string, where?: string): { policy: Policy | null; findings: Finding[] } {
  let raw: YamlValue;
  try {
    raw = parseYaml(text);
  } catch (e) {
    return { policy: null, findings: [{ where: where ?? ".same-page/policy.yaml", message: (e as Error).message, rule: "ENG-189" }] };
  }
  return validatePolicy(raw, where);
}

// ENG-077: the nearest inherited default -- the domain's, else the project's.
export function inheritedProfile(policy: Policy, prefix: string): { name: string; source: string } {
  const d = policy.domains[prefix];
  if (d) return { name: d.profile, source: `domain ${prefix}` };
  return { name: policy.default_profile, source: "project default" };
}

export function requiredText(profile: Profile): string {
  const parts: string[] = [];
  const clause = (c: Clause) => ("kind" in c ? c.kind : `sensitivity ${c.sensitivity}`);
  if (profile.require.all?.length) parts.push(profile.require.all.map(clause).join(" + "));
  if (profile.require.any?.length) parts.push(`any of ${profile.require.any.map(clause).join(", ")}`);
  if (profile.require.binding?.basis) parts.push(`binding ${profile.require.binding.basis}`);
  if (profile.require.binding?.developer_confirmed) parts.push("developer-confirmed binding");
  if (profile.require.authority) parts.push(`authority ${profile.require.authority}`);
  return parts.join("; ") + "; current freshness";
}
