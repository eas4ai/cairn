import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { sha256 } from './canon.mjs';

export class SpecError extends Error { constructor(m) { super(m); this.name = 'SpecError'; } }
export const ID_RE = /^\[([A-Z][A-Z0-9]*-[0-9]{3})\]\s*(.*)$/;
const FIELD = /^(Falsifier|Mechanism|Rationale|Status):\s*(.*)$/;
const STATUS = /^(Draft|Observed|Agreed ([0-9]{4}-[0-9]{2}-[0-9]{2})|Retired ([0-9]{4}-[0-9]{2}-[0-9]{2}))$/;

export function normalize(text) { return text.replace(/[ \t\r\n]+/g, ' ').trim(); }
export function textDigest(id, obligation, falsifier) { return sha256(`${id}\n${normalize(obligation)}\n${normalize(falsifier)}`); }
function calendarDate(s) { const [y, m, d] = s.split('-').map(Number); const dt = new Date(Date.UTC(y, m - 1, d)); return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d; }
export function parseStatus(raw) {
  const m = STATUS.exec(raw.trim());
  if (!m) return { error: /^(Agreed|Retired) /.test(raw.trim()) ? `noncanonical status date in "${raw.trim()}"` : `unknown status "${raw.trim()}"` };
  const date = m[2] ?? m[3] ?? null;
  if (date && !calendarDate(date)) return { error: `noncanonical status date ${date}` };
  return { kind: m[1].split(' ')[0], date };
}

export function parseDomainFile(text) {
  const lines = text.split('\n');
  const header = { prefix: null, scopeEvery: false, hostPaths: [] };
  const blocks = [], problems = [];
  let i = 0;
  while (i < lines.length && !ID_RE.test(lines[i])) {
    const h = /^(Prefix|Scope|Host paths):\s*(.*)$/.exec(lines[i]);
    if (h?.[1] === 'Prefix') header.prefix = h[2].trim();
    if (h?.[1] === 'Scope' && h[2].trim() === 'every commitment') header.scopeEvery = true;
    if (h?.[1] === 'Host paths') header.hostPaths = h[2].split(',').map((s) => s.trim()).filter(Boolean);
    i++;
  }
  while (i < lines.length) {
    const open = ID_RE.exec(lines[i]);
    if (!open) { i++; continue; }
    const line = i + 1, b = { id: open[1], line, obligation: open[2], falsifier: null, mechanism: null, rationale: null, status: null };
    const bad = (reason, at = i + 1) => problems.push({ line: at, reason: `${b.id}: ${reason}` });
    let stage = 'obligation';
    for (i++; i < lines.length && lines[i].trim() !== '' && !ID_RE.test(lines[i]); i++) {
      const f = FIELD.exec(lines[i]);
      if (!f) { if (stage === 'obligation') b.obligation += ' ' + lines[i]; else bad(`unexpected line after Falsifier: "${lines[i].trim()}"`); continue; }
      const [, key, value] = f;
      if (key === 'Falsifier') { if (stage !== 'obligation') bad(`Falsifier: after ${stage === 'falsifier' ? 'Falsifier:' : 'Status:'}`); b.falsifier ??= value; stage = b.status ? 'status' : 'falsifier'; }
      else if (key === 'Mechanism') { if (b.mechanism !== null) bad('second Mechanism:'); else if (stage !== 'falsifier' || b.rationale !== null) bad('Mechanism: out of order'); b.mechanism = value.trim(); }
      else if (key === 'Rationale') { if (b.rationale !== null) bad('second Rationale:'); else if (stage !== 'falsifier') bad('Rationale: out of order'); b.rationale = value.trim(); }
      else { if (b.status !== null) bad('second Status:'); const st = parseStatus(value); if (st.error) bad(st.error); else b.status = st; stage = 'status'; }
    }
    b.obligation = normalize(b.obligation);
    if (b.falsifier !== null) b.falsifier = normalize(b.falsifier);
    if (b.obligation === '') bad('empty obligation', line);
    if (b.falsifier === null) bad('missing Falsifier:', line);
    if (b.status === null && !problems.some((p) => p.reason.startsWith(`${b.id}: `) && /status/i.test(p.reason))) bad('missing Status:', line);
    b.mechanism ??= '';
    b.textDigest = textDigest(b.id, b.obligation, b.falsifier ?? '');
    blocks.push(b);
  }
  return { header, blocks, problems };
}

