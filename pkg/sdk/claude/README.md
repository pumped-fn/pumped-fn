# @pumped-fn/sdk-claude

> **Status: experimental.** APIs change without notice; not recommended for production yet.

Module-level managed Claude CLI model provider for `@pumped-fn/sdk`.

```text
agent -> model tag -> claude turn -> claude run -> scope-owned stream-json process
                    claude attempt -> session lease -> isolated stream-json process
```

```ts
import { createScope } from "@pumped-fn/lite"
import * as claude from "@pumped-fn/sdk-claude"

const scope = createScope({
  tags: [claude.config({
    auth: { kind: "global" },
    cwd: process.cwd(),
    roots: [],
    permission: "deny",
    shutdownTimeoutMs: 1_000,
  })],
})
const ctx = scope.createContext()
await ctx.resolve(claude.claudeLeases)

await ctx.exec({
  flow: claude.turn,
  input: {
    agentName: "triage",
    instructions: "Triage the ticket.",
    messages: [{ role: "user", content: "Login fails after refresh." }],
    tools: [],
    skills: [],
    loadedSkills: [],
    subagents: [],
    round: 0,
  },
})
await ctx.close()
await scope.dispose()
```

Global auth reuses the Claude CLI's writable `~/.claude` state. Token auth reads a long-lived token
from the configured environment name and passes it to the subprocess as
`CLAUDE_CODE_OAUTH_TOKEN`:

```ts
claude.config({
  auth: { kind: "token", env: "MY_CLAUDE_TOKEN" },
  cwd: process.cwd(),
  roots: [],
  permission: "deny",
  shutdownTimeoutMs: 1_000,
})
```

`claudeAttempt` is the provider-neutral streaming edge. It emits `ModelEvent` deltas and returns the
same `ModelResponse` shape as `claudeTurn`. `claudeAttemptBinding` injects it through
`agent.impl.attempt`. When a session record is present, a root-owned lease manager keeps one isolated
sequential process for that logical session. Concurrent sessions never share a process, and abort
releases only the selected session lease.

The scalar turn drains `claudeAttempt`. `claudeRun` and `claudeSession` remain direct prompt
compatibility handles. `roots` lists extra absolute roots; `[]` means no extra roots. Permission policy is explicit and fail-closed. This
integration exposes no Claude tools or MCP servers. The managed config has no free-form CLI argument
escape hatch. Abort and cleanup request graceful shutdown, wait `shutdownTimeoutMs`, send `SIGKILL`,
then wait the same bound again. A child still alive after the second bound makes cleanup reject with
`ClaudeShutdownError`; it is never reported as closed.

The stable handles remain `claude`, `claudeTurn`, `claudeRun`, and `claudeConfig`. The streaming
handles are `claudeAttempt`, `claudeAttemptBinding`, and `claudeLeases`. Tests can replace
`claudeAttempt`, `claudeLeases`, or the process `engine` with a scope preset. Package-module imports also expose aligned
aliases:

```ts
import * as claude from "@pumped-fn/sdk-claude"
import { createScope } from "@pumped-fn/lite"

const scope = createScope({
  tags: [claude.config({
    auth: { kind: "global" },
    cwd: process.cwd(),
    roots: [],
    permission: "deny",
    shutdownTimeoutMs: 1_000,
  })],
})

const ctx = scope.createContext()
await ctx.resolve(claude.claudeLeases)
await ctx.exec({ flow: claude.turn, input: {
  agentName: "triage",
  instructions: "Triage the ticket.",
  messages: [{ role: "user", content: "Login fails after refresh." }],
  tools: [], skills: [], loadedSkills: [], subagents: [], round: 0,
} })
await ctx.close()
await scope.dispose()
```

`config`, `engine`, `run`, `turn`, and `provider` are aliases to the same graph handles. Use
`claudeAttemptBinding` when composing `agent.turn`; `provider` remains the scalar model tag. Tests
can preset `claudeAttempt`, `claudeLeases`, or `engine` through `createScope` without changing the caller.

## Migration to 3.0.0

3.0.0 tracks the `@pumped-fn/sdk` facade removal. The Claude provider no longer wires itself through
an `agent()` object; bind it explicitly and drive the entry flow. The scope example above is the
current, post-migration wiring.

| Removed in 2.x | Replacement in 3.0.0 |
|---|---|
| implicit `agent()` provider wiring | `claude.config` tag + `claudeAttemptBinding` through `agent.impl.attempt` |
| provider `.turn(input)` method | `ctx.exec({ flow: claude.turn, input })` |
| shared long-lived process | `claude.claudeLeases`, one isolated `stream-json` process per logical session |

The migration exposes no Claude tools or MCP servers and keeps the fail-closed permission policy.

---
Part of [pumped-fn](https://github.com/pumped-fn/pumped-fn) — start with the [docs](https://github.com/pumped-fn/pumped-fn/tree/main/docs) or the [mental model](https://github.com/pumped-fn/pumped-fn/blob/main/docs/mental-model.md).
