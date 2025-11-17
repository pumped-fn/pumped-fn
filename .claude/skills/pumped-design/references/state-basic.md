---
name: state-basic
tags: state, add, reactive, lifecycle
description: Define in-memory reactive state using provide/derive. State represents session data, ephemeral cache, app state. Same API as resources but conceptually different - state is internal reactive data, resources are external integrations.
---

# State: Basic Patterns

## When to Use

Use state for in-memory, scope-bound reactive data. Use resources for external integrations.

| Use State | Use Resource |
|-----------|--------------|
| Session cache (in-memory Map) | Database connection |
| OAuth tokens (short/refresh) | API client |
| App state (user preferences) | Logger |
| Form data (ephemeral) | File system |
| Request-scoped cache | Message queue |

**State characteristics:**
- In-memory, scope-bound lifecycle
- Reactive via `.reactive` property
- Controller via `.static` property
- Same `provide/derive` API as resources

**When uncertain:** If it needs I/O or configuration from tags → Resource. If it's in-memory reactive data → State.

## Code Template

### File Naming

`state.*.ts` - Flat structure with prefix (follows coding-standards.md)

**Examples:**
- `state.session-cache.ts`
- `state.oauth-tokens.ts`
- `state.user-preferences.ts`

### Basic State Definition

```typescript
import { provide, derive } from '@pumped-fn/core-next'

// Define state with initial value
const counter = provide(() => 0)

// Derive controller for mutations
const counterCtl = derive(counter.static, (ctl) => {
  return {
    get: () => ctl.get(),
    set: (value: number) => ctl.set(value),
    increment: () => ctl.update(n => n + 1),
    decrement: () => ctl.update(n => n - 1)
  }
})
```

### State with Lifecycle and Tag-based Map

```typescript
import { provide, derive, tag, custom, type Tag } from '@pumped-fn/core-next'

namespace Cache {
  export type Entry<T> = { value: T; timestamp: number }
}

const cache = provide((controller) => {
  const map = new Map<symbol, Cache.Entry<unknown>>()

  controller.cleanup(() => {
    console.log('Clearing cache on dispose')
    map.clear()
  })

  return map
})

const cacheCtl = derive(cache.static, (ctl) => ({
  get: <T>(key: Tag.Tag<T, false>) => key.readFrom(ctl.get()),
  set: async <T>(key: Tag.Tag<T, false>, value: T) => {
    await ctl.update(store => { store.set(key.key, value); return store })
  }
}))

export const cacheKey = <T>(label: string) => tag(custom<T>(), { label })
```

**Type Safety**: Using `key.readFrom(store)` provides type-safe access without casting - tags validate at runtime and infer types at compile time.

## Reactive Consumption

Use `.reactive` property as explicit dependency in flows. When state updates via controller mutations, reactive consumers re-execute.

```typescript
import { flow } from '@pumped-fn/core-next'
import { counter } from './state.counter'

const displayCounter = flow(
  counter.reactive,
  async (value, ctx) => {
    console.log('Counter:', value)
    return value
  }
)
```

**Non-reactive access:**
```typescript
// Resolved once, never re-executes on updates
const display = flow(
  counter,
  async (value, ctx) => value
)
```

**Reactive access:**
```typescript
// Re-executes when counter updates
const display = flow(
  counter.reactive,
  async (value, ctx) => value
)
```

### Mix with Resources

States often pair with resources inside a single flow dependency map:

```typescript
export const cartState = provide(() => new Map<string, number>())

export const checkout = flow(
  {
    repo: orderRepository,
    cart: cartState.reactive
  },
  async ({ repo, cart }, ctx) => {
    const payload = Array.from(cart.entries())
    const created = await ctx.exec({
      fn: () => repo.create(payload),
      key: 'create-order'
    })
    return created
  }
)
```

- `cart.reactive` triggers flow re-run when items update.
- Resource operation is journaled via `ctx.exec`.

## Static Controller

Use `.static` property to create controllers for imperative mutations.

```typescript
import { derive } from '@pumped-fn/core-next'
import { counter } from './state.counter'

const counterCtl = derive(counter.static, (ctl) => {
  return {
    // Read current value
    get: () => ctl.get(),

    // Replace value
    set: (n: number) => ctl.set(n),

    // Functional update
    update: (fn: (n: number) => number) => ctl.update(fn),

    // Subscribe to changes
    subscribe: (fn: (n: number) => void) => ctl.subscribe(fn)
  }
})
```

**Controller methods:**
- `ctl.get()` - Returns current value
- `ctl.set(value)` - Replaces value, triggers reactive subscribers
- `ctl.update(fn)` - Applies function to current value, triggers subscribers
- `ctl.subscribe(fn)` - Registers callback for value changes

**In flows with explicit dependencies:**
```typescript
const increment = flow(
  counterCtl,
  async (ctl, ctx) => {
    ctl.update(n => n + 1)
  }
)
```

## Troubleshooting

### Problem: "State not updating reactively"

**Symptom:** Reactive consumer not re-executing on state changes

**Solution:** Use `.reactive` as explicit dependency:
```typescript
// ❌ Wrong - not reactive
const display = flow(
  counter,
  async (value, ctx) => value
)

// ✅ Correct - reactive
const display = flow(
  counter.reactive,
  async (value, ctx) => value
)
```

### Problem: "Cannot mutate state from entrypoint"

**Symptom:** Need to update state outside flow

**Solution:** Flows are mandatory orchestration point. Create flow with controller dependency:
```typescript
const updateState = flow(
  stateCtl,
  async (ctl, ctx, value) => {
    ctl.set(value)
  }
)

await scope.exec({ flow: updateState, input: newValue })
```

### Problem: "Cleanup not running"

**Symptom:** State cleanup not called on dispose

**Solution:** Ensure `controller.cleanup()` registered in provide:
```typescript
const state = provide((controller) => {
  const resource = initialize()
  controller.cleanup(() => resource.dispose())
  return resource
})
```

## Related Sub-skills

- **State: Derived** - State with dependencies (composition)
- **Resource: Basic** - Resources follow same API
- **Flow: Basic** - Explicit dependency injection patterns
- **Coding Standards** - File naming, type safety

## See Also

- [Reactive Patterns Guide](../../../docs/guides/08-reactive-patterns.md)
- [State Patterns Guide](../../../docs/guides/11-state-patterns.md)
