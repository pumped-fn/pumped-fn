# @pumped-fn/lite-extension-sync-nats

## 1.0.1

### Patch Changes

- 2e95323: Document exported interfaces and align callback registrations with Lite's explicit trailing-parameter contract. Compatible packages widen their peer ranges to include Lite 6 and the Lite React 3.0 release line.

## 1.0.0

### Minor Changes

- f660565: Add the first sync extension package with an atom-like `sync(...)` primitive, tag-injected runtime transport, memory transport, runtime JSON validation, codec support, revision conflict policy, and a NATS JetStream KV transport adapter.

### Patch Changes

- Updated dependencies [f660565]
  - @pumped-fn/lite-extension-sync@0.2.0
