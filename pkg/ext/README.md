# Extension Lane

## Purpose

`pkg/ext/` holds optional packages that extend Lite behavior without becoming part of the core
runtime.

## Structure

| Directory | Package | Role |
| --- | --- | --- |
| `suspense/` | `@pumped-fn/lite-extension-suspense` | Replay and external-resolution support. |
| `observable/` | `@pumped-fn/lite-extension-observable` | Structured lifecycle events with tag-injected sinks. |
| `observable-otel/` | `@pumped-fn/lite-extension-observable-otel` | OpenTelemetry sink adapter for observable events. |
| `logging/` | `@pumped-fn/lite-extension-logging` | Execution-scoped logger resource and flow logs with tag-injected sinks. |
| `logging-pino/` | `@pumped-fn/lite-extension-logging-pino` | Pino sink adapter for logging records. |
| `scheduler/` | `@pumped-fn/lite-extension-scheduler` | Recurring `schedule()` atom against a pluggable `SchedulerBackend`, with an in-process croner-based default. |
| `sync/` | `@pumped-fn/lite-extension-sync` | Strict replicated state primitive with tag-injected transports. |
| `sync-nats/` | `@pumped-fn/lite-extension-sync-nats` | NATS JetStream KV transport adapter for sync. |
| `hmr/` | `@pumped-fn/lite-hmr` | Development-time HMR state preservation helpers. |

## Naming

Use short feature handles for directories. Runtime extension packages should use the
`@pumped-fn/lite-extension-*` package-name shape unless an existing package name is already public.

Anti-goal: names must stay succinct. Prefer a one-word namespace export with one-word members such
as `logging.runtime`, `logging.logger`, and `observable.memory`, plus short policy keys such as
`only`, `input`, `output`, `failure`, and `filter`. Reject backend or vendor names in base package
handles, suffix-heavy handles, and long docs aliases unless an import collision forces a local alias.
Backend adapter packages may use the backend name because the backend is the package boundary.

Anti-goal: extension-like packages should not make consumers destructure generic handles such as
`runtime` or `memory`. Export and document a contextual namespace object such as `logging` or
`observable`.

Anti-goal: do not pass `scope` through application APIs or backend adapters. Scope belongs at the
composition boundary; runtime choices should flow through tags, resources, and execution context.

Anti-goal: extension work is incomplete without a stress-test integration. The test must exercise
the real public seam in detail and cross-check that anti-patterns stayed out; it is not a demo.

Anti-goal: a unit is valid only when every external value it uses is declared through `deps`. Use
`tags.required(...)` for tag dependencies the graph can declare. Direct context reads are for
extension hooks that inspect the current execution boundary.

Anti-goal: do not add devtools, OpenTelemetry, OTEL, OTLP, or backend dependencies to the
base observable and logging packages. Backend adapter packages may carry backend peers, but their
only integration with the base packages is an injected sink.

## Content Rules

An extension package should expose optional behavior around the scope or execution boundary. Keep
extension dependencies local to the extension package and catalog-managed in the workspace.

Static extension composition and runtime backend selection are separate. Install the wrapper in
`createScope({ extensions })`; pass sinks, redaction, levels, filters, and backend policy with tags
such as `observable.runtime(...)` and `logging.runtime(...)`. Backend packages should provide sinks,
not new core composition rules. Keep backend adapters in their own packages so applications only
install the integrations they use.

Use standard OTEL compatibility as the backend rule of thumb. One OTEL sink package should stay
compatible with Grafana, Victoria, and Jaeger deployments through OTLP configuration instead of
creating backend-specific variants.

## Boundaries

Do not put core primitives, React-only adapters, agent providers, or example usage apps here. If an
extension becomes required for basic Lite behavior, it is in the wrong lane.
