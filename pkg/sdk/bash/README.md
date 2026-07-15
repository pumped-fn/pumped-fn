# @pumped-fn/sdk-just-bash

`just-bash` implements the session-mediated `@pumped-fn/sdk/sandbox` port. It exports named flows and resources, not a sandbox method bag.

```text
session authority -> sandbox.read/write/exec -> sandbox.impl tags
                                                |
                         just-bash read/write/run flows
                                                |
                authority -> readiness -> workspace -> engine
```

```ts
import { createScope } from "@pumped-fn/lite"
import * as session from "@pumped-fn/sdk/session"
import * as sandbox from "@pumped-fn/sdk/sandbox"
import * as bash from "@pumped-fn/sdk-just-bash"

const authority = session.createAuthority({
  tenant: "tenant-a",
  roots: ["/workspace"],
  permissions: [],
  tools: [],
  sandbox: {
    roots: ["/workspace"],
    commands: ["printf"],
    write: true,
    network: false,
  },
})

const record: session.SessionRecord = {
  id: "sandbox-session",
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

const scope = createScope({
  tags: [
    sandbox.policy({
      roots: ["/workspace"],
      write: true,
      network: false,
      commands: ["printf"],
      timeoutMs: 5_000,
      maxOutputBytes: 64 * 1024,
    }),
    bash.config.engine({
      options: {
        files: { "/workspace/README.md": "ship it" },
      },
    }),
    bash.config.workspace({ root: "/workspace" }),
    bash.binding.read,
    bash.binding.write,
    bash.binding.run,
  ],
})

const sessionCtx = scope.createContext({ tags: [
  session.authority(authority),
  session.record(record),
  session.clock({ now: () => new Date().toISOString() }),
] })
await sessionCtx.resolve(session.session)
await sessionCtx.resolve(bash.workspace)

const content = await sessionCtx.exec({
  flow: sandbox.read,
  input: { path: "/workspace/README.md" },
})
console.log(content)

const stream = sessionCtx.execStream({
  flow: sandbox.exec,
  input: { command: "printf", args: ["ready"] },
})

for await (const event of stream) console.log(event.type, event.content)
const result = await stream.result
console.log(result.exitCode)

await sessionCtx.close()
await scope.dispose()
```

`sandbox.exec` checks the session authority and policy before the implementation runs. `just-bash.run` forwards the active `abortSignal` and enforces the timeout and UTF-8 output cap. The physical `just-bash` API returns buffered output, so this adapter yields at most one stdout event and one stderr event after the command completes. Use another `sandbox.impl.run` implementation when live command deltas or backpressure are required. Each session pre-resolves its own current-owned `engine` and `workspace`, so closing or cancelling one session does not close another.

Replace `engine`, `workspace`, `readiness`, or any named flow with `preset()` in tests. No module mock or shared scope is needed.

---
Part of [pumped-fn](https://github.com/pumped-fn/pumped-fn).
