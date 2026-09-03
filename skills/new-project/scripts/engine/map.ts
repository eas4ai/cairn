// The evidence map beside the engine (ENG-195 through ENG-201): the
// engine reads conformance.md, computes its machine view of coverage
// from the evidence records, and compares the two (ENG-198, ENG-199).
// The map stays the human claim register: the engine writes it only
// through `same-page sync-map` (ENG-197, ENG-200), never a freshness
// value or a verdict (ENG-196), only the four columns and the value
// sets CONF-041 and CONF-045 through CONF-049 define (ENG-195).

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { StoredRecord } from "./evidence.ts";
import { METHODS, type Method } from "./policy.ts";

export type Coverage = "Covered" | "Asserted" | "Uncovered";
export type MapRow = { id: string; coverage: string; method: string; evidence: string; file: string; line: number };
export type EvidenceMap = { files: string[]; rows: Map<string, MapRow> };

const ROW_RE = /^\| ([A-Z][A-Z0-9]*-\d+) \| ([^|]*) \| ([^|]*) \| ([^|]*)\|\s*$/;

export function readMap(root: string, specDirs: string[]): EvidenceMap {
  const files: string[] = [];
  const rows = new Map<string, MapRow>();
  for (const dir of specDirs) {
    const rel = `${dir}/conformance.md`;
    const path = join(root, rel);
    if (!existsSync(path)) continue;
    files.push(rel);
    readFileSync(path, "utf8")
      .split("\n")
      .forEach((text, i) => {
        const m = ROW_RE.exec(text);
        if (!m) return;
        const row = { id: m[1]!, coverage: m[2]!.trim(), method: m[3]!.trim(), evidence: m[4]!.trim(), file: rel, line: i + 1 };
        if (!rows.has(row.id)) rows.set(row.id, row);
      });
  }
  return { files, rows };
}

// The machine view of one obligation's coverage: Covered when a
// pass-or-fail record beyond inspection addresses the falsifier,
// Asserted when only inspection records exist, Uncovered when there are
// none. Freshness and verdicts are not part of it (ENG-196).
export type View = { coverage: Coverage; methods: Method[]; validators: string[]; actors: string[]; surfaces: string[] };

export function machineView(records: StoredRecord[]): View {
  const addressing = records.filter((r) => r.result !== "error" && r.kind !== "inspected" && (r.kind !== "manual" || r.manual?.addresses_falsifier === true));
  const inspection = records.filter((r) => r.result !== "error" && !addressing.includes(r));
  const pick = addressing.length ? addressing : inspection;
  const methods = METHODS.filter((m) => pick.some((r) => r.kind === m));
  const validators = [...new Set(pick.map((r) => r.validator).filter((v): v is string => v !== null))].sort();
  const actors = [...new Set(pick.map((r) => r.manual?.actor).filter((a): a is string => typeof a === "string" && a !== ""))].sort();
  const surfaces = [...new Set(pick.flatMap((r) => r.manual?.bindings ?? []))];
  return { coverage: addressing.length ? "Covered" : inspection.length ? "Asserted" : "Uncovered", methods, validators, actors, surfaces };
}

function detail(v: View): string {
  if (v.coverage === "Uncovered") return "no evidence record";
  const by = v.methods.join(", ");
  const who = [...v.validators, ...v.actors.map((a) => `manual by ${a}`)].join(", ");
  return v.coverage === "Covered" ? `Covered by ${by}${who ? ` (${who})` : ""}` : `Asserted: inspection only${who ? ` (${who})` : ""}`;
}

// ENG-199: the disagreement between a map row and the machine view, or
// null when they agree. No records agrees with Asserted and with
// Uncovered: both claim that no mechanism addresses the falsifier.
export function compare(view: View, row: MapRow | null): string | null {
  if (!row) return `no map row; machine view: ${detail(view)}`;
  const says = `map says ${row.coverage}${row.coverage === "Covered" ? ` by ${row.method}` : ""}`;
  if (row.coverage === "Covered") {
    if (view.coverage !== "Covered") return `${says}; machine view: ${detail(view)}`;
    if (!(view.methods as string[]).includes(row.method)) return `${says}; machine view: ${detail(view)}`;
    return null;
  }
  if (row.coverage === "Asserted") return view.coverage === "Covered" ? `${says}; machine view: ${detail(view)}` : null;
  if (row.coverage === "Uncovered") return view.coverage === "Uncovered" ? null : `${says}; machine view: ${detail(view)}`;
  return `${says}, which is not a coverage value; machine view: ${detail(view)}`;
}

// The row the machine view projects to, keeping the human's citation
// whenever the coverage still allows one (CONF-046 through CONF-049).
export function projectRow(id: string, view: View, row: MapRow | null): { coverage: Coverage; method: string; evidence: string; citationNeeded: boolean } {
  if (view.coverage === "Uncovered") return { coverage: "Uncovered", method: "-", evidence: "", citationNeeded: false };
  if (view.coverage === "Asserted") {
    const evidence = row?.evidence || view.surfaces[0] || "";
    return { coverage: "Asserted", method: "inspected", evidence, citationNeeded: evidence === "" };
  }
  const method = row && (view.methods as string[]).includes(row.method) ? row.method : view.methods[0]!;
  const evidence = row?.evidence || (view.validators[0] ? `.same-page/validators/${view.validators[0]}.yaml` : view.surfaces[0] || "");
  return { coverage: "Covered", method, evidence, citationNeeded: evidence === "" };
}

export function rowText(id: string, coverage: string, method: string, evidence: string): string {
  return `| ${id} | ${coverage} | ${method} | ${evidence} |`;
}

// Rewrite or add rows in one map file. Only the named lines change;
// every other byte of the file is preserved. A new row goes into the
// table whose rows share the identifier's prefix, in identifier order.
export type RowChange = { id: string; text: string; line: number | null };

export function applyRowChanges(root: string, file: string, changes: RowChange[]): { written: number; added: number; unplaced: string[] } {
  const path = join(root, file);
  const lines = readFileSync(path, "utf8").split("\n");
  let written = 0;
  let added = 0;
  const unplaced: string[] = [];
  const pending: RowChange[] = [];
  for (const c of changes) {
    if (c.line !== null) {
      lines[c.line - 1] = c.text;
      written++;
    } else pending.push(c);
  }
  const num = (id: string) => Number.parseInt(id.slice(id.lastIndexOf("-") + 1), 10);
  for (const c of pending.sort((a, b) => a.id.localeCompare(b.id))) {
    const prefix = c.id.slice(0, c.id.lastIndexOf("-"));
    const indexes = lines.map((t, i) => ({ t, i })).filter(({ t }) => ROW_RE.test(t) && ROW_RE.exec(t)![1]!.startsWith(`${prefix}-`));
    if (indexes.length === 0) {
      unplaced.push(c.id);
      continue;
    }
    const after = indexes.filter(({ t }) => num(ROW_RE.exec(t)![1]!) < num(c.id));
    const at = after.length ? after[after.length - 1]!.i + 1 : indexes[0]!.i;
    lines.splice(at, 0, c.text);
    added++;
  }
  if (written + added > 0) writeFileSync(path, lines.join("\n"));
  return { written, added, unplaced };
}
