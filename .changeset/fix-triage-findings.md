---
"@pumped-fn/lite": patch
---

Fix 16 bugs found via adversarial triage + 5 rounds of Codex review:

**Correctness**
- `preset(atom, undefined)` now works — uses `has()` check instead of `!== undefined`
- `seekHas()` traverses parent chain via interface dispatch, not `instanceof`
- Error-path `pendingSet` only reschedules value-type sets — `fn(undefined)` no longer produces garbage
- `doInvalidateSequential` swallows resolve errors when pending operations exist
- Resource cycle detection moved to per-execution-chain WeakMap — fixes false errors with `ctx.exec()`
- Resource inflight check runs before circular check — sibling `ctx.exec()` no longer false-positives

**Reactive system**
- `set()`/`update()` pendingSet path skips cleanups — watch deps preserved since factory doesn't re-run
- Unconditional `invalidationChain.delete()` in pendingSet fast-path — prevents self-loops
- Copy-on-iterate on all 4 listener iteration sites — unsub during notification no longer drops siblings

**Lifecycle**
- `dispose()` awaits `chainPromise` before setting `disposed` — drains pending invalidation chain
- `resolve()`, `controller()`, `createContext()` throw after dispose
- `release()` cleans up dependents + schedules GC on freed deps

**SelectHandle**
- Eager subscription in constructor — tracks changes without active subscribers
- `dispose()` method for explicit teardown
- Re-subscribe refreshes cached value after auto-cleanup
- Added `seekHas()` to `ContextData` interface, `dispose()` to `SelectHandle` interface
