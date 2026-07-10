# @pumped-fn/sdk-claude

> **Status: experimental.** APIs change without notice; not recommended for production yet.

Module-level Claude CLI model provider for `@pumped-fn/sdk`.

```ts
import { createScope } from "@pumped-fn/lite"
import { agent } from "@pumped-fn/sdk"
import { claude, claudeConfig } from "@pumped-fn/sdk-claude"

const triage = agent({ name: "triage" })
const scope = createScope({
  tags: [claude, claudeConfig({ auth: { kind: "global" } })],
})
const ctx = scope.createContext()

await ctx.exec({ flow: triage.turn, input: { prompt: "Triage this ticket." } })
```

Global auth reuses the Claude CLI's writable `~/.claude` state. Token auth reads a long-lived token
from the configured environment name and passes it to the subprocess as
`CLAUDE_CODE_OAUTH_TOKEN`:

```ts
claudeConfig({ auth: { kind: "token", env: "MY_CLAUDE_TOKEN" } })
```

The stable handles are `claude`, `claudeTurn`, and `claudeRun`. Tests replace `claudeRun` with a
scope preset. The removed `claude()`/`claudeHarness()`/`claudeCliWorker()` factories have no
compatibility aliases.

---
Part of [pumped-fn](https://github.com/pumped-fn/pumped-fn) — start with the [docs](https://github.com/pumped-fn/pumped-fn/tree/main/docs) or the [mental model](https://github.com/pumped-fn/pumped-fn/blob/main/docs/mental-model.md).
