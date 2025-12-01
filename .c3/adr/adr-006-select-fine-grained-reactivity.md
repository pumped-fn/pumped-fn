---
id: ADR-006-select-fine-grained-reactivity
title: Fine-Grained Reactivity with select()
summary: >
  Add select() method to Scope for derived subscriptions with equality-based
  change detection, enabling fine-grained reactivity for frontend rendering optimization.
status: proposed
date: 2025-12-01
---

# [ADR-006] Fine-Grained Reactivity with select()

## Status {#adr-006-status}
**Accepted** - 2025-12-01

## Problem/Requirement {#adr-006-problem}

Frontend applications need fine-grained reactivity when working with collection atoms:

```typescript
const todosAtom = atom({ factory: () => fetchTodos() })
```

When rendering a list of `TodoItem` components, each item needs to:
1. Derive its specific todo from the collection
2. Only re-render when **its own data** changes
3. Not re-render when sibling todos change
4. Clean up subscription on unmount

Current options are suboptimal:
- **Full subscription via Controller** - Re-renders on any change to the collection
- **Separate atom per item** - Overhead, cache pollution, lifecycle complexity
- **External memoization** - Breaks encapsulation, duplicates state management

## Exploration Journey {#adr-006-exploration}

**Initial hypothesis:** Need an "ephemeral atom" type that isn't cached.

**Explored alternatives:**
1. **Ephemeral atoms** - Non-cacheable atoms that can't be dependencies
   - Problem: No reactivity without caching, just one-shot derivation
2. **Callback-based subscribe()** - `scope.subscribe(atom, { onChange })`
   - Problem: No synchronous `get()`, incompatible with React's `useSyncExternalStore`
3. **SelectHandle with get()** - Handle with `get()` + `subscribe()`
   - Winner: Enables synchronous reads for React 18+ concurrent rendering

**Key insights:**
- React 18's `useSyncExternalStore` requires synchronous snapshot via `getSnapshot()`
- Callback-only APIs cause tearing in concurrent rendering
- Handle pattern provides both sync reads and change notifications

**Confirmed:** Pattern aligns with:
- Redux `useSelector(state => state.user, shallowEqual)`
- Zustand `useStore(state => state.bears)`
- Jotai `selectAtom(baseAtom, selector, equalityFn)`

## Solution {#adr-006-solution}

Add `select()` method to Scope that creates a derived subscription with memoization:

```typescript
interface SelectOptions<S> {
  eq?: (prev: S, next: S) => boolean
}

interface SelectHandle<S> {
  get(): S
  subscribe(listener: () => void): () => void
}

interface Scope {
  select<T, S>(
    atom: Atom<T>,
    selector: (value: T) => S,
    options?: SelectOptions<S>
  ): SelectHandle<S>
}
```

### Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Return type | `SelectHandle<S>` | Enables sync `get()` for `useSyncExternalStore` |
| Listener signature | `() => void` | Matches `Controller.on()` pattern; use `get()` to read |
| Auto-cleanup | On zero subscribers | Single cleanup point, prevents memory leaks |
| `fireImmediately` | Removed | React controls initial render; never fire on subscribe |
| `prev` in listener | Removed | Keep simple; track manually if needed |

### Usage Pattern

```typescript
const handle = scope.select(
  todosAtom,
  (todos) => todos.find(t => t.id === itemId),
  { eq: (prev, next) => prev?.updatedAt === next?.updatedAt }
)

const todo = handle.get()

const unsub = handle.subscribe(() => {
  console.log('Changed:', handle.get())
})

unsub()
```

### Behavior

```
todosAtom changes
       │
       ▼
┌──────────────────┐
│ Run selector     │
│ todos.find(...)  │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐     eq returns true
│ Compare with     │─────────────────────► No notification
│ previous value   │
└────────┬─────────┘
         │ eq returns false
         ▼
┌──────────────────┐
│ Store new value  │
│ Notify listeners │
└──────────────────┘
```

### Default Equality

When `eq` is not provided, use reference equality (`===`). This works for:
- Primitive values
- Immutable data patterns (new reference = new value)

### Error Handling

If the source atom isn't resolved when `select()` is called:
- **Throw error** - User must ensure atom is resolved first
- Rationale: Keeps API simple, explicit lifecycle control

## Implementation {#adr-006-implementation}

