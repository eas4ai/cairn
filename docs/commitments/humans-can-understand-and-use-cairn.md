# Humans can understand and use Cairn

Slug: humans-can-understand-and-use-cairn
Requirements: PKG-016, PKG-014, PKG-006

## Goal

A person can understand Cairn, start a project, answer a question, and
interpret progress without reading instructions written for agents.
Requested by the developer on 2026-09-05, including source-grounded claims.

## Deliverables

- A detailed README covering purpose, responsibilities, installation,
  starting work, limits, and links to deeper guidance.
- Mermaid diagrams for the work loop and the explanation conversation,
  with adjacent prose that works when diagrams are not rendered.
- docs/manual.md organized around the human's choices and common problems,
  with concrete commands and a source map for behavioral claims.
- Keep docs/walkthrough.md as the executable companion and link both ways.
- Preserve the distinction between kernel behavior and agent obligations.
  Describe the implementation in this checkout; do not imply deployment.

## Verification

Run the existing install, walkthrough, escalation, reporting, agreement,
and recovery tests, plus the required package and specification checks.
Check local links and diagram syntax. Review each behavior and command
against source and each human action for an understandable consequence.
Automated checks are proxies; they do not establish prose quality.

## Done when

The documentation is committed, the checks have current passing evidence,
and the review records source verification and no open finding.
