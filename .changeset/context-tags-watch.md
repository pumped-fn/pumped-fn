---
"@pumped-fn/lite": minor
---

Add `ExecutionContext.tags` as the typed home for ordered context tag families. It supports atomic family replacement from any `TagInput`, local and inherited reads, presence and deletion, and exact-family watching with synchronous initial delivery. Existing tag helpers on `ContextData` remain as compatibility shims.
