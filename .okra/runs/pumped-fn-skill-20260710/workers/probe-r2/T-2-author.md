Implemented [holdshelf.ts](/tmp/probe-ws-T-2/src/holdshelf.ts), [daemon.ts](/tmp/probe-ws-T-2/bin/daemon.ts), and [holdshelf.test.ts](/tmp/probe-ws-T-2/tests/holdshelf.test.ts).

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

 RUN  v3.2.7 /tmp/probe-ws-T-2

 ✓ tests/holdshelf.test.ts (4 tests) 13ms

 Test Files  1 passed (1)
      Tests  4 passed (4)
   Start at  08:22:00
   Duration  620ms (transform 63ms, setup 0ms, collect 69ms, tests 13ms, environment 2ms, prepare 137ms)
```

```text
$ npx tsx bin/daemon.ts
node:net:2145
      const error = new UVExceptionWithHostPort(rval, 'listen', address, port);
                    ^

Error: listen EPERM: operation not permitted /tmp/tsx-1001/15.pipe
...
```

The last failure is the sandbox blocking `tsx`’s required IPC socket. The entrypoint itself succeeds with the same loader:

```text
$ node --import tsx bin/daemon.ts
{"holds":[{"holdId":1,"isbn":"9780140328721","copyId":"copy-1","status":"printed"},{"holdId":2,"isbn":"9780439708180","copyId":"copy-2","status":"printed"},{"holdId":3,"isbn":"9780547928227","copyId":"copy-3","status":"printed"}],"printer":[{"session":1,"slips":[{"holdId":1,"copyId":"copy-1"},{"holdId":2,"copyId":"copy-2"},{"holdId":3,"copyId":"copy-3"}],"closed":"clean"}]}
```