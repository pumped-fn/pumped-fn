Implemented:

- [src/climate.ts](/tmp/eval2-ws-T-6/src/climate.ts)
- [tests/climate.test.ts](/tmp/eval2-ws-T-6/tests/climate.test.ts)
- [bin/main.ts](/tmp/eval2-ws-T-6/bin/main.ts)

Command outputs:

```text
pumped-lite-lint: 3 files scanned, 0 diagnostics
```

```text
```

```text
 RUN  v3.2.7 /tmp/eval2-ws-T-6

 ✓ tests/climate.test.ts (6 tests) 16ms

 Test Files  1 passed (1)
      Tests  6 passed (6)
   Start at  09:22:35
   Duration  501ms (transform 117ms, setup 0ms, collect 108ms, tests 16ms, environment 0ms, prepare 125ms)
```

`npx tsx bin/main.ts` is blocked by this sandbox’s Unix-socket restriction before it loads the entrypoint:

```text
Error: listen EPERM: operation not permitted /tmp/tsx-1001/15.pipe
```

The equivalent direct runner succeeds:

```text
$ node --import tsx bin/main.ts
alert:east
["east"]
```