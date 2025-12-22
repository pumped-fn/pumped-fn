---
"@pumped-fn/lite": minor
---

Add utility types for better DX and boundary types for extensions

- Add `Lite.Utils` namespace with type extraction utilities:
  - `AtomValue<A>`, `FlowOutput<F>`, `FlowInput<F>`, `TagValue<T>`, `ControllerValue<C>`
  - `DepsOf<T>`, `Simplify<T>`, `AtomType<T, D>`, `FlowType<O, I, D>`
- Add boundary types for passthrough extension code:
  - `AnyAtom`, `AnyFlow`, `AnyController`
- Add `ExecTarget` and `ExecTargetFn` type aliases for cleaner extension signatures
