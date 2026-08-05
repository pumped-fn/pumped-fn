# @pumped-fn/sdk-pi

> **Status: experimental.** APIs change without notice; not recommended for production yet.

In-process `@earendil-works/pi-ai` provider for `@pumped-fn/sdk`.

```ts
import { createScope } from "@pumped-fn/lite"
import * as pi from "@pumped-fn/sdk-pi"

const scope = createScope({
  tags: pi.piConfig({
    auth: { kind: "api-key" },
    provider: "anthropic",
    modelId: "claude-sonnet-4-5",
  }),
})
const ctx = scope.createContext()
await ctx.exec({ flow: pi.piTurn, input: {
  agentName: "triage",
  instructions: "Triage the ticket.",
  messages: [{ role: "user", content: "Login fails after refresh." }],
  tools: [], skills: [], loadedSkills: [], subagents: [], round: 0,
} })
await ctx.close()
await scope.dispose()
```

Set `auth.env` to resolve an explicit provider key through the environment adapter. Without it,
pi-ai uses its provider auth chain. `supportedModels` lists the catalog, while `models` is the
scope-owned collection edge. Native model tool calls become SDK tool, skill, and subagent calls;
the session runtime owns the resulting model lifecycle event.

`piAttempt` maps pi-ai text, thinking, and lifecycle events to the provider-neutral SDK `ModelEvent`
stream. Its final result is the same `ModelResponse` returned by `piTurn`; the scalar turn drains the
attempt. `piAttemptBinding` injects the stream through `agent.impl.attempt`. There is no generic
`engine` alias; `models` names the collection seam that tests preset.

## Current prerelease migration

| Before | Now |
|---|---|
| `apiKeyEnv: "ANTHROPIC_API_KEY"` | `auth: { kind: "api-key", env: "ANTHROPIC_API_KEY" }` |
| no `apiKeyEnv` | `auth: { kind: "api-key" }` |

## Migration to 3.0.0

3.0.0 tracks the `@pumped-fn/sdk` facade removal. The pi-ai provider no longer wires itself through
an `agent()` object; bind it explicitly and drive the entry flow. The scope example above is the
current, post-migration wiring.

| Removed in 2.x | Replacement in 3.0.0 |
|---|---|
| implicit `agent()` provider wiring | `pi.piConfig` tag + `piAttemptBinding` through `agent.impl.attempt` |
| provider `.turn(input)` method | `ctx.exec({ flow: pi.piTurn, input })` |

Native model tool calls still surface as SDK tool, skill, and subagent calls; nothing auto-collects
tools or MCP servers.

---
Part of [pumped-fn](https://github.com/pumped-fn/pumped-fn) — start with the [docs](https://github.com/pumped-fn/pumped-fn/tree/main/docs) or the [mental model](https://github.com/pumped-fn/pumped-fn/blob/main/docs/mental-model.md).
