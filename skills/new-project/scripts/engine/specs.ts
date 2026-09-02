// Reads the spec set: which requirements exist, which are Agreed, what
// each says, and the confirmed falsifier under it. The engine never
// writes a spec (ENG-011); this module only reads.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { canonicalText } from "./digest.ts";

export type Keyword = "MUST NOT" | "MUST" | "MAY" | null;
export type Authority = "agreed" | "draft" | "observed";

export type Requirement = {
  id: string;
  prefix: string;
  file: string; // relative to the project root, forward slashes
  line: number;
  authority: Authority;
  withdrawn: boolean;
  keyword: Keyword;
  text: string; // canonical requirement text, keyword included
  falsifier: string | null; // canonical falsifier text, or null
};

const ID_RE = /^\s*\[([A-Z][A-Z0-9]*)-(\d{3})\]\s*(.*)$/;
const HEADING_RE = /^(#{1,6})\s+\S/;
const AGREED_RE = /^Agreed:\s*\d{4}-\d{2}-\d{2}\s*$/;
const OBSERVED_RE = /^Status:\s*Observed/i;

export function walkMarkdown(dir: string): string[] {
  const out: string[] = [];
  const visit = (d: string) => {
    let names: string[];
    try {
      names = readdirSync(d).sort();
    } catch {
      return;
    }
    for (const name of names) {
      if (name.startsWith(".") || name === "node_modules") continue;
      const p = join(d, name);
      let st;
      try {
        st = statSync(p);
      } catch {
        continue;
      }
      if (st.isDirectory()) visit(p);
      else if (st.isFile() && name.endsWith(".md")) out.push(p);
    }
  };
  visit(dir);
  return out;
}

function fileStatus(lines: string[]): string {
  for (const line of lines.slice(0, 12)) {
    const m = /^\**Status:?\**\s*:?\s*(.+)$/.exec(line.trim());
    if (m) return m[1]!.trim();
  }
  return "";
}

// Mention is not use: a keyword inside backticks or quotes names the
// word without stating an obligation.
function stripMentions(text: string): string {
  return text.replace(/`[^`]*`/g, " ").replace(/"[^"]*"/g, " ");
}

export function keywordOf(text: string): Keyword {
  const t = stripMentions(text);
  if (/\bMUST NOT\b/.test(t)) return "MUST NOT";
  if (/\bMUST\b/.test(t)) return "MUST";
  if (/\bMAY\b/.test(t)) return "MAY";
  return null;
}

function stopsBlock(line: string): boolean {
  const t = line.trim();
  return t === "" || ID_RE.test(line) || HEADING_RE.test(line) || /^(```|~~~)/.test(t) || /^Falsifier:/.test(t) || /^\|/.test(t);
}

export function parseSpecFile(path: string, root: string): Requirement[] {
  const raw = readFileSync(path, "utf8").split(/\r?\n/);
  const status = fileStatus(raw);
  const fileAuthority: Authority = /^Agreed/i.test(status) ? "agreed" : /Observed/i.test(status) ? "observed" : "draft";
  const file = relative(root, path).split("\\").join("/");
  const out: Requirement[] = [];

  // Heading stack: each entry carries the authority in force for its
  // section. A section's own Agreed: or Status: Observed line, placed
  // before its first requirement, overrides what it inherited.
  const stack: Array<{ level: number; authority: Authority }> = [];
  const authorityNow = (): Authority => (stack.length ? stack[stack.length - 1]!.authority : fileAuthority);
  let fenced = false;

  for (let i = 0; i < raw.length; i++) {
    const line = raw[i]!;
    const t = line.trim();
    if (/^(```|~~~)/.test(t)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const h = HEADING_RE.exec(line);
    if (h) {
      const level = h[1]!.length;
      while (stack.length && stack[stack.length - 1]!.level >= level) stack.pop();
      let authority = authorityNow();
      // Look ahead to the section's own marker, if any.
      for (let j = i + 1; j < raw.length; j++) {
        const s = raw[j]!.trim();
        if (HEADING_RE.test(raw[j]!) || ID_RE.test(raw[j]!)) break;
        if (AGREED_RE.test(s)) {
          authority = "agreed";
          break;
        }
        if (OBSERVED_RE.test(s)) {
          authority = "observed";
          break;
        }
      }
      stack.push({ level, authority });
      continue;
    }
    const m = ID_RE.exec(line);
    if (!m) continue;
    const id = `${m[1]}-${m[2]}`;
    const textLines: string[] = [];
    if (m[3]!.trim() !== "") textLines.push(m[3]!);
    let j = i + 1;
    while (j < raw.length && !stopsBlock(raw[j]!)) {
      textLines.push(raw[j]!);
      j++;
    }
    let falsifier: string | null = null;
    if (j < raw.length && /^Falsifier:/.test(raw[j]!.trim())) {
      const fl: string[] = [raw[j]!.trim().replace(/^Falsifier:\s*/, "")];
      j++;
      while (j < raw.length && !stopsBlock(raw[j]!)) {
        fl.push(raw[j]!);
        j++;
      }
      falsifier = canonicalText(fl);
    }
    const text = canonicalText(textLines);
    out.push({
      id,
      prefix: m[1]!,
      file,
      line: i + 1,
      authority: authorityNow(),
      withdrawn: /^Withdrawn:/.test(text),
      keyword: keywordOf(text),
      text,
      falsifier,
    });
  }
  return out;
}

export type Corpus = { requirements: Requirement[]; files: string[]; duplicates: string[] };

export function readCorpus(root: string, specDirs: string[]): Corpus {
  const requirements: Requirement[] = [];
  const files: string[] = [];
  const seen = new Map<string, string>();
  const duplicates: string[] = [];
  for (const dir of specDirs) {
    for (const path of walkMarkdown(join(root, dir))) {
      const name = path.split("/").pop() ?? "";
      if (name === "conformance.md" || name === "glossary.md") continue;
      files.push(path);
      for (const r of parseSpecFile(path, root)) {
        const where = seen.get(r.id);
        if (where && where !== r.file) duplicates.push(`${r.id} defined in ${where} and ${r.file}`);
        seen.set(r.id, r.file);
        requirements.push(r);
      }
    }
  }
  return { requirements, files, duplicates };
}
