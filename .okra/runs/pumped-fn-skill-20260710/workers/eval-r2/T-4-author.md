Implemented:

- [src/telemetry.ts](/tmp/eval2-ws-T-4/src/telemetry.ts)
- [src/audit.ts](/tmp/eval2-ws-T-4/src/audit.ts)
- [src/wire.ts](/tmp/eval2-ws-T-4/src/wire.ts)
- [bin/daemon.ts](/tmp/eval2-ws-T-4/bin/daemon.ts)
- [tests/telemetry.test.ts](/tmp/eval2-ws-T-4/tests/telemetry.test.ts)

Final command output:

```text
$ node_modules/.bin/pumped-lite-lint --max-warnings 0 src bin tests
pumped-lite-lint: 5 files scanned, 0 diagnostics
```

```text
$ npx tsgo --noEmit
```

```text
$ npx vitest run

 RUN  v3.2.7 /tmp/eval2-ws-T-4

 ✓ tests/telemetry.test.ts (5 tests) 22ms

 Test Files  1 passed (1)
      Tests  5 passed (5)
```

The exact `npx tsx` smoke command is blocked by this sandbox’s Unix-socket policy (`EPERM` creating `/tmp/tsx-*/…pipe`). The equivalent non-IPC invocation succeeds:

```text
$ printf '%s\n' '{"kind":"cell","scooterId":"s1","cellId":"c1","batteryPct":4}' | node --import tsx bin/daemon.ts
[{"kind":"resolve","name":"fleetStateFactory","parent":null,"ok":true,"durationMs":0},{"kind":"exec","name":"report-position","parent":null,"ok":true,"durationMs":0},{"kind":"exec","name":"fleetops.dispatchPickup","parent":"low-battery-sweep","ok":true,"durationMs":0},{"kind":"exec","name":"low-battery-sweep","parent":null,"ok":true,"durationMs":0}]
```