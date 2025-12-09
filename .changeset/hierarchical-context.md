---
"@pumped-fn/lite": minor
---

Add hierarchical ExecutionContext with parent-child relationship per exec() call

**Breaking Changes:**

1. **`onClose()` timing changed**: Cleanup callbacks now run immediately when `exec()` completes (child auto-close), not when root context is manually closed.

2. **`ctx.input` isolation**: Each child context has its own isolated input. Root context input remains undefined. Previously, input was mutated on the shared context.

3. **Captured context behavior**: A context captured in setTimeout/callbacks will be closed after the parent `exec()` returns. Calling `exec()` on a closed context throws "ExecutionContext is closed".

**New Features:**

- `ctx.parent`: Reference to parent ExecutionContext (undefined for root)
- `ctx.data`: Per-context `Map<symbol, unknown>` for extension data storage
- Child contexts auto-close after exec completes
- Enables nested span tracing without AsyncLocalStorage
