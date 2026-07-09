# Test without mocking modules

[![npm version](https://img.shields.io/npm/v/@pumped-fn/lite)](https://www.npmjs.com/package/@pumped-fn/lite)
[![npm downloads](https://img.shields.io/npm/dm/@pumped-fn/lite)](https://www.npmjs.com/package/@pumped-fn/lite)
[![license](https://img.shields.io/npm/l/@pumped-fn/lite)](LICENSE)
[![minzip](https://img.shields.io/bundlephobia/minzip/@pumped-fn/lite)](https://bundlephobia.com/package/@pumped-fn/lite)

pumped-fn puts your app behind the scope: fully testable, fully traceable, without compromising readability.

```text
createScope({ presets, tags, extensions })
  -> scope-owned graph
  -> execution context per request, job, action, or test
  -> flows, resources, tags, and wrapped execution edges
```

Production code declares graph edges. Tests replace those edges at `createScope`, then execute the same public flow the app uses.

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

const ctx = scope.createContext()
await ctx.exec({ flow: saveInvoice, input: { id: "inv-1" } })
await ctx.close()
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

const testCtx = testScope.createContext()
const result = await testCtx.exec({ flow: saveInvoice, input: { id: "inv-1" } })

if (result.id !== "inv-1" || calls.length !== 1) throw new Error("unexpected save")

await testCtx.close()
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
const ctx = scope.createContext()

console.log(await ctx.exec({ flow: greet, input: { name: "Ada" } }))

await ctx.close()
await scope.dispose()
```

The core package has zero runtime dependencies and ~12 kB min+gzip.

## Mental model

A `scope` is the composition and test boundary. `atom` values live in the scope. `flow` executions live in an execution context. `resource` values are owned by that context. `tag` values carry request facts and role choices. `preset` replaces an edge for tests or alternate roots. `extension` wraps resolution and execution. Streaming flows use `execStream`.

## Request context without AsyncLocalStorage

Use tags and execution contexts instead of ambient request storage. Middleware creates one context for the request, seeds request facts as tags, runs flows, then closes the context. Product code declares `tags.required(requestId)` and fails during dependency resolution if the boundary forgot it.

Read the full guide: [Request context without AsyncLocalStorage](docs/request-context-without-als.md).

## OpenTelemetry spans without touching business code

Extensions wrap graph execution. Install `observable.extension()` at the scope, pass an OpenTelemetry sink through runtime tags, and business flows stay ordinary TypeScript functions. Foreign SDK calls can still be named with `ctx.exec({ fn, params, name, tags })` so traces show the edge.

Read the full guide: [OpenTelemetry spans without editing business functions](docs/observability.md).

## TypeScript DI without decorators

pumped-fn is not a decorator container. Imports define graph units, dependency records define edges, and a scope materializes one graph with substitutions. Role tags let the root choose an implementation while feature code depends on the role.

Read the comparison: [TypeScript DI without decorators](docs/vs-di-containers.md).

## pumped-fn vs Effect

Use pumped-fn when adoption should stay close to normal `async` TypeScript. Flows return values or promises; streaming flows use async generators only when the result is a stream. Typed faults exist, with the documented limit that `isFault` narrows by `FlowFault` plus flow name.

Read the comparison: [pumped-fn vs Effect](docs/vs-effect.md).

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
| `examples/invoice-triage` | Canonical Postgres-backed invoice import and triage with traced store, model, review, and reminder edges. |

## Package inventory

| Path | Package |
| --- | --- |
| `pkg/core/lite` | `@pumped-fn/lite` |
| `pkg/ext/hmr` | `@pumped-fn/lite-hmr` |
| `pkg/ext/logging` | `@pumped-fn/lite-extension-logging` |
| `pkg/ext/logging-pino` | `@pumped-fn/lite-extension-logging-pino` |
| `pkg/ext/observable` | `@pumped-fn/lite-extension-observable` |
| `pkg/ext/observable-otel` | `@pumped-fn/lite-extension-observable-otel` |
| `pkg/ext/scheduler` | `@pumped-fn/lite-extension-scheduler` |
| `pkg/ext/scheduler-nats` | `@pumped-fn/lite-extension-scheduler-nats` |
| `pkg/ext/suspense` | `@pumped-fn/lite-extension-suspense` |
| `pkg/ext/sync` | `@pumped-fn/lite-extension-sync` |
| `pkg/ext/sync-nats` | `@pumped-fn/lite-extension-sync-nats` |
| `pkg/framework/hono` | `@pumped-fn/lite-hono` |
| `pkg/framework/pumped` | `@pumped-fn/pumped` |
| `pkg/framework/tanstack-start` | `@pumped-fn/lite-tanstack-start` |
| `pkg/react/json` | `@pumped-fn/lite-react-json-render` |
| `pkg/react/lite-react` | `@pumped-fn/lite-react` |
| `pkg/render/core` | `@pumped-fn/lite-render-core` |
| `pkg/render/react` | `@pumped-fn/lite-render-react` |
| `pkg/sdk/bash` | `@pumped-fn/sdk-just-bash` |
| `pkg/sdk/claude` | `@pumped-fn/sdk-claude` |
| `pkg/sdk/codex` | `@pumped-fn/sdk-codex` |
| `pkg/sdk/core` | `@pumped-fn/sdk` |
| `pkg/sdk/test` | `@pumped-fn/sdk-test` |
| `pkg/tool/codemod` | `@pumped-fn/codemod` |
| `pkg/tool/lint` | `@pumped-fn/lite-lint` |

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
