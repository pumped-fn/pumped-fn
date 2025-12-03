---
"@pumped-fn/lite": patch
---

Improve README documentation clarity and reduce size by 19%

**Enhanced API behavior documentation:**
- `ctx.cleanup()`: Clarified lifecycle - runs on every invalidation (before re-resolution) and release, LIFO order
- `ctx.data`: Clarified lifecycle - persists across invalidations, cleared on release, per-atom isolation
- `controller(atom)` as dep: Explained key difference - receives unresolved controller vs auto-resolved value
- `ctx.invalidate()`: Explained scheduling behavior - runs after factory completes, not interrupting
- `ctrl.get()`: Documented stale reads during resolving state
- `scope.flush()`: Added to API Reference (was undocumented)

**Trimmed content:**
- Removed duplicate Core Concepts diagram
- Condensed Flow section
- Condensed Extensions section
- Consolidated Lifecycle diagrams
- Removed rarely-used Direct Tag Methods section
