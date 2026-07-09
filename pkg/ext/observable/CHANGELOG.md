# @pumped-fn/lite-extension-observable

## 0.4.0

### Minor Changes

- 14205c6: Observable events now carry a `parentId`, and the OTel sink uses it to nest spans. Each traced execution stamps its span id on its execution context; a nested `ctx.exec` (fn-exec or a child flow) reads the nearest traced ancestor's id via `ctx.data.seek`, so the emitted `Event` records `parentId` (undefined at the root). The OTel sink starts each span under its parent's context, so the flow → nested-exec tree is reconstructed correctly.

  This makes inline `ctx.exec({ fn, name })` tracing — the recommended way to instrument foreign/IO calls — actually useful in OTel: a query traced inside a flow now shows up nested under that flow instead of flat. Attribution is by the explicitly-threaded execution context (no AsyncLocalStorage), so it is concurrency-safe.

## 0.3.0

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

## 0.2.0

### Minor Changes

- f41dff2: Add observable and logging extension packages with succinct tag-injected runtime sinks and policy,
  plus optional OpenTelemetry and Pino backend sink packages.
