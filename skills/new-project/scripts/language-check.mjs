#!/usr/bin/env node
// Same Page language check -- pass one of the language check and
// evidence map specification (Same Page Conformance names the engine
// above it).
// Deterministic, lexical, and structural findings only: CONF-001
// through CONF-013 plus evidence-map integrity (CONF-040 through
// CONF-049).
// Semantic judgment (pass two) belongs to the model in-session; this
// script is the repeatable floor beneath it.
//
// Usage: node language-check.mjs [paths...]
//   Each path is a spec file or a spec set directory (scanned
//   recursively for *.md). Default: docs/specs under the cwd if it
//   exists, else the cwd.
// Exit: 0 no findings, 1 findings, 0 with INFO lines for skipped
//   checks (git history unavailable, no glossary present).
// The script never writes (CONF-010).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------- lexicon

const NORMATIVE_KEYWORDS = ["MUST NOT", "MUST", "MAY"];
// LANG-005 / CONF-003: banned normative strength. Modals are banned
// in any case (lowercase "should" is exactly the miss the check
// exists for); RECOMMENDED and OPTIONAL are banned in upper case
// only, since lowercase "optional" is an ordinary adjective and
// belongs to pass two when it is actually ambiguous.
const BANNED_KEYWORDS = [
  { phrase: "SHOULD NOT", ci: true },
  { phrase: "SHOULD", ci: true },
  { phrase: "RECOMMENDED", ci: false },
  { phrase: "OPTIONAL", ci: false },
  { phrase: "SHALL", ci: true },
  { phrase: "WILL", ci: true },
  { phrase: "NEEDS TO", ci: true },
];
// LANG-030 / CONF-005: vague qualifiers, any case.
const BANNED_QUALIFIERS = [
  "quickly",
  "appropriately",
  "normally",
  "gracefully",
  "robustly",
  "efficiently",
  "seamlessly",
  "easily",
  "simply",
  "properly",
  "adequately",
  "reasonably",
  "as needed",
  "where possible",
  "if necessary",
  "whenever possible",
  "best-effort",
];
// LANG-021 / CONF-008: banned requirement subjects.
const BANNED_SUBJECTS = ["it", "this", "they", "the system"];
// LANG-060: canonical normative headings (matched case-insensitively,
// after stripping leading numbering); a normative heading covers its
// subsections.
const CANONICAL_HEADINGS = [
  "capabilities",
  "acceptance criteria",
  "cross-cutting requirements",
  "in",
  "out",
  "definition of done",
  "expected behavior",
];
const MAP_COVERAGE = ["Covered", "Asserted", "Uncovered"];
// CONF-045: evidence kinds. Not a rank; the order is alphabetical by
// family, and no check reads position as strength.
const MAP_METHODS = [
  "formal",
  "model",
  "property",
  "integration",
  "test",
  "static",
  "inspected",
  "manual",
  "-",
];
const ID_RE = /\[([A-Z][A-Z0-9]*)-(\d{3})\]/g;
const ID_LOOSE_RE = /\[([A-Z][A-Z0-9]*)-(\d+)\]/g;
const SENTENCE_ABBREV = ["e.g.", "i.e.", "etc.", "vs.", "cf."];

// ---------------------------------------------------------------- helpers

