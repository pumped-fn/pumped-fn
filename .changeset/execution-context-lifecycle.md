---
"@pumped-fn/core-next": patch
---

Add ExecutionContext lifecycle management

**New Features:**
- `ExecutionContext.state` property with states: `'active'` | `'closing'` | `'closed'`
- `ExecutionContext.closed` convenience boolean for quick state checks
- `ExecutionContext.close(options?)` method with graceful (default) and abort modes
- `ExecutionContext.onStateChange(callback)` subscription returning cleanup function
- `ExecutionContextClosedError` thrown when operations attempted on closed context
- `ContextLifecycleOperation` extension hook for observing context lifecycle events

**Graceful mode (default):**
- Waits for all in-flight executions to complete
- Cascades close to child contexts
- Returns single promise for idempotent calls

**Abort mode:**
- Signals abort to in-flight executions via `AbortController`
- Collects errors into `AggregateError` if any operations fail
- Useful for timeout or cancellation scenarios

**Extension Integration:**
- Extensions receive `context-lifecycle` operations with phases: `create`, `closing`, `closed`
- Enables middleware patterns: tracing, logging, metrics collection

**Bug Fixes:**
- Fixed 33 unhandled promise rejections in test suite
- Added vitest setup file for unhandled rejection detection
