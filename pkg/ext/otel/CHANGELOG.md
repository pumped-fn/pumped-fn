# @pumped-fn/lite-extension-otel

## 2.0.0

### Major Changes

- b366df0: Add tag-first agent workflow helpers and tighten context tag handling across lite primitives.

  Move serializability policy out of lite core, remove the experimental primitive `use` surface, make `workflowRun()` a composable workflow tag, expose workflow and agent runtime contracts as required tags, and split workflow replay/logging from agent remote routing.

  Preserve exec extension async error semantics, make the lite CLI bin install-safe before build, and suppress the lite-hmr CJS import.meta build warning.

  Upgrade the repo build/test toolchain for the Vite 8 ecosystem, remove the stale docs site generation path, and refresh affected package build metadata.

  Remove the unmaintained `@pumped-fn/lite-devtools-server` package.

  Breaking extension note: `wrapExec` now wraps dependency resolution as well as factories so extensions can install tags before deps resolve. `ResolveEvent` now carries atom resolve context and resource context shapes explicitly.

## 1.0.0

### Patch Changes

- Updated dependencies [e87f8c9]
  - @pumped-fn/lite@2.0.0

## 0.2.0

### Minor Changes

- 9e1f827: Add `name` property to ExecutionContext for extension visibility

  - ExecutionContext now exposes `name: string | undefined` (lazy-computed)
  - Name resolution: exec name > flow name > undefined
  - OTEL extension uses `ctx.name` with configurable `defaultFlowName` fallback

## 0.1.0

### Minor Changes

- 2bea2be: Add OpenTelemetry extension for distributed tracing, metrics, and context propagation

  - Tracing: Automatic span creation for flows and atoms with hierarchical parent-child relationships
  - Metrics: Record `pumped.atom.resolution_ms`, `pumped.flow.execution_ms` histograms and `pumped.errors` counter
  - Context propagation: W3C Trace Context helpers (`extractContext`, `injectContext`, `getCurrentSpan`)
  - Filtering: Optional `atomFilter` and `flowFilter` to selectively trace operations
  - Error handling: Automatic exception recording on spans with proper status codes
