# @pumped-fn/pumped

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
