# @pumped-fn/sdk-test

In-memory test helpers for `@pumped-fn/sdk`.

Use `kit()` to install the agent workflow extensions with a `MemoryWorkflowLog`. The helper keeps the normal pumped-fn seam: tests still exercise public APIs through `createScope({ presets, tags, extensions })`.

```ts
import { createScope } from "@pumped-fn/lite"
import { kit } from "@pumped-fn/sdk-test"

const { extensions, log } = kit()
const scope = createScope({ extensions })
const ctx = scope.createContext()
```

`localRemoteRunner` executes remote-tagged steps in process for tests. `MemoryWorkflowLog` implements the same `RunLog` contract used by `inspect()`.

---
Part of [pumped-fn](https://github.com/pumped-fn/pumped-fn) — start with the [docs](https://github.com/pumped-fn/pumped-fn/tree/main/docs) or the [mental model](https://github.com/pumped-fn/pumped-fn/blob/main/docs/mental-model.md).
