Implemented [observatory.ts](/tmp/eval-ws-T-3/src/observatory.ts), [backend.ts](/tmp/eval-ws-T-3/src/backend.ts), [tests](/tmp/eval-ws-T-3/tests/observatory.test.ts), and [daemon.ts](/tmp/eval-ws-T-3/bin/daemon.ts).

Required command outputs:

```text
$ node_modules/.bin/pumped-lite-lint --max-warnings 0 src bin tests
pumped-lite-lint: 4 files scanned, 0 diagnostics
```

```text
$ npx tsgo --noEmit
```

```text
$ npx vitest run
 RUN  v3.2.7 /tmp/eval-ws-T-3

 ✓ tests/observatory.test.ts (3 tests) 12ms

 Test Files  1 passed (1)
      Tests  3 passed (3)
```

`npx tsx bin/daemon.ts` is blocked by this sandbox’s prohibition on tsx’s internal Unix IPC socket (`EPERM`). The equivalent tsx loader execution succeeds:

```text
$ node --import tsx bin/daemon.ts
{"exposures":1,"uploadRuns":4,"restartUploadRuns":3,"manifests":[[1],[],[],[]]}
```