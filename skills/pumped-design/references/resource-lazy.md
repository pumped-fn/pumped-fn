---
name: resource-lazy
tags: resource, add, lazy, conditional, reactive, static, update, accessor
description: Lazy loading and reactive resources. Use .reactive for resources that can be updated, .lazy for conditional initialization, .static for immutable dependencies. Includes scope.update() and accessor patterns for reactive state.
---

# Resource: Lazy and Reactive Patterns

## When to Use

Use lazy/reactive resource patterns when:

- **Reactive (.reactive)**: Resources that can be updated after initialization (config, feature flags, user preferences)
- **Lazy (.lazy)**: Resources that should only initialize when first accessed (expensive operations, optional features)
- **Static (.static)**: Resources that should never change (constants, immutable config)

**Don't use for:**
- Simple resources without update requirements (use basic `provide()`)
- Resources that need complex lifecycle (use basic `provide()` with controller)
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

## Lazy Resources

Lazy resources initialize only when first accessed:

```typescript
// ❌ Basic resource - initializes immediately
const dbPool = provide(() => {
  console.log('Initializing DB pool')
  return new Pool()
})

// ✅ Lazy resource - initializes on first access
const dbPool = provide(() => {
  console.log('Initializing DB pool')
  return new Pool()
}).lazy

const scope = createScope()
// No output yet

const pool = await scope.resolve(dbPool)
// Output: "Initializing DB pool"
```

**Use cases for lazy:**
- Expensive resources only needed conditionally
- Optional features
- Resources with slow initialization
- Feature flags

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

### Problem: "Lazy resource initializes immediately"

**Symptom:** Lazy resource runs initialization code before being accessed

**Cause:** Not using `.lazy` modifier

**Solution:**

```typescript
// ❌ Wrong: No .lazy
const dbPool = provide(() => {
  console.log('Init')  // Runs immediately
  return new Pool()
})

// ✅ Correct: Use .lazy
const dbPool = provide(() => {
  console.log('Init')  // Runs on first access
  return new Pool()
}).lazy
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
