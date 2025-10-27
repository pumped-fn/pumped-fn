# Promised API Chainability

## Overview

All async operations in pumped-fn return `Promised<T>`, which is **chainable** like a monadic Promise wrapper.

**Key operations:** `resolve()`, `scope.run()`, `flow.execute()`, `accessor.resolve()`

---

## Core Concept

`Promised<T>` extends Promise behavior with functional operators:

```typescript
import { type Promised } from '@pumped-fn/core-next'

// Standard operations return Promised
const result: Promised<User> = scope.resolve(currentUser)

// Chain transformations
const userName = result
  .map(user => user.name)
  .mapError(error => new Error('Failed to get user'))
```

---

## Available Operators

### `.map<U>(fn: (value: T) => U): Promised<U>`

Transform success value:

```typescript
const user: Promised<User> = scope.resolve(currentUser)

const userName: Promised<string> = user.map(u => u.name)

const upperName: Promised<string> = user
  .map(u => u.name)
  .map(name => name.toUpperCase())
```

### `.mapError(fn: (error: unknown) => Error): Promised<T>`

Transform error:

```typescript
const user: Promised<User> = scope.resolve(currentUser)

const safeUser = user.mapError(error =>
  new Error(`Failed to load user: ${error.message}`)
)
```

### `.flatMap<U>(fn: (value: T) => Promised<U>): Promised<U>`

Chain dependent operations:

```typescript
const user: Promised<User> = scope.resolve(currentUser)

const posts: Promised<Post[]> = user.flatMap(u =>
  scope.resolve(userPosts) // Returns Promised<Post[]>
)
```

### `.catch(fn: (error: unknown) => T): Promised<T>`

Recover from errors:

```typescript
const user: Promised<User> = scope.resolve(currentUser)

const userOrDefault = user.catch(() => ({
  id: 'guest',
  name: 'Guest User'
}))
```

---

## React Integration

### In Components (with Suspense)

```typescript
function UserDashboard() {
  // useResolves internally handles Promised
  const [user] = useResolves(currentUser)

  // user is T, not Promised<T>
  return <div>{user.name}</div>
}
```

### Manual Resolution

```typescript
function App() {
  const [userData, setUserData] = useState<User | null>(null)

  useEffect(() => {
    const promised = scope.resolve(currentUser)
      .map(user => ({ ...user, loaded: true }))
      .mapError(error => {
        console.error('Load failed:', error)
        throw error
      })

    promised.then(setUserData)
  }, [])

  if (!userData) return <Loading />
  return <Dashboard user={userData} />
}
```

---

## Common Patterns

### Transformation Pipeline

```typescript
const result = scope.resolve(apiResponse)
  .map(data => data.items)
  .map(items => items.filter(item => item.active))
  .map(active => active.sort((a, b) => b.priority - a.priority))
  .mapError(error => {
    logError(error)
    return new Error('Failed to process data')
  })
```

### Dependent Resolution

```typescript
const userWithPosts = scope.resolve(currentUser)
  .flatMap(user =>
    scope.resolve(userPosts)
      .map(posts => ({ user, posts }))
  )
```

### Error Recovery

```typescript
const data = scope.resolve(remoteData)
  .catch(() => scope.resolve(cachedData))
  .catch(() => defaultData)
```

---

## Flow API Returns Promised

```typescript
import { flow } from '@pumped-fn/core-next'

const processOrder = flow((ctx, orderId: string) => {
  // Flow logic
  return { orderId, status: 'processed' }
})

// execute() returns Promised
const result: Promised<{ orderId: string, status: string }> =
  flow.execute(processOrder, '123', { scope })

// Chain operations
const notification = result
  .map(order => `Order ${order.orderId} ${order.status}`)
  .mapError(error => {
    logError(error)
    return 'Order processing failed'
  })

await notification // string
```

---

## Scope.run() Returns Promised

```typescript
const appScope = createScope()

const initialized: Promised<void> = appScope.run(async () => {
  const api = await appScope.resolve(apiClient)
  console.log('API ready')
})

// Can chain
initialized
  .map(() => console.log('App started'))
  .catch(error => {
    console.error('Startup failed:', error)
    process.exit(1)
  })
```

---

## Type Safety

`Promised<T>` maintains type safety through chains:

```typescript
const user: Promised<User> = scope.resolve(currentUser)

// ✅ Type-safe: string
const name: Promised<string> = user.map(u => u.name)

// ✅ Type-safe: number
const age: Promised<number> = user.map(u => u.age)

// ❌ Type error: User doesn't have 'foo'
const invalid = user.map(u => u.foo)
```

---

## React Hooks Abstract Promised

Most React usage doesn't need manual Promised handling:

```typescript
// ✅ Hooks handle Promised internally
function Component() {
  const [user] = useResolves(currentUser)  // user: User, not Promised<User>
  return <div>{user.name}</div>
}

// ❌ Don't do this
function Component() {
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    scope.resolve(currentUser).then(setUser)  // Manual Promised handling
  }, [])

  if (!user) return <Loading />
  return <div>{user.name}</div>
}
```

---

## Key Takeaways

1. **All async operations return Promised** - Not plain Promise
2. **Chainable operators** - `map`, `mapError`, `flatMap`, `catch`
3. **Type-safe transformations** - Types flow through chain
4. **React hooks abstract it** - Usually don't need manual handling
5. **Use for pipelines** - Transform/error-handle in functional style

---

## When to Use Promised Chains

✅ **Use when:**
- Transforming resolved values
- Error handling pipelines
- Dependent resolutions
- Flow result processing

❌ **Don't need when:**
- Using `useResolves()` in components
- Simple `await` is clearer
- No transformations needed

**Rule:** Use Promised chains for functional pipelines, `await` for imperative code.
