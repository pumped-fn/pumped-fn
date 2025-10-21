---
title: Error Solutions
description: TypeScript error mappings and solutions
keywords: [errors, typescript, solutions]
---

# Error Solutions

Common TypeScript errors and how to fix them.

## Type 'unknown' is not assignable to type 'T'

**Error:**
```text
Type 'unknown' is not assignable to type 'UserData'
```

**Cause:** Tag not found in container, `.get()` returns `unknown`.

**Solution:**
```typescript
// Ensure tag is set before .get()
const scope = createScope({
  tags: [userDataTag({ id: '123' })]
})

// Or use .find() for optional access
const data = userDataTag.find(ctx)
if (!data) {
  throw new Error('User data not found')
}
```

## Cannot find name 'ctx'

**Error:**
```text
Cannot find name 'ctx'
```

**Cause:** Using scope context in executor factory.

**Solution:**
```typescript
// ❌ Wrong - ctx doesn't exist in executors
const executor = provide((controller) => appConfig.get(controller.scope))

// ✅ Right - get tag from scope, not ctx
const executor = derive.tag(appConfig, (cfg) => cfg)

// Or use scope.get() directly
const cfg = appConfig.get(scope)
```

## Argument of type 'X' is not assignable to parameter of type 'Y'

**Error:**
```text
Argument of type '{ port: number }' is not assignable to parameter of type 'AppConfig'
```

**Cause:** Tag value type mismatch.

**Solution:**
```typescript
// Check tag definition
const appConfig = tag(custom<AppConfig>(), { label: 'app.config' })

// Ensure value matches type
appConfig({
  port: 3000,
  env: 'development', // Don't forget required fields
  dbHost: 'localhost'
})
```

## Property 'X' does not exist on type 'never'

**Error:**
```text
Property 'query' does not exist on type 'never'
```

**Cause:** Type inference failure in destructured dependencies.

**Solution:**
```typescript
// ❌ Inference lost
derive({ db, config }, (deps) => {
  return deps.db.query // Error!
})

// ✅ Destructure parameter
derive({ db, config }, ({ db, config }) => {
  return db.query // Works!
})
```

## Circular dependency detected

**Error:**
```text
Circular dependency detected: A -> B -> A
```

**Cause:** Executor A depends on B, B depends on A.

**Solution:**
```typescript
// Break cycle with shared upstream
const shared = provide(() => ({ data: 'shared' }))
const a = derive(shared, (s) => ({ ...s, fromA: true }))
const b = derive(shared, (s) => ({ ...s, fromB: true }))
```

## Type instantiation is excessively deep

**Error:**
```text
Type instantiation is excessively deep and possibly infinite
```

**Cause:** Deep executor nesting or complex type inference.

**Solution:**
```typescript
// Add explicit type at problematic boundary
type ServiceType = {
  method: () => Promise<Result>
}

const service = derive({ db, config }, ({ db, config }): ServiceType => ({
  method: () => db.query('...')
}))
```

## Promise returned is not awaited

**Error:**
```text
Promise<T> returned but expected T
```

**Cause:** Missing `await` in async operations.

**Solution:**
```typescript
// ❌ Missing await
flow((ctx, input) => {
  const result = ctx.exec(subFlow, input) // Promise<T>
  return result
})

// ✅ Await subflow
flow((ctx, input) => {
  const result = await ctx.exec(subFlow, input) // T
  return result
})
```

## Object is possibly 'undefined'

**Error:**
```text
Object is possibly 'undefined'
```

**Cause:** Using `.find()` without null check.

**Solution:**
```typescript
// ❌ No null check
const value = tag.find(ctx)
return value.property // Error!

// ✅ Check before use
const value = tag.find(ctx)
if (!value) {
  throw new Error('Tag not found')
}
return value.property

// Or use .get() which throws
const value = tag.get(ctx)
return value.property
```

## Type 'Promised&lt;T&gt;' is not awaitable

**Error:**
```text
Type 'Promised<User>' is not awaitable
```

**Cause:** Trying to use Promised without awaiting.

**Solution:**
```typescript
// ❌ Can't use Promised directly
const promised = scope.resolve(userService)
promised.getUser('123') // Error!

// ✅ Await to get value
const service = await scope.resolve(userService)
service.getUser('123') // Works!

// Or chain with .map()
const user = await scope.resolve(userService)
  .map(s => s.getUser('123'))
```

## See Also

- [Common Mistakes](./common-mistakes.md)
- [Type Verification](./type-verification.md)
- [API Cheatsheet](./api-cheatsheet.md)
