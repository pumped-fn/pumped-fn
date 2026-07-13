# @pumped-fn/sdk-pi

> **Status: experimental.** APIs change without notice; not recommended for production yet.

In-process `@earendil-works/pi-ai` provider for `@pumped-fn/sdk`.

```ts
import { createScope, flow, typed } from "@pumped-fn/lite"
import { currentAgent, currentTool, turn, validation } from "@pumped-fn/sdk"
import { pi, piConfig } from "@pumped-fn/sdk-pi"
import * as z from "zod"

const inspect = currentTool({
  description: "Inspect a ticket by ID.",
  inputSchema: z.object({ ticketId: z.string().min(1) }),
  flow: flow({
    name: "ticket.inspect",
    parse: typed<{ ticketId: string }>(),
    factory: (ctx) => ({ id: ctx.input.ticketId, status: "open" }),
  }),
})
const triage = currentAgent({ name: "triage", tools: { inspect } })
const run = turn({ agent: triage })
const scope = createScope({
  tags: [
    pi,
    piConfig({ provider: "anthropic", modelId: "claude-sonnet-4-5" }),
    validation.engine(validation.standard<z.ZodType>((schema) => z.toJSONSchema(schema))),
  ],
})
const ctx = scope.createContext()

await ctx.exec({ flow: run, input: { prompt: "Inspect ticket T-42." } })
```

Set `apiKeyEnv` to resolve an explicit provider key through the environment adapter. Without it,
pi-ai uses its provider auth chain. `supportedModels` lists the catalog, while `models` is the
scope-owned collection edge. Managed-tool JSON Schema is forwarded to pi-ai, then tool input is
validated again through the scope-selected engine before its flow starts. Native model tool calls become SDK tool, skill, and subagent calls;
usage and cost are copied to the SDK event buffer.

---
Part of [pumped-fn](https://github.com/pumped-fn/pumped-fn) — start with the [docs](https://github.com/pumped-fn/pumped-fn/tree/main/docs) or the [mental model](https://github.com/pumped-fn/pumped-fn/blob/main/docs/mental-model.md).
