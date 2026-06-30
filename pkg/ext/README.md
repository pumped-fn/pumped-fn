# Extension Lane

## Purpose

`pkg/ext/` holds optional packages that extend Lite behavior without becoming part of the core
runtime.

## Structure

| Directory | Package | Role |
| --- | --- | --- |
| `suspense/` | `@pumped-fn/lite-extension-suspense` | Replay and external-resolution support. |
| `otel/` | `@pumped-fn/lite-extension-otel` | OpenTelemetry integration. |
| `hmr/` | `@pumped-fn/lite-hmr` | Development-time HMR state preservation helpers. |
| `devtools/` | `@pumped-fn/lite-devtools` | Devtools transports and observability helpers. |

## Naming

Use short feature handles for directories. Runtime extension packages should use the
`@pumped-fn/lite-extension-*` package-name shape unless an existing package name is already public.

## Content Rules

An extension package should expose optional behavior around the scope or execution boundary. Keep
extension dependencies local to the extension package and catalog-managed in the workspace.

## Boundaries

Do not put core primitives, React-only adapters, agent providers, or example usage apps here. If an
extension becomes required for basic Lite behavior, it is in the wrong lane.
