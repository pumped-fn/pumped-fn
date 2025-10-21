---
title: Common Mistakes
description: Anti-patterns and their fixes
keywords: [mistakes, anti-patterns, best-practices]
---

# Common Mistakes

Common anti-patterns and how to fix them.

## Using `any` or Type Assertions

**❌ Don't:**
```typescript
const value = tag.get(ctx) as UserData
const result: any = await scope.resolve(executor)
```

**✅ Do:**
```typescript
const userTag = tag(custom<UserData>(), { label: 'user' })
const value = userTag.get(ctx)

const result = await scope.resolve(executor)
```

Use tags for type safety. Let inference work.

## Manual Type Annotations

**❌ Don't:**
```typescript
derive({ db, config }, ({ db, config }): Service => ({
  method: (): Promise<User> => db.query('...')
}))
```

**✅ Do:**
```typescript
derive({ db, config }, ({ db, config }) => ({
  method: () => db.query('...')
}))
```

Return types infer from implementation. Only annotate when truly needed.

## Ignoring Scope Disposal

**❌ Don't:**
```typescript
const scope = createScope()
const result = await scope.resolve(executor)
// scope never disposed
```

**✅ Do:**
```typescript
const scope = createScope()
try {
  const result = await scope.resolve(executor)
} finally {
  await scope.dispose()
}
```

Always dispose scopes to prevent resource leaks.

## Mixing Scope and Flow Concerns

**❌ Don't:**
```typescript
const requestHandler = provide(() => {
  // This runs once per scope, not per request!
  return { requestId: generateId() }
})
```

**✅ Do:**
```typescript
const requestHandler = flow((ctx, req) => {
  const requestId = generateId()
  ctx.set(requestIdTag, requestId)
  return processRequest(req)
})
```

Scopes are long-lived. Flows are short-lived. Use the right tool.

## Not Using preset() for Testing

**❌ Don't:**
```typescript
const db = derive(config, (cfg) =>
  process.env.NODE_ENV === 'test'
    ? mockDb
    : realDb(cfg)
)
```

**✅ Do:**
```typescript
const db = derive(config, (cfg) => realDb(cfg))

// In tests
const scope = createScope({
  presets: [preset(db, mockDb)]
})
```

Keep production logic clean. Use presets for test overrides.

## Circular Dependencies

**❌ Don't:**
```typescript
const a = derive(b, (bVal) => ({ bVal }))
const b = derive(a, (aVal) => ({ aVal }))
```

**✅ Do:**
```typescript
const shared = provide(() => ({ data: 'shared' }))
const a = derive(shared, (s) => ({ ...s, a: true }))
const b = derive(shared, (s) => ({ ...s, b: true }))
```

Break circular deps with common upstream executor.

## Forgetting .reactive()

**❌ Don't:**
```typescript
const cache = derive(config, (cfg) => buildCache(cfg))

scope.update(newConfig)
// cache still has old value!
```

**✅ Do:**
```typescript
const cache = derive.reactive(config, (cfg) => buildCache(cfg))

scope.update(newConfig)
// cache rebuilds with new config
```

Use `.reactive()` when you need live updates.

## Parallel Execution Without ctx.parallel()

**❌ Don't:**
```typescript
flow((ctx, input) => {
  // These run sequentially!
  const a = await ctx.exec(flowA, input)
  const b = await ctx.exec(flowB, input)
  return [a, b]
})
```

**✅ Do:**
```typescript
flow((ctx, input) => {
  return ctx.parallel([
    ctx.exec(flowA, input),
    ctx.exec(flowB, input)
  ])
})
```

Use `ctx.parallel()` for concurrent execution.

## Tag Without Label

**❌ Don't:**
```typescript
const userId = tag(custom<string>())
// Debugging nightmare - no label!
```

**✅ Do:**
```typescript
const userId = tag(custom<string>(), { label: 'user.id' })
// Clear debugging and better errors
```

Always provide labels for tags.

## See Also

- [Error Solutions](./error-solutions.md)
- [Type Verification](./type-verification.md)
- [API Cheatsheet](./api-cheatsheet.md)
