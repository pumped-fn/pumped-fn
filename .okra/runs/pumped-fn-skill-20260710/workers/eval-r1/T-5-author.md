Implemented [ports.ts](/tmp/eval-ws-T-5/src/ports.ts), [export.ts](/tmp/eval-ws-T-5/src/export.ts), [export.ts](/tmp/eval-ws-T-5/bin/export.ts), and [export.test.ts](/tmp/eval-ws-T-5/tests/export.test.ts).

Three required gates pass. `npx tsx` is blocked by this sandbox denying tsx’s local IPC socket; the equivalent direct loader command succeeds and prints all progress plus `{ "exported": 3 }`.

```text
$ node_modules/.bin/pumped-lite-lint --max-warnings 0 src bin tests
pumped-lite-lint: 4 files scanned, 0 diagnostics
```

```text
$ npx tsgo --noEmit
```

```text
$ npx vitest run

 RUN  v3.2.7 /tmp/eval-ws-T-5

 ✓ tests/export.test.ts (3 tests) 14ms

 Test Files  1 passed (1)
      Tests  3 passed (3)
   Start at  07:28:09
   Duration  519ms (transform 78ms, setup 0ms, collect 80ms, tests 14ms, environment 0ms, prepare 113ms)
```

```text
$ npx tsx bin/export.ts
Error: listen EPERM: operation not permitted /tmp/tsx-1001/15.pipe
```

```text
$ node --import tsx bin/export.ts
{"slug":"granola","stage":"fetched"}
{"slug":"granola","stage":"converted"}
{"slug":"granola","stage":"shared","id":"shared-1"}
{"slug":"soda-bread","stage":"fetched"}
{"slug":"soda-bread","stage":"converted"}
{"slug":"soda-bread","stage":"shared","id":"shared-2"}
{"slug":"pesto","stage":"fetched"}
{"slug":"pesto","stage":"converted"}
{"slug":"pesto","stage":"shared","id":"shared-3"}
{"exported":3,"failedSlugs":[]}
```