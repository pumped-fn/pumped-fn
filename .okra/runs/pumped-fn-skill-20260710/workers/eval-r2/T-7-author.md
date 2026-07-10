Written:

- [src/tournament.ts](/tmp/eval2-ws-T-7/src/tournament.ts)
- [tests/tournament.test.ts](/tmp/eval2-ws-T-7/tests/tournament.test.ts)
- [bin/main.ts](/tmp/eval2-ws-T-7/bin/main.ts)

Lint, typecheck, and tests pass. The `tsx` CLI is blocked by this sandbox’s IPC-socket restriction; `node --import tsx bin/main.ts` runs successfully and prints two rounds.

```text
$ node_modules/.bin/pumped-lite-lint --max-warnings 0 src bin tests
pumped-lite-lint: 3 files scanned, 0 diagnostics
```

```text
$ npx tsgo --noEmit
```

```text
$ npx vitest run

 RUN  v3.2.7 /tmp/eval2-ws-T-7

 ✓ tests/tournament.test.ts (6 tests) 32ms

 Test Files  1 passed (1)
      Tests  6 passed (6)
   Start at  09:26:38
   Duration  631ms (transform 117ms, setup 0ms, collect 143ms, tests 32ms, environment 0ms, prepare 118ms)
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
    at file:///tmp/eval2-ws-T-7/node_modules/tsx/dist/cli.mjs:53:31537
    at new Promise (<anonymous>)
    at createIpcServer (file:///tmp/eval2-ws-T-7/node_modules/tsx/dist/cli.mjs:53:31515)
    at async file:///tmp/eval2-ws-T-7/node_modules/tsx/dist/cli.mjs:55:459 {
  code: 'EPERM',
  errno: -1,
  syscall: 'listen',
  address: '/tmp/tsx-1001/15.pipe',
  port: -1
}

Node.js v26.4.0
```