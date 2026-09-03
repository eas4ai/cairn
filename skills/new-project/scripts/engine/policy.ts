// The policy file, .same-page/policy.yaml: the spec directories the
// engine reads, the assurance profiles, the project default, and the
// domain overrides. Validation enforces the shape the engine spec
// fixes: a profile is a composition (ENG-070), freshness is always
// required and cannot be waived (ENG-072, ENG-073), a project default
// exists (ENG-075), a domain may override it (ENG-076).

import { AUTHORITIES, type Authority } from "./authority.ts";
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
    authority?: Authority;
    assumptions?: string[];
  };
};
export type Policy = {
  version: number;
  specs: string[];
  authority: Authority | null; // null: the default rule of ENG-157 applies
  authority_name: string | null;
  default_profile: string;
  profiles: Record<string, Profile>;
  domains: Record<string, { profile: string }>;
};

export type Finding = { where: string; message: string; rule: string };

export function defaultPolicy(specDirs: string[], authority: Authority): Policy {
  return {
    version: 1,
    specs: specDirs,
    authority,
    authority_name: null,
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
  "authority: whose evidence counts, ci, local, or named-environment (with",
  "authority_name); the first elaborate writes ci when the repository carries",
  "CI configuration, else local. A profile's require.authority overrides it.",
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
  for (const [name, prof] of Object.entries(p.profiles)) profiles[name] = { require: requireToYaml(prof.require) };
  const domains: YamlMap = {};
  for (const [k, v] of Object.entries(p.domains)) domains[k] = { profile: v.profile };
  const out: YamlMap = { version: p.version, specs: [...p.specs] };
  if (p.authority) out["authority"] = p.authority;
  if (p.authority_name) out["authority_name"] = p.authority_name;
  out["default_profile"] = p.default_profile;
  out["profiles"] = profiles;
  out["domains"] = domains;
  return out;
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


// A profile is a composition (ENG-070): a mapping with a require block
// of all/any clauses, binding, authority, assumptions. A scalar, a
// missing require block, or a freshness setting anywhere is a finding.
export function parseProfile(prof: YamlValue | undefined, at: string, findings: Finding[]): Profile | null {
  if (!isMap(prof) || !isMap(prof["require"])) {
    findings.push({ where: at, message: "a profile is a composition: a mapping with a require block, not a single grade", rule: "ENG-070" });
    return null;
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
    if (typeof req["authority"] === "string" && (AUTHORITIES as readonly string[]).includes(req["authority"])) profile.require.authority = req["authority"] as Authority;
    else findings.push({ where: `${at}.require.authority`, message: `authority must be one of ${AUTHORITIES.join(", ")}`, rule: "ENG-156" });
  }
  if (req["assumptions"] !== undefined) {
    const a = req["assumptions"];
    if (Array.isArray(a) && a.every((x) => typeof x === "string")) profile.require.assumptions = a as string[];
    else findings.push({ where: `${at}.require.assumptions`, message: "assumptions must be a list of names", rule: "ENG-071" });
  }
  if (!profile.require.all?.length && !profile.require.any?.length)
    findings.push({ where: `${at}.require`, message: "a profile requires at least one evidence method under all or any", rule: "ENG-070" });
  return profile;
}

export function requireToYaml(r: Profile["require"]): YamlMap {
  const req: YamlMap = {};
  if (r.all) req["all"] = r.all.map((c) => ({ ...c }) as YamlMap);
  if (r.any) req["any"] = r.any.map((c) => ({ ...c }) as YamlMap);
  if (r.binding) req["binding"] = { ...r.binding } as YamlMap;
  if (r.authority !== undefined) req["authority"] = r.authority;
  if (r.assumptions) req["assumptions"] = [...r.assumptions];
  return req;
}

const clauseKey = (c: Clause): string => ("kind" in c ? `kind:${c.kind}` : `sensitivity:${c.sensitivity}`);
const basisRank = (b: string | undefined): number => (b === "backend" ? 2 : b === "attested" ? 1 : 0);

// Implication between requirements: every evidence set that satisfies
// `a` also satisfies `b`. Sound under the clause semantics (a clause is
// met by some passing record): an all-clause of b is guaranteed by a
// when a demands it outright or a's any-set can only be met by it; an
// any-set of b is guaranteed when a demands one of its members or a's
// any-set lies inside it; a binding is guaranteed when a's is at least
// as strong.
export function implies(a: Profile["require"], b: Profile["require"]): boolean {
  const aAll = new Set((a.all ?? []).map(clauseKey));
  const aAny = (a.any ?? []).map(clauseKey);
  const bAll = (b.all ?? []).map(clauseKey);
  const bAny = new Set((b.any ?? []).map(clauseKey));
  for (const c of bAll) {
    if (aAll.has(c)) continue;
    if (aAny.length > 0 && aAny.every((k) => k === c)) continue;
    return false;
  }
  if (bAny.size > 0) {
    const viaAll = [...bAny].some((c) => aAll.has(c));
    const viaAny = aAny.length > 0 && aAny.every((k) => bAny.has(k));
    if (!viaAll && !viaAny) return false;
  }
  if (basisRank(a.binding?.basis) < basisRank(b.binding?.basis)) return false;
  if (b.binding?.developer_confirmed && !a.binding?.developer_confirmed) return false;
  return true;
}

// ENG-101: the new requirement is a downgrade when it no longer
// guarantees what the old one demanded. Incomparable requirements count
// as a downgrade, because something the old one demanded is no longer
// guaranteed.
export function compareStrength(oldR: Profile["require"], newR: Profile["require"]): "equal" | "stronger" | "weaker" {
  const newGuaranteesOld = implies(newR, oldR);
  const oldGuaranteesNew = implies(oldR, newR);
  if (newGuaranteesOld && oldGuaranteesNew) return "equal";
  if (newGuaranteesOld) return "stronger";
  return "weaker";
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
      const parsed = parseProfile(prof, at, findings);
      if (parsed) profiles[name] = parsed;
    }
  }

  const def = raw["default_profile"];
  if (typeof def !== "string" || def === "")
    findings.push({ where: `${where}:default_profile`, message: "default_profile must name a profile", rule: "ENG-075" });
  else if (Object.keys(profiles).length && !profiles[def])
    findings.push({ where: `${where}:default_profile`, message: `default_profile names ${def}, which profiles does not define`, rule: "ENG-075" });

  // ENG-156: the configured authority is one of three; a named
  // environment carries its name.
  let authority: Authority | null = null;
  let authorityName: string | null = null;
  if (raw["authority"] !== undefined) {
    if (typeof raw["authority"] === "string" && (AUTHORITIES as readonly string[]).includes(raw["authority"])) authority = raw["authority"] as Authority;
    else findings.push({ where: `${where}:authority`, message: `authority must be one of ${AUTHORITIES.join(", ")}`, rule: "ENG-156" });
  }
  if (raw["authority_name"] !== undefined) {
    if (typeof raw["authority_name"] === "string" && raw["authority_name"] !== "") authorityName = raw["authority_name"];
    else findings.push({ where: `${where}:authority_name`, message: "authority_name must be a non-empty name", rule: "ENG-156" });
  }
  if (authority === "named-environment" && authorityName === null) findings.push({ where: `${where}:authority`, message: "a named-environment authority needs authority_name", rule: "ENG-156" });
  if (authority !== null && authority !== "named-environment" && authorityName !== null) findings.push({ where: `${where}:authority_name`, message: `authority_name applies to named-environment only, not ${authority}`, rule: "ENG-156" });

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
    policy: { version: version as number, specs, authority, authority_name: authorityName, default_profile: def as string, profiles, domains },
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

export function requiredText(r: Profile["require"]): string {
  const parts: string[] = [];
  const clause = (c: Clause) => ("kind" in c ? c.kind : `sensitivity ${c.sensitivity}`);
  if (r.all?.length) parts.push(r.all.map(clause).join(" + "));
  if (r.any?.length) parts.push(`any of ${r.any.map(clause).join(", ")}`);
  if (r.binding?.basis) parts.push(`binding ${r.binding.basis}`);
  if (r.binding?.developer_confirmed) parts.push("developer-confirmed binding");
  if (r.authority) parts.push(`authority ${r.authority}`);
  return parts.join("; ") + "; current freshness";
}
