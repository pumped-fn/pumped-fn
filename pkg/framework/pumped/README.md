# @pumped-fn/pumped

A scope compiler, not a runtime. `pumped` discovers flows on disk, assembles them into one
`@pumped-fn/lite` scope, and drives that scope under a run mode — dev server, test, or production
build. One graph, three projections:

- **Dev** observes the graph through Vite's module runner with HMR; atom identity survives reloads.
- **Test** substitutes into the graph with a plain `createScope({presets})` — no framework import,
  no plugin, no discovery.
- **Prod** compiles the graph: `pumped build` bundles the discovered manifest into a server and/or
  CLI entry ahead of time.

## Layout conventions

Discovery is flat and convention-driven under `src/`:

- `src/server/*.ts`, `src/cli/*.ts`, `src/jobs/*.ts` — one file per flow, kebab-case filename, default
  export is the flow. The filename becomes the route/command/schedule name unless overridden by a
  `route`/`command`/`schedule` tag on the flow.
- `src/agents/*.ts` — one file per agent, default export is either an `@pumped-fn/sdk` `Agent`
  struct (detected structurally by a `.turn` flow — the framework never imports `@pumped-fn/sdk`
  types) or a plain flow. An agent is mounted as `POST /agents/<name>` on the HTTP server and as
  `pumped agent <name> --json '...'` on the CLI, both executing `agent.turn` with the request/JSON
  body as `rawInput`.
- `src/workflows/*.ts` — one file per workflow, default export is a flow. Each entry runs once at
  server boot in its own context tagged with `pumped.workflowRun({ taskId, runId })`; a workflow that
  returns ends its run. No durability/resume in this increment — see "Workflow tag" below.
- `src/app.ts` (optional) — the scope config seam: `{ presets, tags, extensions, context(req?) }`,
  typed against `pumped.Config`.

### Provider wiring for agents

Agents read their model off a `model` tag (from `@pumped-fn/sdk`), resolved through the scope
like any other tag. Wiring a provider is a one-liner on the app config:

```ts
// src/app.ts
import { claude } from "@pumped-fn/sdk-claude"

export default { tags: [claude()] }
```

### One scope per process

`pumped.createServer`, `pumped.runJobs`, and `pumped.runWorkflows` all accept an existing
`@pumped-fn/lite` scope so a single process — dev server or built entry — runs HTTP, jobs, and
workflows against **one** shared scope. Stateful atoms are therefore the same instance whether
they're read from an HTTP handler, a cron tick, or a workflow run in the same process:

```ts
import { pumped } from "@pumped-fn/pumped"
import { hono } from "@pumped-fn/lite-hono"

const lite = hono.adapter()
const scope = pumped.createAppScope(manifest, [lite])
const { app } = pumped.createServer(manifest, { scope, lite })
pumped.runJobs(manifest, undefined, scope)
pumped.runWorkflows(manifest, undefined, scope)
```

