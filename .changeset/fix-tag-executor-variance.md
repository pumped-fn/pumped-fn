---
"@pumped-fn/lite": patch
---

fix(lite): use `any` for TagExecutor in Dependency type to fix contravariance issue

The Tag interface has a callable signature `(value: T): Tagged<T>` which makes it contravariant in T. This prevented `TagExecutor<SpecificType>` from being assignable to `TagExecutor<unknown>` in service/atom deps. Changed to `TagExecutor<any>` to bypass variance checking.
