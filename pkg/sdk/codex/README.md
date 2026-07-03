# @pumped-fn/sdk-codex

Codex CLI model provider for `@pumped-fn/sdk`.

```ts
import { createScope } from "@pumped-fn/lite"
import { agent } from "@pumped-fn/sdk"
import { codex } from "@pumped-fn/sdk-codex"

const triage = agent({ name: "triage" })
const scope = createScope({ tags: [codex()] })
const ctx = scope.createContext()

await ctx.exec({ flow: triage.turn, input: { prompt: "Triage this ticket." } })
```

`codex()` returns a lazy `model` tag. The Codex harness is created only when the model is first used, and the agent can be run with `claude()` or `model(fake)` instead without changing the graph.
