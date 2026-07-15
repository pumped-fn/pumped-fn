# @pumped-fn/sdk-codex

> **Status: experimental.** APIs change without notice; not recommended for production yet.

Module-level Codex CLI and ACP model providers for `@pumped-fn/sdk`.

```ts
import { createScope } from "@pumped-fn/lite"
import * as codex from "@pumped-fn/sdk-codex"

const scope = createScope({
  tags: [codex.codexConfig({ auth: { kind: "global" } })],
})
const ctx = scope.createContext()
await ctx.exec({ flow: codex.codexTurn, input: {
  agentName: "triage",
  instructions: "Triage the ticket.",
  messages: [{ role: "user", content: "Login fails after refresh." }],
  tools: [], skills: [], loadedSkills: [], subagents: [], round: 0,
} })
await ctx.close()
await scope.dispose()
```

Global auth reuses writable `CODEX_HOME` state. API-key auth reads the configured environment name
and passes it to `codex exec` as `CODEX_API_KEY`:

```ts
codex.codexConfig({ auth: { kind: "api-key", env: "MY_CODEX_KEY" } })
```

ACP uses `@agentclientprotocol/codex-acp` over stdio through the official TypeScript client. Its auth,
working directory, extra roots, permission policy, and shutdown bound are required. Paths must be
absolute. An empty `additionalDirectories` array means no extra roots. Every permission decision is
emitted as a provider status event by streaming attempts.

```ts
import * as codex from "@pumped-fn/sdk-codex"
import { createScope } from "@pumped-fn/lite"

const scope = createScope({
  tags: [codex.config({
    auth: { kind: "global" },
    cwd: process.cwd(),
    additionalDirectories: [],
    permission: "deny",
    shutdownTimeoutMs: 5_000,
  })],
})
const ctx = scope.createContext()
await ctx.resolve(codex.engine)
await ctx.exec({ flow: codex.turn, input: {
  agentName: "triage",
  instructions: "Triage the ticket.",
  messages: [{ role: "user", content: "Login fails after refresh." }],
  tools: [], skills: [], loadedSkills: [], subagents: [], round: 0,
} })
await ctx.close()
await scope.dispose()
```

Each ACP prompt sends `cwd`, `additionalDirectories`, and `mcpServers: []`. Pumped-fn tool collection
and MCP projection remain deferred. Abort sends `session/cancel`. Scope cleanup closes the ACP
connection and child within `shutdownTimeoutMs`, escalates to `SIGKILL` for one more bound, waits for
the child process and transport to close, and clears request correlation state. Cleanup rejects with
`CodexShutdownError` instead of reporting success if the second bound expires.

`codexAttempt` normalizes the CLI lifecycle to the SDK `ModelEvent` stream. `codexAcpAttempt`
normalizes ACP message chunks and reuses the ACP session for the same SDK session and branch.
Correlation, cancellation, and continuation are keyed per ACP session, so overlapping attempts do
not consume each other's chunks or cancel each other. `codexAttemptBinding` and
`codexAcpAttemptBinding` inject either implementation through `agent.impl.attempt`.

Every ACP `session/new` response is an `ActiveSession`. The adapter extracts its continuation ID and
disposes its update route immediately; the connection-level notification handler remains the single
chunk router. Late session creation after cancellation is also disposed, so connection close leaves
no rejected update queue.

The stable CLI handles remain `codex`, `codexTurn`, and `codexRun`; ACP keeps `codexAcp`,
`codexAcpTurn`, `codexAcpPrompt`, `codexAcpConfig`, and `acp`. Package-module imports expose the
managed ACP aliases `config`, `engine`, `run`, `turn`, and `provider`. They are the same graph handles,
not a facade object or shared scope factory. Tests can preset `run` or `engine` through `createScope`
without changing the agent graph.

---
Part of [pumped-fn](https://github.com/pumped-fn/pumped-fn) — start with the [docs](https://github.com/pumped-fn/pumped-fn/tree/main/docs) or the [mental model](https://github.com/pumped-fn/pumped-fn/blob/main/docs/mental-model.md).
