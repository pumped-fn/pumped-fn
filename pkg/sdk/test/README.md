# @pumped-fn/sdk-test

In-memory test helpers for `@pumped-fn/sdk`. Every helper keeps `createScope` as the seam.

```text
modelStub / attemptStub ----> inert provider flows
sessionStoreStub -----------> load and commit port bindings
createScope ----------------> explicit test-owned session seam
```

```ts
import * as agent from "@pumped-fn/sdk/agent"
import * as session from "@pumped-fn/sdk/session"
import { createScope } from "@pumped-fn/lite"
import {
  attemptStub,
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
const provider = attemptStub({
  events: [{ type: "content_delta", content: "ready" }],
  result: { content: "ready", stop: true },
})
const store = sessionStoreStub([record])
const scope = createScope({
  tags: [
    agent.attempt(provider),
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

`modelStub` keeps the scalar model seam. `attemptStub` yields provider events and returns one final model response. `sessionStoreStub` owns an isolated record map and exposes named load and commit flows plus their bindings. None of these helpers creates or caches a scope.

The existing workflow helpers remain: `kit`, `suspense`, `MemoryWorkflowLog`, `MemorySuspenseLog`, and `localRemoteRunner`.

---
Part of [pumped-fn](https://github.com/pumped-fn/pumped-fn).
