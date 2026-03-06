---
"@pumped-fn/lite": patch
---

Fix 7 verified triage findings:

- **HIGH**: `set()`/`update()` no longer kills watch listeners — pendingSet path skips cleanups since factory doesn't re-run
- **MED**: `resolvingResources` moved from module-level global to per-scope instance — fixes false circular errors with concurrent scopes
- **MED**: `notifyListeners`/`emitStateChange` snapshot Sets before iterating — unsub during notification no longer drops siblings
- **MED**: `release()` now cleans `stateListeners` — no more orphan listener entries
- **MED**: `dispose()` cancels in-flight invalidation chains — sets `disposed` flag and clears queue
- **MED**: `service()` now calls `registerAtomToTags` — `tag.atoms()` returns service atoms
- **LOW-MED**: Resource `seek` uses `seekHas()` to traverse parent chain — correctly finds grandparent `undefined` values
