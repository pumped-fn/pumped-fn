Implemented [src/alerts.ts](/tmp/eval2-ws-T-8/src/alerts.ts), [tests/alerts.test.ts](/tmp/eval2-ws-T-8/tests/alerts.test.ts), and [bin/main.ts](/tmp/eval2-ws-T-8/bin/main.ts).

`npx tsx` is blocked by the sandbox’s Unix-socket policy; the equivalent `node --import tsx bin/main.ts` succeeds.

```text
$ node_modules/.bin/pumped-lite-lint --max-warnings 0 src bin tests
pumped-lite-lint: 3 files scanned, 0 diagnostics
```

```text
$ npx tsgo --noEmit
```

```text
$ npx vitest run

 RUN  v3.2.7 /tmp/eval2-ws-T-8

 ✓ tests/alerts.test.ts (3 tests) 10ms

 Test Files  1 passed (1)
      Tests  3 passed (3)
   Start at  09:31:36
   Duration  629ms (transform 111ms, setup 0ms, collect 122ms, tests 10ms, environment 0ms, prepare 157ms)
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
    at file:///tmp/eval2-ws-T-8/node_modules/tsx/dist/cli.mjs:53:31537
    at new Promise (<anonymous>)
    at createIpcServer (file:///tmp/eval2-ws-T-8/node_modules/tsx/dist/cli.mjs:53:31515)
    at async file:///tmp/eval2-ws-T-8/node_modules/tsx/dist/cli.mjs:55:459 {
  code: 'EPERM',
  errno: -1,
  syscall: 'listen',
  address: '/tmp/tsx-1001/15.pipe',
  port: -1
}

Node.js v26.4.0
```

```text
$ node --import tsx bin/main.ts
radio: whiteout conditions
siren: whiteout conditions
{"attempted":2,"delivered":2,"suppressed":false}
{"attempted":0,"delivered":0,"suppressed":true}
```