# @pumped-fn/lite-extension-suspense

Replay and suspend extension for `@pumped-fn/lite`.

Use it when `ctx.exec()` steps need deterministic replay or external resolution without agent, worker, or CLI concepts.

```ts
import { createScope, flow } from "@pumped-fn/lite"
import {
  extension,
  suspend,
  run,
} from "@pumped-fn/lite-extension-suspense"

const waitForCommit = flow({
  name: "wait-for-commit",
  tags: [suspend(true)],
  factory: () => {
    throw new Error("resolved externally")
  },
})

const scope = createScope({
  extensions: [extension({ log })],
})

const ctx = scope.createContext(run({ taskId: "doc-123", runId: "sync-42" }))

await ctx.exec({ flow: waitForCommit })
```

Marked steps get key `(taskId, runId, step)`. Completed steps replay from the log. Suspended steps write pending entries and throw `SuspendSignal` until a resolver stores a value.

---
Part of [pumped-fn](https://github.com/pumped-fn/pumped-fn) — start with the [docs](https://github.com/pumped-fn/pumped-fn/tree/main/docs) or the [mental model](https://github.com/pumped-fn/pumped-fn/blob/main/docs/mental-model.md).
