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
//
// The snapshot is the repository boundary, step three of the
// dependency chain (ENG-124). When it cannot be computed -- git reports
// a tree it could not read, or a tree without git has a directory the
// engine cannot read -- there is no snapshot, the chain ends at step
// four, and freshness is unknown (ENG-126). Nothing is guessed.

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { digest } from "./digest.ts";

export type Snapshot = { id: string; head: string | null; dirty: string[] };

// A git command that succeeds silently. Anything on stderr (git warns,
// and exits 0, when it cannot open a directory) means the answer does
// not cover the whole tree, so it is not used.
function git(root: string, args: string[]): string | null {
  const r = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (r.error || r.status !== 0 || (r.stderr ?? "").trim() !== "") return null;
  return r.stdout;
}

class Unreadable extends Error {}

// A path's content digest; a deleted path is "absent". A path that
// exists and cannot be read is not a value, it is a failure to compute.
function fileDigest(path: string): string {
  let isDir: boolean;
  try {
    isDir = statSync(path).isDirectory();
  } catch (e) {
    if ((e as { code?: string }).code === "ENOENT") return "absent";
    throw new Unreadable(`cannot read ${path}`);
  }
  if (isDir) return "dir";
  try {
    return digest(readFileSync(path, "utf8"));
  } catch {
    throw new Unreadable(`cannot read ${path}`);
  }
}

// Without git, every file under the root is an input (the widest
// conservative boundary), except the derived engine state.
function walkAll(root: string): string[] {
  const out: string[] = [];
  const skip = new Set([".git", "node_modules"]);
  const visit = (dir: string) => {
    let names: string[];
    try {
      names = readdirSync(dir).sort();
    } catch {
      throw new Unreadable(`cannot read ${dir}`);
    }
    for (const name of names) {
      if (skip.has(name)) continue;
      const p = join(dir, name);
      const rel = relative(root, p).split("\\").join("/");
      if (rel === ".same-page") continue;
      let isDir: boolean;
      try {
        isDir = statSync(p).isDirectory();
      } catch {
        throw new Unreadable(`cannot read ${p}`);
      }
      if (isDir) visit(p);
      else out.push(rel);
    }
  };
  visit(root);
  return out;
}

export function currentSnapshot(root: string): Snapshot | null {
  try {
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
    if (!existsSync(root)) return null;
    const files = walkAll(root);
    const parts = ["head:none"];
    for (const p of files) parts.push(`${p}=${fileDigest(join(root, p))}`);
    return { id: `workspace:${digest(parts.join("\n")).slice("sha256:".length)}`, head: null, dirty: files };
  } catch (e) {
    if (e instanceof Unreadable) return null;
    throw e;
  }
}

export function isCommitSnapshot(id: string): boolean {
  return id.startsWith("git:");
}
