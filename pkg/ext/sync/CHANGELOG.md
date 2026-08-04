# @pumped-fn/lite-extension-sync

## 1.0.2

### Patch Changes

- 344862e: Publish declarations with TypeScript 7.0.2 through tsdown's package-local `tsconfig.dts.json` files, keeping ESM and CommonJS type entrypoints aligned. Legacy Compiler API consumers use the `typescript-api` alias.

## 1.0.1

### Patch Changes

- cb45cc9: Accept one bound tag, flat tag lists, or nested tag lists in every public `tags` configuration. Runtime normalization preserves order and duplicates while stored unit metadata remains flat. Framework, extension, React, and lint adapters accept the same input contract.

## 1.0.0

### Major Changes

- 2e95323: Adopt Lite 6 structured cleanup and listener registration with explicit callback parameters. These packages now require Lite 6 and graduate their pre-1.0 release lines to 1.0.

## 0.2.0

### Minor Changes

- f660565: Add the first sync extension package with an atom-like `sync(...)` primitive, tag-injected runtime transport, memory transport, runtime JSON validation, codec support, revision conflict policy, and a NATS JetStream KV transport adapter.
