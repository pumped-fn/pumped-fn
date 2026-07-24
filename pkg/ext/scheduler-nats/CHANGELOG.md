# @pumped-fn/lite-extension-scheduler-nats

## 1.0.1

### Patch Changes

- 2e95323: Document exported interfaces and align callback registrations with Lite's explicit trailing-parameter contract. Compatible packages widen their peer ranges to include Lite 6 and the Lite React 3.0 release line.

## 1.0.0

### Minor Changes

- 1b83ce4: Scheduling as graph nodes with pluggable backends. `schedule()` returns a
  keepAlive atom bound to a `SchedulerBackend` via the backend tag; `inProcess()`
  (croner) ships in core, `nats()` provides durable distributed scheduling over
  JetStream KV (per-run-key locking with TTL takeover, catch-up skip/last/all,
  run history). pumped: jobs entries are schedule atoms (schedule tag removed),
  sibling `meta` exports for route/command, `p` alias + named exports,
  no-handle-spread lint rule.

### Patch Changes

- Updated dependencies [1b83ce4]
  - @pumped-fn/lite-extension-scheduler@0.2.0
