Implemented [board-link.ts](/tmp/eval2-ws-T-10/src/board-link.ts), [board.ts](/tmp/eval2-ws-T-10/src/board.ts), [board.test.ts](/tmp/eval2-ws-T-10/tests/board.test.ts), and [board.ts](/tmp/eval2-ws-T-10/bin/board.ts).

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

 RUN  v3.2.7 /tmp/eval2-ws-T-10

 ✓ tests/board.test.ts (4 tests) 12ms

 Test Files  1 passed (1)
      Tests  4 passed (4)
   Start at  09:49:18
   Duration  522ms (transform 76ms, setup 0ms, collect 84ms, tests 12ms, environment 0ms, prepare 125ms)
```

```text
$ npx tsx bin/board.ts
node:net:2145
      const error = new UVExceptionWithHostPort(rval, 'listen', address, port);
                    ^

Error: listen EPERM: operation not permitted /tmp/tsx-1001/15.pipe
...
```

The last command is blocked by this sandbox’s Unix-socket restriction. The entrypoint itself runs successfully via `node --import tsx bin/board.ts` and prints the canned JSON frame.