// Verification authority (ENG-155 through ENG-160): which execution
// context's evidence counts as authoritative for a snapshot. The policy
// configures it; when it does not, the default is `ci` when the
// repository carries owner-controlled CI configuration at a recognized
// path (ENG-157), else `local`. Evidence of each authority lives in its
// own derived directory, so a record's location and its stored
// authority must agree (ENG-194): local evidence is derived local
// state, CI evidence is an artifact downloaded beside it.

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Policy } from "./policy.ts";

export const AUTHORITIES = ["ci", "local", "named-environment"] as const;
export type Authority = (typeof AUTHORITIES)[number];

export type Configured = { authority: Authority; name: string | null; source: string };

// Owner-controlled CI configuration, by the paths the common services
// read. The first that exists names the configuration.
export const CI_CONFIGURATION = [
  ".github/workflows",
  ".gitlab-ci.yml",
  ".circleci/config.yml",
  "Jenkinsfile",
  ".buildkite",
  "azure-pipelines.yml",
  ".travis.yml",
  "bitbucket-pipelines.yml",
  ".drone.yml",
  ".woodpecker.yml",
];

export function ciConfiguration(root: string): string | null {
  for (const p of CI_CONFIGURATION) if (existsSync(join(root, p))) return p;
  return null;
}

// The CI services set CI=true in the job environment.
export function inCi(env: Record<string, string | undefined>): boolean {
  const v = (env["CI"] ?? "").trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

export function ciActor(env: Record<string, string | undefined>): string {
  if (env["GITHUB_ACTIONS"]) return `github-actions ${env["GITHUB_REPOSITORY"] ?? ""} run ${env["GITHUB_RUN_ID"] ?? ""}`.replace(/\s+/g, " ").trim();
  if (env["GITLAB_CI"]) return `gitlab-ci ${env["CI_PROJECT_PATH"] ?? ""} job ${env["CI_JOB_ID"] ?? ""}`.replace(/\s+/g, " ").trim();
  return "ci";
}

export function configuredAuthority(root: string, policy: Policy): Configured {
  if (policy.authority) return { authority: policy.authority, name: policy.authority_name, source: "policy" };
  const ci = ciConfiguration(root);
  if (ci) return { authority: "ci", name: null, source: `default: CI configuration at ${ci}` };
  return { authority: "local", name: null, source: "default: no CI configuration" };
}

export function authorityLabel(authority: Authority, name: string | null): string {
  return authority === "named-environment" ? `named-environment ${name ?? "?"}` : authority;
}

export function sameAuthority(a: { authority: Authority; name: string | null }, b: { authority: Authority; name: string | null }): boolean {
  return a.authority === b.authority && (a.authority !== "named-environment" || a.name === b.name);
}

// Where evidence of an authority lives, relative to the project root.
export function evidenceRoot(authority: Authority, name: string | null): string {
  if (authority === "local") return ".same-page/evidence";
  if (authority === "ci") return ".same-page/artifacts/ci";
  return `.same-page/artifacts/environments/${name ?? "unnamed"}`;
}
