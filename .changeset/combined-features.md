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
- scope.exec() now returns FlowExecution<T> instead of Promised<T> directly (backward compatible via Promised auto-await)
- FlowExecutionImpl no longer exported (internal implementation detail)
