---
"@pumped-fn/lite": major
---

**BREAKING**: `createScope()` now returns `Scope` synchronously instead of `Promise<Scope>`.

Migration:
```typescript
// Before
const scope = await createScope()

// After
const scope = createScope()
// resolve() waits for ready internally, or use:
await scope.ready
```

Other changes:
- Add `Controller.on()` state filtering: `ctl.on('resolved', fn)`, `ctl.on('resolving', fn)`, `ctl.on('*', fn)`
- Fix duplicate listener notifications (was 3x per invalidation, now 2x)
- On failed state, only `'*'` listeners are notified (not `'resolved'`)
