# @pumped-fn/lite-extension-suspense

Replay and suspend extension for `@pumped-fn/lite`.

Use it when `ctx.exec()` steps need deterministic replay or external resolution without agent, worker, or CLI concepts.

```ts
import { createScope, flow } from "@pumped-fn/lite"
import {
  eventLog,
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
  tags: [eventLog(log)],
  extensions: [extension()],
})

const ctx = scope.createContext(run({ taskId: "doc-123", runId: "sync-42" }))

await ctx.exec({ flow: waitForCommit })
```

Marked steps get key `(taskId, runId, step)`, where `step` can be the positional counter or a caller-provided stable string key. Completed steps replay from the log. Suspended steps write pending entries and throw `SuspendSignal` until a resolver stores a value.

The log contract is intentionally small and swappable:

- `get()`, `putPending()`, `putCompleted()`, and `resolve()` are required.
- `putFailed()` is optional for stores that persist failed step records.
- `list()` is optional for stores that expose run dashboards or operators.
- `observer()` or `observe()` reports `started`, `pending`, `completed`, `replayed`, `resolved`, and `failed` lifecycle events without changing workflow code.
- `units()` or the `units` option composes reusable extension policy around the same log. Tag units are prepended to option units, so first-match hooks can override option policy and `run()` wrappers execute outside option wrappers.

Suspension is not failure. When a child step throws `SuspendSignal`, parent replayable steps propagate it without writing failed entries.
