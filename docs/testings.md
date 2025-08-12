# Testing: Graph-Based Approach

With Pumped-fn, you test entire dependency graphs, not individual units. Change one node, the entire graph adapts.

## The Power of Graph Testing

Your application is a dependency graph. Test it that way:

<<< @/code/testing-graph-unified.ts#snippet{ts:line-numbers}

## Core Concepts United

### 1. **Graph Propagation**
Change the root → entire graph updates. No manual mock wiring.

### 2. **Scope Isolation**  
Each test gets its own scope. Run all tests concurrently without interference.

### 3. **Preset Power**
One `preset()` can simulate entire environments. No mock framework needed.

## Why Graph Testing Wins

**Traditional Approach:**
```typescript
// Mock everything individually
mockFetch.mockResolvedValue(...)
mockCache.mockImplementation(...)
mockConfig.mockReturnValue(...)
mockDatabase.mockResolvedValue(...)
// Hope they work together correctly
```

**Graph Approach:**
```typescript
// Change the environment, everything adapts
const scope = createScope(
  preset(env, 'test')
)
// Entire system configured for testing
```

## Testing Patterns

```typescript
// Test different environments
const prodScope = createScope(preset(env, 'production'))
const testScope = createScope(preset(env, 'test'))

// Test failure scenarios  
const failScope = createScope(
  preset(httpClient, { get: async () => { throw error } })
)

// Test with specific data
const dataScope = createScope(
  preset(database, { users: testData })
)
```

One line changes entire system behavior. That's graph testing.