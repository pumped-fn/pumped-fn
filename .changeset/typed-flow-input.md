---
"@pumped-fn/lite": minor
---

Add `typed<T>()` utility for type-only flow input marking

- Add `typed<T>()` function that provides typed input without runtime parsing
- Fix type inference for `ctx.input` when using `parse` function - now correctly infers the parsed type
- Add `Lite.Typed<T>` interface and `typedSymbol` for the type marker

**Before:** Required explicit type annotation on factory callback
```typescript
const myFlow = flow({
  parse: (raw: unknown): MyType => validate(raw),
  factory: (ctx: Lite.ExecutionContext<MyType>) => ctx.input.field
})
```

**After:** Type is automatically inferred from parse return type
```typescript
const myFlow = flow({
  parse: (raw: unknown): MyType => validate(raw),
  factory: (ctx) => ctx.input.field  // ctx.input is MyType
})
```

**New:** Use `typed<T>()` for type-only marking without validation
```typescript
const myFlow = flow({
  parse: typed<{ name: string }>(),
  factory: (ctx) => ctx.input.name  // ctx.input is { name: string }
})
```
