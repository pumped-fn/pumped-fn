---
"@pumped-fn/lite": patch
---

Fix type ergonomics for tags arrays

- Change `Tagged<unknown>[]` to `Tagged<any>[]` at input boundaries to eliminate need for user casting
- Simplify `Tag.get()` return type from redundant conditional to plain `T`
- Applies to: `atom()`, `flow()`, `service()`, `createScope()`, `TagSource`
