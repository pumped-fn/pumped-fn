---
"@pumped-fn/lite": patch
---

fix: simplify service to be narrowed atom with type constraint

**BREAKING**: Removed `Service<T>` interface, `isService()`, and `serviceSymbol`

- `service()` now returns `Atom<T extends ServiceMethods>` directly
- Use `isAtom()` instead of `isService()` for type guards
- Removed `ServiceFactory` type - uses `AtomFactory` instead

The `ServiceMethods` constraint ensures methods match the `(ctx: ExecutionContext, ...args) => result`
signature that `ctx.exec({ fn, params })` expects. This is enforced at compile time.

Migration:
- Replace `Lite.Service<T>` with `Lite.Atom<T>` where `T extends Lite.ServiceMethods`
- Replace `isService(value)` with `isAtom(value)`
