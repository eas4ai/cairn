// The YAML subset the engine reads and writes. Every file the engine
// emits is valid YAML 1.2; the reader accepts that subset plus the
// hand edits a developer makes to policy.yaml and obligation files:
// block mappings, block sequences, plain and quoted scalars, literal
// block scalars, comments, and the empty flow collections [] and {}.
// Anchors, tags, multi-document streams, and other flow syntax are
// reported as errors with a line number, never guessed at.

export type YamlScalar = string | number | boolean | null;
export type YamlValue = YamlScalar | YamlValue[] | YamlMap;
export type YamlMap = { [key: string]: YamlValue };

export class YamlError extends Error {
  line: number;
  constructor(message: string, line: number) {
    super(`${message} (line ${line})`);
    this.name = "YamlError";
    this.line = line;
  }
}

type Line = { indent: number; text: string; num: number; raw: string };

const METHODS_NOTE = "yaml subset";

function stripComment(raw: string): string {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === "'" && !inDouble) inSingle = !inSingle;
    else if (c === '"' && !inSingle) {
      if (raw[i - 1] !== "\\") inDouble = !inDouble;
    } else if (c === "#" && !inSingle && !inDouble) {
      if (i === 0 || raw[i - 1] === " " || raw[i - 1] === "\t") return raw.slice(0, i);
    }
  }
  return raw;
}

function prepare(text: string): Line[] {
  const out: Line[] = [];
  const rawLines = text.split(/\r?\n/);
  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i] ?? "";
    if (/^\t/.test(raw)) throw new YamlError("tab indentation is not accepted", i + 1);
    const noComment = stripComment(raw).replace(/\s+$/, "");
    if (noComment.trim() === "") continue;
    if (noComment === "---" || noComment === "...") continue;
    const indent = noComment.length - noComment.replace(/^ */, "").length;
    out.push({ indent, text: noComment.slice(indent), num: i + 1, raw });
  }
  return out;
}

const KEY_RE = /^("(?:[^"\\]|\\.)*"|[A-Za-z0-9_.\-\/@+]+):(?:\s+(.*))?$/;

function isKeyLine(text: string): boolean {
  return KEY_RE.test(text) && !text.startsWith("- ");
}

function unquoteKey(k: string): string {
  return k.startsWith('"') ? parseDoubleQuoted(k, 0) : k;
}

function parseDoubleQuoted(s: string, line: number): string {
  const body = s.slice(1, -1);
  let out = "";
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c !== "\\") {
      out += c;
      continue;
    }
    const n = body[++i];
    if (n === "n") out += "\n";
    else if (n === "t") out += "\t";
    else if (n === "r") out += "\r";
    else if (n === '"') out += '"';
    else if (n === "\\") out += "\\";
    else if (n === "/") out += "/";
    else throw new YamlError(`unsupported escape \\${n ?? ""}`, line);
  }
  return out;
}

const NUMBER_RE = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][-+]?[0-9]+)?$/;

