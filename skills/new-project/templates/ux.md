# Project Name -- UX Specification

Status: Normative design specification
Last revised: date of last edit

<!-- How the user interacts with the software. This spec owns the map;
domain specs own the streets: per-feature flow detail lives in each
domain spec and defers to this document for how it fits the whole.
Not a visual design document. -->

## Interaction model

How users accomplish things, stated for this product's type: screens and
navigation for an app, commands and flags and composition for a CLI, call
sequences for an API. The primary workflows, their entry points, and how
users move between capabilities.

## User journeys

End-to-end paths, each a numbered sequence of user action -> system
response: first contact, onboarding, the core loop, recurring use. The
whole-system view individual domain specs cannot hold.

## Surface map

The inventory of surfaces (screens, views, commands, endpoints) and which
actions are available from each -- so a new feature attaches to an existing
surface deliberately instead of inventing an entry point.

## Decision points and branching

Where flows fork on user choice or system state, and where each branch
leads.

## Error and recovery flows

What the user experiences when things fail, per journey, and the path back
to good. Every surface's states (loading, empty, error, success) get named
here or in the owning domain spec.

## Platform divergences

Where behavior intentionally differs across platforms or contexts, and why.

## Decisions and revisions

Append-only, newest first.

- date -- Decision. Context in one line; alternatives rejected and why.
