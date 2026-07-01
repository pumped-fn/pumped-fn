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
| `parking-lot-tanstack-start/` | `@pumped-fn/parking-lot-tanstack-start` | TanStack Start server-function entrypoint over the parking lot management flows. |
| `parking-lot-spa/` | `@pumped-fn/parking-lot-spa` | Vite React SPA over the parking lot management flows and state. |
| `agent-practical/` | `@pumped-fn/agent-practical` | Agent workflow examples. |

## Naming

Small examples use `<surface>-practical`. Domain capstones use `<domain>-<surface>` with a shared
domain package when multiple entrypoints prove the same behavior.

## Content Rules

Examples should be runnable, tested, and tied to real package behavior. Prefer small focused examples
plus capstones over decorative demos.

## Boundaries

Do not use examples as scratch space or as hidden package tests. Research notes belong in
`research/`; reusable test fixtures belong in package tests or `tests/`.
