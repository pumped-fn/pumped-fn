# @pumped-fn/pumped

> **Status: experimental.** APIs change without notice; not recommended for production yet.

A scope compiler. Your application is a set of flows, atoms, and resources from
`@pumped-fn/lite`. Pumped discovers entries on disk, assembles one scope, and mounts
each entry on the hosts its tags name — HTTP, CLI, cron, workflow — without the entry
knowing which transport called it.

```
src/entries/*.ts                      hosts (selected by tag)
┌──────────────────────────┐          ┌───────────────────────────────┐
│ entry({                  │  route   │ httpHost   per request:       │
│   flow: greet,           ├──────────▶   createContext + exec        │
│   tags: [route(...),     │  command │ cliHost    per invocation     │
│          command(...)]   ├──────────▶ cronHost   per tick           │
│ })                       │ schedule │ workflowHost  once at boot    │
└──────────────────────────┘ workflow └───────────────┬───────────────┘
             │                                        │
             │ flow, by reference                     │ ambient tags in
             ▼                                        ▼ the context
┌──────────────────────────┐          ┌───────────────────────────────┐
│ one scope per process    │          │ httpRequest, httpResponse,    │
│ createScope(app)         │          │ cliInvocation, cronTick,      │
│ app = { presets, tags,   │          │ workflowRun                   │
│         extensions }     │          │ read via tags.optional(...)   │
└──────────────────────────┘          └───────────────────────────────┘
```

One entry, both transports:

```ts
// src/entries/greet.ts
import { command, entry, route } from "@pumped-fn/pumped"
import { greet } from "../domain/greet"

export default entry({
  flow: greet,
  tags: [route({ method: "GET", path: "/greet" }), command({ name: "greet" })],
})
```

## Layout

- `src/entries/*.ts` — one file per entry, kebab-case filename, default export is
  `entry({ flow, tags })`. The tags decide where it mounts; the filename is only the
  entry's report name. Bare flow default exports are rejected with a named error.
- `src/app.ts` — optional default composition: `app({ presets, tags, extensions })`.
- `src/apps/*.ts` — optional named compositions deriving from the base:
  `app(base, { tags: [region("east")] })`. Select with `--app east`.
- Everything else (`src/domain/`, …) is yours; only `src/entries` is scanned, one
  level deep.

## Mount tags

| Tag | Host | Spec |
| --- | --- | --- |
| `route` | HTTP | `{ method: "GET" \| "POST" \| "PUT" \| "PATCH" \| "DELETE"; path: string }` |
| `command` | CLI | `{ name: string; description?: string }` |
| `schedule` | cron | `{ cron: string } \| { every: string }`, plus `name?`, `overlap?: "skip" \| "queue"`, `catchUp?: "skip" \| "last" \| "all"` |
| `workflow` | boot | `{ name?: string }` — runs once at server startup |

An entry may carry several tags, including several of the same kind (two `route`
tags mount one flow on two paths). Duplicate paths, command names, or schedule names
fail `pumped check` and refuse to start.

## The app picks entries

Entries and mounts state facts about themselves as attributes — declaration-layer
metadata that never enters a scope or an execution context. On a mount tag they ride
the call's second argument, so the value stays purely yours. The app holds the
picking rules. One fixed sentence decides everything: a carrier is picked iff every
selectable fact on it matches the app's `include` — a bound value, or a bare
attribute enabling any value of that family — and none of its `exclude`; carriers
without selectable facts are always in. Exclude wins at both granularities.

```ts
// src/domain/capability.ts
export const capability = attribute<string>({ label: "acme.capability" })

// src/entries/refund.ts — states what it IS; knows nothing about apps
export default entry({
  flow: refund,
  tags: [route({ method: "POST", path: "/refunds" })],
  attributes: [capability("billing")],
})

// per-mount facts ride the mount tag's creation options:
// the command exists everywhere, the route only where beta is included
export default entry({
  flow: search,
  tags: [
    command({ name: "search" }),
    route({ method: "GET", path: "/search" }, { attributes: [capability("beta")] }),
  ],
})

// src/apps/pro.ts — picks; a bare attribute includes the whole family
export default app(base, { attributes: { include: [capability], exclude: [capability("experimental")] } })
```

The build census applies the rule before generating a target manifest, so an
unpicked entry's whole import subtree never enters the artifact — picking is tree
shaking. Hosts apply the same rule at mount, so dev and production agree. Unpicked
carriers' tags are never applied to the scope or a context, and attributes are
invisible at runtime by construction: no seeding path, no `tags.required(attribute)`.

Consumer-owned attributes declare `select: false` and picking ignores them — they
belong to their consumers (a future `server` attribute belongs to engines); `flag()`
markers never participate. Duplicates are checked among picked mounts only, and
`analyze` reports unpicked entries under `excluded` and skips their checks.
Implementation variants (basic vs premium search behind one route) are role tags,
not picking: one entry whose flow declares `tags.required(searchImpl)`, each app
supplying its implementor.

## Ambient values

Hosts seed each activation context with tags. Flows read them by declaration —
optionally, so the same flow stays valid on every host:

```ts
import { flow, tags } from "@pumped-fn/lite"
import { httpRequest, httpResponse } from "@pumped-fn/pumped"

export const describe = flow({
  deps: { req: tags.optional(httpRequest), res: tags.optional(httpResponse) },
  factory: (context, deps) => {
    deps.res?.headers.set("cache-control", "no-store")
    return { agent: deps.req?.headers.get("user-agent") ?? "not http" }
  },
})
```

