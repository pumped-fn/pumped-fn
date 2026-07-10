Implemented [src/tournament.ts](/tmp/eval-ws-T-7/src/tournament.ts), [tests/tournament.test.ts](/tmp/eval-ws-T-7/tests/tournament.test.ts), and [bin/main.ts](/tmp/eval-ws-T-7/bin/main.ts).

Required command outputs:

```text
$ node_modules/.bin/pumped-lite-lint --max-warnings 0 src bin tests
pumped-lite-lint: 3 files scanned, 0 diagnostics
```

```text
$ npx tsgo --noEmit
```

```text
$ npx vitest run

 RUN  v3.2.7 /tmp/eval-ws-T-7

 ✓ tests/tournament.test.ts (4 tests) 28ms

 Test Files  1 passed (1)
      Tests  4 passed (4)
   Start at  07:39:13
   Duration  585ms (transform 84ms, setup 0ms, collect 67ms, tests 28ms, environment 0ms, prepare 138ms)
```

```text
$ npx tsx bin/main.ts
Error: listen EPERM: operation not permitted /tmp/tsx-1001/15.pipe
```

That final failure is a sandbox restriction on tsx’s IPC socket, not the entrypoint. Verified equivalent loader execution succeeds:

```text
$ node --import tsx bin/main.ts
[{"round":1,"pairings":[["ada","bea"],["cam","dan"]],"bye":null},{"round":2,"pairings":[["ada","bea"],["cam","dan"]],"bye":null}]
```