---
"@pumped-fn/lite": minor
"@pumped-fn/pumped": patch
---

Add `ExecutionContext.tags` as the typed home for ordered context tag families. It supports atomic family replacement from any `TagInput`, local and inherited reads, presence and deletion, and exact-family watching with synchronous initial delivery. Watcher failures are rethrown after the family mutation commits, including mutations made through the compatibility tag helpers on `ContextData`. Existing raw-symbol bridging remains only for the 6.x migration: a raw write can replace an existing family but cannot create one.

Update Pumped's scheduler development dependency to use the published package after its move out of this repository.