| Tag | Provided by | Value |
| --- | --- | --- |
| `httpRequest` | httpHost | the platform `Request` |
| `httpResponse` | httpHost | mutable carrier `{ status?, headers, body? }`, rendered after exec |
| `cliInvocation` | cliHost | `{ command, argv }` |
| `cronTick` | cronHost | `{ name, key, scheduledAt }` |
| `workflowRun` | workflowHost | `{ name, runId }` |

A downstream app hardens a dependency by switching `tags.optional` to
`tags.required` — and `pumped check` then proves every host the entry mounts on can
supply it. The entry's own tags are seeded into the context too, so
`entry({ flow, tags: [route(...), tenant("acme")] })` provides `tenant` to
everything the flow reaches.

## HTTP responses and errors

Output renders as JSON by default. To control status, headers, or the body, mutate
the `httpResponse` carrier; when `body` is set the host sends it verbatim.

Failures map to transport codes: a `ParseError` is HTTP 400 / exit 2, a declared
fault (`ctx.fail`) is HTTP 422 / exit 3 with the fault as payload, anything else is
HTTP 500 / exit 1. Override HTTP mapping with the `httpError` tag on the app or on
one entry:

```ts
import { app, httpError } from "@pumped-fn/pumped"
import { region } from "./domain/greet"

export default app({
  tags: [
    region("default"),
    httpError((error) => (error instanceof RangeError ? { status: 416, body: { kind: "range" } } : undefined)),
  ],
})
```

GET input comes from the query string as `Record<string, string | string[]>`; other
methods read a JSON body. `flow.parse` owns coercion and validation.

## Static verification

`analyze(manifest)` walks declared dependencies without executing a factory. It
returns a truthful graph (`nodes`, `edges`, `unknowns`) plus `failures` — defects
provable before anything runs:

- an entry whose tags no host mounts
- duplicate routes, commands, schedules, or workflows
- a `tags.required(...)` read some mounted host can never satisfy — for example a
  flow requiring `httpRequest` on an entry that also carries `command(...)` fails
  for the CLI host, while `tags.optional(httpRequest)` passes on both

`pumped check` prints failures and exits 1; `pumped build` refuses to emit
artifacts on failures; `pumped dev` logs them and keeps serving while you iterate.

## Commands

```
pumped dev [--app east]       start the dev server (watches src, reloads the scope)
pumped build [--target all]   build dist/server.mjs and dist/cli.mjs
pumped check [--app east]     statically verify the manifest, exit 1 on failures
pumped graph [--app east]     print the full graph report as JSON
```

The binary owns Vite; no `vite.config.ts` is read. Project settings live in an
optional `pumped.config.ts`:

```ts
import { defineConfig } from "@pumped-fn/pumped"

export default defineConfig({
  dir: "src",
  port: 3000,
  vite: { server: { host: "127.0.0.1" } },
})
```

## Builds carry only what their tags demand

`pumped build` first evaluates the full manifest, then generates one artifact per
target from exactly the entries whose tags belong to it:

- the server target takes `route`, `schedule`, and `workflow` entries and imports
  only the hosts those tags require — no cron entries, no scheduler in the graph
- the CLI target takes `command` entries; the artifact contains no HTTP server and
  runs with `@pumped-fn/lite` as its only framework dependency on disk
- an entry tagged for both lands in both artifacts, sharing the same flow

Transports are peer dependencies loaded inside hosts: install `hono` and
`@hono/node-server` for HTTP apps and `@pumped-fn/lite-extension-scheduler` for
schedules. Importing `@pumped-fn/pumped` never evaluates Vite, a transport, or the
scheduler — the single package entry is safe for tests and plain Node.

The package exports only its own twenty concepts. Lite primitives — `flow`, `atom`,
`resource`, `tag`, `tags`, `typed`, `createScope`, `preset` — come from
`@pumped-fn/lite`, the required peer. One name has one home.

## Testing

The scope is the single seam. A flow test presets its dependencies and seeds
ambient tags on a plain context; a host test drives the public runtime:

```ts
import { createScope, preset } from "@pumped-fn/lite"
import { httpHost } from "@pumped-fn/pumped"
import { directory, greet, region } from "../src/domain/greet"
import greeting from "../src/entries/greet"

const scope = createScope({
  tags: [region("test")],
  presets: [preset(directory, { displayName: (name: string) => name.toUpperCase() })],
})
const runtime = httpHost.start({
  scope,
  manifest: { app: undefined, entries: [{ name: "greet", file: "src/entries/greet.ts", entry: greeting }] },
})
const response = await runtime.fetch(new Request("http://test/greet?name=Ada"))
```

`scope.dispose()` alone stops every host — listeners, schedules, and in-flight
workflow runs register their own cleanup on the scope.

## Substitution reaches through entries

`entry()` holds its flow by reference. `preset(greet, …)` on the scope replaces the
flow behind every entry that carries it, and `preset(greeting, { flow })` swaps a
whole entry's bundle while its declared tags survive. Never spread a flow handle
into a new object — a copy forks its node identity and presets miss it.

## Migrating from 0.3

- `export default flow(...)` plus a sibling `meta` export becomes
  `export default entry({ flow, tags: [...] })`.
- `src/server/`, `src/cli/`, `src/jobs/`, `src/agents/`, `src/workflows/` collapse
  into `src/entries/`; discovery names the move if it finds the old directories.
- `schedule()` atoms as entries become `entry({ flow, tags: [schedule({ cron })] })`.
- `AppConfig.context` is replaced by ambient tags; `AppConfig.mapError` by the
  `httpError` tag and the fixed CLI exit-code policy.
- `@pumped-fn/pumped/app`, `/meta`, and `/runtime` are gone. Lite primitives import
  from `@pumped-fn/lite`; pumped concepts import from `@pumped-fn/pumped`.
- An agent is an entry carrying both `route` and `command` tags; the hardcoded
  `/agents/<name>` mount is gone.
