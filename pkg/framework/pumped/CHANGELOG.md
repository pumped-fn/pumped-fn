# @pumped-fn/pumped

## 1.0.0

### Major Changes

- 3c80d40: One entry adapter, tags pick the hosts, single package entry.

  An application entry is now declared, not inferred from a file location plus a sibling
  `meta` export:

  ```ts
  export default entry({
    flow: greet,
    tags: [
      route({ method: "GET", path: "/greet" }),
      command({ name: "greet" }),
    ],
  });
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

### Patch Changes

- @pumped-fn/lite-hmr@1.0.3

## 0.3.2

### Patch Changes

- 1a0a8ee: Fix three defects that only surface when the framework is consumed from outside this repository.

  **`pumped dev` no longer answers discovered `GET` routes with 404.** The plugin registers its request handler as a Vite _post_ middleware, so Vite's own html-fallback and 404 middlewares answered every `GET` before pumped saw it. `POST` routes were unaffected, which hid the split: the same app served `GET /list` correctly from `dist/server.mjs` and returned `404 Not Found` under `pumped dev`. Pumped now uses Vite's `"custom"` app type because it owns the request pipeline and has no HTML fallback. If an application explicitly sets another app type, Pumped warns with the ignored value before using `"custom"`.

  **`analyze()` accepts an entry flow that declares `faults`.** `ManifestEntry.flow` was declared `Lite.Flow<any, any>`, which leaves the fault and yield type parameters at their `never` defaults, so passing a flow built with `faults: typed<F>()` — the pattern the README recommends — failed to typecheck. It is now `Lite.Flow<any, any, any, any>`. Generated manifests are emitted JavaScript and were never affected; this only bit hand-written `analyze()` calls and tests.

  **Production servers and CLIs no longer require `vite` at runtime.** The generated entries imported the package index, which re-exports the Vite plugin and therefore pulled `vite` into the production module graph — removing `vite` from a deployment made `node dist/server.mjs` fail with `ERR_MODULE_NOT_FOUND`. A new `@pumped-fn/pumped/runtime` subpath exports only what a running application needs (`createServer`, `createAppScope`, `runCli`, `runJobs`, `runWorkflows`, `normalizeAgentEntry`, `normalizeApp`, and the route/command/workflow/job tags), and the generated server and CLI entries now import from it. The package index keeps every existing export, so nothing consumers import today changes.

  - @pumped-fn/lite-hmr@1.0.3
  - @pumped-fn/lite-extension-scheduler@1.0.2

## 0.3.1

### Patch Changes

- 344862e: Publish declarations with TypeScript 7.0.2 through tsdown's package-local `tsconfig.dts.json` files, keeping ESM and CommonJS type entrypoints aligned. Legacy Compiler API consumers use the `typescript-api` alias.
- Updated dependencies [344862e]
  - @pumped-fn/lite-hmr@1.0.3
  - @pumped-fn/lite-extension-scheduler@1.0.2

## 0.3.0

### Minor Changes

- 6b853ee: Add lightweight app and metadata entrypoints, deterministic named app composition and selection, target-specific production manifests, and truthful static analysis of declared graph edges.

## 0.2.2

### Patch Changes

- cb45cc9: Accept one bound tag, flat tag lists, or nested tag lists in every public `tags` configuration. Runtime normalization preserves order and duplicates while stored unit metadata remains flat. Framework, extension, React, and lint adapters accept the same input contract.
- Updated dependencies [cb45cc9]
  - @pumped-fn/lite-extension-scheduler@1.0.1
  - @pumped-fn/lite-hmr@1.0.2

## 0.2.1

### Patch Changes

- 2e95323: Document exported interfaces and align callback registrations with Lite's explicit trailing-parameter contract. Compatible packages widen their peer ranges to include Lite 6 and the Lite React 3.0 release line.
- Updated dependencies [b10849f]
- Updated dependencies [2e95323]
- Updated dependencies [2e95323]
  - @pumped-fn/lite-hmr@1.0.2
  - @pumped-fn/lite-extension-scheduler@1.0.0

## 0.2.0

### Minor Changes

- 1b83ce4: Scheduling as graph nodes with pluggable backends. `schedule()` returns a
  keepAlive atom bound to a `SchedulerBackend` via the backend tag; `inProcess()`
  (croner) ships in core, `nats()` provides durable distributed scheduling over
  JetStream KV (per-run-key locking with TTL takeover, catch-up skip/last/all,
  run history). pumped: jobs entries are schedule atoms (schedule tag removed),
  sibling `meta` exports for route/command, `p` alias + named exports,
  no-handle-spread lint rule.

### Patch Changes

- Updated dependencies [1b83ce4]
  - @pumped-fn/lite-extension-scheduler@0.2.0

## 0.1.0

### Minor Changes

- 80e17f0: The pumped meta-framework and typed faults.

  `@pumped-fn/pumped` (new): vite-based scope compiler — discovery dirs
  (server/, cli/, jobs/, agents/, workflows/) assemble one lite scope via a
  generated virtual manifest, driven per run mode (dev with module-runner HMR,
  build to per-target bundles, tests bypass the framework entirely). Includes
  `mapError` edge seam, jobRun/workflowRun tags, croner-backed jobs runner.

  `@pumped-fn/lite`: `Flow<Output, Input, Fault>` with `faults: typed<F>()`,
  `ctx.fail(fault)` throwing `FlowFault`, `isFault` guard and
  `Lite.Utils.FaultsOf`. Backward compatible — fault param defaults to never.

  Extensions: observable/logging error events carry the `FlowFault` payload
  (`fault` field) so planned failures are structurally distinguishable.

  `@pumped-fn/lite-lint`: graph-coverage rule family — no-implicit-tag-read,
  no-naked-globals, no-module-state, prefer-destructured-deps,
  no-untyped-throw, no-swallowed-error — plus per-rule severity config and
  --max-warnings.

  `@pumped-fn/sdk*`: renamed from `@pumped-fn/agent-sdk*` — the generic
  runtime-primitive toolkit counterpart to pumped; agents/models are one
  primitive family. API unchanged.

### Patch Changes

- @pumped-fn/lite-hmr@1.0.1
