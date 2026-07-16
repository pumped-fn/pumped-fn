# pumped-fn

[![npm version](https://img.shields.io/npm/v/@pumped-fn/lite)](https://www.npmjs.com/package/@pumped-fn/lite)
[![npm downloads](https://img.shields.io/npm/dm/@pumped-fn/lite)](https://www.npmjs.com/package/@pumped-fn/lite)
[![license](https://img.shields.io/npm/l/@pumped-fn/lite)](LICENSE)
[![minzip](https://img.shields.io/bundlephobia/minzip/@pumped-fn/lite)](https://bundlephobia.com/package/@pumped-fn/lite)

Put your app behind a scope, and it becomes fully testable, fully traceable, without compromising readability. One graph carries your backend handlers, scheduled jobs, workflows, and React components — the same nodes swap for fakes in tests and light up as spans in production.

```text
createScope({ presets, tags, extensions })
  ├─ run / runStream -> owned execution context ─┐
  │    └─ flow or named inline { deps, fn, params }  │
  └─ createContext -> exec / execStream ─────────┴─ session.run -> agent.turn
                                                               ├─ role + selected capability flows
                                                               └─ provider + backend adapters
```

Executing the entry flow activates its complete recursively declared dependency tree before the entry factory starts. Required tags are checked at runtime during activation. A missing provider, tool backend, validation engine, or session binding fails before semantic work begins. Tests replace the same graph edges at `createScope`; they do not mock the tree.

## Test without mocking modules

The clearest place to start is testing. Production code declares graph edges; tests replace those edges at `createScope`, then execute the same public flow the app uses — no `vi.mock`, no module interception.

```ts
import { atom, createScope, flow, preset, tag, tags, typed } from "@pumped-fn/lite"

interface Db {
  save(id: string, at: Date): Promise<{ id: string; at: Date }>
}

interface Clock {
  now(): Date
}

const clock = tag<Clock>({ label: "clock" })

const db = atom({
  factory: (): Db => ({
    save: async (id, at) => ({ id, at }),
  }),
})

export const saveInvoice = flow({
  parse: typed<{ id: string }>(),
  deps: { db, clock: tags.required(clock) },
  factory: (ctx, { db, clock }) => db.save(ctx.input.id, clock.now()),
})

const scope = createScope({
  tags: [clock({ now: () => new Date() })],
})

await scope.run({ flow: saveInvoice, input: { id: "inv-1" } })
await scope.dispose()

const calls: string[] = []
const fake: Db = {
  async save(id, at) {
    calls.push(`${id}:${at.toISOString()}`)
    return { id, at }
  },
}

const testScope = createScope({
  presets: [preset(db, fake)],
  tags: [clock({ now: () => new Date("2026-07-05T12:00:00.000Z") })],
})

const result = await testScope.run({ flow: saveInvoice, input: { id: "inv-1" } })

if (result.id !== "inv-1" || calls.length !== 1) throw new Error("unexpected save")

await testScope.dispose()
```

## Quickstart

```bash
pnpm add @pumped-fn/lite
npm install @pumped-fn/lite
```

```ts
import { createScope, flow, typed } from "@pumped-fn/lite"

const greet = flow({
  parse: typed<{ name: string }>(),
  factory: (ctx) => `hello ${ctx.input.name}`,
})

const scope = createScope()
console.log(await scope.run({ flow: greet, input: { name: "Ada" } }))

await scope.dispose()
```

The core package has zero runtime dependencies and ~12 kB min+gzip.

## Mental model

A `scope` is the composition and test boundary. `scope.run` and `scope.runStream` own one temporary execution context. `scope.run({ name, deps, fn, params })` declares a named one-off operation without a reusable flow handle. Use `createContext` with `exec` or `execStream` when several turns or flows share one lifetime. `atom` values live in the scope. `resource` values are owned by an execution context. `tag` values carry request facts and role choices. `preset` replaces an edge for tests or alternate roots. `extension` wraps resolution and execution.

SDK applications use stable `session.run`, `agent.turn`, `agent.role`, and `agent.fromModel` definitions. Composition selects configuration and implementations through namespaced tags such as `agent.config.*`, `agent.impl.*`, and `session.execution.*`. Tool, skill, and subagent flows remain ordinary declared graph edges.

## Request context without AsyncLocalStorage

Use tags and execution contexts instead of ambient request storage. Middleware creates one context for the request, seeds request facts as tags, runs flows, then closes the context. Product code declares `tags.required(requestId)` and fails during dependency resolution if the boundary forgot it.

Read the full guide: [Request context without AsyncLocalStorage](docs/request-context-without-als.md).

## OpenTelemetry spans without touching business code

Extensions wrap graph execution. Install `observable.extension()` at the scope, pass an OpenTelemetry sink through runtime tags, and business flows stay ordinary TypeScript functions. Foreign SDK calls can still be named with `ctx.exec({ name, deps, params, fn, tags })` so traces show the edge.

Read the full guide: [OpenTelemetry spans without editing business functions](docs/observability.md).

## TypeScript DI without decorators

Use this comparison when the issue is not "decorators or no decorators" but where the footguns go. It walks through hidden IO, async providers, the single `createScope({ presets, tags, extensions })` access point, and static deps versus dynamic tags.

Read the comparison: [TypeScript DI without decorators](docs/vs-di-containers.md).

## pumped-fn vs Effect

Use this comparison when you are choosing between a small scope seam and a full Effect program model. It walks through hidden effects and typed faults, async dependency ownership, the scope entry point, and static dependencies versus dynamic request facts. Effect is still the pick when you want its typed effect combinators, ecosystem, and fiber model.

Read the comparison: [pumped-fn vs Effect](docs/vs-effect.md).

## Run the comparison

The [source-locked comparison lab](playground/compare/README.md) runs one account-onboarding contract through pumped-fn, Effect, Awilix, Inversify, and plain TypeScript. The same checked-in files run in tests and in an editable browser sandbox.

```sh
pnpm compare:verify
```

## Adopt one route at a time

Keep the existing server. Add a scope at one composition boundary, move one leaf dependency into an atom, and run one flow from the route. Existing consumers can keep the old function while new graph consumers get the preset seam.

Read the guide: [Adopt pumped-fn one route at a time](docs/adopt-incrementally.md).

## Durable workflows and streaming

Durable work replays via the suspense extension. Marked steps can replay from the log or suspend for external resolution. Streaming flows are not replayable yet, so do not put streaming progress behind durable replay.

## Code review guide

Review for hidden edges: module mocks, global patches, helper functions that accept `scope`, raw IO inside feature factories, child flows hidden behind same-file `ctx.exec`, and awaited dep calls that are not named execution edges.

Read the checklist: [How to review pumped-fn code](docs/code-review-guide.md).

## Practical examples

| Path | What it shows |
| --- | --- |
| `examples` | [Examples index](examples/README.md). |
| `examples/issue-triage` | [GitHub issue triage with durable leases, per-delivery SDK sessions, repository/PostgreSQL/Victoria evidence, deterministic review, and idempotent publication.](examples/issue-triage/README.md) |
| `examples/invoice-triage` | [Canonical Postgres-backed invoice import and triage with traced store, model, review, and reminder edges.](examples/invoice-triage/README.md) |

## Package inventory

| Path | Package | Docs |
| --- | --- | --- |
| `pkg/core/lite` | `@pumped-fn/lite` | [README](pkg/core/lite/README.md) |
| `pkg/ext/hmr` | `@pumped-fn/lite-hmr` | [README](pkg/ext/hmr/README.md) |
| `pkg/ext/logging` | `@pumped-fn/lite-extension-logging` | [README](pkg/ext/logging/README.md) |
| `pkg/ext/logging-pino` | `@pumped-fn/lite-extension-logging-pino` | [README](pkg/ext/logging-pino/README.md) |
| `pkg/ext/observable` | `@pumped-fn/lite-extension-observable` | [README](pkg/ext/observable/README.md) |
| `pkg/ext/observable-otel` | `@pumped-fn/lite-extension-observable-otel` | [README](pkg/ext/observable-otel/README.md) |
| `pkg/ext/scheduler` | `@pumped-fn/lite-extension-scheduler` | [README](pkg/ext/scheduler/README.md) |
| `pkg/ext/scheduler-nats` | `@pumped-fn/lite-extension-scheduler-nats` | [README](pkg/ext/scheduler-nats/README.md) |
| `pkg/ext/suspense` | `@pumped-fn/lite-extension-suspense` | [README](pkg/ext/suspense/README.md) |
| `pkg/ext/sync` | `@pumped-fn/lite-extension-sync` | [README](pkg/ext/sync/README.md) |
| `pkg/ext/sync-nats` | `@pumped-fn/lite-extension-sync-nats` | [README](pkg/ext/sync-nats/README.md) |
| `pkg/framework/hono` | `@pumped-fn/lite-hono` | [README](pkg/framework/hono/README.md) |
| `pkg/framework/pumped` | `@pumped-fn/pumped` | [README](pkg/framework/pumped/README.md) |
| `pkg/framework/tanstack-start` | `@pumped-fn/lite-tanstack-start` | [README](pkg/framework/tanstack-start/README.md) |
| `pkg/react/json` | `@pumped-fn/lite-react-json-render` | [README](pkg/react/json/README.md) |
| `pkg/react/lite-react` | `@pumped-fn/lite-react` | [README](pkg/react/lite-react/README.md) |
| `pkg/render/core` | `@pumped-fn/lite-render-core` | [README](pkg/render/core/README.md) |
| `pkg/render/react` | `@pumped-fn/lite-render-react` | [README](pkg/render/react/README.md) |
| `pkg/sdk/bash` | `@pumped-fn/sdk-just-bash` | [README](pkg/sdk/bash/README.md) |
| `pkg/sdk/claude` | `@pumped-fn/sdk-claude` | [README](pkg/sdk/claude/README.md) |
| `pkg/sdk/codex` | `@pumped-fn/sdk-codex` | [README](pkg/sdk/codex/README.md) |
| `pkg/sdk/core` | `@pumped-fn/sdk` | [README](pkg/sdk/core/README.md) |
| `pkg/sdk/mcp` | `@pumped-fn/sdk-mcp` | [README](pkg/sdk/mcp/README.md) |
| `pkg/sdk/pi` | `@pumped-fn/sdk-pi` | [README](pkg/sdk/pi/README.md) |
| `pkg/sdk/test` | `@pumped-fn/sdk-test` | [README](pkg/sdk/test/README.md) |
| `pkg/tool/codemod` | `@pumped-fn/codemod` | [README](pkg/tool/codemod/README.md) |
| `pkg/tool/lint` | `@pumped-fn/lite-lint` | [README](pkg/tool/lint/README.md) |

## Documentation

- [Mental model](docs/mental-model.md)
- [Test without mocking modules](docs/test-without-mocks.md)
- [Docs index and limits](docs/README.md)
- [Core runtime README](pkg/core/lite/README.md)
- [Core patterns](pkg/core/lite/PATTERNS.md)
- [Anti-pattern scanner](pkg/tool/lint/README.md)

## What this is not

pumped-fn is not a full application framework, an ORM, or a queue. The render packages (`@pumped-fn/lite-render-core`, `@pumped-fn/lite-render-react`) and `@pumped-fn/sdk-claude` are experimental. You also have to learn scopes, lifetimes, tags, resources, and dependency kinds; the payoff is one explicit seam for production wiring, tracing, and tests.

## License

[MIT](LICENSE)