```typescript
class SelectHandleImpl<T, S> implements Lite.SelectHandle<S> {
  private listeners = new Set<() => void>()
  private currentValue: S
  private ctrlUnsub: (() => void) | null = null

  constructor(
    private ctrl: Lite.Controller<T>,
    private selector: (value: T) => S,
    private eq: (prev: S, next: S) => boolean
  ) {
    if (ctrl.state !== 'resolved') {
      throw new Error("Cannot select from unresolved atom")
    }

    this.currentValue = selector(ctrl.get())

    this.ctrlUnsub = ctrl.on(() => {
      if (ctrl.state !== 'resolved') return

      const nextValue = this.selector(ctrl.get())
      if (!this.eq(this.currentValue, nextValue)) {
        this.currentValue = nextValue
        this.notifyListeners()
      }
    })
  }

  get(): S {
    return this.currentValue
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)

    return () => {
      this.listeners.delete(listener)
      if (this.listeners.size === 0) {
        this.cleanup()
      }
    }
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener()
    }
  }

  private cleanup(): void {
    this.ctrlUnsub?.()
    this.ctrlUnsub = null
    this.listeners.clear()
  }
}
```

## Changes Across Layers {#adr-006-changes}

### Context Level
- No changes to system overview

### Container Level
- **[c3-2](../c3-2-lite/README.md)**: Add `select()` to Public API table

### Component Level
- **[c3-201](../c3-2-lite/c3-201-scope.md)**:
  - Add SelectHandle interface
  - Add SelectOptions interface
  - Add `select()` method to Scope interface
  - Document behavior and usage patterns
  - Add testing section for select scenarios

### Source Files
- `src/types.ts`: Add `SelectHandle`, `SelectOptions` to Lite namespace
- `src/scope.ts`: Add `SelectHandleImpl` class and `select()` method
- `tests/select.test.ts`: New test file for select functionality

## Verification {#adr-006-verification}

- [ ] `select()` throws if atom not resolved
- [ ] `select()` subscribes to atom changes via Controller
- [ ] Selector function runs on each atom state change
- [ ] Selector only runs when atom is in 'resolved' state
- [ ] Default equality is reference equality (`===`)
- [ ] Custom `eq` function is called with (prev, next)
- [ ] Listeners only notified when `eq` returns false
- [ ] `handle.get()` returns current sliced value
- [ ] `handle.get()` returns updated value after change
- [ ] Multiple `subscribe()` calls work independently
- [ ] Unsubscribe removes specific listener
- [ ] Auto-cleanup when last subscriber unsubscribes
- [ ] Multiple selects on same atom work independently
- [ ] Memory: no leaks after all subscribers removed
- [ ] TypeScript: S inferred from selector return type

## React Integration {#adr-006-react}

### useSyncExternalStore Compatibility

The `SelectHandle` API is designed for React 18+ `useSyncExternalStore`:

```typescript
function useSelect<T, S>(
  atom: Lite.Atom<T>,
  selector: (value: T) => S,
  eq?: (prev: S, next: S) => boolean
): S {
  const scope = useScope()
  const selectorRef = useRef(selector)
  const eqRef = useRef(eq)

  useEffect(() => {
    selectorRef.current = selector
    eqRef.current = eq
  })

  const handleRef = useRef<Lite.SelectHandle<S>>()

  const subscribe = useCallback((onStoreChange: () => void) => {
    handleRef.current = scope.select(atom, selectorRef.current, { eq: eqRef.current })
    return handleRef.current.subscribe(onStoreChange)
  }, [scope, atom])

  const getSnapshot = useCallback(() => {
    return handleRef.current?.get() ?? selectorRef.current(scope.controller(atom).get())
  }, [scope, atom])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
```

### Why SelectHandle Works for React

| Requirement | How SelectHandle Satisfies |
|-------------|---------------------------|
| Sync snapshot | `handle.get()` is synchronous |
| Tearing prevention | Same snapshot throughout render |
| Strict mode | No fire on subscribe, React controls |
| Concurrent rendering | Consistent reads via `get()` |
| SSR | `getServerSnapshot` uses same `get()` |

### Selector Stability

Inline selectors are stabilized via refs in the hook:

```typescript
const todo = useSelect(todosAtom, todos => todos.find(t => t.id === id))
```

### SSR/Hydration

Server-side rendering requires pre-resolved atoms:

```typescript
const scope = await createScope()
await scope.resolve(todosAtom)

const clientScope = await createScope({
  presets: [preset(todosAtom, serverData)]
})
```

## Future Considerations {#adr-006-future}

### Multi-Atom Selection

Select from multiple atoms simultaneously:

```typescript
scope.selectMany(
  [userAtom, settingsAtom],
  ([user, settings]) => ({ name: user.name, theme: settings.theme }),
  { eq: shallowEqual }
)
```

### Atom Families

Dynamic atom creation with parameter:

```typescript
const todoAtomFamily = atomFamily((id: string) =>
  atom({ factory: () => fetchTodo(id) })
)
```

## Related {#adr-006-related}

- [c3-201](../c3-2-lite/c3-201-scope.md) - Scope & Controller (where select() lives)
- [c3-202](../c3-2-lite/c3-202-atom.md) - Atom (source for selections)
- [ADR-003](./adr-003-controller-reactivity.md) - Controller-based reactivity (foundation)
