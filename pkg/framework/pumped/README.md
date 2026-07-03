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

### Jobs and cron

`src/jobs/*.ts` flows require a `schedule` tag (`{ cron: string }`) — the framework throws a startup
error naming the entry if it's missing. Cron parsing/scheduling is done by
[`croner`](https://github.com/hexagon/croner). `pumped.runJobs(manifest)` starts one long-lived scope
for the whole runner and creates a fresh context per tick; the per-tick function is also exposed
directly so tests can invoke it without waiting on real cron timing:

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

Inside the app body itself, follow the strata convention: nouns (`atom.*`, `resource.*`) at the
bottom, verbs (`flow.*`) in the middle, edges (the discovered entries) at the top, with imports
flowing downward only. A unit's kind is either its filename prefix or its parent directory — never
both, never inferred from content.

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
