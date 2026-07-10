Implemented:

- [src/transcripts.ts](/tmp/eval-ws-T-9/src/transcripts.ts) — flows, wiring tags, staged retry, persistent store, ledger.
- [tests/transcripts.test.ts](/tmp/eval-ws-T-9/tests/transcripts.test.ts) — busy retry, permanent failure, exhaustion, ledger, read-back.
- [bin/backfill.ts](/tmp/eval-ws-T-9/bin/backfill.ts) — canned demo.

Final command outputs:

```text
$ node_modules/.bin/pumped-lite-lint --max-warnings 0 src bin tests
pumped-lite-lint: 3 files scanned, 0 diagnostics
```

```text
$ npx tsgo --noEmit
```

```text
$ npx vitest run

 RUN  v3.2.7 /tmp/eval-ws-T-9

 ✓ tests/transcripts.test.ts (3 tests) 10ms

 Test Files  1 passed (1)
      Tests  3 passed (3)
   Start at  07:47:27
   Duration  539ms (transform 80ms, setup 0ms, collect 78ms, tests 10ms, environment 0ms, prepare 122ms)
```

```text
$ node --import tsx bin/backfill.ts
{"result":{"done":["episode-1","episode-2"],"failed":[]},"ledger":{"backfill":{"started":1,"succeeded":1,"failed":0},"transcribe-episode":{"started":4,"succeeded":2,"failed":2},"speech.transcribe":{"started":4,"succeeded":2,"failed":2},"backoff.wait":{"started":2,"succeeded":2,"failed":0}}}
```

`npx tsx bin/backfill.ts` is blocked by this sandbox’s prohibition on Unix-socket listening (`EPERM`); the equivalent `node --import tsx` execution above ran the entrypoint successfully.