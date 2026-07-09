# @pumped-fn/sdk-claude

> **Status: experimental.** APIs change without notice; not recommended for production yet.

Claude CLI model provider for `@pumped-fn/sdk`.

```ts
import { createScope } from "@pumped-fn/lite"
import { agent } from "@pumped-fn/sdk"
import { claude } from "@pumped-fn/sdk-claude"

const triage = agent({ name: "triage" })
const scope = createScope({ tags: [claude()] })
const ctx = scope.createContext()

await ctx.exec({ flow: triage.turn, input: { prompt: "Triage this ticket." } })
```

`claude()` returns a lazy `model` tag. The Claude harness is created only when the model is first used, and the agent can be run with `codex()` or `model(fake)` instead without changing the graph.

---
Part of [pumped-fn](https://github.com/pumped-fn/pumped-fn) — start with the [docs](https://github.com/pumped-fn/pumped-fn/tree/main/docs) or the [mental model](https://github.com/pumped-fn/pumped-fn/blob/main/docs/mental-model.md).
