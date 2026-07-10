Implemented [board-link.ts](/tmp/eval-ws-T-10/src/board-link.ts), [board.ts](/tmp/eval-ws-T-10/src/board.ts), [board.ts](/tmp/eval-ws-T-10/bin/board.ts), and [board.test.ts](/tmp/eval-ws-T-10/tests/board.test.ts).

Final command outputs:

```text
pumped-lite-lint: 4 files scanned, 0 diagnostics
```

```text
npx tsgo --noEmit
# (no output; exit 0)
```

```text
 RUN  v3.2.7 /tmp/eval-ws-T-10

 ✓ tests/board.test.ts (6 tests) 18ms

 Test Files  1 passed (1)
      Tests  6 passed (6)
   Start at  07:57:22
   Duration  483ms (transform 84ms, setup 0ms, collect 92ms, tests 18ms, environment 0ms, prepare 140ms)
```

```text
node:net:2145
      const error = new UVExceptionWithHostPort(rval, 'listen', address, port);
                    ^

Error: listen EPERM: operation not permitted /tmp/tsx-1001/213.pipe
...
Node.js v26.4.0
```

The final `tsx` CLI is blocked by this sandbox’s Unix-socket policy before it executes the entrypoint. The entrypoint itself ran successfully with the equivalent loader command and printed:

```json
{"address":"harbor-main","departures":[{"vessel":"North Star","at":"09:15"},{"vessel":"Harbor Runner","at":"09:40"}]}
```