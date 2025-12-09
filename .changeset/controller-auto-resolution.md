---
"@pumped-fn/lite": minor
---

Add controller auto-resolution option

- Add `{ resolve: true }` option to `controller()` helper
- When set, the controller is auto-resolved before the factory runs
- Eliminates need for redundant atom+controller deps or manual `resolve()` calls

```typescript
const myAtom = atom({
  deps: { config: controller(configAtom, { resolve: true }) },
  factory: (ctx, { config }) => {
    config.get()  // safe - already resolved
  }
})
```
