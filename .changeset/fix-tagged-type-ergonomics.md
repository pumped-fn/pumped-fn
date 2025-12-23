---
"@pumped-fn/lite": patch
---

Improve type ergonomics for tags and Tag.get()

- Change `Tagged<unknown>[]` to `Tagged<any>[]` at input boundaries to eliminate user casting
- Simplify `Tag.get()` return type from redundant `HasDefault extends true ? T : T` to plain `T`
- Applies to: `atom()`, `flow()`, `service()`, `createScope()`, `TagSource`
