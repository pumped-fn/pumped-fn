# @pumped-fn/devtools

## 0.2.6

### Patch Changes

- 252db92: Simplify Extension.Operation types and remove generic from wrap method

  - Consolidated 5 operation kinds (execute, journal, subflow, parallel, resolve) into 2 kinds (execution, resolve)
  - Removed generic type parameter from Extension.wrap method for simpler type signatures
  - Updated all wrapWithExtensions implementations to use type assertions
  - Migrated all tests to new operation type structure
  - Updated documentation for simplified 2-kind operation model
  - Benefits: Simpler mental model, easier AI explanation, more flexible tag-based nesting context

- Updated dependencies [252db92]
- Updated dependencies [5f190c0]
- Updated dependencies [13f84a4]
  - @pumped-fn/core-next@0.5.84

## 0.2.5

### Patch Changes

- Updated dependencies [811926e]
  - @pumped-fn/core-next@0.5.83

## 0.2.4

### Patch Changes

- Updated dependencies [40be7e4]
- Updated dependencies [596bf02]
  - @pumped-fn/core-next@0.5.82

## 0.2.3

### Patch Changes

- Updated dependencies [a1bdb17]
  - @pumped-fn/core-next@0.5.81

## 0.2.2

### Patch Changes

- Updated dependencies [4c115a3]
- Updated dependencies [7b1d5ba]
  - @pumped-fn/core-next@0.5.80

## 0.2.1

### Patch Changes

- Updated dependencies [f93c97c]
  - @pumped-fn/core-next@0.5.79

## 0.2.0

### Minor Changes

- 79af33c: Add IPC transport and standalone CLI binary for multi-process monitoring

  - Implemented IPC transport using Unix sockets for inter-process communication
  - Added standalone `pumped-cli` binary for running devtools as separate process
  - Multi-scope monitoring - track multiple application scopes simultaneously
  - Silent degradation with automatic retry and message buffering
  - Transport abstraction supporting both in-memory and IPC modes

## 0.1.1

### Patch Changes

- Updated dependencies [3fec0d3]
  - @pumped-fn/core-next@0.5.78
