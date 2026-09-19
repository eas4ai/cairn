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
