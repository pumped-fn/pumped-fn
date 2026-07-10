Implemented:

- [src/holdshelf.ts](/tmp/eval-ws-T-2/src/holdshelf.ts)
- [tests/holdshelf.test.ts](/tmp/eval-ws-T-2/tests/holdshelf.test.ts)
- [bin/daemon.ts](/tmp/eval-ws-T-2/bin/daemon.ts)

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

 RUN  v3.2.7 /tmp/eval-ws-T-2

 ✓ tests/holdshelf.test.ts (3 tests) 15ms

 Test Files  1 passed (1)
      Tests  3 passed (3)
   Start at  07:08:15
   Duration  541ms (transform 85ms, setup 0ms, collect 96ms, tests 15ms, environment 0ms, prepare 90ms)
```

```text
$ npx tsx bin/daemon.ts
Error: listen EPERM: operation not permitted /tmp/tsx-1001/15.pipe
```

The last failure is this sandbox blocking tsx CLI’s IPC socket. The equivalent loader execution succeeds:

```text
$ node --import tsx bin/daemon.ts
{"holds":[{"holdId":1,"isbn":"9780140328721","copyId":"copy-1","status":"printed"},{"holdId":2,"isbn":"9780061120084","copyId":"copy-2","status":"printed"},{"holdId":3,"isbn":"9780439139601","copyId":"copy-3","status":"printed"}],"printer":[{"session":1,"slips":[{"holdId":1,"copyId":"copy-1"},{"holdId":2,"copyId":"copy-2"},{"holdId":3,"copyId":"copy-3"}],"closed":"clean"}]}
```