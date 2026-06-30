# @pumped-fn/agent-sdk-claude

Claude CLI model provider for `@pumped-fn/agent-sdk`.

```ts
import { createScope } from "@pumped-fn/lite"
import { agent } from "@pumped-fn/agent-sdk"
import { claude } from "@pumped-fn/agent-sdk-claude"

const triage = agent({ name: "triage" })
const scope = createScope({ tags: [claude()] })
const ctx = scope.createContext()

await ctx.exec({ flow: triage.turn, input: { prompt: "Triage this ticket." } })
```

`claude()` returns a lazy `model` tag. The Claude harness is created only when the model is first used, and the agent can be run with `codex()` or `model(fake)` instead without changing the graph.
