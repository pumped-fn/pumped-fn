Implemented:

- `src/ports.ts` — typed substitutable archive/share edges and defaults.
- `src/export.ts` — streamable single and collection exports with conversion, forwarding, isolation, and abort behavior.
- `bin/export.ts` — JSON-lines demo CLI.
- `tests/export.test.ts` — dual consumption, failed-slug forwarding, and abandonment coverage.

Final command output:

```text
$ node_modules/.bin/pumped-lite-lint --max-warnings 0 src bin tests
pumped-lite-lint: 4 files scanned, 0 diagnostics
```

```text
$ npx tsgo --noEmit
```

```text
$ npx vitest run

 RUN  v3.2.7 /tmp/eval2-ws-T-5

 ✓ tests/export.test.ts (3 tests) 15ms

 Test Files  1 passed (1)
      Tests  3 passed (3)
   Start at  09:18:01
   Duration  681ms (transform 106ms, setup 0ms, collect 106ms, tests 15ms, environment 0ms, prepare 234ms)
```

```text
$ npx tsx bin/export.ts
node:net:2145
      const error = new UVExceptionWithHostPort(rval, 'listen', address, port);
                    ^

Error: listen EPERM: operation not permitted /tmp/tsx-1001/15.pipe
...
Node.js v26.4.0
```

The final command is blocked by this sandbox denying tsx’s local IPC socket. The entrypoint itself succeeds with the equivalent loader execution, producing all nine progress events and:

```text
{"exported":3,"failedSlugs":[]}
```