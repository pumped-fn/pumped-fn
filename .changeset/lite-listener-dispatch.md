---
"@pumped-fn/lite": patch
---

Fix listener dispatch using stale snapshots: replacing listeners between dispatches at equal count (unsubscribe N + resubscribe N) kept notifying the removed listeners and never the new ones — React `useSelect` consumers with inline selectors froze permanently after the first update. Dispatch now snapshots per notification.

`scope.select()` handles now register their controller subscription lazily on first `subscribe()` instead of at construction, so handles created during a React render that gets discarded (StrictMode, Suspense replays) no longer leak subscriptions. `get()` stays fresh before the first subscription and frozen after dispose, matching the existing contract.

Invalidation scheduling uses O(1) queue membership instead of a linear scan.