function walkMarkdown(target) {
  const st = statSync(target);
  if (st.isFile()) return target.endsWith(".md") ? [target] : [];
  const out = [];
  for (const entry of readdirSync(target, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const p = join(target, entry.name);
    if (entry.isDirectory()) out.push(...walkMarkdown(p));
    else if (entry.name.endsWith(".md")) out.push(p);
  }
  return out.sort();
}

// CONF-013 / LANG-062: mention is not use. Replace fenced blocks,
// backtick code spans, and double-quoted spans with spaces so offsets
// and word counts stay honest while mentions escape every token rule.
function stripFences(text) {
  const lines = text.split("\n");
  let fenced = false;
  return lines
    .map((line) => {
      const isFence = /^\s*(```|~~~)/.test(line);
      if (isFence) {
        fenced = !fenced;
        return "";
      }
      return fenced ? "" : line;
    })
    .join("\n");
}

function stripMentionsInline(line) {
  return line
    .replace(/`[^`]*`/g, (m) => " ".repeat(m.length))
    .replace(/"[^"]*"/g, (m) => " ".repeat(m.length));
}

function headingLevel(line) {
  const m = /^(#{1,6})\s+(.*)$/.exec(line);
  return m ? { level: m[1].length, text: m[2].trim() } : null;
}

function canonicalHeading(text) {
  const stripped = text
    .replace(/^[0-9.\s-]+/, "")
    .replace(/[:.]+$/, "")
    .trim()
    .toLowerCase();
  return CANONICAL_HEADINGS.includes(stripped);
}

// LANG-060/LANG-061 via CONF-012: mark each line normative or not.
function normativeLineMap(rawLines) {
  const map = new Array(rawLines.length).fill(false);
  // stack of { level, normative }
  const stack = [];
  let fenced = false;
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    const h = !fenced && headingLevel(line);
    if (h) {
      while (stack.length && stack[stack.length - 1].level >= h.level) stack.pop();
      const inherited = stack.length ? stack[stack.length - 1].normative : false;
      // Marker check: first non-empty line after the heading is "Normative."
      let marked = false;
      for (let j = i + 1; j < rawLines.length; j++) {
        const t = rawLines[j].trim();
        if (t === "") continue;
        marked = t === "Normative.";
        break;
      }
      stack.push({ level: h.level, normative: inherited || marked || canonicalHeading(h.text) });
      map[i] = false; // headings themselves are not scanned
      continue;
    }
    map[i] = stack.length ? stack[stack.length - 1].normative : false;
  }
  return map;
}

// Join wrapped lines into paragraphs; keep the starting line number.
// Tables, headings, the "Normative." marker, and blank lines break
// paragraphs; table rows are token-scanned but never sentence-scanned.
function paragraphs(rawLines, isNormative) {
  const paras = [];
  let buf = [];
  let start = -1;
  let table = false;
  const flush = () => {
    if (buf.length)
      paras.push({
        line: start + 1,
        text: stripMentionsInline(buf.join(" ")),
        table,
      });
    buf = [];
    start = -1;
    table = false;
  };
  let fenced = false;
  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i];
    if (/^\s*(```|~~~)/.test(raw)) {
      fenced = !fenced;
      flush();
      continue;
    }
    if (fenced || !isNormative[i]) {
      flush();
      continue;
    }
    const t = raw.trim();
    if (t === "" || headingLevel(raw) || t === "Normative.") {
      flush();
      continue;
    }
    const isTableRow = t.startsWith("|");
    const isListItem = /^[-*]\s+/.test(t) || /^\d+\.\s+/.test(t);
    if ((isTableRow && buf.length && !table) || (!isTableRow && table) || isListItem) flush();
    if (buf.length === 0) {
      start = i;
      table = isTableRow;
    }
    buf.push(t);
  }
  flush();
  return paras;
}

function splitSentences(text) {
  let guarded = text;
  for (const a of SENTENCE_ABBREV) {
    guarded = guarded.split(a).join(a.replace(/\./g, "\u0000"));
  }
  return guarded
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.replace(/\u0000/g, ".").trim())
    .filter((s) => s.length > 0);
}

function wordCount(sentence) {
  return sentence.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
}

function findKeywords(sentence) {
  const found = [];
  const re = /\b(MUST NOT|MUST|MAY)\b/g;
  let m;
  while ((m = re.exec(sentence)) !== null) found.push({ kw: m[1], index: m.index });
  return found;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function phraseRe(phrase, ci = true) {
  return new RegExp(
    `\\b${escapeRe(phrase).replace(/\s+/g, "\\s+")}\\b`,
    ci ? "gi" : "g"
  );
}

// ---------------------------------------------------------------- report

class Report {
  constructor() {
    this.blocks = new Map(); // anchor -> { context, items: [] }
    this.infos = [];
  }
  info(msg) {
    this.infos.push(`INFO: ${msg}`);
  }
  add(anchor, context, term, message, hint) {
    if (!this.blocks.has(anchor)) this.blocks.set(anchor, { context, items: [] });
    const block = this.blocks.get(anchor);
    const dupe = block.items.some((it) => it.term === term && it.message === message);
    if (!dupe) block.items.push({ term, message, hint });
  }
  count() {
    let n = 0;
    for (const b of this.blocks.values()) n += b.items.length;
    return n;
  }
  print() {
    const out = [];
    for (const [anchor, block] of this.blocks) {
      out.push(anchor, "");
      if (block.context) out.push(`"${block.context}"`, "");
      for (const it of block.items) {
        out.push(it.term, `  ${it.message}`);
        if (it.hint) out.push(`  ${it.hint}`);
        out.push("");
      }
    }
    for (const i of this.infos) out.push(i);
    if (this.infos.length) out.push("");
    out.push(
      this.count() === 0
        ? "language check: no findings"
        : `language check: ${this.count()} finding(s)`
    );
    process.stdout.write(out.join("\n") + "\n");
  }
}

// ---------------------------------------------------------------- glossary

// Parses the shipped glossary format: "**Term**:" entries and
// "_Avoid_:" lines. A parenthetically qualified Avoid term is a
// conditional ban and is excluded from pass one (CONF-006).
function parseGlossary(path) {
  const entries = new Set();
  const avoid = [];
  const text = stripFences(readFileSync(path, "utf8"));
  let lastTerm = null;
  for (const raw of text.split("\n")) {
    const term = /^\*\*(.+?)\*\*\s*:/.exec(raw.trim());
    if (term) {
      lastTerm = term[1].trim();
      entries.add(lastTerm.toLowerCase());
      continue;
    }
    const av = /^_Avoid_\s*:\s*(.+)$/.exec(raw.trim());
    if (av) {
      for (const piece of splitAvoidList(av[1])) {
        if (piece.qualified) continue;
        avoid.push({ term: piece.term, preferred: lastTerm });
      }
    }
  }
  return { entries, avoid };
}

// Split an Avoid list on top-level commas; a trailing "(...)" on an
// item marks it qualified.
function splitAvoidList(s) {
  const items = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      items.push(cur);
      cur = "";
    } else cur += ch;
  }
  items.push(cur);
  return items
    .map((i) => i.trim())
    .filter(Boolean)
    .map((i) => {
      const qualified = /\)\s*$/.test(i) && i.includes("(");
      const term = i.replace(/\s*\([^)]*\)\s*$/, "").trim();
      return { term, qualified };
    })
    .filter((i) => i.term.length > 0);
}

// ---------------------------------------------------------------- specs

function fileStatus(rawLines) {
  for (const line of rawLines.slice(0, 12)) {
    const m = /^\**Status:?\**\s*:?\s*(.+)$/.exec(line.trim());
    if (m) return m[1];
  }
  return "";
}

function declaredPrefix(rawLines) {
  for (const line of rawLines) {
    const m = /^\**(?:Rule\s+)?[Pp]refix:?\**\s*:?\s*([A-Z][A-Z0-9]*)\s*$/.exec(line.trim());
    if (m) return m[1];
  }
  return null;
}

function scanFile(path, displayPath, report, corpus) {
  const raw = readFileSync(path, "utf8");
  const rawLines = raw.split("\n");
  const status = fileStatus(rawLines);
  const prefix = declaredPrefix(rawLines);
  const normMap = normativeLineMap(rawLines);
  const fileInfo = {
    path,
    displayPath,
    status,
    prefix,
    definitions: new Map(), // id -> { line, withdrawn, observed, draft }
    references: new Set(),
  };
  corpus.files.push(fileInfo);

  // Definitions and references. A definition is a bracketed ID that
  // opens a line (LANG-050); everything else bracketed is a reference,
  // and bare PREFIX-NNN tokens are references too.
  let fenced = false;
  // Section status (CONF-015): a heading stack; a section's own
  // `Agreed: <date>` or `Status: Observed` line, placed before its first
  // requirement, sets the status for it and its subsections until a
  // heading of the same or higher level. The engine (specs.ts) reads
  // the same convention.
  const AGREED_LINE_RE = /^Agreed:\s*\d{4}-\d{2}-\d{2}\s*$/;
  const OBSERVED_LINE_RE = /^Status:\s*Observed/i;
  const stack = []; // { level, status: "agreed" | "observed" | null }
  const sectionStatus = () => (stack.length ? stack[stack.length - 1].status : null);
  const stopsBlock = (l) => {
    const t = l.trim();
    return t === "" || /^\s*\[[A-Z][A-Z0-9]*-\d+\]/.test(l) || headingLevel(l) || /^(```|~~~)/.test(t) || /^Falsifier:/.test(t) || /^\|/.test(t);
  };
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    if (fenced) continue;
    const h = headingLevel(line);
    if (h) {
      while (stack.length && stack[stack.length - 1].level >= h.level) stack.pop();
      let sstatus = stack.length ? stack[stack.length - 1].status : null;
      for (let j = i + 1; j < rawLines.length; j++) {
        const t = rawLines[j].trim();
        if (headingLevel(rawLines[j]) || /^\s*\[[A-Z][A-Z0-9]*-\d+\]/.test(rawLines[j])) break;
        if (AGREED_LINE_RE.test(t)) {
          sstatus = "agreed";
          break;
        }
        if (OBSERVED_LINE_RE.test(t)) {
          sstatus = "observed";
          break;
        }
      }
      stack.push({ level: h.level, status: sstatus });
    }
    const defMatch = /^\s*\[([A-Z][A-Z0-9]*)-(\d+)\]/.exec(line);
    if (defMatch) {
      const id = `${defMatch[1]}-${defMatch[2]}`;
      const rest = line.slice(defMatch[0].length).trim();
      let after = rest;
      if (after === "") {
        for (let j = i + 1; j < rawLines.length; j++) {
          if (rawLines[j].trim() !== "") {
            after = rawLines[j].trim();
            break;
          }
        }
      }
      const withdrawn = /^Withdrawn:/.test(after);
      const sec = sectionStatus();
      const observed = sec === "observed" || (sec !== "agreed" && /Observed/i.test(status));
      const draft = sec !== "agreed" && /Draft/i.test(status);
      if (defMatch[2].length !== 3) {
        report.add(
          `${displayPath}:${i + 1}`,
          line.trim(),
          id,
          "Identifier number is not three digits. (LANG-053, CONF-001)",
          "Use [PREFIX-NNN] with a three-digit number."
        );
      }
      if (fileInfo.definitions.has(id)) {
        report.add(
          `${displayPath}:${i + 1}`,
          line.trim(),
          id,
          "Duplicate identifier. (LANG-052, CONF-001)",
          `First defined at line ${fileInfo.definitions.get(id).line}.`
        );
      } else {
        fileInfo.definitions.set(id, {
          line: i + 1,
          withdrawn,
          observed,
          draft,
        });
      }
      // The requirement block and its Falsifier line (CONF-016..018).
      const block = [rest];
      let j = i + 1;
      while (j < rawLines.length && !stopsBlock(rawLines[j])) {
        block.push(rawLines[j]);
        j++;
      }
      const kws = new Set(findKeywords(stripMentionsInline(block.join(" "))).map((k) => k.kw));
      let falsifier = null;
      if (j < rawLines.length && /^Falsifier:/.test(rawLines[j].trim())) {
        const fl = [rawLines[j].trim().replace(/^Falsifier:\s*/, "")];
        let k = j + 1;
        while (k < rawLines.length && !stopsBlock(rawLines[k])) {
          fl.push(rawLines[k]);
          k++;
        }
        falsifier = { line: j + 1, text: fl.join(" ") };
      }
      const agreed = !withdrawn && !observed && !draft;
      const obligates = kws.has("MUST") || kws.has("MUST NOT");
      if (agreed && obligates && !falsifier) {
        report.add(
          `${displayPath}:${i + 1}`,
          line.trim(),
          id,
          "Agreed MUST or MUST NOT requirement with no Falsifier: line. (LANG-070, LANG-075, CONF-016)",
          "Ask what observable state would violate it; record the confirmed falsifier on a Falsifier: line directly under the requirement."
        );
      }
      if (!obligates && kws.has("MAY") && falsifier) {
        report.add(
          `${displayPath}:${falsifier.line}`,
          rawLines[falsifier.line - 1].trim(),
          id,
          "Falsifier: line under a permission-only MAY requirement. (LANG-073, CONF-017)",
          "A permission has no falsifier; state a limit as its own MUST or MUST NOT requirement."
        );
      }
      if (falsifier && findKeywords(stripMentionsInline(falsifier.text)).length > 0) {
        report.add(
          `${displayPath}:${falsifier.line}`,
          rawLines[falsifier.line - 1].trim(),
          id,
          "Normative keyword inside a Falsifier: line. (LANG-077, CONF-018)",
          "A falsifier describes a state; the obligation lives in the requirement above it."
        );
      }
      if (prefix && defMatch[1] !== prefix) {
        report.add(
          `${displayPath}:${i + 1}`,
          line.trim(),
          id,
          `Identifier prefix is not this spec's declared prefix (${prefix}). (LANG-051, CONF-001)`,
          "One prefix per spec; move the requirement or fix the prefix."
        );
      }
      if (!prefix) {
        report.add(
          `${displayPath}:${i + 1}`,
          line.trim(),
          id,
          "Identified requirement in a spec with no declared prefix. (LANG-051, CONF-001)",
          "Add a Prefix: line to the status header."
        );
      }
      continue;
    }
    if (normMap[i] || true) {
      let m;
      const scan = stripMentionsInline(line);
      ID_LOOSE_RE.lastIndex = 0;
      while ((m = ID_LOOSE_RE.exec(scan)) !== null) fileInfo.references.add(`${m[1]}-${m[2]}`);
      const bare = /\b([A-Z][A-Z0-9]*)-(\d{3})\b/g;
      while ((m = bare.exec(scan)) !== null) fileInfo.references.add(`${m[1]}-${m[2]}`);
    }
  }

  // Token and sentence rules over normative text.
  const glossary = corpus.glossary;
  for (const para of paragraphs(rawLines, normMap)) {
    const anchorFor = (sentence) => {
      const idm = /^\[?([A-Z][A-Z0-9]*-\d{3})\]?/.exec(para.text.trim());
      return idm ? idm[1] : `${displayPath}:${para.line}`;
    };
    const units = para.table ? [para.text] : splitSentences(para.text);
    for (const sentence of units) {
      const anchor = anchorFor(sentence);
      const clean = sentence.replace(/^\[[A-Z][A-Z0-9]*-\d+\]\s*/, "");
      // CONF-003: banned normative strength.
      for (const banned of BANNED_KEYWORDS) {
        if (phraseRe(banned.phrase, banned.ci).test(clean)) {
          report.add(
            anchor,
            clean,
            banned.phrase,
            "Ambiguous normative strength. (LANG-005, CONF-003)",
            banned.phrase.startsWith("SHOULD")
              ? "Did you mean MUST or MAY?"
              : "Use MUST, MUST NOT, or MAY, or move this to rationale."
          );
        }
      }
      // CONF-004: lowercase keywords.
      for (const low of ["must not", "must", "may"]) {
        const re = new RegExp(`\\b${low.replace(" ", "\\s+")}\\b`, "g");
        if (re.test(clean)) {
          report.add(
            anchor,
            clean,
            low.toUpperCase(),
            "Normative keyword in lower case. (LANG-006, CONF-004)",
            "Write normative keywords in upper case, or rephrase."
          );
        }
      }
      // CONF-005: banned qualifiers, unless the glossary defines the term.
      for (const q of BANNED_QUALIFIERS) {
        if (glossary && glossary.entries.has(q)) continue;
        if (phraseRe(q).test(clean)) {
          report.add(
            anchor,
            clean,
            q.toUpperCase(),
            "Undefined qualitative term. (LANG-030, CONF-005)",
            "State the observable required behavior."
          );
        }
      }
      // CONF-006: unqualified glossary Avoid terms.
      if (glossary) {
        for (const { term, preferred } of glossary.avoid) {
          if (phraseRe(term).test(clean)) {
            report.add(
              anchor,
              clean,
              term.toUpperCase(),
              "Ambiguous term. (LANG-013, CONF-006)",
              preferred ? `Project vocabulary contains: ${preferred.toLowerCase()}` : null
            );
          }
        }
      }
      if (para.table) continue; // sentence-level rules need sentences
      const kws = findKeywords(clean);
      // CONF-007: compound requirement.
      if (kws.length > 1) {
        report.add(
          anchor,
          clean,
          "COMPOUND REQUIREMENT",
          `${kws.length} normative keywords in one sentence. (LANG-020, CONF-007)`,
          "Split into one requirement per sentence."
        );
      }
      if (kws.length >= 1) {
        // CONF-008: requirement subject.
        const before = clean.slice(0, kws[0].index).trim();
        const subject = before.split(",").pop().trim().replace(/[.;:]+$/, "");
        if (subject === "") {
          report.add(
            anchor,
            clean,
            "NO ACTOR",
            "Requirement names no actor. (LANG-021, CONF-008)",
            "Name the component that carries the obligation."
          );
        } else if (BANNED_SUBJECTS.includes(subject.toLowerCase())) {
          report.add(
            anchor,
            clean,
            subject.toUpperCase(),
            "Pronoun or placeholder subject. (LANG-021, CONF-008)",
            "Name the actor explicitly."
          );
        }
        // CONF-009: sentence length.
        const words = wordCount(clean);
        if (words > 30) {
          report.add(
            anchor,
            clean,
            "SENTENCE LENGTH",
            `${words} words in one requirement sentence. (LANG-024, CONF-009)`,
            "Split it, or confirm it with the developer as irreducible."
          );
        }
      }
    }
  }
}

// CONF-002: identifier stability against git HEAD.
function checkHistory(report, corpus) {
  for (const file of corpus.files) {
    const dir = dirname(file.path);
    const top = spawnSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: dir,
      encoding: "utf8",
    });
    if (top.status !== 0) {
      report.info(
        `git history unavailable for ${file.displayPath}: identifier-stability check (CONF-002) skipped.`
      );
      continue;
    }
    const root = top.stdout.trim();
    const rel = relative(root, file.path).split("\\").join("/");
    const show = spawnSync("git", ["show", `HEAD:${rel}`], { cwd: root, encoding: "utf8" });
    if (show.status !== 0) continue; // new file: nothing to compare
    const prev = new Map();
    const prevLines = show.stdout.split("\n");
    let fenced = false;
    for (let i = 0; i < prevLines.length; i++) {
      if (/^\s*(```|~~~)/.test(prevLines[i])) fenced = !fenced;
      if (fenced) continue;
      const m = /^\s*\[([A-Z][A-Z0-9]*)-(\d+)\]/.exec(prevLines[i]);
      if (!m) continue;
      const id = `${m[1]}-${m[2]}`;
      let after = prevLines[i].slice(m[0].length).trim();
      if (after === "") {
        for (let j = i + 1; j < prevLines.length; j++) {
          if (prevLines[j].trim() !== "") {
            after = prevLines[j].trim();
            break;
          }
        }
      }
      prev.set(id, { withdrawn: /^Withdrawn:/.test(after) });
    }
    for (const [id, was] of prev) {
      const now = file.definitions.get(id);
      if (!now && !was.withdrawn) {
        report.add(
          file.displayPath,
          null,
          id,
          "Identifier removed. (LANG-052, CONF-002)",
          "Identifiers are permanent: withdraw it instead of deleting it."
        );
      }
      if (now && was.withdrawn && !now.withdrawn) {
        report.add(
          file.displayPath,
          null,
          id,
          "Withdrawn identifier reused. (LANG-052, CONF-002)",
          "Retired identifiers are never reassigned; take the next number."
        );
      }
    }
  }
}

function checkReferences(report, corpus) {
  const defined = new Set();
  const declaredPrefixes = new Set();
  for (const f of corpus.files) {
    for (const id of f.definitions.keys()) defined.add(id);
    if (f.prefix) declaredPrefixes.add(f.prefix);
  }
  for (const f of corpus.files) {
    for (const ref of f.references) {
      const prefix = ref.split("-")[0];
      if (declaredPrefixes.has(prefix) && !defined.has(ref)) {
        report.add(
          f.displayPath,
          null,
          ref,
          "Unresolved requirement reference. (LANG-052, CONF-001)",
          "The referenced identifier is not defined in the scanned spec set."
        );
      }
    }
  }
}

// CONF-040 through CONF-049: evidence map integrity.
function checkMap(report, corpus, specDirs) {
  const required = new Map(); // id -> displayPath
  for (const f of corpus.files) {
    if (basename(f.path) === "conformance.md") continue;
    for (const [id, meta] of f.definitions) {
      if (!meta.withdrawn && !meta.observed && !meta.draft) required.set(id, f.displayPath);
    }
  }
  const mapFile = corpus.files.find((f) => basename(f.path) === "conformance.md");
  if (!mapFile) {
    if (required.size > 0) {
      report.add(
        "conformance.md",
        null,
        "MISSING MAP",
        `No conformance.md, but ${required.size} Agreed requirement(s) exist. (CONF-040)`,
        "Scaffold the map; an honest Uncovered beats an absent row."
      );
    }
    return;
  }
  const rows = new Map(); // id -> count
  const raw = readFileSync(mapFile.path, "utf8").split("\n");
  const root = gitRootFor(mapFile.path) || dirname(mapFile.path);
  for (let i = 0; i < raw.length; i++) {
    const t = raw[i].trim();
    if (!t.startsWith("|") || /^\|\s*-+/.test(t)) continue;
    if (/^\|\s*Requirement\s*\|/i.test(t) || /^\|\s*Req\s*\|/i.test(t)) continue;
    const cells = t.split("|").map((c) => c.trim());
    const [, id, coverage, method, evidence] = cells;
    if (!id || !/^[A-Z][A-Z0-9]*-\d{3}$/.test(id)) continue;
    rows.set(id, (rows.get(id) || 0) + 1);
    if (rows.get(id) > 1) {
      report.add(
        `${mapFile.displayPath}:${i + 1}`,
        t,
        id,
        "Identifier appears more than once in the map. (CONF-040)",
        null
      );
    }
    // A three-column row is the pre-split map format; report it once
    // rather than misreading its evidence cell as a method.
    if (cells.length < 6) {
      report.add(
        `${mapFile.displayPath}:${i + 1}`,
        t,
        id,
        "Row does not carry the four map columns. (CONF-041, CONF-045)",
        "Columns are Requirement, Coverage, Method, Evidence."
      );
      continue;
    }
    if (!MAP_COVERAGE.includes(coverage)) {
      report.add(
        `${mapFile.displayPath}:${i + 1}`,
        t,
        id,
        `Invalid map coverage "${coverage}". (CONF-041)`,
        "Use Covered, Asserted, or Uncovered."
      );
    }
    if (!MAP_METHODS.includes(method)) {
      report.add(
        `${mapFile.displayPath}:${i + 1}`,
        t,
        id,
        `Invalid map method "${method}". (CONF-045)`,
        `Use one of ${MAP_METHODS.join(", ")}.`
      );
    }
    if (method === "inspected" && coverage !== "Asserted") {
      report.add(
        `${mapFile.displayPath}:${i + 1}`,
        t,
        id,
        "Method inspected with coverage that is not Asserted. (CONF-046)",
        "Implementation inspection addresses no falsifier; it is Asserted."
      );
    }
    if (coverage === "Asserted" && method !== "inspected") {
      report.add(
        `${mapFile.displayPath}:${i + 1}`,
        t,
        id,
        `Coverage Asserted with method "${method}". (CONF-047)`,
        "Asserted is implementation inspection; name a mechanism and raise coverage, or use inspected."
      );
    }
    if (coverage === "Uncovered" && method !== "-") {
      report.add(
        `${mapFile.displayPath}:${i + 1}`,
        t,
        id,
        `Coverage Uncovered with method "${method}". (CONF-048)`,
        "An Uncovered row carries method -."
      );
    }
    if (coverage === "Uncovered" && evidence) {
      report.add(
        `${mapFile.displayPath}:${i + 1}`,
        t,
        id,
        "Coverage Uncovered with an evidence citation. (CONF-049)",
        "Raise the coverage, or drop the citation."
      );
    }
    if ((coverage === "Covered" || coverage === "Asserted") && (!evidence || evidence === "")) {
      report.add(
        `${mapFile.displayPath}:${i + 1}`,
        t,
        id,
        `${coverage} with no evidence citation. (CONF-041)`,
        "Cite the test or code path, or mark it Uncovered."
      );
    }
    if (evidence) {
      const p = evidence.split("::")[0].trim();
      const candidates = isAbsolute(p)
        ? [p]
        : [join(root, p), join(dirname(mapFile.path), p)];
      if (p && !candidates.some((c) => existsSync(c))) {
        report.add(
          `${mapFile.displayPath}:${i + 1}`,
          t,
          id,
          `Evidence path does not exist: ${p} (CONF-042)`,
          null
        );
      }
    }
    const known = corpus.files.some((f) => f.definitions.has(id));
    if (!known) {
      report.add(
        `${mapFile.displayPath}:${i + 1}`,
        t,
        id,
        "Map row for an identifier no spec defines. (CONF-040)",
        null
      );
    }
  }
  for (const [id, where] of required) {
    if (!rows.has(id)) {
      report.add(
        mapFile.displayPath,
        null,
        id,
        `Agreed requirement missing from the map (defined in ${where}). (CONF-040)`,
        "Add the row; Uncovered is a valid answer."
      );
    }
  }
}

function gitRootFor(p) {
  const r = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    cwd: dirname(p),
    encoding: "utf8",
  });
  return r.status === 0 ? r.stdout.trim() : null;
}

// ---------------------------------------------------------------- main

// ---------------------------------------------------------------- standard dictionary

// CONF-014: the glossary's Working vocabulary section is the standard
// dictionary, shipped in the glossary template beside this script and
// identical in every project by default. A project changes a standard
// entry only by a recorded ruling: a "_Ruling_:" line inside the entry.
// An entry that differs without one is drift and is reported; an entry
// with one is listed as information, so the deviation stays visible.
const STANDARD_HEADING = "## Working vocabulary";
const RESTORE_HINT =
  "Restore the entry from the shipped glossary template, or record the project's ruling on it with a _Ruling_: line (date -- reason).";

function stripTrailingBlank(lines) {
  const out = [...lines];
  while (out.length && out[out.length - 1] === "") out.pop();
  return out;
}

function standardSection(text) {
  const lines = text.split("\n").map((l) => l.replace(/\s+$/, ""));
  const start = lines.indexOf(STANDARD_HEADING);
  if (start < 0) return null;
  let end = lines.findIndex((l, i) => i > start && /^## /.test(l));
  if (end < 0) end = lines.length;
  return { start, lines: stripTrailingBlank(lines.slice(start, end)) };
}

// Entries: a "**Term**:" line and every line up to the next blank line.
// The _Ruling_: line is kept apart from the body so a ruled entry still
// compares on its wording.
function parseEntries(section) {
  const entries = new Map();
  let cur = null;
  section.lines.forEach((raw, i) => {
    const term = /^\*\*(.+?)\*\*\s*:/.exec(raw);
    if (term) {
      cur = { term: term[1].trim(), body: [raw], ruling: null, line: section.start + i + 1 };
      entries.set(cur.term.toLowerCase(), cur);
      return;
    }
    if (!cur) return;
    if (raw === "") {
      cur = null;
      return;
    }
    const ruling = /^_Ruling_\s*:\s*(.+)$/.exec(raw);
    if (ruling) cur.ruling = ruling[1].trim();
    else cur.body.push(raw);
  });
  return entries;
}

function checkStandardDictionary(report, glossaryPath, rel) {
  const templatePath = join(dirname(fileURLToPath(import.meta.url)), "..", "templates", "glossary.md");
  if (!existsSync(templatePath)) {
    report.info("glossary template not found beside the script: standard-dictionary check (CONF-014) skipped.");
    return;
  }
  const shipped = standardSection(readFileSync(templatePath, "utf8"));
  if (!shipped) {
    report.info("shipped glossary template has no Working vocabulary section: standard-dictionary check (CONF-014) skipped.");
    return;
  }
  const local = standardSection(readFileSync(glossaryPath, "utf8"));
  if (!local) {
    report.add(
      rel,
      null,
      "STANDARD DICTIONARY MISSING",
      "Glossary has no Working vocabulary section. (LANG-011, CONF-014)",
      "Copy the section verbatim from the shipped glossary template; project terms go under Project terms."
    );
    return;
  }
  const shippedEntries = parseEntries(shipped);
  const localEntries = parseEntries(local);
  for (const [key, s] of shippedEntries) {
    const l = localEntries.get(key);
    if (!l) {
      report.add(
        rel,
        null,
        `STANDARD DICTIONARY DRIFT: ${s.term}`,
        "Standard dictionary entry is missing. (LANG-011, CONF-014)",
        RESTORE_HINT
      );
      continue;
    }
    if (s.body.join("\n") === l.body.join("\n")) continue;
    if (l.ruling) {
      report.info(`standard term ruled for this project: ${l.term} -- ${l.ruling}`);
      continue;
    }
    let j = 0;
    while (j < s.body.length && j < l.body.length && s.body[j] === l.body[j]) j++;
    const context = l.body[j] ?? `(missing: ${s.body[j]})`;
    report.add(
      `${rel}:${l.line + Math.min(j, l.body.length - 1)}`,
      context,
      `STANDARD DICTIONARY DRIFT: ${l.term}`,
      "Entry differs from the shipped standard dictionary and carries no ruling. (LANG-011, CONF-014)",
      RESTORE_HINT
    );
  }
  for (const [key, l] of localEntries) {
    if (shippedEntries.has(key)) continue;
    report.add(
      `${rel}:${l.line}`,
      l.body[0],
      `NOT A STANDARD TERM: ${l.term}`,
      "Working vocabulary holds a term the shipped standard dictionary does not define. (LANG-011, CONF-014)",
      "Move the entry under Project terms."
    );
  }
}

function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  let targets = args;
  if (targets.length === 0) {
    const dflt = join(process.cwd(), "docs", "specs");
    targets = [existsSync(dflt) ? dflt : process.cwd()];
  }
  const report = new Report();
  const files = [];
  for (const t of targets) {
    const abs = resolve(t);
    if (!existsSync(abs)) {
      report.info(`path not found: ${t}`);
      continue;
    }
    files.push(...walkMarkdown(abs));
  }
  const specDirs = [...new Set(files.map((f) => dirname(f)))];
  let glossary = null;
  const glossaryPath = specDirs.map((d) => join(d, "glossary.md")).find((p) => existsSync(p));
  if (glossaryPath) {
    glossary = parseGlossary(glossaryPath);
    checkStandardDictionary(report, glossaryPath, relative(process.cwd(), glossaryPath) || glossaryPath);
  } else report.info("no glossary.md in scanned set: Avoid-term check (CONF-006) skipped.");

  const corpus = { files: [], glossary };
  for (const f of files) {
    if (basename(f) === "glossary.md") continue;
    scanFile(f, relative(process.cwd(), f) || f, report, corpus);
  }
  checkHistory(report, corpus);
  checkReferences(report, corpus);
  checkMap(report, corpus, specDirs);
  report.print();
  process.exit(report.count() === 0 ? 0 : 1);
}

main();
