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
| `lite-hono-todo-practical/` | `@pumped-fn/lite-hono-todo-practical` | Hono backend integration for a todo API. |
| `lite-tanstack-start-todo-practical/` | `@pumped-fn/lite-tanstack-start-todo-practical` | TanStack Start fullstack integration for todos. |
| `lite-cli-practical/` | `@pumped-fn/lite-cli-practical` | CLI parser integrations with per-command Lite scopes. |
| `lite-sync-practical/` | `@pumped-fn/lite-sync-practical` | Replicated draft state with sync stress metrics. |
| `lite-sync-web-practical/` | `@pumped-fn/lite-sync-web-practical` | Frontend/backend sync through a web environment gateway. |
| `parking-lot-shared/` | `@pumped-fn/parking-lot-shared` | Parking lot management business logic and persistence ports shared by every entrypoint. |
| `parking-lot-cli/` | `@pumped-fn/parking-lot-cli` | CLI entrypoint over the parking lot management flows. |
| `parking-lot-hono/` | `@pumped-fn/parking-lot-hono` | Hono API entrypoint over the parking lot management flows. |
| `parking-lot-app/` | `@pumped-fn/parking-lot-app` | Convention-driven `@pumped-fn/app` entrypoint producing a CLI and HTTP server from one manifest over the parking lot management flows. |
| `parking-lot-tanstack-start/` | `@pumped-fn/parking-lot-tanstack-start` | TanStack Start server-function entrypoint over the parking lot management flows. |
| `parking-lot-spa/` | `@pumped-fn/parking-lot-spa` | Vite React SPA over the parking lot management flows and state. |
| `agent-practical/` | `@pumped-fn/agent-practical` | Agent workflow examples. |

## Naming

Small examples use `<surface>-practical`. Domain capstones use `<domain>-<surface>` with a shared
domain package when multiple entrypoints prove the same behavior.

## Canonical Usage

Examples teach one library shape:

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

Examples should be runnable, tested, and tied to real package behavior. Prefer small focused examples
plus capstones over decorative demos.

## Boundaries

Do not use examples as scratch space or as hidden package tests. Research notes belong in
`research/`; reusable test fixtures belong in package tests or `tests/`.
