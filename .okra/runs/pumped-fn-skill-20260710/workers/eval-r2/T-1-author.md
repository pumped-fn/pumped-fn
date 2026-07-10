Implemented:

- `src/greenhouse.ts`
- `bin/main.ts`
- `tests/greenhouse.test.ts`

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

 RUN  v3.2.7 /tmp/eval2-ws-T-1

 ✓ tests/greenhouse.test.ts (4 tests) 16ms

 Test Files  1 passed (1)
      Tests  4 passed (4)
```

```text
$ npx tsx bin/main.ts
Error: listen EPERM: operation not permitted /tmp/tsx-1001/15.pipe
```

The `tsx` CLI cannot create its IPC socket in this sandbox. The entrypoint itself runs successfully with the equivalent loader:

```text
{"status":{"siteName":"demo-greenhouse","level":"alert","temperatureC":25},"adjustment":{"applied":50,"log":["plan:50","apply:50"]},"outlook":{"siteName":"demo-greenhouse","highC":25}}
```