`pumped.createAppScope(manifest, extraExtensions?)` derives a scope's `extensions`/`tags`/`presets`
from `manifest.app` (the `src/app.ts` config), merged with any `extraExtensions` the caller needs
(the HTTP server needs the `@pumped-fn/lite-hono` adapter extension; jobs/workflows don't). Each
runner still creates its own per-request/per-tick/per-run `ExecutionContext` off the shared scope —
only the scope (and its atoms) is shared, never the context. Calling `createServer`/`runJobs`/
`runWorkflows` with no scope argument builds a standalone scope internally (useful for tests/scripts)
and owns its disposal; passing a scope hands disposal ownership to the caller — `stop()` will not
dispose a scope it didn't create.

The generated production entry (`ENTRY_SERVER_SOURCE` in `src/plugin.ts`) and `pumped dev` both wire
one shared scope this way, so `pumped dev` boots the same server + jobs + workflows composition as
production — a missing `schedule` tag or invalid cron expression surfaces as a dev-startup error
instead of only crashing in prod. On Vite server close, `pumped dev` stops jobs/workflows and
disposes the shared scope. A `src/` file change that breaks the graph is not cached forever: dev
rebuilds on every watcher `add`/`unlink`/`change` event, and a rejected build never poisons the
cache — the next request retries the build with the just-saved fix.

### Jobs and cron

`src/jobs/*.ts` flows require a `schedule` tag (`{ cron: string }`) — the framework throws a startup
error naming the entry if it's missing. Cron parsing/scheduling is done by
[`croner`](https://github.com/hexagon/croner). `pumped.runJobs(manifest)` starts one long-lived scope
for the whole runner (or reuses a scope passed as the third argument) and creates a fresh context per
tick; the per-tick function is also exposed directly so tests can invoke it without waiting on real
cron timing:

```ts
// src/jobs/nightly-sweep.ts
import { flow } from "@pumped-fn/lite"
import { pumped } from "@pumped-fn/pumped"

export default flow({
  tags: [pumped.schedule({ cron: "0 2 * * *" })],
  factory: (ctx) => sweepExpired(ctx),
})
```

### Workflow tag

`pumped.workflowRun` is a lightweight `{ taskId, runId }` tag the framework defines itself, so the
base package never hard-depends on `@pumped-fn/sdk`'s durable-workflow extension. If you want
`@pumped-fn/sdk`'s suspend/resume `workflowExtension`, wire it yourself via `app.extensions` —
`runWorkflows` only guarantees each entry gets *a* run/task id pair on its context, not durability.

### HTTP input semantics

`src/server/*.ts` flows receive `rawInput` derived from the request, with no implicit type
coercion — the framework never guesses a query string is "really" a number or boolean:

- **GET**: `rawInput` is built from the URL's query string. A key that appears once becomes a
  plain `string`; a key repeated (`?a=1&a=2`) becomes a `string[]` of all its values, in order. If
  your flow needs a number, boolean, or single-vs-array normalization, declare that in the flow's
  own `parse`/`typed<T>()` or write your own coercion — don't rely on framework guessing.
- **Non-GET** (`POST`/`PUT`/`PATCH`/`DELETE`): the raw body is read as text first. An empty body
  becomes `rawInput: undefined` (no `req.json()` thrown on an empty request). A non-empty body that
  fails to parse as JSON responds `400 { error: "invalid JSON body" }` instead of an unhandled
  framework-level `500`. A well-formed JSON body is parsed and passed through as `rawInput`.

Inside the app body itself, follow the strata convention: nouns (`atom.*`, `resource.*`) at the
bottom, verbs (`flow.*`) in the middle, edges (the discovered entries) at the top, with imports
flowing downward only. A unit's kind is either its filename prefix or its parent directory — never
both, never inferred from content.

### Typed faults and `mapError`

Flows declare their planned failures with `faults: typed<F>()` and raise them with `ctx.fail(fault)`
(both from `@pumped-fn/lite`) instead of throwing an ad hoc error class. `ctx.fail` throws a
`FlowFault` — `{ fault: F; flow: string }` — with the flow's name attached automatically. The
framework's `mapError` seam (`pumped.Config.mapError`) still receives the thrown error as
`unknown`; nothing structural changed there, but a `FlowFault` is now the shape to narrow on:

```ts
import { FlowFault } from "@pumped-fn/lite"

const faultStatus = { conflict: 409, "not-found": 404, forbidden: 403 } satisfies Record<Fault["kind"], number>

function mapError(error: unknown): { status: number; body: unknown } | undefined {
  if (!(error instanceof FlowFault)) return undefined
  const fault = error.fault as Fault
  return { status: faultStatus[fault.kind], body: fault }
}
```

Declaring `faultStatus` with `satisfies Record<Fault["kind"], number>` makes a missing fault kind a
compile error instead of a silent `undefined` status. See `examples/parking-lot-app/src/app.ts` for
a full worked example.

## Quick start

```ts
// vite.config.ts
import { defineConfig } from "vite"
import { pumped } from "@pumped-fn/pumped"

export default defineConfig({
  plugins: [pumped.plugin()],
})
```

```ts
// src/server/greet.ts
import { flow, typed } from "@pumped-fn/lite"

export default flow({
  parse: typed<{ name: string }>(),
  factory: (ctx) => ({ message: `hello ${ctx.input.name}` }),
})
```

```bash
pumped dev              # Vite dev server with HMR over the discovered graph
pumped build --target all   # emits dist/server.mjs and dist/cli.mjs
```

## Testing

The scope is the single seam. Domain flows never import `@pumped-fn/pumped` — tests preset the scope
directly and exec flows through it, mirroring `examples/parking-lot-app/tests/booking.test.ts`:

```ts
import { createScope, preset } from "@pumped-fn/lite"
import { store, createMemoryStore, actor, configureLot } from "@pumped-fn/parking-lot-shared"

const scope = createScope({
  presets: [preset(store, createMemoryStore())],
  tags: [actor({ id: "manager-1", role: "manager" })],
})

const lot = await scope.createContext().exec({ flow: configureLot, input: { name: "Downtown", capacity: 10, /* ... */ } })
```

No plugin, no discovery, no generated manifest — just the public `@pumped-fn/lite` API against the
same flows the app serves.

## Roadmap

- System-manifest scan with build-time checks (unreachable entries, duplicate route/command names).
- A dev graph endpoint / devtools view over the assembled scope.
- Reachability-based per-target builds, so `server`/`cli` bundles only pull what they use.
- Graph AOT: "unwrapping" atoms that are provably never substituted — no presets target them, no
  runtime tags, no lifecycle — into folded constants or plain functions. Dev and test always
  interpret the graph; prod compiles it.

## The constraint that makes this possible

Deps are declared, never dynamically registered. A flow's `deps` and a resource's shape are static
and readable without running anything. That's what keeps the graph compilable ahead of time instead
of only inspectable at runtime.
