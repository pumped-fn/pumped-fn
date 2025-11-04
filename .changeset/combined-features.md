---
"@pumped-fn/core-next": minor
---

Add flow execution tracking and comprehensive extension authoring documentation

**Flow Execution Tracking:**
- FlowExecution return type with id, status, abort, ctx access
- Cancellation via AbortController with ctx.signal and ctx.throwIfAborted()
- Timeout support at scope.exec() and ctx.exec() levels
- Status tracking with observable status changes (pending → running → completed/failed/cancelled)
- Execution registry with auto-cleanup

**Extension Authoring:**
- New extension-authoring sub-skill with progressive learning structure
- Comprehensive scope capabilities and lifecycle documentation
- Real-world patterns: correlation tracking, rate limiting, APM integration, multi-tenancy
- Type-safe operation discrimination and error handling patterns

**Verifiable Skill Code Pattern:**
- 13 typechecked TypeScript files (4,509 LOC) extracted from skill markdown
- 79 grep references for AI-assisted code discovery
- Zero `@ts-nocheck` directives - full type safety
- Pattern documented for future skill improvements

**Breaking Changes:**
- Removed positional API: `scope.exec(flow, input, options)` → use `scope.exec({ flow, input, ...options })`
- scope.exec() now returns FlowExecution<T> (thenable, fully backward compatible)
- FlowExecutionImpl no longer exported (internal implementation detail)

**Migration:**
```ts
// Before
await scope.exec(myFlow, input)
await scope.exec(myFlow, input, { tags: [tag1] })

// After
await scope.exec({ flow: myFlow, input })
await scope.exec({ flow: myFlow, input, tags: [tag1] })
```

FlowExecution<T> is thenable, so existing await patterns continue to work.
