# Project Name -- Recon report

Status: Observed (as-built; unconfirmed)
Captured: date of the recon pass
Work this session prepares for: one line naming the feature or defect

<!-- Written in Stage 0 of /existing-project before the developer is asked
anything. Every row cites a path; a claim without a path is a question,
not a finding. When the project already has a spec set, the Documented
column names the spec and section, and Contradicted rows are spec drift.
A previous recon.md is replaced by this one; its unclosed Gaps rows carry
forward. The worked example below is a small invoicing service; replace
its rows with this project's, keep every section. -->

## Stack

Rust 1.94 service (Cargo.toml:3), axum 0.8 (Cargo.lock:112), SQLite via
sqlx (Cargo.toml:18), Svelte 5 frontend under web/ (web/package.json:9).
Single binary; the frontend is built into static/ at release
(scripts/build.sh:14).

## Exists

What the system is and does, with evidence. One row per capability.

| Capability | Evidence |
|---|---|
| Creates, edits, and voids invoices | src/routes/invoices.rs:41-188 |
| Emails an invoice as PDF on send | src/jobs/send_invoice.rs:22, src/pdf/render.rs |
| Records payments against an invoice | src/routes/payments.rs:30, migrations/0007_payments.sql |
| Nightly overdue reminder job | src/jobs/overdue.rs:15, scheduled in src/main.rs:88 |
| Per-customer tax rate | src/models/customer.rs:44 (tax_rate column, migrations/0004) |

## Documented

Which of the above the existing documentation covers, and where.

| Capability | Where documented | Currency |
|---|---|---|
| Invoice lifecycle | README.md "Invoices" section | Matches code |
| Emailing on send | docs/email.md | Matches code |
| Payments | none | -- |
| Overdue reminders | README.md "Reminders" | See Contradicted |

## Contradicted

Where documentation and code disagree. Both sides cited; the code side is
what the system does today. Raise each one; do not quietly fix either
side.

| Claim in docs | What the code does | Evidence |
|---|---|---|
| Reminders go out at 7 days overdue (README.md:73) | Job selects invoices 14 or more days overdue | src/jobs/overdue.rs:31 (`due_at < now - 14d`) |
| Voiding refunds recorded payments (README.md:58) | Void sets status only; payments untouched | src/routes/invoices.rs:171-180 |

## Unverified

Claims that could not be checked from the repository alone.

- Whether the SMTP relay retries on transient failure: the job hands off to
  lettre with default settings (src/jobs/send_invoice.rs:40); relay-side
  behavior is not visible here.

## Tests and checks

How the project verifies itself, from its own configuration.

- `cargo test` -- 214 tests across src/ and tests/ (counted 2026-08-25);
  payments have no route-level test (tests/ has no payments file).
- `cargo clippy --all-targets` -- run in CI (.github/workflows/ci.yml:31).
- `bun run check` in web/ -- svelte-check, CI step at ci.yml:44.
- No end-to-end test drives the email path; send_invoice.rs is covered by
  a unit test with a fake transport only (src/jobs/send_invoice.rs:97).

## Blast radius of this session's work

Confirmed with the developer in Stage 0. Example, for "add partial
refunds on void":

- src/routes/invoices.rs (void handler), src/routes/payments.rs,
  src/models/payment.rs, migrations/ (new refund table), tests/invoices.rs,
  tests/payments.rs (new), README.md "Invoices".
- Outside the radius, documented at overview level only: PDF rendering,
  reminders, customers, the frontend.

## Gaps

Filled in Stage 3. Documentation debt this session did not close stays
here with its evidence; it is promoted or cut at iteration close.

| Gap | Kind | Evidence | Decision |
|---|---|---|---|
| Payments have no documentation | undocumented | src/routes/payments.rs | closed: 03-payments.md written and Agreed |
| Reminder threshold contradicts README | contradicted | src/jobs/overdue.rs:31 vs README.md:73 | recorded: developer to decide which is right |
| No route-level test for payments | untested | tests/ | closed: required by iterations/001.md definition of done |
