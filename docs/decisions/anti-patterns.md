# Anti-Patterns

Common mistakes and their solutions when working with Pumped-FN.

## Side Effects in Factories

**Problem:** Factories should be pure functions. Side effects make executors unpredictable and hard to test.

<<< @/code/basic-patterns.ts#anti-pattern-side-effects{ts}

**Why it matters:**
- Factories may be called multiple times during resolution
- Side effects break caching assumptions
- Makes testing and reasoning difficult

**Solution:** Keep factories pure. Place side effects in methods or lifecycle hooks.

## Async Factory Functions

**Problem:** Factory functions must be synchronous. Async factories break the resolution model.

<<< @/code/basic-patterns.ts#anti-pattern-async-factory{ts}

**Why it matters:**
- Executors resolve synchronously to values
- Async factories create unresolved promises
- Breaks type inference and composition

**Solution:** Return an object with async methods instead of making the factory async.

## Hidden Dependencies

**Problem:** Accessing external state instead of declaring dependencies.

```ts
// ❌ Bad: Hidden dependency on global
const globalConfig = { apiUrl: "https://api.example.com" }

const apiClient = provide(() => ({
  fetch: () => axios.get(globalConfig.apiUrl) // Hidden!
}))

// ✅ Good: Explicit dependency
const config = provide(() => ({ apiUrl: "https://api.example.com" }))

const apiClient = derive([config], ([cfg]) => ({
  fetch: () => axios.get(cfg.apiUrl)
}))
```

**Why it matters:**
- Hidden dependencies prevent proper testing
- Graph doesn't reflect actual dependencies
- Can't swap implementations with presets

## Mutating Resolved Values

**Problem:** Mutating cached values affects other consumers.

```ts
// ❌ Bad: Mutating shared state
const counter = provide(() => ({ count: 0 }))

const incrementer = derive([counter], ([ctr]) => {
  ctr.count++ // Mutates shared object!
  return ctr.count
})

// ✅ Good: Return new values
const counter = provide(() => ({ count: 0 }))

const incrementer = derive([counter], ([ctr]) => {
  return { ...ctr, count: ctr.count + 1 }
})
```

**Why it matters:**
- Cached values are shared across resolutions
- Mutations create unexpected side effects
- Breaks single-responsibility of executors

## Best Practices Summary

1. **Pure Factories**: No side effects, no async
2. **Explicit Dependencies**: Declare all dependencies in arrays
3. **Immutable Values**: Don't mutate resolved values
4. **Clear Boundaries**: Separate scope resources from flow operations
