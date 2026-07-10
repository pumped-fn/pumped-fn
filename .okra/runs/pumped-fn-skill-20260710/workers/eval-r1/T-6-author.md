Implemented:

- `src/climate.ts`
- `tests/climate.test.ts`
- `bin/main.ts`

Lint, typecheck, and tests pass. The `tsx` CLI is blocked by this sandbox’s Unix-socket restriction; the same entrypoint succeeds with `node --import tsx bin/main.ts` and prints:

```text
alert:west
["west"]
```

Verbatim requested command outputs:

```text
$ node_modules/.bin/pumped-lite-lint --max-warnings 0 src bin tests
pumped-lite-lint: 3 files scanned, 0 diagnostics
```

```text
$ npx tsgo --noEmit
```

```text
$ npx vitest run

 RUN  v3.2.7 /tmp/eval-ws-T-6

 ✓ tests/climate.test.ts (5 tests) 13ms

 Test Files  1 passed (1)
      Tests  5 passed (5)
   Start at  07:32:46
   Duration  590ms (transform 75ms, setup 0ms, collect 95ms, tests 13ms, environment 0ms, prepare 101ms)
```

```text
$ npx tsx bin/main.ts
node:net:2145
      const error = new UVExceptionWithHostPort(rval, 'listen', address, port);
                    ^

Error: listen EPERM: operation not permitted /tmp/tsx-1001/15.pipe
    at Server.setupListenHandle [as _listen2] (node:net:2145:21)
    at listenInCluster (node:net:2224:12)
    at Server.listen (node:net:2361:5)
    at file:///tmp/eval-ws-T-6/node_modules/tsx/dist/cli.mjs:53:31537
    at new Promise (<anonymous>)
    at createIpcServer (file:///tmp/eval-ws-T-6/node_modules/tsx/dist/cli.mjs:53:31515)
    at async file:///tmp/eval-ws-T-6/node_modules/tsx/dist/cli.mjs:55:459 {
  code: 'EPERM',
  errno: -1,
  syscall: 'listen',
  address: '/tmp/tsx-1001/15.pipe',
  port: -1
}

Node.js v26.4.0
```