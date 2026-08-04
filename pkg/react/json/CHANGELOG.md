# @pumped-fn/lite-react-json-render

## 0.1.4

### Patch Changes

- 344862e: Publish declarations with TypeScript 7.0.2 through tsdown's package-local `tsconfig.dts.json` files, keeping ESM and CommonJS type entrypoints aligned. Legacy Compiler API consumers use the `typescript-api` alias.

## 0.1.3

### Patch Changes

- cb45cc9: Accept one bound tag, flat tag lists, or nested tag lists in every public `tags` configuration. Runtime normalization preserves order and duplicates while stored unit metadata remains flat. Framework, extension, React, and lint adapters accept the same input contract.

## 0.1.2

### Patch Changes

- 2e95323: Document exported interfaces and align callback registrations with Lite's explicit trailing-parameter contract. Compatible packages widen their peer ranges to include Lite 6 and the Lite React 3.0 release line.

## 0.1.1

### Patch Changes

- 8e8632f: Sunset: superseded by the owned strict render contract (`@pumped-fn/lite-render-core` + `@pumped-fn/lite-render-react`). Kept as json-render compatibility / prior art; no new features.

## 0.1.0

### Minor Changes

- 1bb9f3b: Add the dedicated json-render adapter package for scopedValue-backed controlled state and Lite flow-backed action handlers.
