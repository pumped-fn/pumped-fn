Implemented greenhouse control graph and demo.

Written:

- [src/greenhouse.ts](/tmp/eval-ws-T-1/src/greenhouse.ts)
- [tests/greenhouse.test.ts](/tmp/eval-ws-T-1/tests/greenhouse.test.ts)
- [bin/main.ts](/tmp/eval-ws-T-1/bin/main.ts)

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

 RUN  v3.2.7 /tmp/eval-ws-T-1

 ✓ tests/greenhouse.test.ts (6 tests) 19ms

 Test Files  1 passed (1)
      Tests  6 passed (6)
```

```text
$ npx tsx bin/main.ts
Error: listen EPERM: operation not permitted /tmp/tsx-1001/15.pipe
```

The final `tsx` CLI is blocked by this sandbox’s Unix-socket restriction. The same entrypoint succeeds via tsx’s loader:

```text
{"reading":{"temperatureC":23.4},"status":{"siteName":"demo-greenhouse","level":"ok","temperatureC":23.4},"adjustment":{"applied":20,"log":["plan:24","apply:20"]},"outlook":{"siteName":"demo-greenhouse","highC":24}}
```