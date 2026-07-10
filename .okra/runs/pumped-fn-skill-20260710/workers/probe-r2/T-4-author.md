Implemented [telemetry.ts](/tmp/probe-ws-T-4/src/telemetry.ts), [audit.ts](/tmp/probe-ws-T-4/src/audit.ts), [wire.ts](/tmp/probe-ws-T-4/src/wire.ts), [daemon.ts](/tmp/probe-ws-T-4/bin/daemon.ts), and [tests](/tmp/probe-ws-T-4/tests/telemetry.test.ts).

Command outputs:

```text
$ node_modules/.bin/pumped-lite-lint --max-warnings 0 src bin tests
pumped-lite-lint: 5 files scanned, 0 diagnostics
```

```text
$ npx tsgo --noEmit
```

```text
$ npx vitest run

 RUN  v3.2.7 /tmp/probe-ws-T-4

 ✓ tests/telemetry.test.ts (4 tests) 19ms

 Test Files  1 passed (1)
      Tests  4 passed (4)
   Start at  08:29:29
   Duration  782ms (transform 186ms, setup 0ms, collect 209ms, tests 19ms, environment 0ms, prepare 202ms)
```

`npx tsx bin/daemon.ts` is blocked in this sandbox because tsx cannot create its IPC socket (`EPERM` on `/tmp/tsx-1001/*.pipe`). The entrypoint itself ran successfully through the equivalent loader:

```text
$ printf ... | node --import tsx bin/daemon.ts
[{"kind":"resolve","name":"fleetState","parent":null,"ok":true,"durationMs":1},{"kind":"exec","name":"report-position","parent":null,"ok":true,"durationMs":3},{"kind":"exec","name":"fleetops.dispatchPickup","parent":"low-battery-sweep","ok":true,"durationMs":1},{"kind":"exec","name":"low-battery-sweep","parent":null,"ok":true,"durationMs":3}]
{"error":"ParseError: Failed to parse flow input \"report-position\"","cause":"[\n  {\n    \"expected\": \"string\",\n    \"code\": \"invalid_type\",\n    \"path\": [\n      \"cellId\"\n    ],\n    \"message\": \"Invalid input: expected string, received number\"\n  }\n]"}
```