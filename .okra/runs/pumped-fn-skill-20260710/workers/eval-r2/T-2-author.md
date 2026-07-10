Implemented:

- [src/holdshelf.ts](/tmp/eval2-ws-T-2/src/holdshelf.ts) — all required flows, atomic shelf state, outcome-bound sessions, jam handling, dispatcher/shutdown.
- [tests/holdshelf.test.ts](/tmp/eval2-ws-T-2/tests/holdshelf.test.ts) — recording, batches, concurrent duplicates, draining, jams, dispatcher shutdown.
- [bin/daemon.ts](/tmp/eval2-ws-T-2/bin/daemon.ts) — runnable demo and SIGINT stop handler.

Command outputs:

```text
$ node_modules/.bin/pumped-lite-lint --max-warnings 0 src bin tests
pumped-lite-lint: 3 files scanned, 0 diagnostics
```

```text
$ npx tsgo --noEmit
```

```text
$ npx vitest run

 RUN  v3.2.7 /tmp/eval2-ws-T-2

 ✓ tests/holdshelf.test.ts (4 tests) 18ms

 Test Files  1 passed (1)
      Tests  4 passed (4)
   Start at  08:58:49
   Duration  474ms (transform 99ms, setup 0ms, collect 83ms, tests 18ms, environment 0ms, prepare 143ms)
```

```text
$ npx tsx bin/daemon.ts
node:net:2145
      const error = new UVExceptionWithHostPort(rval, 'listen', address, port);
                    ^

Error: listen EPERM: operation not permitted /tmp/tsx-1001/15.pipe
...
```

The last failure is this sandbox blocking `tsx`’s Unix IPC socket. The same entrypoint succeeds through the equivalent loader invocation:

```text
$ node --import tsx bin/daemon.ts
{"holds":[{"holdId":1,"isbn":"9780000000001","copyId":"copy-1","status":"printed"},{"holdId":2,"isbn":"9780000000002","copyId":"copy-2","status":"printed"},{"holdId":3,"isbn":"9780000000003","copyId":"copy-3","status":"printed"}],"printer":[{"session":1,"slips":[{"holdId":1,"copyId":"copy-1"}],"closed":"clean"},{"session":2,"slips":[{"holdId":2,"copyId":"copy-2"},{"holdId":3,"copyId":"copy-3"}],"closed":"clean"}]}
```