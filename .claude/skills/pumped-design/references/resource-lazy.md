---
name: resource-lazy
tags: resource, add, lazy, conditional, reactive, static, update, accessor
description: Lazy, reactive, and static dependency modifiers. Use .lazy for conditional resolution, .reactive for updateable resources, .static for immutable dependencies. Includes scope.update() and accessor patterns.
---

# Resource: Lazy and Reactive Patterns

## Core Concept: All Executors Are Lazy By Default

**IMPORTANT:** All executors are lazy by default—they only initialize when included in a dependency graph being resolved.

The `.lazy`, `.reactive`, and `.static` modifiers control HOW dependencies are resolved:

- **Normal dependency**: Auto-resolved when parent resolves; factory receives the **value**
- **Lazy (.lazy)**: NOT auto-resolved; factory receives an **Accessor** to conditionally resolve
- **Reactive (.reactive)**: Auto-resolved; factory receives the **value**; supports updates
- **Static (.static)**: Auto-resolved; factory receives an **Accessor**; immutable

## When to Use

Use these patterns when:

- **Lazy (.lazy)**: Conditional dependencies based on config/feature flags (console logger in dev, pino in prod)
- **Reactive (.reactive)**: Resources that can be updated after initialization (config, feature flags, user preferences)
- **Static (.static)**: Immutable dependencies where you want accessor without reactivity overhead

**Don't use for:**
- Simple resources without special requirements (use basic dependency)
- Business logic (belongs in flows)

---

## Reactive Resources

### Basic Pattern

```typescript
import { provide, derive, createScope } from '@pumped-fn/core-next'

// Reactive resource that can be updated
const counter = provide(() => 0)

// Derived resource depending on reactive counter
const incrementedCounter = derive(
  counter.reactive,
  (count) => count + 1
)

// Usage
const scope = createScope()

const value = await scope.resolve(counter)  // 0
await scope.update(counter, (current) => current + 1)

const newValue = await scope.resolve(incrementedCounter)  // 2
```

### Why .reactive?

When a derived resource depends on `counter.reactive`, it automatically re-computes when the counter is updated via `scope.update()`.

```typescript
// ✅ Reactive dependency - re-computes on update
const derived = derive(
  counter.reactive,
  (count) => count * 2
)

await scope.update(counter, (c) => c + 1)
const value = await scope.resolve(derived)  // Updated

// ❌ Non-reactive dependency - doesn't re-compute
const derived = derive(
  counter,
  (count) => count * 2
)

await scope.update(counter, (c) => c + 1)
const value = await scope.resolve(derived)  // Stale
```

---

## Real Examples from Pumped-fn Tests

### Example 1: Basic Reactive Dependency (packages/next/tests/index.test.ts)

```typescript
const counter = provide(() => 0, name("counter"))
const incrementedCounter = derive(
  counter.reactive,
  (count) => {
    return count + 1
  },
  name("incrementedCounter")
)

const scope = createScope()

const counterValue = await scope.resolve(counter)  // 0
const incrementedValue = await scope.resolve(incrementedCounter)  // 1

await scope.update(counter, (current) => current + 1)

const updatedIncrementedValue = await scope.resolve(incrementedCounter)
expect(updatedIncrementedValue).toBe(2)
```

### Example 2: Chained Reactive Dependencies (packages/next/tests/index.test.ts)

```typescript
const counter = provide(() => 0)
const incrementedCounter = derive(
  counter.reactive,
  (count) => count + 1
)

const doubleIncrementedCounter = derive(
  incrementedCounter.reactive,
  (count) => count + 1
)

const scope = createScope()
const doubleAccessor = scope.accessor(doubleIncrementedCounter)

expect(await doubleAccessor.resolve()).toBe(2)

await scope.update(counter, (current) => current + 1)

expect(doubleAccessor.get()).toBe(3)
```

### Example 3: Multiple Reactive Dependency Patterns (packages/next/tests/index.test.ts)

```typescript
const counter = provide(() => 0)

// Single reactive dependency
const derivedCounter = derive(counter.reactive, (count) => count.toString())

// Array pattern
const derivedArrayCounter = derive([counter.reactive], (count, ctl) => {
  ctl.cleanup(() => {})
  return count.toString()
})

// Object pattern
const derivedObjectCounter = derive(
  { counter: counter.reactive },
  ({ counter }) => counter.toString()
)

const scope = createScope()

await scope.update(counter, (current) => current + 1)

// All derived resources reflect the update
const str1 = await scope.resolve(derivedCounter)  // "1"
const str2 = await scope.resolve(derivedArrayCounter)  // "1"
const str3 = await scope.resolve(derivedObjectCounter)  // "1"
```

### Example 4: Update Callbacks (packages/next/tests/index.test.ts)

```typescript
const counter = provide(() => 0)
const scope = createScope()

const updateCallback = vi.fn()
const cleanup = scope.onUpdate(counter, (accessor) => {
  updateCallback(accessor.get())
})

await scope.update(counter, (current) => current + 1)

expect(updateCallback).toBeCalledTimes(1)
expect(updateCallback).toBeCalledWith(1)

await scope.update(counter, (current) => current + 1)

expect(updateCallback).toBeCalledTimes(2)
expect(updateCallback).toBeCalledWith(2)

await cleanup()  // Remove listener
```

