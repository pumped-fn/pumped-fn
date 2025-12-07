---
"@pumped-fn/lite": minor
"@pumped-fn/react-lite": minor
---

feat(lite,react-lite): add controller resolution options and reference counting

**New Features:**

**Controller Resolution Options:**
- Add optional `resolve` parameter to `controller()` for auto-resolution
- Lazy (default): `controller(atom)` - controller stays in idle state
- Eager: `controller(atom, { resolve: true })` - auto-resolves before factory executes

```typescript
const dependentAtom = atom({
  deps: { config: controller(configAtom, { resolve: true }) },
  factory: (ctx, { config }) => {
    return config.get()
  }
})
```

**Reference Counting (ScopeInternal):**
- Add `ScopeInternal` interface with `acquireRef()` and `releaseRef()` methods
- Enables automatic lifecycle management for framework integrations
- Atoms are kept alive while references exist
- Auto-cleanup when reference count reaches zero

**React Integration:**
- Add `UseControllerOptions` with `resolve` and `cascade` options
- `resolve: true` - suspends until controller is resolved
- `cascade: true` - auto-manages atom lifecycle with component mount/unmount

```typescript
const ctrl = useController(userAtom, { resolve: true, cascade: true })
```

**Implementation Details:**
- Fixed async cleanup in React hooks (fire-and-forget pattern)
- Added failed state handling to prevent retry loops
- Guard against unbalanced `releaseRef` calls
- Clear refs map during scope disposal

**Documentation:**
- Updated C3 docs for controller resolution options
- Documented `ScopeInternal` interface for framework integrations
- Added comprehensive test coverage for new features
