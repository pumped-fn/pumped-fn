---
"@pumped-fn/lite": minor
"@pumped-fn/lite-ui": minor
---

Extract shared tracking primitives and add reactive collections.

`@pumped-fn/lite` now exports `registerInTracker`, `startArrayTracking`, `stopArrayTracking`, `startTracking`, `stopTracking` from a new `tracker` module — allowing external renderers and benchmark adapters to share the same dep-tracking singleton.

`@pumped-fn/lite-ui` gains:
- `atoms<T>()` — reactive collection with item-level granularity (O(1) updates, stable `ItemSignal<T>` refs per key)
- `$` atom binding primitives and `bind` utilities
- `useScope()` / scope-context stack — tree-scoped reactive scope without global state
- Performance: sync fast-path for cached-deps resolution, pre-classified vnode prop dispatch, deps-graph static pre-classification
