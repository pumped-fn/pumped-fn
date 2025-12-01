---
"@pumped-fn/lite": minor
---

Add `scope.select()` for fine-grained reactivity with selector and equality-based change detection.

- `SelectHandle<S>` provides `get()` and `subscribe()` for derived subscriptions
- Default reference equality (`===`) with optional custom `eq` function
- Auto-cleanup when last subscriber unsubscribes
- Designed for React 18+ `useSyncExternalStore` compatibility
