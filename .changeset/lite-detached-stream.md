---
"@pumped-fn/lite": minor
---

Add `ExecutionContext.execDetachedStream()` for streaming work that must release its caller when an uncooperative generator ignores cancellation. Detached streams inherit context data structurally, preserve normal completion and failure, and contain late settlement after abandonment.
