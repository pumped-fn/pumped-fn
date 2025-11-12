---
"@pumped-fn/core-next": minor
---

Add select() method for property-level reactivity with change detection

Adds `.select()` method to executors that creates derived executors for individual object properties with automatic change detection. Only propagates updates when the selected property value actually changes (using Object.is by default).

Features:
- Executor identity: same key returns same instance
- Change detection: only propagates when value changes
- Custom equality: supports custom comparator functions
- Automatic cleanup: WeakRef-based caching with GC
