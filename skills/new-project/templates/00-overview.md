# Project Name -- System Overview

Status: Normative design specification
Last revised: date of last edit

<!-- The keystone spec, ara2-bridge shape. Stage 2 fills Purpose through
Supported and excluded scope; Stage 5 completes the rest once domains
exist. Replace this template's example prose; keep every section. -->

## Purpose

One or two paragraphs: what the system provides, for whom, and what
"complete" means for it. Written with the normative keywords of Same
Page Technical English ("MUST", "MUST NOT", "MAY") where obligations
are stated.

## Design principles

Numbered, short, opinionated. A principle earns its place by settling
future arguments. Example: "1. ABI exactness before ergonomics."

## System architecture

The system's shape: components and boundaries, technology choices with the
why recorded next to each choice, and how the pieces talk. Dependencies
have no inventory here -- lockfiles are ground truth; this section records
choices and rationale only.

## Cross-cutting requirements

Named constraints that apply system-wide: performance targets, security
posture, scalability expectations, integration contracts. Each one
measurable or checkable.

## Spec map

The numbered specs and one line each on what they own. Reading order is
dependency order.

| Spec | Owns |
|---|---|
| 01-example-domain.md | One-line statement of the bounded subsystem |

## Supported and excluded scope

Two lists. What the system covers, and what it explicitly does not.
Exclusions are decisions, not omissions.

## Revision policy

How specs change: revisions are made in place, dated, and logged in the
affected spec's Decisions and revisions section.

## System completion criteria

The checkable conditions under which the system as specified is done.

## Decisions and revisions

Cross-cutting decisions, append-only, newest first.

- date -- Decision. Context in one line; alternatives rejected and why.
