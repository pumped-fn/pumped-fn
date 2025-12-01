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

**BREAKING**: `Controller.on()` now requires explicit event type.

Migration:
```typescript
// Before
ctl.on(() => { ... })

// After
ctl.on('resolved', () => { ... })  // Most common: react to new values
ctl.on('resolving', () => { ... }) // Loading states
ctl.on('*', () => { ... })         // All state changes
```

Other changes:
- Fix duplicate listener notifications (was 3x per invalidation, now 2x)
- On failed state, only `'*'` listeners are notified (not `'resolved'`)
