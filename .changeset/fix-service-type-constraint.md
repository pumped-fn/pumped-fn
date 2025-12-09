---
"@pumped-fn/lite": patch
---

fix: enforce ServiceMethods type constraint on service return type

The `service()` function now properly enforces that the return type `T` must be a record of methods where each method receives `ExecutionContext` as its first parameter.

Before: `Service<T>` allowed any type `T`
After: `Service<T extends ServiceMethods>` requires `T` to be `Record<string, (ctx: ExecutionContext, ...args) => unknown>`

This is a type-level fix that improves type safety without changing runtime behavior.
