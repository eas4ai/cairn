# Defect -- short name for the defect

Status: Agreed
Agreed: date the developer confirmed observed and expected behavior
Violates: NN-domain.md, the Agreed section the behavior contradicts

<!-- Written in Stage 4 of /existing-project when the session's work is a
remediation. Lives at docs/specs/<project>/defects/<slug>.md and is the
In list of the iteration contract. The worked example is from the recon
template's invoicing service; replace it, keep every section. -->

## Observed behavior

What the system does, with a reproduction anyone can run and evidence in
the code.

Voiding an invoice that has recorded payments leaves the payments in
place and reports the invoice balance as negative.

Reproduction:
1. Create an invoice for 100.00; record a payment of 100.00.
2. `POST /invoices/{id}/void`.
3. `GET /invoices/{id}` returns `status: "void"`, `balance: -100.00`.

Evidence: src/routes/invoices.rs:171-180 sets `status` and returns; no
call into the payments module. Balance is computed in
src/models/invoice.rs:66 as total minus payments regardless of status.

## Expected behavior

What the system shall do, as the Agreed spec states it. If no section
says so yet, write and confirm it before this record is complete.

Per 02-invoices.md "Voiding": a void reverses every recorded payment as a
refund entry, and a void invoice's balance is zero.

## Root cause

When known. One paragraph; cite the code. Leave the heading with "not yet
determined" if the fix will establish it.

The void handler predates the payments module (git log: payments arrived
in migration 0007, void in 0003) and was never revisited when payments
became possible.

## Regression test

The test the fix must ship with. It fails before the fix and passes
after; that is part of the iteration's definition of done.

tests/invoices.rs: `void_reverses_recorded_payments` -- creates an
invoice, records a payment, voids, asserts a refund entry exists for the
payment amount and the balance reads 0.00.

## Out of this record

What the fix will not touch, so the contract's Out list has something to
point at. Example: partial refunds, refund emails, and the frontend's
void confirmation copy are separate work.