export function parseScalar(text: string, line: number): YamlScalar {
  const t = text.trim();
  if (t.startsWith('"')) {
    if (!t.endsWith('"') || t.length < 2) throw new YamlError("unterminated double-quoted scalar", line);
    return parseDoubleQuoted(t, line);
  }
  if (t.startsWith("'")) {
    if (!t.endsWith("'") || t.length < 2) throw new YamlError("unterminated single-quoted scalar", line);
    return t.slice(1, -1).replace(/''/g, "'");
  }
  if (t === "null" || t === "~") return null;
  if (t === "true") return true;
  if (t === "false") return false;
  if (NUMBER_RE.test(t)) return Number(t);
  if (/^[&*!%@`]/.test(t)) throw new YamlError(`unsupported syntax in ${METHODS_NOTE}: ${t[0]}`, line);
  if (/^[\[{]/.test(t)) throw new YamlError("flow collections are not accepted except empty [] and {}", line);
  return t;
}

class Parser {
  lines: Line[];
  pos = 0;
  constructor(lines: Line[]) {
    this.lines = lines;
  }

  peek(): Line | undefined {
    return this.lines[this.pos];
  }

  parseDocument(): YamlValue {
    if (this.lines.length === 0) return {};
    const first = this.lines[0]!;
    const value = this.parseNode(first.indent);
    const rest = this.peek();
    if (rest) throw new YamlError("unexpected content after the document", rest.num);
    return value;
  }

  parseNode(indent: number): YamlValue {
    const line = this.peek();
    if (!line) return null;
    if (line.indent !== indent) throw new YamlError("unexpected indentation", line.num);
    if (line.text === "-" || line.text.startsWith("- ")) return this.parseSequence(indent);
    if (isKeyLine(line.text)) return this.parseMapping(indent);
    this.pos++;
    return parseScalar(line.text, line.num);
  }

  parseMapping(indent: number): YamlMap {
    const map: YamlMap = {};
    for (;;) {
      const line = this.peek();
      if (!line || line.indent < indent) break;
      if (line.indent > indent) throw new YamlError("unexpected indentation", line.num);
      const m = KEY_RE.exec(line.text);
      if (!m || line.text.startsWith("- ")) throw new YamlError("expected a key", line.num);
      const key = unquoteKey(m[1]!);
      if (Object.prototype.hasOwnProperty.call(map, key)) throw new YamlError(`duplicate key ${key}`, line.num);
      const rest = m[2];
      this.pos++;
      map[key] = this.parseValueAfterKey(rest, indent, line);
    }
    return map;
  }

  parseValueAfterKey(rest: string | undefined, indent: number, keyLine: Line): YamlValue {
    if (rest === undefined || rest.trim() === "") {
      const next = this.peek();
      if (!next) return null;
      if (next.indent > indent) return this.parseNode(next.indent);
      if (next.indent === indent && (next.text === "-" || next.text.startsWith("- "))) return this.parseSequence(indent);
      return null;
    }
    const r = rest.trim();
    if (r === "[]") return [];
    if (r === "{}") return {};
    if (r === "|" || r === "|-") return this.parseBlockScalar(indent, r === "|-", keyLine.num);
    return parseScalar(r, keyLine.num);
  }

  parseBlockScalar(parentIndent: number, strip: boolean, keyNum: number): string {
    // Literal block: take the raw lines that are indented deeper than the
    // parent, preserving their content relative to the first line.
    const parts: string[] = [];
    const first = this.peek();
    if (!first || first.indent <= parentIndent) throw new YamlError("empty literal block", keyNum);
    const blockIndent = first.indent;
    while (this.peek() && this.peek()!.indent >= blockIndent) {
      const l = this.peek()!;
      parts.push(l.raw.slice(blockIndent));
      this.pos++;
    }
    return parts.join("\n") + (strip ? "" : "\n");
  }

  parseSequence(indent: number): YamlValue[] {
    const items: YamlValue[] = [];
    for (;;) {
      const line = this.peek();
      if (!line || line.indent < indent) break;
      if (line.indent > indent) throw new YamlError("unexpected indentation", line.num);
      if (!(line.text === "-" || line.text.startsWith("- "))) break;
      const item = line.text === "-" ? "" : line.text.slice(2);
      if (item.trim() === "") {
        this.pos++;
        const next = this.peek();
        if (!next || next.indent <= indent) {
          items.push(null);
          continue;
        }
        items.push(this.parseNode(next.indent));
        continue;
      }
      if (isKeyLine(item)) {
        // "- key: value": the mapping continues at indent + 2.
        this.lines[this.pos] = { indent: indent + 2, text: item, num: line.num, raw: line.raw };
        items.push(this.parseMapping(indent + 2));
        continue;
      }
      this.pos++;
      if (item.trim() === "[]") items.push([]);
      else if (item.trim() === "{}") items.push({});
      else items.push(parseScalar(item, line.num));
    }
    return items;
  }
}

export function parseYaml(text: string): YamlValue {
  return new Parser(prepare(text)).parseDocument();
}

// ---------------------------------------------------------------- writer

const PLAIN_SAFE_RE = /^[A-Za-z0-9_][^#\n\r\t]*$/;

function needsQuotes(s: string): boolean {
  if (s === "") return true;
  if (!PLAIN_SAFE_RE.test(s)) return true;
  if (s !== s.trim()) return true;
  if (s.includes(": ") || s.endsWith(":") || s.includes(" #")) return true;
  if (s === "null" || s === "~" || s === "true" || s === "false") return true;
  if (NUMBER_RE.test(s)) return true;
  return false;
}

function quote(s: string): string {
  return (
    '"' +
    s
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r")
      .replace(/\t/g, "\\t") +
    '"'
  );
}

export function formatScalar(v: YamlScalar): string {
  if (v === null) return "null";
  if (typeof v === "boolean" || typeof v === "number") return String(v);
  return needsQuotes(v) ? quote(v) : v;
}

function formatKey(k: string): string {
  return /^[A-Za-z0-9_.\-\/@+]+$/.test(k) ? k : quote(k);
}

function isScalar(v: YamlValue): v is YamlScalar {
  return v === null || typeof v !== "object";
}

function writeLines(value: YamlValue, indent: number, out: string[]): void {
  const pad = " ".repeat(indent);
  if (Array.isArray(value)) {
    for (const item of value) {
      if (isScalar(item)) out.push(`${pad}- ${formatScalar(item)}`);
      else if (Array.isArray(item)) {
        if (item.length === 0) out.push(`${pad}- []`);
        else {
          out.push(`${pad}-`);
          writeLines(item, indent + 2, out);
        }
      } else {
        const keys = Object.keys(item);
        if (keys.length === 0) {
          out.push(`${pad}- {}`);
          continue;
        }
        const sub: string[] = [];
        writeLines(item, indent + 2, sub);
        sub[0] = `${pad}- ${sub[0]!.slice(indent + 2)}`;
        out.push(...sub);
      }
    }
    return;
  }
  if (isScalar(value)) {
    out.push(`${pad}${formatScalar(value)}`);
    return;
  }
  for (const [k, v] of Object.entries(value)) {
    const key = `${pad}${formatKey(k)}`;
    if (isScalar(v)) out.push(`${key}: ${formatScalar(v)}`);
    else if (Array.isArray(v)) {
      if (v.length === 0) out.push(`${key}: []`);
      else {
        out.push(`${key}:`);
        writeLines(v, indent + 2, out);
      }
    } else if (Object.keys(v).length === 0) out.push(`${key}: {}`);
    else {
      out.push(`${key}:`);
      writeLines(v, indent + 2, out);
    }
  }
}

export function stringifyYaml(value: YamlValue, comments: string[] = []): string {
  const out: string[] = comments.map((c) => `# ${c}`);
  writeLines(value, 0, out);
  return out.join("\n") + "\n";
}
