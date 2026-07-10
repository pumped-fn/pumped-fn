Written: [src/alerts.ts](/tmp/eval-ws-T-8/src/alerts.ts), [tests/alerts.test.ts](/tmp/eval-ws-T-8/tests/alerts.test.ts), [bin/main.ts](/tmp/eval-ws-T-8/bin/main.ts).

Three required gates pass. `npx tsx` is blocked by this sandbox’s Unix-socket restriction; the equivalent direct tsx loader succeeds.

```text
$ node_modules/.bin/pumped-lite-lint --max-warnings 0 src bin tests
pumped-lite-lint: 3 files scanned, 0 diagnostics
```

```text
$ npx tsgo --noEmit
```

```text
$ npx vitest run

 RUN  v3.2.7 /tmp/eval-ws-T-8

 ✓ tests/alerts.test.ts (4 tests) 11ms

 Test Files  1 passed (1)
      Tests  4 passed (4)
```

```text
$ npx tsx bin/main.ts
Error: listen EPERM: operation not permitted /tmp/tsx-1001/211.pipe
```

```text
$ node --import tsx bin/main.ts
radio: heavy snow
siren: heavy snow
{"attempted":2,"delivered":2,"suppressed":false}
{"attempted":0,"delivered":0,"suppressed":true}
```