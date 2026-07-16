# @pumped-fn/sdk-test

In-memory test helpers for `@pumped-fn/sdk`. Every helper keeps `createScope` as the seam.

```text
config.model / modelStub ---------> scalar provider seam
config.attempt / attemptStub -----> streaming provider seam
sessionStoreStub ----------------> configured load and commit ports
createScope ----------------------> explicit test-owned session seam
```

```ts
import * as session from "@pumped-fn/sdk/session"
import { createScope } from "@pumped-fn/lite"
import {
  attemptStubConfig,
  sessionStoreStub,
} from "@pumped-fn/sdk-test"

const authority = session.createAuthority({
  tenant: "tenant-a",
  roots: ["/workspace"],
  permissions: [],
  tools: [],
  sandbox: {
    roots: ["/workspace"],
    commands: [],
    write: false,
    network: false,
  },
})
const record: session.SessionRecord = {
  id: "test-session",
  version: 0,
  schemaVersion: 1,
  status: "open",
  authorityFingerprint: authority.fingerprint,
  authorityConstraints: authority,
  currentBranchId: "main",
  branches: [{
    id: "main",
    version: 0,
    createdBy: "bootstrap",
    authorityFingerprint: authority.fingerprint,
    authority,
    evidence: [],
  }],
  work: [],
  attempts: [],
  invocations: [],
  artifacts: [],
  memory: [],
  schedules: [],
  providerContinuations: {},
  nextEventSequence: 1,
}
const provider = attemptStubConfig({
  events: [{ type: "content_delta", content: "ready" }],
  result: { content: "ready", stop: true },
})
const store = sessionStoreStub([record])
const scope = createScope({
  tags: [
    ...provider,
    store.config,
    store.binding.load,
    store.binding.commit,
  ],
})
const root = scope.createContext()
const owner = scope.createContext({
  parent: root,
  tags: [
    session.authority(authority),
    session.record(record),
    session.clock({ now: () => new Date().toISOString() }),
  ],
})

await owner.resolve(session.session)
await owner.close()
await root.close()
await scope.dispose()
```

Every test creates its own scope and owner context with exactly the extensions, presets, and tags it needs. Resolve `session.session` on that owner before execution so current-owned resources share the intended session lifecycle. Close the owner, root, and scope in that order.

`modelStub` and `attemptStub` are stable module-level flows configured by `config.model` and `config.attempt`. `attemptStubConfig` supplies the attempt response and implementation tags together. `sessionStoreStub` owns an isolated record map and supplies its config plus named load and commit bindings. None of these helpers creates or caches a scope.

The existing workflow helpers remain: `kit`, `suspense`, `MemoryWorkflowLog`, `MemorySuspenseLog`, and `localRemoteRunner`.

The bundled issue-triage verifier uses the same scope seam to prove a session-owned `agent.turn`, three evidence backends, independent verification, idempotent publication, and queue concurrency capped at two.

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
