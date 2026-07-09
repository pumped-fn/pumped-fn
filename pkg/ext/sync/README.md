# @pumped-fn/lite-extension-sync

Strict replicated state for Lite scopes.

```ts
import { createScope } from "@pumped-fn/lite"
import { sync } from "@pumped-fn/lite-extension-sync"

const draft = sync({
  id: "draft",
  factory: () => ({ title: "", body: "" }),
})

const wire = sync.memory()

const left = createScope({
  extensions: [sync.extension()],
  tags: [sync.runtime({ peer: "left", transport: wire })],
})

const right = createScope({
  extensions: [sync.extension()],
  tags: [sync.runtime({ peer: "right", transport: wire })],
})
```

`sync(...)` returns an atom-like value. Plain JSON-safe state is inferred. Non-JSON state must use a
codec, and every inbound value is decoded before it can be applied.

---
Part of [pumped-fn](https://github.com/pumped-fn/pumped-fn) — start with the [docs](https://github.com/pumped-fn/pumped-fn/tree/main/docs) or the [mental model](https://github.com/pumped-fn/pumped-fn/blob/main/docs/mental-model.md).