---

## Accessor Pattern

Accessors provide synchronous access to resolved reactive resources:

```typescript
const counter = provide(() => 0)
const derived = derive(counter.reactive, (count) => count * 2)

const scope = createScope()

// Create accessor
const accessor = scope.accessor(derived)

// First access requires resolution
const value1 = await accessor.resolve()  // 0

// After resolution, synchronous access
const value2 = accessor.get()  // 0 (no await)

// Updates propagate automatically
await scope.update(counter, (c) => c + 1)
const value3 = accessor.get()  // 2 (updated)
```

---

## Lazy Dependencies

**What `.lazy` actually does:**
- Prevents automatic resolution of the dependency
- Factory receives `Accessor<T>` instead of `T`
- Parent can conditionally resolve based on runtime conditions

**Key semantics:**
- **Without `.lazy`**: Dependency auto-resolved → factory receives value
- **With `.lazy`**: Dependency NOT auto-resolved → factory receives accessor

### Example 1: Configuration-Based Resolution

```typescript
const consoleLogger = provide(() => {
  console.log('Initializing console logger')
  return { log: (msg: string) => console.log(msg) }
})

const pinoLogger = provide(() => {
  console.log('Initializing pino logger')
  return { log: (msg: string) => console.log(`[PINO] ${msg}`) }
})

const appConfig = provide(() => ({
  env: process.env.NODE_ENV || 'development'
}))

// ✅ Correct: Using .lazy for conditional resolution
const logger = derive(
  {
    console: consoleLogger.lazy,  // Receives Accessor<Logger>
    pino: pinoLogger.lazy,        // Receives Accessor<Logger>
    config: appConfig              // Receives Config (auto-resolved)
  },
  async ({ console, pino, config }) => {
    // Only resolve the logger needed for current environment
    if (config.env === 'development') {
      return await console.resolve()  // Only consoleLogger initializes
    } else {
      return await pino.resolve()     // Only pinoLogger initializes
    }
  }
)

const scope = createScope()
const log = await scope.resolve(logger)
// Output: "Initializing console logger" (in dev)
// Only ONE logger was initialized, not both
```

**Alternative: Using scope-based tag resolution**

For cleaner config handling, use scope's tag resolution instead of passing config as dependency:

```typescript
import { tag } from '@pumped-fn/core-next'

const envTag = tag<string>()

const consoleLogger = provide(() => ({ log: (msg: string) => console.log(msg) }))
const pinoLogger = provide(() => ({ log: (msg: string) => console.log(`[PINO] ${msg}`) }))

const logger = derive(
  { console: consoleLogger.lazy, pino: pinoLogger.lazy },
  async ({ console, pino }, ctl) => {
    const env = ctl.scope.tag(envTag) ?? 'development'
    return env === 'development'
      ? await console.resolve()
      : await pino.resolve()
  }
)

// Usage with tagged scope
const scope = createScope({ tags: [envTag.of('production')] })
const log = await scope.resolve(logger)
// Output: "Initializing pino logger"
```

### Example 2: Optional Feature Flags

```typescript
const mlModel = provide(() => {
  console.log('Loading expensive ML model...')
  return { predict: (x: number) => x * 2 }
})

const featureFlags = provide(() => ({
  mlEnabled: false
}))

const predictionService = derive(
  {
    model: mlModel.lazy,      // Receives Accessor<MLModel>
    flags: featureFlags        // Receives FeatureFlags (auto-resolved)
  },
  async ({ model, flags }) => {
    if (flags.mlEnabled) {
      const m = await model.resolve()
      return { predict: (x: number) => m.predict(x) }
    }
    // ML model never initialized if feature disabled
    return { predict: (x: number) => x }
  }
)
```

### Example 3: Testing Benefits

Lazy dependencies reduce test pollution by not initializing unused dependencies:

```typescript
const dbConnection = provide(() => {
  console.log('Connecting to database...')
  return { query: async () => [] }
})

const cacheConnection = provide(() => {
  console.log('Connecting to cache...')
  return { get: async () => null }
})

const userService = derive(
  {
    db: dbConnection.lazy,      // Receives Accessor<DB>
    cache: cacheConnection.lazy // Receives Accessor<Cache>
  },
  async ({ db, cache }) => {
    return {
      getUser: async (id: string, useCache: boolean) => {
        if (useCache) {
          const c = await cache.resolve()
          const cached = await c.get()
          if (cached) return cached
        }
        const d = await db.resolve()
        return await d.query()
      }
    }
  }
)

// In tests:
const scope = createScope()
const service = await scope.resolve(userService)
// No "Connecting to..." output yet
// Connections only initialize when getUser() is called with useCache=true/false
```

**Use cases for lazy:**
- Conditional dependencies based on configuration
- Optional features controlled by feature flags
- Reducing test pollution (dependencies only resolve when needed)
- Explicit dependency resolution control

