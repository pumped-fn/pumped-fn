# @pumped-fn/devtools

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
