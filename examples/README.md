# Examples

## Purpose

`examples/` holds the private workspace package that shows practical pumped-fn usage. It is a proof
surface for documented patterns, not a publishing target.

## Structure

| Directory | Package | Role |
| --- | --- | --- |
| `invoice-triage/` | `@pumped-fn/invoice-triage` | Postgres-backed invoice import, LLM triage, database capabilities, daemon/server/CLI entrypoints, and scheduler cron. |

## Naming

Examples are named after what the application is, not the lesson it teaches. A tech suffix (e.g.
`-hono`, `-cli`, `-web`) is kept only where it distinguishes variants of the same domain. Pure API
tours with no domain get an honest `<library>-tour` name. Domain capstones use `<domain>-<surface>`
with a shared domain package when multiple entrypoints prove the same behavior.

## Canonical Usage

The canonical example teaches one library shape:

- Composition roots create scopes with the presets, tags, and extensions they need.
- Tests use the scope seam and public API instead of module mocks or internal reaches.
- Entrypoints translate transport input into flow input and tags; shared packages own the flows.
- React examples observe graph state and dispatch with Lite React hooks.
- Runtime backend variation is passed with tags, presets, or extensions at the composition root.

If an example needs a different shape, document the reason in that example README and make it lint
food when the difference is repeatable.

## Inconsistency Guardrails

Inconsistency means one of these measurable failures:

| Guardrail | Failure shape |
| --- | --- |
| Example inventory | A package under `examples/*` is missing from this index or the root practical examples table. |
| Canonical shape | An example README lacks `## Canonical Shape` or describes a shape that differs from the code. |
| Lint coverage | A current example or guidance README is absent from the root lint script. |
| Stale references | Markdown points at an example or package path that no longer exists. |
| Dependency policy | External dependencies bypass `catalog:` or peer dependencies use non-explicit ranges. |
| Package map | README package tables disagree with current `pkg/*/*/package.json` package names. |
| Pattern contract | A pattern lacks its bad specimen, canonical rewrite, tests, or explanation sections. |
| Script surface | `package.json`, workflows, or `scripts/README.md` name a script file that does not exist. |

`pnpm examples:check` measures these guardrails and prints the drift counters.

`before.*` files are the exception by design: they are anti-pattern specimens for lint and pattern
work. Every specimen needs a paired canonical rewrite and tests, and the root lint path scans the
canonical side.

## Content Rules

Examples should be runnable, tested, and tied to real package behavior. Keep the canonical example
deep enough to carry product-shaped requirements instead of spreading shallow demos across domains.

## Boundaries

Do not use examples as scratch space or as hidden package tests. Research notes belong in
`research/`; reusable test fixtures belong in package tests or `tests/`.
