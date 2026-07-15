# @pumped-fn/sdk-pi

> **Status: experimental.** APIs change without notice; not recommended for production yet.

In-process `@earendil-works/pi-ai` provider for `@pumped-fn/sdk`.

```ts
import { createScope } from "@pumped-fn/lite"
import * as pi from "@pumped-fn/sdk-pi"

const scope = createScope({
  tags: [pi.piConfig({ provider: "anthropic", modelId: "claude-sonnet-4-5" })],
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

Set `apiKeyEnv` to resolve an explicit provider key through the environment adapter. Without it,
pi-ai uses its provider auth chain. `supportedModels` lists the catalog, while `models` is the
scope-owned collection edge. Native model tool calls become SDK tool, skill, and subagent calls;
the session runtime owns the resulting model lifecycle event.

`piAttempt` maps pi-ai text, thinking, and lifecycle events to the provider-neutral SDK `ModelEvent`
stream. Its final result is the same `ModelResponse` returned by `piTurn`; the scalar turn drains the
attempt. `piAttemptBinding` injects the stream through `agent.impl.attempt`.

---
Part of [pumped-fn](https://github.com/pumped-fn/pumped-fn) — start with the [docs](https://github.com/pumped-fn/pumped-fn/tree/main/docs) or the [mental model](https://github.com/pumped-fn/pumped-fn/blob/main/docs/mental-model.md).