export function parseRoadmap(text) {
  const out = { current: null, sections: {} };
  let section = null;
  text.split('\n').forEach((raw, i) => {
    const cur = /^Current:\s*(\S+)\s*$/.exec(raw);
    if (cur && out.current === null) { out.current = cur[1]; return; }
    const head = /^#+\s+(.+?)\s*$/.exec(raw);
    if (head) { section = head[1]; out.sections[section] ??= { requirements: [], line: i + 1 }; return; }
    const req = /^Requirements:\s*(.*)$/.exec(raw);
    if (req && section && out.sections[section].requirements.length === 0) out.sections[section].requirements = req[1].split(/[\s,]+/).filter(Boolean);
  });
  return out;
}

export const SPEC_DIR = 'docs/spec';
export const NON_DOMAIN = ['overview.md', 'glossary.md', 'roadmap.md'];
const REF_RE = /\b([A-Z][A-Z0-9]*-[0-9]{3})\b/g;

export function parseSpecMap(text) {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length - 1; i++) {
    const cells = (l) => l.split('|').map((c) => c.trim()).filter((c, j, a) => j > 0 && j < a.length - 1);
    if (!lines[i].startsWith('|')) continue;
    const head = cells(lines[i]), fi = head.indexOf('File'), pi = head.indexOf('Prefix');
    if (fi < 0 || pi < 0) continue;
    const rows = [];
    for (let j = i + 2; j < lines.length && lines[j].startsWith('|'); j++) { const c = cells(lines[j]); rows.push({ file: c[fi], prefix: c[pi] }); }
    return rows;
  }
  return [];
}
export async function readSpec(cwd) {
  const dir = join(cwd, SPEC_DIR);
  const read = async (name) => { try { return await readFile(join(dir, name), 'utf8'); } catch { return null; } };
  const names = (await readdir(dir)).filter((n) => n.endsWith('.md')).sort();
  const texts = Object.fromEntries(await Promise.all(names.map(async (n) => [n, await read(n)])));
  const domains = Object.fromEntries(names.filter((n) => !NON_DOMAIN.includes(n)).map((n) => [n, parseDomainFile(texts[n])]));
  const blocks = new Map();
  for (const [file, d] of Object.entries(domains)) for (const b of d.blocks) if (!blocks.has(b.id)) blocks.set(b.id, { ...b, file });
  return { texts, map: parseSpecMap(texts['overview.md'] ?? ''), domains, roadmap: parseRoadmap(texts['roadmap.md'] ?? ''), blocks };
}
export async function lint(cwd) {
  const { texts, map, domains, blocks } = await readSpec(cwd);
  const out = [], f = (file, line, reason) => out.push({ file: `${SPEC_DIR}/${file}`, line, reason });
  const seen = new Map();
  for (const [file, d] of Object.entries(domains)) {
    for (const p of d.problems) f(file, p.line, p.reason);
    if (!d.header.prefix) f(file, 1, 'no Prefix: header');
    for (const b of d.blocks) {
      if (seen.has(b.id)) f(file, b.line, `duplicate identifier ${b.id} (also ${seen.get(b.id)})`); else seen.set(b.id, `${SPEC_DIR}/${file}:${b.line}`);
      if (d.header.prefix && !b.id.startsWith(d.header.prefix + '-')) f(file, b.line, `${b.id} does not carry prefix ${d.header.prefix}`);
      if (b.status?.kind === 'Agreed' && b.mechanism === '') f(file, b.line, `${b.id}: Agreed block without a mechanism`);
    }
  }
  const prefixes = new Set(Object.values(domains).map((d) => d.header.prefix).filter(Boolean));
  for (const [file, text] of Object.entries(texts)) text.split('\n').forEach((line, i) => {
    if (ID_RE.test(line)) return;
    for (const m of line.matchAll(REF_RE)) if (prefixes.has(m[1].split('-')[0]) && !blocks.has(m[1])) f(file, i + 1, `reference to absent identifier ${m[1]}`);
  });
  for (const row of map) {
    const d = domains[row.file];
    if (!d) f('overview.md', 1, `spec map names missing file ${row.file}`);
    else if (d.header.prefix !== row.prefix) f('overview.md', 1, `spec map says ${row.file} has prefix ${row.prefix}, file says ${d.header.prefix}`);
  }
  for (const file of Object.keys(domains)) if (!map.some((r) => r.file === file)) f('overview.md', 1, `spec map has no row for ${file}`);
  return out.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}
