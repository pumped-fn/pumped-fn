# @pumped-fn/sdk-claude

> **Status: experimental.** APIs change without notice; not recommended for production yet.

Module-level managed Claude CLI model provider for `@pumped-fn/sdk`.

```text
agent -> model tag -> claude turn -> claude run -> scope-owned stream-json process
```

Managed tools resolve in core before the provider request and need no provider registry.

```ts
import { createScope } from "@pumped-fn/lite"
import { agent } from "@pumped-fn/sdk"
import { claude, claudeConfig } from "@pumped-fn/sdk-claude"

const triage = agent({ name: "triage" })
const scope = createScope({
  tags: [claude, claudeConfig({
    auth: { kind: "global" },
    cwd: process.cwd(),
    roots: [],
    permission: "deny",
    shutdownTimeoutMs: 1_000,
  })],
})
const ctx = scope.createContext()

await ctx.exec({ flow: triage.turn, input: { prompt: "Triage this ticket." } })
```

Global auth reuses the Claude CLI's writable `~/.claude` state. Token auth reads a long-lived token
from the configured environment name and passes it to the subprocess as
`CLAUDE_CODE_OAUTH_TOKEN`:

```ts
claudeConfig({
  auth: { kind: "token", env: "MY_CLAUDE_TOKEN" },
  cwd: process.cwd(),
  roots: [],
  permission: "deny",
  shutdownTimeoutMs: 1_000,
})
```

The provider keeps one sequential stream-json process per execution boundary. `roots` lists extra
absolute roots; `[]` means no extra roots. Permission policy is explicit and fail-closed. This
integration exposes no Claude tools or MCP servers. The managed config has no free-form CLI argument
escape hatch. Abort and cleanup request graceful shutdown, wait `shutdownTimeoutMs`, send `SIGKILL`,
then wait the same bound again. A child still alive after the second bound makes cleanup reject with
`ClaudeShutdownError`; it is never reported as closed.

The stable handles remain `claude`, `claudeTurn`, `claudeRun`, and `claudeConfig`. Tests can replace
`claudeRun` or the process `engine` with a scope preset. Package-module imports also expose aligned
aliases:

```ts
import * as claude from "@pumped-fn/sdk-claude"
import { createScope } from "@pumped-fn/lite"
import { agent } from "@pumped-fn/sdk"

const triage = agent({ name: "triage" })
const scope = createScope({
  tags: [claude.provider, claude.config({
    auth: { kind: "global" },
    cwd: process.cwd(),
    roots: [],
    permission: "deny",
    shutdownTimeoutMs: 1_000,
  })],
})

const ctx = scope.createContext()
await ctx.exec({ flow: triage.turn, input: { prompt: "Triage this ticket." } })
await ctx.close()
await scope.dispose()
```

`config`, `engine`, `run`, `turn`, and `provider` are aliases to the same graph handles, not a
facade object. Tests can preset `run` or `engine` through `createScope` without changing the agent.

---
Part of [pumped-fn](https://github.com/pumped-fn/pumped-fn) — start with the [docs](https://github.com/pumped-fn/pumped-fn/tree/main/docs) or the [mental model](https://github.com/pumped-fn/pumped-fn/blob/main/docs/mental-model.md).
