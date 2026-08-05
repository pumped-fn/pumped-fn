# @pumped-fn/sdk-test

In-memory test helpers for `@pumped-fn/sdk`. Every helper keeps `createScope` as the seam.

```text
config.model / modelStub ---------> scalar provider seam
config.attempt / attemptStub -----> streaming provider seam
sessionStoreStub ----------------> configured load and commit ports
sessionKit ----------------------> complete agent turn tag bundle
createScope ----------------------> explicit test-owned session seam
```

```ts
import * as session from "@pumped-fn/sdk/session"
import { createScope } from "@pumped-fn/lite"
import { sessionKit } from "@pumped-fn/sdk-test"

const bundle = sessionKit({
  id: "test-session",
  role: {
    name: "reviewer",
    version: "1",
    instructions: "Review the request.",
    maxRounds: 1,
  },
  respond: {
    events: [{ type: "content_delta", content: "ready" }],
    result: { content: "ready", stop: true },
  },
})
const scope = createScope({ tags: bundle.tags })
const owner = scope.createContext()
await owner.resolve(session.session)

const result = await owner.exec({
  flow: session.run,
  input: {
    work: { id: "review", branchId: "main", role: "reviewer", policy: "all" },
    input: { prompt: "Check this." },
  },
})

await owner.close()
await scope.dispose()
```

Every test creates its own scope and owner context with exactly the extensions, presets, and tags it needs. `sessionKit` supplies the authority, record, clock, turn, store, attempt, role, and validation tags. Resolve `session.session` on the owner before execution, then close the owner and scope in that order.

Pass `respond` to configure `attemptStub`, or pass `attempt` to replace it with a custom flow. Every other tag value can also be replaced through the matching option. The returned `record` and `store` make state checks direct. `validationStub` is the default trivial validation engine and can also be used by tests that wire tags themselves.

`initialRecord`, `testAuthority`, and `modelRequest` supply valid defaults with shallow overrides. `testAuthority` denies all sandbox access unless the test grants it. `modelStub` and `attemptStub` are stable module-level flows configured by `config.model` and `config.attempt`. `attemptStubConfig` supplies the attempt response and implementation tags together. `sessionStoreStub` owns an isolated record map and supplies its config plus named load and commit bindings. None of these helpers creates or caches a scope.

The existing workflow helpers remain: `kit`, `suspense`, `MemoryWorkflowLog`, `MemorySuspenseLog`, and `localRemoteRunner`.

The issue-triage example uses the same scope seam for independent tests of `agent.turn`, evidence backends, verification, publication, and queue concurrency.

## Migration to 4.0.0

| Before | Now |
|---|---|
| hand-written `SessionRecord` literal | `initialRecord(id, authority, overrides?)` |
| full `session.createAuthority` object | `testAuthority(overrides?)` with deny-all defaults |
| eight-field `ModelRequest` literal | `modelRequest(overrides?)` |
| local `validation.standard({ id: "test", toJsonSchema: () => true })` | `validationStub` |
| hand-wired session and agent tag list | `sessionKit(options?).tags` |

## Migration to 3.0.0

3.0.0 tracks the `@pumped-fn/sdk` facade removal. The test helpers no longer own or cache a scope;
each test builds its own `createScope` seam. The scope example above is the current, post-migration
wiring.

| Removed in 2.x | Replacement in 3.0.0 |
|---|---|
| helper-owned scope or singleton | test-owned `createScope({ tags, presets, extensions })` |
| provider mock object | `attemptStubConfig` / `config.attempt` / `attemptStub` |
| session mock object | `sessionStoreStub` with `config`, `binding.load`, and `binding.commit` |

None of these helpers creates or caches a scope, so the migration keeps `createScope` as the only seam.

---
Part of [pumped-fn](https://github.com/pumped-fn/pumped-fn).
