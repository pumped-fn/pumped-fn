# @pumped-fn/lite-extension-logging-pino

## 1.0.2

### Patch Changes

- 344862e: Publish declarations with TypeScript 7.0.2 through tsdown's package-local `tsconfig.dts.json` files, keeping ESM and CommonJS type entrypoints aligned. Legacy Compiler API consumers use the `typescript-api` alias.

## 1.0.1

### Patch Changes

- 2e95323: Document exported interfaces and align callback registrations with Lite's explicit trailing-parameter contract. Compatible packages widen their peer ranges to include Lite 6 and the Lite React 3.0 release line.

## 1.0.0

### Patch Changes

- Updated dependencies [80e17f0]
  - @pumped-fn/lite-extension-logging@0.3.0

## 0.2.0

### Minor Changes

- f41dff2: Add observable and logging extension packages with succinct tag-injected runtime sinks and policy,
  plus optional OpenTelemetry and Pino backend sink packages.
