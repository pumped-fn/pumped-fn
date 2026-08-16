---
"@pumped-fn/pumped": major
---

One entry adapter, tags pick the hosts, single package entry.

An application entry is now declared, not inferred from a file location plus a sibling
`meta` export:

```ts
export default entry({
  flow: greet,
  tags: [route({ method: "GET", path: "/greet" }), command({ name: "greet" })],
})
```

- `entry({ flow, tags })` is the only valid entry default export. It is a branded atom:
  the frozen spec (flow by reference, normalized tags) reads without a scope, the bundle
  resolves inside one, and `preset()` reaches through to the flow. Bare flow defaults
  fail with a named error.
- The five kind directories collapse into `src/entries/`. Tags decide where an entry
  mounts: `route` → HTTP, `command` → CLI, `schedule` (now carrying the cadence) → cron,
  `workflow` → boot. One entry can carry several and lands in every matching artifact.
- Four hosts (`httpHost`, `cliHost`, `cronHost`, `workflowHost`) replace `createServer`,
  `runCli`, `runJobs`, and `runWorkflows`. Each activation opens an execution context
  seeded with ambient tags — `httpRequest`, `httpResponse`, `cliInvocation`, `cronTick`,
  `workflowRun` — plus the entry's own tags. Flows read them with `tags.optional(...)`
  and stay portable across hosts; disposing the scope stops everything a host started.
- `analyze` gains `failures`: entries no host mounts, duplicate routes/commands/
  schedules/workflows, and required tags a mounted host can never supply are provable
  before anything runs. New `pumped check` exits 1 on failures and `pumped build`
  refuses to emit artifacts on them; `pumped dev` logs them and keeps serving.
- The app picks entries. Entries and single mounts state facts as attributes
  (`entry({ attributes })`, `route(spec, { attributes })`) — declaration-layer
  metadata that can never become ambient runtime values — and the app holds the
  rules: `app({ attributes: { include, exclude } })`, where a rule is a bound value or
  a bare attribute meaning the whole family. A carrier is picked iff every selectable
  fact on it matches include and none exclude (exclude wins at both granularities);
  bare carriers are always in; consumer-owned attributes (`select: false`) and flags
  are ignored. Unpicked tags are never seeded into activation contexts. The
  build census applies the rule before generating a target manifest, so an unpicked
  entry's import subtree never enters the artifact; hosts apply the same rule at
  mount, so dev and production agree. Duplicates are checked among picked mounts
  only, and `analyze` reports unpicked entries under `excluded`.
- One package entry. `/app`, `/meta`, and `/runtime` subpaths, the `pumped`/`p` facades,
  `AppConfig.context`/`mapError` (replaced by ambient tags and the `httpError` tag),
  `createAppScope`, the module-level default scheduler backend, and the hardcoded agents
  mounts are removed. The index exports exactly nineteen values — declaration, mount and
  ambient tags, hosts, `analyze`, `HostStartError` — with no Lite re-exports and no
  build internals; Lite primitives import from the `@pumped-fn/lite` peer. It declares
  `sideEffects: false` and never evaluates Vite, a transport, or the scheduler.
- The `pumped` binary owns Vite. `vite.config.ts` is ignored with a warning; overrides
  live in `pumped.config.ts` via `defineConfig({ dir, app, port, vite })`.
- Builds are planned from tags: each target bundles only its entries and imports only
  the hosts those entries need. A CLI artifact ships without an HTTP server or scheduler
  and runs with `@pumped-fn/lite` as its only framework dependency on disk.
- Peer changes: `hono`, `@hono/node-server`, and `@pumped-fn/lite-extension-scheduler`
  are optional peers loaded inside hosts; `vite` moves from peer to dependency of the
  binary. `@pumped-fn/lite-hono` is no longer used anywhere and its package is removed
  from the workspace — the HTTP host owns the request-to-context boundary directly.
