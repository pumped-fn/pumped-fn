# @pumped-fn/lite-extension-scheduler

## 1.0.0

### Major Changes

- 2e95323: Adopt Lite 6 structured cleanup and listener registration with explicit callback parameters. These packages now require Lite 6 and graduate their pre-1.0 release lines to 1.0.

## 0.2.0

### Minor Changes

- 1b83ce4: Scheduling as graph nodes with pluggable backends. `schedule()` returns a
  keepAlive atom bound to a `SchedulerBackend` via the backend tag; `inProcess()`
  (croner) ships in core, `nats()` provides durable distributed scheduling over
  JetStream KV (per-run-key locking with TTL takeover, catch-up skip/last/all,
  run history). pumped: jobs entries are schedule atoms (schedule tag removed),
  sibling `meta` exports for route/command, `p` alias + named exports,
  no-handle-spread lint rule.
