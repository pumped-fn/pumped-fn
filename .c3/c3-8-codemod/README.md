---
id: c3-8
c3-version: 4
title: Codemod Library (@pumped-fn/codemod)
type: container
boundary: library
parent: c3-0
goal: Provide automated migration tooling for rewriting older pumped-fn code onto the lite APIs.
summary: >
  Source-to-source codemod package with a CLI entrypoint, jscodeshift transforms,
  and migration report generation.
---

# Codemod Library (@pumped-fn/codemod)

## Goal

Provide a supported migration path from earlier pumped-fn APIs to lite by packaging the
rewrite entrypoints, the transforms themselves, and the report output in one place.

## Responsibilities

- Expose stable entrypoints for CLI-driven and programmatic migration runs.
- Apply the source transforms that move core-next usage onto lite primitives.
- Collect edge cases and generate a migration report for manual follow-up.

## Complexity Assessment

**Level:** moderate
**Why:** The package is small, but it combines CLI orchestration, AST rewrites, and
report generation across multiple source files.

## Components

| ID | Name | Category | Status | Goal Contribution |
|----|------|----------|--------|-------------------|
| c3-801 | CLI & Entry Points | foundation | active | Launches migrations and exposes the package entrypoints that wire transforms and reporting together. |
| c3-802 | Transforms | foundation | active | Performs the actual source-to-source rewrite from older pumped-fn APIs to lite APIs. |
| c3-803 | Reporting | foundation | active | Records edge cases and produces the migration report for manual review. |

## Layer Constraints

This container operates within these boundaries:

**MUST:**
- Coordinate components within its boundary
- Define how context linkages are fulfilled internally
- Own its technology stack decisions

**MUST NOT:**
- Define system-wide policies (context responsibility)
- Implement business logic directly (component responsibility)
- Bypass refs for cross-cutting concerns
- Orchestrate other containers (context responsibility)
