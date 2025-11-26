---
"@pumped-fn/core-next": minor
---

Add Sucrose static analysis and JIT compilation

- Static analysis via `analyze()` detects factory patterns (async, cleanup, reload, scope usage)
- JIT compilation via `compile()` generates optimized factory functions
- Compilation metadata accessible via `getMetadata(executor)`
- Skip reasons (`skipReason`, `skipDetail`) explain why compilation was skipped
- Call site tracking for better error messages
- Supports all dependency shapes: none, single, array, record
