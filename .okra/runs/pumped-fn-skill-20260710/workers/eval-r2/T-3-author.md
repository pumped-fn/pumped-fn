Implemented:

- [src/observatory.ts](/tmp/eval2-ws-T-3/src/observatory.ts) — instrument/archive atoms, flows, scheduled jobs.
- [src/backend.ts](/tmp/eval2-ws-T-3/src/backend.ts) — durable injected scheduler backend.
- [tests/observatory.test.ts](/tmp/eval2-ws-T-3/tests/observatory.test.ts) — overlap, replay, rejection tests.
- [bin/daemon.ts](/tmp/eval2-ws-T-3/bin/daemon.ts) — two-phase JSON demo.

Final command outputs:

```text
$ node_modules/.bin/pumped-lite-lint --max-warnings 0 src bin tests
pumped-lite-lint: 4 files scanned, 0 diagnostics
```

```text
$ npx tsgo --noEmit
```

```text
$ npx vitest run

 RUN  v3.2.7 /tmp/eval2-ws-T-3

 ✓ tests/observatory.test.ts (3 tests) 17ms

 Test Files  1 passed (1)
      Tests  3 passed (3)
   Start at  09:05:13
   Duration  555ms (transform 75ms, setup 0ms, collect 103ms, tests 17ms, environment 0ms, prepare 99ms)
```

`npx tsx bin/daemon.ts` is blocked in this sandbox because `tsx` attempts to open a Unix IPC socket (`EPERM`). The equivalent loader execution succeeds:

```text
$ node --import tsx bin/daemon.ts
{"captureReplayExposures":0,"missedUploadRuns":3,"missedUploadManifests":[[],[],[]]}
```