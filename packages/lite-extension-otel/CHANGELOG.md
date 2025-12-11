# @pumped-fn/lite-extension-otel

## 0.1.0

### Minor Changes

- 2bea2be: Add OpenTelemetry extension for distributed tracing, metrics, and context propagation

  - Tracing: Automatic span creation for flows and atoms with hierarchical parent-child relationships
  - Metrics: Record `pumped.atom.resolution_ms`, `pumped.flow.execution_ms` histograms and `pumped.errors` counter
  - Context propagation: W3C Trace Context helpers (`extractContext`, `injectContext`, `getCurrentSpan`)
  - Filtering: Optional `atomFilter` and `flowFilter` to selectively trace operations
  - Error handling: Automatic exception recording on spans with proper status codes
