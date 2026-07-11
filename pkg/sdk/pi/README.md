# @pumped-fn/sdk-pi

> **Status: experimental.** APIs change without notice; not recommended for production yet.

In-process `@earendil-works/pi-ai` provider for `@pumped-fn/sdk`.

```ts
import { createScope } from "@pumped-fn/lite"
import { agent } from "@pumped-fn/sdk"
import { pi, piConfig } from "@pumped-fn/sdk-pi"

const triage = agent({ name: "triage" })
const scope = createScope({
  tags: [pi, piConfig({ provider: "anthropic", modelId: "claude-sonnet-4-5" })],
})
```

Set `apiKeyEnv` to resolve an explicit provider key through the environment adapter. Without it,
pi-ai uses its provider auth chain. `supportedModels` lists the catalog, while `models` is the
scope-owned collection edge. Native model tool calls become SDK tool, skill, and subagent calls;
usage and cost are copied to the SDK event buffer.

---
Part of [pumped-fn](https://github.com/pumped-fn/pumped-fn) — start with the [docs](https://github.com/pumped-fn/pumped-fn/tree/main/docs) or the [mental model](https://github.com/pumped-fn/pumped-fn/blob/main/docs/mental-model.md).
