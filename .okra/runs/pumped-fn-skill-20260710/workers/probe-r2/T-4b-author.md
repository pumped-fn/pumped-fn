Written:

- [src/telemetry.ts](/tmp/probe-ws-T-4b/src/telemetry.ts)
- [src/audit.ts](/tmp/probe-ws-T-4b/src/audit.ts)
- [src/wire.ts](/tmp/probe-ws-T-4b/src/wire.ts)
- [bin/daemon.ts](/tmp/probe-ws-T-4b/bin/daemon.ts)
- [tests/telemetry.test.ts](/tmp/probe-ws-T-4b/tests/telemetry.test.ts)

Final command outputs:

```text
$ node_modules/.bin/pumped-lite-lint --max-warnings 0 src bin tests
pumped-lite-lint: 5 files scanned, 0 diagnostics
```

```text
$ npx tsgo --noEmit
```

```text
$ npx vitest run

 RUN  v3.2.7 /tmp/probe-ws-T-4b

 ✓ tests/telemetry.test.ts (4 tests) 23ms

 Test Files  1 passed (1)
      Tests  4 passed (4)
   Start at  08:42:59
   Duration  705ms (transform 97ms, setup 0ms, collect 175ms, tests 23ms, environment 0ms, prepare 123ms)
```

```text
$ printf ... | npx tsx bin/daemon.ts
node:net:2145
      const error = new UVExceptionWithHostPort(rval, 'listen', address, port);
                    ^

Error: listen EPERM: operation not permitted /tmp/tsx-1001/17.pipe
...
```

The final command is blocked by this sandbox forbidding tsx’s local IPC socket. The same daemon executed successfully via `node --import tsx bin/daemon.ts`, including field-named rejection output and JSON audit trail.