---
"@pumped-fn/core-next": patch
---

Add flow execution tracking and extension authoring improvements

**Flow Execution Tracking:**
- FlowExecution return type with id, status, abort, ctx access
- Cancellation via AbortController with ctx.signal and ctx.throwIfAborted()
- Timeout support at scope.exec() and ctx.exec() levels
- Status tracking with observable status changes
- Execution registry with auto-cleanup

**Extension Authoring:**
- Extension authoring documentation and examples
- Scope capabilities and lifecycle documentation
- Real-world patterns for extensions

**API Changes:**
- scope.exec() now uses named parameters: `scope.exec({ flow, input, ...options })`
- scope.exec() returns FlowExecution<T> (thenable, backward compatible)

**Migration:**
```ts
// Before
await scope.exec(myFlow, input)
await scope.exec(myFlow, input, { tags: [tag1] })

// After
await scope.exec({ flow: myFlow, input })
await scope.exec({ flow: myFlow, input, tags: [tag1] })
```
