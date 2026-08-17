---
"@pumped-fn/lite": minor
---

Add `ExecutionContext.tags` as the typed home for ordered context tag families. It supports atomic family replacement from any `TagInput`, local and inherited reads, presence and deletion, and exact-family watching with synchronous initial delivery. Each watch call owns its own subscription, each listener receives its own value snapshot, and a failed initial delivery rolls the registration back. Watcher failures are rethrown after the family mutation commits, including mutations made through the compatibility tag helpers on `ContextData`. A reentrant write that does not settle throws instead of hanging. Existing raw-symbol bridging remains only for the 6.x migration: a raw write can replace an existing family but cannot create one.
