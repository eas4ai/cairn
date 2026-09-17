# decide --supersedes validates neither the slug nor a prior supersession

Surfaced from: DEC-010
Captured: 2026-09-17T11:59:29.106Z

bin/cairn.mjs line 1182 joins the raw --supersedes argument into a path under docs/decisions, unlike answer, which enforces a slug pattern; a ../ argument reads and rewrites any file with a '# ' title outside docs/decisions. It also never refuses a record that already carries Superseded by, so a second supersede appends a second line and the last-wins read rewrites the reversal chain that DEC-010 says is never lost. Kernel review 2026-09-17, finding 5.
