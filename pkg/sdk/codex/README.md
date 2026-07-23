# @pumped-fn/sdk-codex

> **Status: experimental.** APIs change without notice; not recommended for production yet.

Module-level Codex CLI and ACP model providers for `@pumped-fn/sdk`.

```ts
import { createScope } from "@pumped-fn/lite"
import * as codex from "@pumped-fn/sdk-codex"

const scope = createScope({
  tags: [codex.codexConfig({
    auth: { kind: "global" },
    cwd: "/absolute/path/to/project",
  })],
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

CLI auth and an absolute working directory are required. Global auth reuses writable `CODEX_HOME`
state. API-key auth reads the configured environment name and passes it to `codex exec` as
`CODEX_API_KEY`:

```ts
codex.codexConfig({
  auth: { kind: "api-key", env: "MY_CODEX_KEY" },
  cwd: "/absolute/path/to/project",
})
```

When a current SDK work authority is present, the CLI checks `cwd`, explicit isolate roots, write
access, and network access against that authority before starting `codex exec`. Standalone calls
without session work keep their explicit config contract. Root checks resolve symlinks before
containment. `extraArgs` accepts only `-m`/`--model`, `--color`, `--json`, and
`--skip-git-repo-check`; working-directory, sandbox, config, and other authority-bearing flags are
rejected in split and `--flag=value` forms.

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

ACP applies the same current-work check to `cwd`, `additionalDirectories`, and granted write and
network capabilities before starting its process or creating a session.

Each ACP prompt sends `cwd`, `additionalDirectories`, and `mcpServers: []`. Pumped-fn tool collection
and MCP projection remain deferred. Abort sends `session/cancel`, releases local correlation state,
and waits at most `shutdownTimeoutMs` for the remote prompt and cancellation to settle. A timed-out
prompt terminates and releases its transport before a replacement can start. Failed termination
quarantines the session invocation, which fences session finish. Scope cleanup closes the ACP
connection and child within `shutdownTimeoutMs`, escalates to `SIGKILL` for one more bound, waits for
the child process and transport to close, and clears request correlation state. Cleanup rejects with
`CodexShutdownError` instead of reporting success if the second bound expires.

`codexAttempt` normalizes the CLI lifecycle to the SDK `ModelEvent` stream. `codexAcpAttempt`
normalizes ACP message chunks and reuses the ACP session only for a validated active SDK session,
work, attempt, branch, record, and authority tuple. Standalone attempts create fresh ACP sessions.
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

## Migration to 3.0.0

3.0.0 tracks the `@pumped-fn/sdk` facade removal. The Codex provider no longer wires itself through
an `agent()` object; bind an attempt and drive the entry flow. The scope example above is the
current, post-migration wiring.

| Removed in 2.x | Replacement in 3.0.0 |
|---|---|
| implicit `agent()` provider wiring | `codex.config` / `codex.codexConfig` tag + `codexAttemptBinding` or `codexAcpAttemptBinding` through `agent.impl.attempt` |
| provider `.turn(input)` method | `ctx.exec({ flow: codex.turn, input })` |

Every ACP prompt still sends `mcpServers: []`; pumped-fn tool collection and MCP projection remain
deferred, not auto-collected.

---
Part of [pumped-fn](https://github.com/pumped-fn/pumped-fn) — start with the [docs](https://github.com/pumped-fn/pumped-fn/tree/main/docs) or the [mental model](https://github.com/pumped-fn/pumped-fn/blob/main/docs/mental-model.md).
