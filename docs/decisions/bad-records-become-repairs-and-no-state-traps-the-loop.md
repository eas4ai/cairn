# Bad records become repairs and no state traps the loop

Level: Judged
Decided by: agent
Rests on: LOOP-102 LOOP-103 LOOP-104 LOOP-105 LOOP-106 LOOP-107 LOOP-108 LOOP-109 LOOP-110 LOOP-111 LOOP-112 LOOP-113 LOOP-005 LOOP-022
Would be wrong if: a repair verdict hides a kernel bug that an error exit would have shown, or the write-ahead demand interrupts more sessions than it saves
History: Five reversals in this domain; none concerns record parsing or the wake order. Judged: every change here is inside LOOP-005's rule that a malformed artifact the agent can repair is Resolvable, and reversal is a revert of one commit.

## Decision

The 2026-09-15 audit reproduced records that make the kernel exit with a JavaScript error (a list-form Requirements line, a subdirectory or README in a record directory), three states the loop cannot leave (a declaration repeating a requirement, a declared input covering Cairn's own evidence directory, a requirement whose evidence outlives its mechanism), fields the gates never read (a review's examined list and findings key, a decision's header fields and Supersedes target), the write-ahead record the kernel reconciles but never asks for, and three environments where check or wake give wrong answers (core.filemode false, a project root below the Git toplevel, a shallow clone). On the developer's direction of 2026-09-15 to fix the findings without further rulings, and applying the plan's recommendation R1 for the write-ahead record: each becomes a Resolvable repair verdict or a declaration refusal naming the fault, the three traps are closed at declaration or in the wake order, the record is asked for when a declared input is dirty and no record exists, and the three environments are handled. The wake gains one action, record, which the working agreement names so LOOP-101 holds. The kernel stays under its ceiling; the changes are estimated at about fifty lines against ninety-five available.

## Realized by

- 8a1ac76d6615f4a2a126e320d03145460cd0f03f The kernel refuses bad records and leaves no trap
