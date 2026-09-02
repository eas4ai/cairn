// Source snapshot identity (ENG-046 through ENG-050): `git:<sha>` for a
// clean source tree, `workspace:<digest>` otherwise. The workspace
// digest covers HEAD and the content of every path git reports as
// modified, added, deleted, renamed, or untracked, so two workspaces
// that differ in any of those never share an identity. The engine's own
// directory, .same-page/, is not a source input: obligations and
// validator definitions are identified on every record by their own
// digests, a policy change re-evaluates evidence instead of staling it,
// and evidence and cache are derived state. So a tree that differs from
// HEAD only under .same-page/ has the commit's identity.

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { digest } from "./digest.ts";

export type Snapshot = { id: string; head: string | null; dirty: string[] };

function git(root: string, args: string[]): string | null {
  const r = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (r.error || r.status !== 0) return null;
  return r.stdout;
}

function fileDigest(path: string): string {
  try {
    if (statSync(path).isDirectory()) return "dir";
    return digest(readFileSync(path, "utf8"));
  } catch {
    return "absent";
  }
}

// Without git, every file under the root is an input (the widest
// conservative boundary), except the derived engine state.
function walkAll(root: string): string[] {
  const out: string[] = [];
  const skip = new Set([".git", "node_modules"]);
  const visit = (dir: string) => {
    for (const name of readdirSync(dir).sort()) {
      if (skip.has(name)) continue;
      const p = join(dir, name);
      const rel = relative(root, p).split("\\").join("/");
      if (rel === ".same-page") continue;
      if (statSync(p).isDirectory()) visit(p);
      else out.push(rel);
    }
  };
  visit(root);
  return out;
}

export function currentSnapshot(root: string): Snapshot {
  const headOut = git(root, ["rev-parse", "HEAD"]);
  const head = headOut ? headOut.trim() : null;
  const status = head === null ? null : git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  if (head !== null && status !== null) {
    const entries = status.split("\0").filter((e) => e.length > 3);
    const paths = new Set<string>();
    for (const e of entries) {
      // "XY path" or, for renames, "XY new" followed by the old path as
      // its own NUL-terminated entry; both sides count as inputs.
      const p = e.slice(3);
      if (p === ".same-page" || p.startsWith(".same-page/")) continue;
      paths.add(p);
    }
    const dirty = [...paths].sort();
    if (dirty.length === 0) return { id: `git:${head}`, head, dirty };
    const parts = [`head:${head}`];
    for (const p of dirty) parts.push(`${p}=${fileDigest(join(root, p))}`);
    return { id: `workspace:${digest(parts.join("\n")).slice("sha256:".length)}`, head, dirty };
  }
  // No git: a workspace whose every file is an input.
  const files = existsSync(root) ? walkAll(root) : [];
  const parts = ["head:none"];
  for (const p of files) parts.push(`${p}=${fileDigest(join(root, p))}`);
  return { id: `workspace:${digest(parts.join("\n")).slice("sha256:".length)}`, head: null, dirty: files };
}

export function isCommitSnapshot(id: string): boolean {
  return id.startsWith("git:");
}
