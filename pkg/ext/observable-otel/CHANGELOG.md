# @pumped-fn/lite-extension-observable-otel

## 2.0.0

### Minor Changes

- 14205c6: Observable events now carry a `parentId`, and the OTel sink uses it to nest spans. Each traced execution stamps its span id on its execution context; a nested `ctx.exec` (fn-exec or a child flow) reads the nearest traced ancestor's id via `ctx.data.seek`, so the emitted `Event` records `parentId` (undefined at the root). The OTel sink starts each span under its parent's context, so the flow → nested-exec tree is reconstructed correctly.

  This makes inline `ctx.exec({ fn, name })` tracing — the recommended way to instrument foreign/IO calls — actually useful in OTel: a query traced inside a flow now shows up nested under that flow instead of flat. Attribution is by the explicitly-threaded execution context (no AsyncLocalStorage), so it is concurrency-safe.

### Patch Changes

- Updated dependencies [14205c6]
  - @pumped-fn/lite-extension-observable@0.4.0

## 1.0.0

### Patch Changes

- Updated dependencies [80e17f0]
  - @pumped-fn/lite-extension-observable@0.3.0

## 0.2.0

### Minor Changes

- f41dff2: Add observable and logging extension packages with succinct tag-injected runtime sinks and policy,
  plus optional OpenTelemetry and Pino backend sink packages.
