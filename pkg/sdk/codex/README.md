# @pumped-fn/sdk-codex

> **Status: experimental.** APIs change without notice; not recommended for production yet.

Module-level Codex CLI and ACP model providers for `@pumped-fn/sdk`.

```ts
import { createScope } from "@pumped-fn/lite"
import { agent } from "@pumped-fn/sdk"
import { codex, codexConfig } from "@pumped-fn/sdk-codex"

const triage = agent({ name: "triage" })
const scope = createScope({
  tags: [codex, codexConfig({ auth: { kind: "global" } })],
})
```

Global auth reuses writable `CODEX_HOME` state. API-key auth reads the configured environment name
and passes it to `codex exec` as `CODEX_API_KEY`:

```ts
codexConfig({ auth: { kind: "api-key", env: "MY_CODEX_KEY" } })
```

ACP uses `@agentclientprotocol/codex-acp` over stdio through the official TypeScript client. Its auth,
working directory, extra roots, permission policy, and shutdown bound are required. Paths must be
absolute. An empty `additionalDirectories` array means no extra roots. Every permission decision is
recorded in the SDK event buffer.

```ts
import * as codex from "@pumped-fn/sdk-codex"
import * as claude from "@pumped-fn/sdk-claude"
import { createScope } from "@pumped-fn/lite"
import { agent } from "@pumped-fn/sdk"

const triage = agent({ name: "triage" })
const claudeScope = createScope({
  tags: [claude.provider, claude.config({
    auth: { kind: "global" },
    cwd: process.cwd(),
    roots: [],
    permission: "deny",
    shutdownTimeoutMs: 1_000,
  })],
})
const codexScope = createScope({
  tags: [codex.provider, codex.config({
    auth: { kind: "global" },
    cwd: process.cwd(),
    additionalDirectories: [],
    permission: "deny",
    shutdownTimeoutMs: 5_000,
  })],
})

for (const scope of [claudeScope, codexScope]) {
  const ctx = scope.createContext()
  await ctx.exec({ flow: triage.turn, input: { prompt: "Triage this ticket." } })
  await ctx.close()
  await scope.dispose()
}
```

The same `triage` graph switches between managed Claude and Codex by changing only scope tags.
Each ACP prompt sends `cwd`, `additionalDirectories`, and `mcpServers: []`. Pumped-fn tool collection
and MCP projection remain deferred. Abort sends `session/cancel`. Scope cleanup closes the ACP
connection and child within `shutdownTimeoutMs`, escalates to `SIGKILL` for one more bound, waits for
the child process and transport to close, and clears request correlation state. Cleanup rejects with
`CodexShutdownError` instead of reporting success if the second bound expires.

The stable CLI handles remain `codex`, `codexTurn`, and `codexRun`; ACP keeps `codexAcp`,
`codexAcpTurn`, `codexAcpPrompt`, `codexAcpConfig`, and `acp`. Package-module imports expose the
managed ACP aliases `config`, `engine`, `run`, `turn`, and `provider`. They are the same graph handles,
not a facade object or shared scope factory. Tests can preset `run` or `engine` through `createScope`
without changing the agent graph.

---
Part of [pumped-fn](https://github.com/pumped-fn/pumped-fn) — start with the [docs](https://github.com/pumped-fn/pumped-fn/tree/main/docs) or the [mental model](https://github.com/pumped-fn/pumped-fn/blob/main/docs/mental-model.md).
