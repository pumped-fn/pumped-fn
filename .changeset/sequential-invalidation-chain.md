---
"@pumped-fn/lite": minor
---

Add sequential invalidation chain with loop detection

- Invalidations now execute sequentially in dependency order (A → B → C)
- Infinite loop detection throws with helpful error message showing chain path
- New `scope.flush()` method to await pending invalidations
- State transitions now happen AFTER cleanups complete (matching C3-201 docs)
- Self-invalidation during factory execution remains deferred (poll-and-refresh pattern)
