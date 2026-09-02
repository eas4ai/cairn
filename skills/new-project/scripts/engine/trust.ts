// Execution trust records (ENG-058 through ENG-065): a grant lives
// outside the repository it authorizes, under the developer's home
// directory ($SAME_PAGE_HOME or ~/.same-page), and binds the
// repository, the validator name, and the validator definition digest.
// Committed content can request trust by defining a validator; only a
// record here, or an explicit developer invocation, lets it run.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { parseYaml, stringifyYaml, type YamlMap, type YamlValue } from "./yaml.ts";

export type Grant = { repository: string; validator: string; digest: string; actor: string; granted_at: string };
export type TrustStore = { version: number; grants: Grant[] };

export const TRUST_CONTEXTS = ["developer-invocation", "trust-record", "ci", "named-environment"] as const;
export type TrustContext = (typeof TRUST_CONTEXTS)[number];

export function trustHome(): string {
  const env = process.env["SAME_PAGE_HOME"];
  return env && env !== "" ? resolve(env) : join(homedir(), ".same-page");
}

export function trustPath(): string {
  return join(trustHome(), "trust.yaml");
}

// ENG-062: a trust store inside the evaluated repository is refused.
export function trustStoreInsideRepository(root: string): boolean {
  const rel = relative(resolve(root), trustHome());
  return rel === "" || (!rel.startsWith("..") && !rel.startsWith("/"));
}

export function gitActor(root: string): string {
  const name = spawnSync("git", ["config", "user.name"], { cwd: root, encoding: "utf8" });
  const email = spawnSync("git", ["config", "user.email"], { cwd: root, encoding: "utf8" });
  const n = !name.error && name.status === 0 ? name.stdout.trim() : "";
  const e = !email.error && email.status === 0 ? email.stdout.trim() : "";
  if (n && e) return `${n} <${e}>`;
  if (n) return n;
  return process.env["USER"] ?? "developer";
}

function isMap(v: YamlValue | undefined): v is YamlMap {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export function readTrustStore(): TrustStore {
  const path = trustPath();
  if (!existsSync(path)) return { version: 1, grants: [] };
  const raw = parseYaml(readFileSync(path, "utf8"));
  const grants: Grant[] = [];
  if (isMap(raw) && Array.isArray(raw["grants"])) {
    for (const g of raw["grants"]) {
      if (!isMap(g)) continue;
      const s = (k: string) => (typeof g[k] === "string" ? (g[k] as string) : "");
      if (s("repository") && s("validator") && s("digest")) {
        grants.push({ repository: s("repository"), validator: s("validator"), digest: s("digest"), actor: s("actor"), granted_at: s("granted_at") });
      }
    }
  }
  return { version: 1, grants };
}

export function writeTrustStore(store: TrustStore): void {
  const path = trustPath();
  mkdirSync(dirname(path), { recursive: true });
  const value: YamlMap = {
    version: store.version,
    grants: store.grants.map((g) => ({ ...g }) as YamlMap),
  };
  writeFileSync(
    path,
    stringifyYaml(value, [
      "Same Page execution trust. Each grant binds one repository, one validator",
      "name, and the digest of its definition; a changed definition needs a new",
      "grant. This file lives outside every repository it authorizes.",
    ])
  );
}

export function findGrant(store: TrustStore, root: string, validator: string, digest: string): Grant | null {
  const repo = resolve(root);
  return store.grants.find((g) => g.repository === repo && g.validator === validator && g.digest === digest) ?? null;
}

export function grant(root: string, validator: string, digest: string, actor: string): Grant {
  const store = readTrustStore();
  const repo = resolve(root);
  const g: Grant = { repository: repo, validator, digest, actor, granted_at: new Date().toISOString() };
  store.grants = store.grants.filter((x) => !(x.repository === repo && x.validator === validator));
  store.grants.push(g);
  writeTrustStore(store);
  return g;
}
