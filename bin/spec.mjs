// Shared specification grammar. A requirement is one contiguous paragraph;
// its Status overrides the file header. Fenced examples are not requirements.
// A fenced block is not content, and only a fence that closes hides its lines. A record's
// findings are swept from its own lines instead, so no fence can hide one (LOOP-071).
export function withoutFences(text) {
  const lines = text.split(/\r?\n/), out = lines.slice();
  let open = null;
  for (let i = 0; i < lines.length; i++) {
    if (open) {
      if (new RegExp(`^ {0,3}${open.mark[0]}{${open.mark.length},}\\s*$`).test(lines[i])) {
        for (let j = open.at; j <= i; j++) out[j] = "";
        open = null;
      }
      continue;
    }
    const m = /^ {0,3}(`{3,}|~{3,})/.exec(lines[i]);
    if (m) open = { mark: m[1], at: i };
  }
  return out;
}

export function parseSpec(text) {
  const lines = withoutFences(text), blocks = [];
  const first = lines.findIndex((line) => /^\[[A-Z]+-\d+\]/.test(line));
  const header = lines.slice(0, first < 0 ? lines.length : first).join("\n");
  const status = /^Status:[ \t]*(\w+)/m.exec(header)?.[1] ?? null;
  const prefix = /^Prefix:[ \t]*([A-Z]+)/m.exec(header)?.[1] ?? null;
  const scope = /^Scope:[ \t]*(.*)$/m.exec(header)?.[1].trim() ?? null;
  for (let i = 0; i < lines.length; i++) {
    const m = /^\[([A-Z]+-\d+)\]\s*(.*)$/.exec(lines[i]);
    if (!m) continue;
    const start = i, body = [m[2]];
    while (i + 1 < lines.length && lines[i + 1].trim() && !/^(?:\[[A-Z]+-\d+\]|#)/.test(lines[i + 1])) body.push(lines[++i]);
    const ownStatus = body.findLast((line) => /^Status:[ \t]*(?:[A-Z][a-z]+(?:[ \t]|$)|$)/.test(line));   // the block's own status is its last Status: line carrying a status word; wrapped prose may start a line with the word
    // A decision marker: Agreed by promotion (LOOP-088) or by deference (SPEC-002), naming the record.
    const marker = ownStatus === undefined ? null : /\bby (promotion|deference)[ \t]+(\S+)/.exec(ownStatus);
    blocks.push({ id: m[1], line: start + 1, body,
      status: ownStatus === undefined ? status : /^Status:[ \t]*(\w+)/.exec(ownStatus)?.[1] ?? null,
      promotion: marker?.[2] ?? null, agreedBy: marker?.[1] ?? null,
      falsifier: body.some((line) => /^Falsifier:/.test(line)) });
  }
  return { lines, blocks, status, prefix, scope };
}
