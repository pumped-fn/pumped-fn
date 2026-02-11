# @pumped-fn/lite-extension-otel

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
