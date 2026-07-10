Implemented [telemetry.ts](/tmp/eval-ws-T-4/src/telemetry.ts), [audit.ts](/tmp/eval-ws-T-4/src/audit.ts), [wire.ts](/tmp/eval-ws-T-4/src/wire.ts), [daemon.ts](/tmp/eval-ws-T-4/bin/daemon.ts), and [tests](/tmp/eval-ws-T-4/tests/telemetry.test.ts).

Required command outputs:

```text
$ node_modules/.bin/pumped-lite-lint --max-warnings 0 src bin tests
pumped-lite-lint: 5 files scanned, 0 diagnostics
```

```text
$ npx tsgo --noEmit
```

```text
$ npx vitest run

 RUN  v3.2.7 /tmp/eval-ws-T-4

 ✓ tests/telemetry.test.ts (4 tests) 18ms

 Test Files  1 passed (1)
      Tests  4 passed (4)
   Start at  07:22:13
   Duration  704ms (transform 108ms, setup 0ms, collect 162ms, tests 18ms, environment 0ms, prepare 128ms)
```

The sandbox blocks `npx tsx` from creating its required IPC socket (`EPERM`). The daemon itself passed with the equivalent TSX loader invocation:

```text
$ printf '%s\n' '{"kind":"gps","scooterId":"demo","lat":1,"lng":2,"batteryPct":3}' | node --import tsx bin/daemon.ts
[{"kind":"resolve","name":"fleetState","parent":null,"ok":true,"durationMs":1},{"kind":"exec","name":"report-position","parent":null,"ok":true,"durationMs":3},{"kind":"exec","name":"fleetops.dispatchPickup","parent":"low-battery-sweep","ok":true,"durationMs":1},{"kind":"exec","name":"low-battery-sweep","parent":null,"ok":true,"durationMs":3}]
```