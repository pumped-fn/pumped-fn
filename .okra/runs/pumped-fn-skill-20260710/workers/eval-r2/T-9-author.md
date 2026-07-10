Implemented:

- [src/transcripts.ts](/tmp/eval2-ws-T-9/src/transcripts.ts)
- [tests/transcripts.test.ts](/tmp/eval2-ws-T-9/tests/transcripts.test.ts)
- [bin/backfill.ts](/tmp/eval2-ws-T-9/bin/backfill.ts)

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

 RUN  v3.2.7 /tmp/eval2-ws-T-9

 ✓ tests/transcripts.test.ts (4 tests) 21ms

 Test Files  1 passed (1)
      Tests  4 passed (4)
   Start at  09:36:24
   Duration  651ms (transform 149ms, setup 0ms, collect 159ms, tests 21ms, environment 0ms, prepare 105ms)
```

```text
$ npx tsx bin/backfill.ts
Error: listen EPERM: operation not permitted /tmp/tsx-1001/15.pipe
```

The last failure is the sandbox blocking tsx CLI’s IPC pipe, not the entrypoint. It runs successfully through the equivalent loader:

```text
$ node --import tsx bin/backfill.ts
{"done":["episode-1","episode-2"],"failed":[]}
{"backfill":{"started":1,"succeeded":1,"failed":0},"transcribe-episode":{"started":4,"succeeded":2,"failed":2},"speech.transcribe":{"started":4,"succeeded":2,"failed":2},"backfill.backoff":{"started":2,"succeeded":2,"failed":0}}
```