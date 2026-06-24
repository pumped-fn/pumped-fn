# pumped-fn

[![npm version](https://img.shields.io/npm/v/@pumped-fn/lite)](https://www.npmjs.com/package/@pumped-fn/lite)

`pumped-fn` is a TypeScript package family for building application systems around explicit boundaries.
It gives you a small core runtime for dependency graphs, execution-scoped work, lifecycle cleanup,
reactive state, and test seams, plus React bindings and structural guardrails for larger codebases.

The main idea is simple: put the system behind a scope. Product code declares atoms, flows, resources,
tags, and extensions. Composition roots create scopes. Tests create scopes with different presets. UI
components observe the graph instead of owning business logic.

## Install

```bash
npm install @pumped-fn/lite
npm install @pumped-fn/lite-react
```

Use only `@pumped-fn/lite` for backend, workers, command-line tools, and framework-neutral graph logic.
Add `@pumped-fn/lite-react` when React should observe that graph.

## Why This Exists

Most application code has the same hidden problems in different forms:

- Import-time singletons connect early and close late.
- Request state leaks through globals or parameter drilling.
- Frontend components grow validation, async work, derived state, and IO.
- Tests patch modules or browser globals because there is no honest seam.
- Cross-cutting behavior like tracing, auth, logging, and transactions is repeated by hand.

`pumped-fn` makes those concerns explicit without turning the app into a framework. A scope owns the graph.
An execution context owns one request, job, action, or UI boundary. Presets change the radius of a test.
Extensions wrap execution. React is an observer layer.

## Package Map

| Package | Role |
| --- | --- |
| `@pumped-fn/lite` | Core runtime: scopes, atoms, flows, resources, tags, presets, controllers, extensions |
| `@pumped-fn/lite-react` | React integration: providers, Suspense/ErrorBoundary-aware observers, scoped frontend state |
| `@pumped-fn/lite-lint` | Static scanner for the documented lite and lite-react anti-patterns |
| `@pumped-fn/lite-devtools` | Devtools transports and observability helpers |
| `@pumped-fn/lite-hmr` | HMR helpers for preserving atom state during development |
| `@pumped-fn/lite-extension-otel` | OpenTelemetry integration |
| `@pumped-fn/lite-extension-suspense` | Suspense-oriented extension support |
| `@pumped-fn/codemod` | Migration helpers for older pumped-fn code |

## Mental Model

```text
composition root
  createScope({ presets, tags, extensions })
        |
        v
scope
  long-lived graph boundary
  atoms: cached capabilities, state, derived data, infrastructure
  controllers/select: opt-in reactivity
        |
        v
execution context
  request, job, action, route, or UI boundary
  flows: input/output work
  resources: transactions, request loggers, form drafts, spans
  tags: tenant, locale, trace id, runtime config
```

The same seam works for backend and frontend:

- Backend handlers create or receive an execution context and run flows.
- Workers create scopes for process lifetime and contexts per job.
- React roots render `ScopeProvider` and `ExecutionContextProvider`.
- Tests use `createScope({ presets, tags, extensions })` and public APIs.

## Core Primitives

| Primitive | Owns | Use it for |
| --- | --- | --- |
| `createScope` | The composition and test boundary | App roots, server mounts, worker processes, isolated tests |
| `atom` | Scope-owned values | Transports, capabilities, state, derived data, caches |
| `flow` | Short-lived execution | Commands, request handlers, actions with typed input |
| `resource` | Execution-context-owned values | Transactions, request loggers, spans, per-action buffers, form drafts |
| `tag` | Typed ambient values | Tenant, request id, locale, runtime config, equality-aware boundary identity |
| `preset` | Replacement at the seam | Unit radius tests, outside-in adapter tests, tenant-specific implementation swaps |
| `extension` | Cross-cutting wrappers | Logging, tracing, auth, metrics, transactions |
| `controller` / `select` | Opt-in reactivity | UI state, live config, derived subscriptions, invalidation |

## Architectural Shape

`pumped-fn` code usually falls into four layers:

| Layer | Responsibility | Rule of thumb |
| --- | --- | --- |
| Transport atom | Wrap raw ambient IO such as fetch, storage, timers, clock, random, process APIs | Its own unit test may fake the platform below the seam |
| Capability atom | Expose domain/application operations over transports | No raw IO, no token/session plumbing in feature nodes |
| Feature atom or flow | Own application state, decisions, derived data, and use-case execution | Depends on capabilities and resources |
| Composition root | Create scopes, root contexts, providers, route/job mounts, and disposal | Thin, tested adapter; no service-locator helper that accepts `scope` |

That shape lets you test inside-out or outside-in without changing product code. Inside-out tests preset a
unit's direct dependencies. Outside-in tests preset only edge adapters. Needing module mocks, product
branches for test mode, or global patches above a raw transport wrapper is a design smell.

## Backend, BFF, Worker

Use `@pumped-fn/lite` directly when there is no UI.

```ts
import { atom, createScope, flow, resource, tag, tags, typed } from "@pumped-fn/lite"

const tenantId = tag<string>({ label: "tenant.id" })

const http = atom({
  factory: () => ({
    get: async (path: string) => ({ path, ok: true }),
  }),
})

const audit = resource({
  name: "audit",
  ownership: "boundary",
  factory: (ctx) => {
    const events: string[] = []
    ctx.cleanup(() => {
      events.length = 0
    })
    return {
      record(event: string) {
        events.push(event)
      },
      snapshot: () => [...events],
    }
  },
})

const loadDashboard = flow({
  parse: typed<{ userId: string }>(),
  deps: { http, audit, tenantId: tags.required(tenantId) },
  factory: async (ctx, deps) => {
    deps.audit.record(`dashboard:${ctx.input.userId}`)
    return deps.http.get(`/tenants/${deps.tenantId}/users/${ctx.input.userId}/dashboard`)
  },
})

const scope = createScope({ tags: [tenantId("acme")] })
const ctx = scope.createContext()
const dashboard = await ctx.exec({ flow: loadDashboard, input: { userId: "u1" } })
await ctx.close()
await scope.dispose()
```

The same structure works for HTTP handlers, BFF endpoints, scheduled jobs, command handlers, and CLIs.
Adapters translate the outside world into flow input and tags; the graph owns application behavior.

## React

React components should observe and dispatch. They should not create dependencies, mirror graph state, or
own execution lifecycles.

```tsx
import { atom, createScope, flow } from "@pumped-fn/lite"
import { ExecutionContextProvider, ScopeProvider, useAtom, useFlow } from "@pumped-fn/lite-react"

const dashboardState = atom({
  factory: () => ({ title: "Dashboard" }),
})

const refreshDashboard = flow({
  factory: () => undefined,
})

const scope = createScope()

function App() {
  return (
    <ScopeProvider scope={scope}>
      <ExecutionContextProvider>
        <Dashboard />
      </ExecutionContextProvider>
    </ScopeProvider>
  )
}

function Dashboard() {
  const dashboard = useAtom(dashboardState)
  const refresh = useFlow(refreshDashboard)

  return (
    <button onClick={() => refresh.execute()}>
      {dashboard.title}
    </button>
  )
}
```

For forms, modals, editors, and nested UI boundaries, `@pumped-fn/lite-react` provides `scopedValue`.
That state is backed by a current-owned resource, so it is testable without React and resets when the
owning execution context unmounts or is released.

## Tests

The scope is the single seam:

```ts
import { atom, createScope, preset } from "@pumped-fn/lite"

const clock = atom({
  factory: () => ({ now: () => Date.now() }),
})

const timestamp = atom({
  deps: { clock },
  factory: (_ctx, deps) => deps.clock.now(),
})

const scope = createScope({
  presets: [preset(clock, { now: () => 42 })],
})

const value = await scope.resolve(timestamp)
if (value !== 42) throw new Error("expected preset clock")

await scope.dispose()
```

Frontend tests split by responsibility. Graph logic stays in node tests and uses the same scope seam.
Rendered observer tests run in Vitest Browser Mode under `ScopeProvider` and `ExecutionContextProvider`.
Browser mode proves React wiring; it does not replace node logic tests. CI also runs a Lightpanda
smoke against a Vite-served `useFlow` page so browser-runtime drift is caught before release.

`@pumped-fn/lite-lint` codifies the common mistakes: module mocks, stale browser-emulator markers,
definition-handle suffixes, scope-as-argument helpers, shared scope factories, inline ambient IO, React
feature components using scope directly, and local state mirrors.

## Practical Examples

The examples are part of the public contract for how code should be shaped:

| Path | What it shows |
| --- | --- |
| `examples/lite-practical` | Backend and service-style patterns, plus a service health capstone |
| `examples/lite-react-practical` | React observer patterns, provider-owned execution, scoped drafts, complex Kanban |
| `examples/lite-bff-practical` | BFF transport/capability/feature layering and HTTP-shaped flow boundaries |
| `benchmarks/lite-perf` | Runtime and React observer performance checks |

## Local Development

```bash
pnpm install
pnpm build
pnpm test
pnpm typecheck
pnpm lint
pnpm verify
```

Useful package commands:

```bash
pnpm -F @pumped-fn/lite test
pnpm -F @pumped-fn/lite-react test
pnpm -F @pumped-fn/lite-lint test
```

## Documentation

- Core runtime: [`packages/lite/README.md`](packages/lite/README.md)
- Core patterns: [`packages/lite/PATTERNS.md`](packages/lite/PATTERNS.md)
- React runtime: [`packages/lite-react/README.md`](packages/lite-react/README.md)
- React patterns: [`packages/lite-react/PATTERNS.md`](packages/lite-react/PATTERNS.md)
- Anti-pattern scanner: [`packages/lite-lint/README.md`](packages/lite-lint/README.md)

## License

MIT