---

## Static Resources

Static resources are immutable - they never change and don't support updates:

```typescript
const config = provide(() => ({
  apiUrl: 'https://api.example.com',
  timeout: 5000
}))

// Use .static for immutable dependencies
const apiClient = derive(
  config.static,
  (cfg) => createClient(cfg)
)

// ✅ Static - more efficient, no reactivity overhead
// ❌ Cannot use scope.update(config, ...)
```

**Use .static when:**
- Resource is truly immutable
- No updates will ever be needed
- Want to avoid reactivity overhead

**Don't use .static when:**
- Resource might need updates
- Unsure if updates will be needed (use basic dependency)

---

## Troubleshooting

### Problem: "Derived resource not updating when dependency changes"

**Symptom:** Updates to resource don't propagate to derived resources

**Cause:** Derived resource doesn't depend on `.reactive`

**Solution:**

```typescript
// ❌ Wrong: No .reactive
const derived = derive(counter, (count) => count * 2)

await scope.update(counter, (c) => c + 1)
// derived doesn't update

// ✅ Correct: Use .reactive
const derived = derive(counter.reactive, (count) => count * 2)

await scope.update(counter, (c) => c + 1)
// derived updates automatically
```

---

### Problem: "Cannot update static resource"

**Symptom:** Error when calling `scope.update()` on static dependency

**Cause:** Static resources are immutable by design

**Solution:**

```typescript
// ❌ Wrong: Trying to update static
const config = provide(() => ({ port: 3000 }))
const derived = derive(config.static, (cfg) => cfg)

await scope.update(config, (c) => ({ port: 4000 }))  // Error

// ✅ Correct: Use reactive if updates needed
const config = provide(() => ({ port: 3000 }))
const derived = derive(config.reactive, (cfg) => cfg)

await scope.update(config, (c) => ({ port: 4000 }))  // Works
```

---

### Problem: "Lazy dependency resolves automatically"

**Symptom:** Lazy dependency initializes even though it shouldn't based on conditions

**Cause:** Not using `.lazy` modifier or using `resolves()` helper which auto-resolves all dependencies

**Solution:**

```typescript
// ❌ Wrong: No .lazy - both loggers initialize
const logger = derive(
  { console: consoleLogger, pino: pinoLogger, config: appConfig },
  async ({ console, pino, config }) => {
    // Too late - both already initialized!
    return config.env === 'dev' ? console : pino
  }
)

// ✅ Correct: Use .lazy - only needed logger initializes
const logger = derive(
  { console: consoleLogger.lazy, pino: pinoLogger.lazy, config: appConfig },
  async ({ console, pino, config }) => {
    if (config.env === 'dev') {
      return await console.resolve()  // Only this one initializes
    }
    return await pino.resolve()
  }
)
```

---

### Problem: "Accessor returns stale value"

**Symptom:** `accessor.get()` doesn't reflect recent updates

**Cause:** Accessor not created from reactive dependency

**Solution:**

```typescript
// ❌ Wrong: Accessor from non-reactive
const counter = provide(() => 0)
const derived = derive(counter, (c) => c * 2)  // No .reactive

const accessor = scope.accessor(derived)
await scope.update(counter, (c) => c + 1)
accessor.get()  // Stale value

// ✅ Correct: Use .reactive
const derived = derive(counter.reactive, (c) => c * 2)

const accessor = scope.accessor(derived)
await scope.update(counter, (c) => c + 1)
accessor.get()  // Updated value
```

---

### Problem: "Memory leak with update callbacks"

**Symptom:** Update callbacks continue firing after component unmounts

**Cause:** Not cleaning up `onUpdate()` listener

**Solution:**

```typescript
// ❌ Wrong: No cleanup
scope.onUpdate(counter, (accessor) => {
  console.log(accessor.get())
})

// ✅ Correct: Cleanup when done
const cleanup = scope.onUpdate(counter, (accessor) => {
  console.log(accessor.get())
})

// Later (e.g., component unmount)
await cleanup()
```

---

## Performance Considerations

### Reactive Overhead

```typescript
// More expensive: Reactive tracking
const derived = derive(counter.reactive, (c) => c * 2)

// Less expensive: No tracking
const derived = derive(counter, (c) => c * 2)

// Most expensive: Multiple reactive deps
const derived = derive(
  { a: counter.reactive, b: other.reactive },
  ({ a, b }) => a + b
)
```

**Guideline:** Only use `.reactive` when updates are actually needed.

### Lazy Initialization

```typescript
// Expensive resource - use .lazy
const mlModel = provide(() => {
  return loadLargeMLModel()  // 500ms initialization
}).lazy

// Only pay cost if feature is used
if (featureEnabled) {
  const model = await scope.resolve(mlModel)
}
```

---

## Related Sub-skills

- **resource-basic.md** - Basic resource patterns
- **resource-derived.md** - Derived resources with dependencies
- **coding-standards.md** - Type safety and naming
- **testing-utilities.md** - Testing reactive resources
- **flow-context.md** - Using reactive resources in flows
