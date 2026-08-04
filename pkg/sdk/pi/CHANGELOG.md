# @pumped-fn/sdk-pi

## 3.0.1

### Patch Changes

- 344862e: Publish declarations with TypeScript 7.0.2 through tsdown's package-local `tsconfig.dts.json` files, keeping ESM and CommonJS type entrypoints aligned. Legacy Compiler API consumers use the `typescript-api` alias.

## 3.0.0

### Major Changes

- 2e95323: Add the in-process pi-ai provider with catalog validation, supported-model discovery, native tool mapping, and resolved tool schemas. Provider-neutral streaming attempts normalize text, reasoning, and lifecycle events; scalar turns drain the same stream. Consumer cancellation aborts the producer, and session provenance and authority are validated before execution.
