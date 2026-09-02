// Canonical text and digests (glossary: Canonical text, Digest).
// The engine digests canonical text, never raw bytes, so a re-wrapped
// paragraph keeps its digest and a changed word does not.

import { createHash } from "node:crypto";

export function canonicalText(lines: string[]): string {
  return lines
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function digest(text: string): string {
  return "sha256:" + createHash("sha256").update(text, "utf8").digest("hex");
}
