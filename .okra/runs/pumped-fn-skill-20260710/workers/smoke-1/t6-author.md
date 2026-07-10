Written:

- [src/climate.ts](/tmp/smoke-T-6/src/climate.ts)
- [tests/climate.test.ts](/tmp/smoke-T-6/tests/climate.test.ts)
- [bin/main.ts](/tmp/smoke-T-6/bin/main.ts)

Final command outputs:

```text
pumped-lite-lint: 3 files scanned, 0 diagnostics
```

```text
```

```text
 RUN  v3.2.7 /tmp/smoke-T-6

 ✓ tests/climate.test.ts (6 tests) 9ms

 Test Files  1 passed (1)
      Tests  6 passed (6)
   Start at  05:59:09
   Duration  500ms (transform 73ms, setup 0ms, collect 79ms, tests 9ms, environment 0ms, prepare 94ms)
```

```text
node:net:2145
      const error = new UVExceptionWithHostPort(rval, 'listen', address, port);
                    ^

Error: listen EPERM: operation not permitted /tmp/tsx-1001/15.pipe
    at Server.setupListenHandle [as _listen2] (node:net:2145:21)
    at listenInCluster (node:net:2145:21)
    at Server.listen (node:net:2145:21)
    at file:///tmp/smoke-T-6/node_modules/tsx/dist/cli.mjs:53:31537
    at new Promise (<anonymous>)
    at createIpcServer (file:///tmp/smoke-T-6/node_modules/tsx/dist/cli.mjs:53:31515)
    at async file:///tmp/smoke-T-6/node_modules/tsx/dist/cli.mjs:55:459 {
  code: 'EPERM',
  errno: -1,
  syscall: 'listen',
  address: '/tmp/tsx-1001/15.pipe',
  port: -1
}

Node.js v26.4.0
```

The final failure is a sandbox restriction on tsx’s IPC socket, not the entrypoint. `node --import tsx bin/main.ts` runs successfully and prints:

```text
alert:east
["east"]
```