# Examples

## Purpose

`examples/` holds private workspace packages that show practical pumped-fn usage. They are proof
surfaces for documented patterns, not publishing targets.

## Structure

| Directory | Package | Role |
| --- | --- | --- |
| `lite-practical/` | `@pumped-fn/lite-practical` | Backend and framework-neutral Lite patterns. |
| `lite-react-practical/` | `@pumped-fn/lite-react-practical` | React patterns, capstones, and browser checks. |
| `lite-bff-practical/` | `@pumped-fn/lite-bff-practical` | BFF-style composition examples. |
| `agent-practical/` | `@pumped-fn/agent-practical` | Agent workflow examples. |

## Naming

Example directories use `<surface>-practical`. Keep names explicit enough to map to the package lane
they demonstrate.

## Content Rules

Examples should be runnable, tested, and tied to real package behavior. Prefer small focused examples
plus capstones over decorative demos.

## Boundaries

Do not use examples as scratch space or as hidden package tests. Research notes belong in
`research/`; reusable test fixtures belong in package tests or `tests/`.
