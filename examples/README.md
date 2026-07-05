# Examples

## Purpose

`examples/` holds private workspace packages that show practical pumped-fn usage. They are proof
surfaces for documented patterns, not publishing targets.

## Structure

| Directory | Package | Role |
| --- | --- | --- |
| `lite-tour/` | `@pumped-fn/lite-tour` | Backend and framework-neutral Lite patterns. |
| `lite-react-tour/` | `@pumped-fn/lite-react-tour` | React patterns, capstones, and browser checks. |
| `service-health-bff/` | `@pumped-fn/service-health-bff` | BFF-style composition examples. |
| `todo-hono/` | `@pumped-fn/todo-hono` | Hono backend integration for a todo API. |
| `todo-tanstack-start/` | `@pumped-fn/todo-tanstack-start` | TanStack Start fullstack integration for todos. |
| `deploy-cli/` | `@pumped-fn/deploy-cli` | CLI parser integrations with per-command Lite scopes. |
| `draft-sync/` | `@pumped-fn/draft-sync` | Replicated draft state with sync stress metrics. |
| `draft-sync-web/` | `@pumped-fn/draft-sync-web` | Frontend/backend sync through a web environment gateway. |
| `parking-lot-shared/` | `@pumped-fn/parking-lot-shared` | Parking lot management business logic and persistence ports shared by every entrypoint. |
| `parking-lot-cli/` | `@pumped-fn/parking-lot-cli` | CLI entrypoint over the parking lot management flows. |
| `parking-lot-hono/` | `@pumped-fn/parking-lot-hono` | Hono API entrypoint over the parking lot management flows. |
| `parking-lot-app/` | `@pumped-fn/parking-lot-app` | Convention-driven `@pumped-fn/app` entrypoint producing a CLI and HTTP server from one manifest over the parking lot management flows. |
| `parking-lot-tanstack-start/` | `@pumped-fn/parking-lot-tanstack-start` | TanStack Start server-function entrypoint over the parking lot management flows. |
| `parking-lot-spa/` | `@pumped-fn/parking-lot-spa` | Vite React SPA over the parking lot management flows and state. |
| `ticket-triage/` | `@pumped-fn/ticket-triage` | Agent workflow examples. |
| `invoice-triage/` | `@pumped-fn/invoice-triage` | Invoice import and LLM triage over generator flows, execStream, and scheduler cron. |

## Naming

Examples are named after what the application is, not the lesson it teaches. A tech suffix (e.g.
`-hono`, `-cli`, `-web`) is kept only where it distinguishes variants of the same domain. Pure API
tours with no domain get an honest `<library>-tour` name. Domain capstones use `<domain>-<surface>`
with a shared domain package when multiple entrypoints prove the same behavior.

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
