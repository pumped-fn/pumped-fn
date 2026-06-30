# Cross-Workspace Tests

## Purpose

`tests/` holds cross-workspace fixtures and requests that do not naturally belong to one package.

## Structure

| Directory | Role |
| --- | --- |
| `example/` | Shared example request fixtures. |

## Naming

Use names that describe the shared test surface, not the package that happens to consume it first.

## Content Rules

Keep package-specific tests inside package directories. Files here should be small, explicit, and
referenced by a real test or validation path.

## Boundaries

Do not use this directory for broad integration apps, examples, or research notes. Those belong in
`examples/` or `research/`.
