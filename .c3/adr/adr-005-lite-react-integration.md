---
id: ADR-005-lite-react-integration
title: React Integration for @pumped-fn/lite with Centralized Machine Pattern
summary: >
  Design a React binding for @pumped-fn/lite that uses a centralized machine pattern
  for state orchestration, with support for selectors (slices), optimistic updates,
  and explicit transition states.
status: proposed
date: 2025-11-29
---

# [ADR-005] React Integration for @pumped-fn/lite

## Status {#adr-005-status}
**Proposed** - 2025-11-29

## Problem/Requirement {#adr-005-problem}

`@pumped-fn/lite` provides lightweight DI with Controller-based reactivity (ADR-003), making it suitable for frontend state management. However, direct integration with React requires addressing several frontend-specific concerns:

### Core Requirements

1. **React Integration**
   - Connect atoms to React's rendering lifecycle
   - Support Concurrent React features (Suspense, transitions)
   - Efficient re-rendering (only affected components)

2. **Slices (Granular Subscriptions)**
   - Components often need only a portion of an atom's state
   - Changing unrelated fields shouldn't trigger re-renders
   - Example: Avatar component only needs `user.profile.avatar`, not entire user object

3. **Optimistic Updates**
   - Show immediate feedback before server confirmation
   - Automatic rollback on failure
   - Support multiple concurrent mutations

4. **Transition States**
   - Beyond simple loading/error states
   - Explicit state machines for complex flows (forms, wizards, multi-step processes)
   - Predictable state transitions

### Architectural Decision Point

Two patterns emerged during exploration:

**Pattern A: Decentralized (Controller-per-atom)**
```
atomA.invalidate() → atomB.on() → atomB.invalidate() → atomC.on() → ...
```
- Each atom manages its own reactivity
- Downstream subscribes to upstream via `controller.on()`
- Emergent behavior from composition

**Pattern B: Centralized (Machine orchestrator)**
```
machine.send('EVENT') → machine decides which atoms to invalidate
```
- Single source of truth for state transitions
- Explicit event-to-invalidation mapping
- Predictable, debuggable flows

This ADR proposes **Pattern B** for complex frontend state, while preserving Pattern A for simple cases.

## Exploration Journey {#adr-005-exploration}

### Phase 1: Direct Controller → React Mapping

**Initial hypothesis:** Map Controller directly to `useSyncExternalStore`.

```typescript
function useAtom<T>(atom: Atom<T>): T {
  const ctrl = scope.controller(atom)
  return useSyncExternalStore(ctrl.on, ctrl.get)
}
```

**Result:** Works for simple cases. Controller's `on()` and `get()` align perfectly with `useSyncExternalStore`'s subscribe/getSnapshot pattern.

**Problem discovered:** For complex state flows, reactivity is scattered across atoms. Debugging requires tracing through multiple `controller.on()` subscriptions.

### Phase 2: Centralized Machine Pattern

**Insight:** Frontend state often follows explicit event-driven patterns:
- User actions trigger state changes
- Multiple atoms may need coordinated updates
- The "what happens when" should be in one place

**Solution:** Introduce a `machine()` that wraps atoms and defines event handlers.

```typescript
const appMachine = machine({
  atoms: { user, posts, notifications },
  on: {
    LOGIN: (ctx) => ctx.invalidate(ctx.atoms.user),
    LOGOUT: (ctx) => ctx.invalidateAll(),
    REFRESH: (ctx) => ctx.invalidate(ctx.atoms.posts)
  }
})
```

### Phase 3: Slices/Selectors

**Problem:** Component subscribes to `userAtom` but only uses `user.name`. When `user.avatar` changes, component re-renders unnecessarily.

**Explored solutions:**

1. **Split into multiple atoms:** `userNameAtom`, `userAvatarAtom`, etc.
   - Rejected: Explosion of atoms, loses cohesion

2. **Selector with memoization:** Derive slice, compare with previous
   - Selected: Natural, composable, familiar pattern (Redux selectors, Recoil selectors)

**Implementation insight:** Selector wraps atom subscription, compares slice values, only triggers React update when slice changes.

### Phase 4: Optimistic Updates

**Problem:** User clicks "Like" → wait for server → show result. Poor UX.

**Desired flow:**
1. Apply optimistic change immediately
2. Send request to server
3. On success: keep or refresh from server
4. On failure: rollback to previous state

**Key insight:** Two-layer state model:
- **Server layer:** Atom values (source of truth)
- **Optimistic layer:** Pending mutations (temporary overlay)
- **Computed view:** Merge of both layers (what components see)

**Design decision:** Optimistic updates are scoped to mutations, not general atom writes. This preserves type safety (factory return type is the only value source).

### Phase 5: Transition States

**Problem:** Atom states (idle/resolving/resolved/failed) don't capture all UI states.

**Examples:**
- Form: `idle → validating → submitting → success/error`
- Delete: `idle → confirming → deleting → deleted`
- Upload: `idle → selecting → uploading(50%) → done`

**Solution:** Machine has its own state, separate from atom states. This enables XState-like patterns without XState dependency.

## Solution {#adr-005-solution}

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     @pumped-fn/lite-react Architecture                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                         Machine                                   │ │
│  │  ┌─────────────────────────────────────────────────────────────┐ │ │
│  │  │  State: 'authenticated' | 'anonymous' | ...                 │ │ │
│  │  │  Events: { LOGIN, LOGOUT, REFRESH, LIKE, ... }              │ │ │
│  │  └─────────────────────────────────────────────────────────────┘ │ │
│  │                              │                                    │ │
│  │              ┌───────────────┼───────────────┐                   │ │
│  │              ▼               ▼               ▼                   │ │
│  │  ┌─────────────────────────────────────────────────────────────┐ │ │
│  │  │                 Atoms (Server Truth)                        │ │ │
│  │  │   userAtom        postsAtom        notificationsAtom        │ │ │
│  │  └─────────────────────────────────────────────────────────────┘ │ │
│  │              │               │               │                   │ │
│  │              └───────────────┼───────────────┘                   │ │
│  │                              ▼                                    │ │
│  │  ┌─────────────────────────────────────────────────────────────┐ │ │
│  │  │              Optimistic Layer                               │ │ │
│  │  │   Map<MutationId, { atom, previous, optimistic }>           │ │ │
│  │  └─────────────────────────────────────────────────────────────┘ │ │
│  │                              │                                    │ │
│  │                              ▼                                    │ │
│  │  ┌─────────────────────────────────────────────────────────────┐ │ │
│  │  │              Selectors (Slices)                             │ │ │
│  │  │   avatarSelector     themeSelector     unreadCountSelector  │ │ │
│  │  └─────────────────────────────────────────────────────────────┘ │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                    │                                    │
│                                    ▼                                    │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                       React Components                            │ │
│  │                                                                   │ │
│  │   useAtom(atom)              → full atom value                    │ │
│  │   useSelector(selector)      → sliced value (optimized)           │ │
│  │   useMachineState()          → machine state + send               │ │
│  │   useMutation(name)          → optimistic mutation                │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1. Core React Bindings

#### Provider

```typescript
interface LiteProviderProps {
  scope: Lite.Scope
  children: React.ReactNode
}

function LiteProvider({ scope, children }: LiteProviderProps): JSX.Element
```

Injects scope into React context. All hooks consume this context.

#### useScope

```typescript
function useScope(): Lite.Scope
```

Access the scope directly for advanced use cases.

#### useAtom

```typescript
function useAtom<T>(atom: Lite.Atom<T>): T
```

Subscribe to atom value. Uses `useSyncExternalStore` internally.

**Implementation:**
```typescript
function useAtom<T>(atom: Lite.Atom<T>): T {
  const scope = useScope()
  const controllerRef = useRef<Lite.Controller<T>>()

  if (!controllerRef.current) {
    controllerRef.current = scope.controller(atom)
  }

  const ctrl = controllerRef.current

  return useSyncExternalStore(
    useCallback((onStoreChange) => ctrl.on(onStoreChange), [ctrl]),
    useCallback(() => ctrl.get(), [ctrl]),
    useCallback(() => ctrl.get(), [ctrl])
  )
}
```

#### useController

```typescript
function useController<T>(atom: Lite.Atom<T>): Lite.Controller<T>
```

Get controller for manual control (invalidation, state inspection).

### 2. Selectors (Slices)

#### selector factory

```typescript
interface SelectorConfig<TSource, TSlice> {
  source: Lite.Atom<TSource>
  select: (source: TSource) => TSlice
  equals?: (prev: TSlice, next: TSlice) => boolean
}

interface Selector<TSource, TSlice> {
  readonly [selectorSymbol]: true
  readonly source: Lite.Atom<TSource>
  readonly select: (source: TSource) => TSlice
  readonly equals: (prev: TSlice, next: TSlice) => boolean
}

function selector<TSource, TSlice>(
  config: SelectorConfig<TSource, TSlice>
): Selector<TSource, TSlice>
```

#### Multi-source selector

```typescript
interface MultiSelectorConfig<TSources, TSlice> {
  sources: { [K in keyof TSources]: Lite.Atom<TSources[K]> }
  select: (sources: TSources) => TSlice
  equals?: (prev: TSlice, next: TSlice) => boolean
}

function selector<TSources extends Record<string, unknown>, TSlice>(
  config: MultiSelectorConfig<TSources, TSlice>
): Selector<TSources, TSlice>
```

#### useSelector hook

```typescript
function useSelector<TSource, TSlice>(
  selector: Selector<TSource, TSlice>
): TSlice
```

**Implementation:**
```typescript
function useSelector<TSource, TSlice>(
  selector: Selector<TSource, TSlice>
): TSlice {
  const scope = useScope()
  const ctrl = scope.controller(selector.source)
  const selectFn = selector.select
  const equalsFn = selector.equals

  const sliceRef = useRef<TSlice | undefined>(undefined)
  const initializedRef = useRef(false)

  const getSnapshot = useCallback(() => {
    const fullValue = ctrl.get()
    const nextSlice = selectFn(fullValue)

    if (initializedRef.current && sliceRef.current !== undefined) {
      if (equalsFn(sliceRef.current, nextSlice)) {
        return sliceRef.current
      }
    }

    initializedRef.current = true
    sliceRef.current = nextSlice
    return nextSlice
  }, [ctrl, selectFn, equalsFn])

  return useSyncExternalStore(
    useCallback((onStoreChange) => ctrl.on(onStoreChange), [ctrl]),
    getSnapshot,
    getSnapshot
  )
}
```

#### Equality functions

```typescript
const equals = {
  shallow: <T>(a: T, b: T) => shallowEqual(a, b),
  deep: <T>(a: T, b: T) => deepEqual(a, b),
  strict: <T>(a: T, b: T) => Object.is(a, b)
}
```

### 3. Machine Pattern

#### machine factory

```typescript
interface MachineConfig<
  TAtoms extends Record<string, Lite.Atom<unknown>>,
  TEvents extends Record<string, unknown>,
  TState extends string = string,
  TMutations extends Record<string, unknown> = Record<string, unknown>
> {
  atoms: TAtoms

  on?: {
    [E in keyof TEvents]?: (
      ctx: MachineEventContext<TAtoms>,
      payload: TEvents[E]
    ) => void | Promise<void>
  }

  initial?: TState

  states?: {
    [S in TState]?: {
      entry?: (ctx: MachineStateContext<TAtoms>) => void | Promise<void>
      exit?: (ctx: MachineStateContext<TAtoms>) => void | Promise<void>
      on?: {
        [E in keyof TEvents]?: TState | {
          target?: TState
          guard?: (ctx: MachineEventContext<TAtoms>, payload: TEvents[E]) => boolean
          action?: (ctx: MachineEventContext<TAtoms>, payload: TEvents[E]) => void
        }
      }
    }
  }

  mutations?: {
    [M in keyof TMutations]?: Mutation<TAtoms, TMutations[M]>
  }
}

interface Machine<TAtoms, TEvents, TState> {
  readonly scope: Lite.Scope
  readonly atoms: TAtoms
  readonly state: TState

  send<E extends keyof TEvents>(event: E, payload?: TEvents[E]): void

  controller<K extends keyof TAtoms>(
    key: K
  ): Lite.Controller<TAtoms[K] extends Lite.Atom<infer T> ? T : never>

  on(listener: () => void): () => void

  matches(state: TState): boolean

  can<E extends keyof TEvents>(event: E): boolean

  dispose(): Promise<void>
}

async function createMachine<TAtoms, TEvents, TState, TMutations = Record<string, unknown>>(
  config: MachineConfig<TAtoms, TEvents, TState, TMutations>,
  options?: { scope?: Lite.Scope }
): Promise<Machine<TAtoms, TEvents, TState>>
```

#### MachineEventContext

```typescript
interface MachineEventContext<TAtoms> {
  readonly atoms: TAtoms
  readonly scope: Lite.Scope
  readonly payload: unknown

  invalidate<K extends keyof TAtoms>(...keys: K[]): void

  invalidateAll(): void

  invalidateWithDependents<K extends keyof TAtoms>(key: K): void

  send(event: string, payload?: unknown): void
}
```

#### MachineStateContext

```typescript
interface MachineStateContext<TAtoms> {
  readonly atoms: TAtoms
  readonly scope: Lite.Scope
  readonly previousState: string | undefined
  readonly currentState: string

  invalidate<K extends keyof TAtoms>(...keys: K[]): void

  send(event: string, payload?: unknown): void
}
```

#### React hooks for Machine

```typescript
interface MachineProviderProps<TAtoms, TEvents, TState> {
  machine: Machine<TAtoms, TEvents, TState>
  children: React.ReactNode
}

function MachineProvider<TAtoms, TEvents, TState>(
  props: MachineProviderProps<TAtoms, TEvents, TState>
): JSX.Element

function useMachine<TAtoms, TEvents, TState>(): Machine<TAtoms, TEvents, TState>

function useMachineState<TState extends string>(): {
  state: TState
  matches: (state: TState) => boolean
  can: (event: string) => boolean
}

function useSend<TEvents>(): <E extends keyof TEvents>(
  event: E,
  payload?: TEvents[E]
) => void

function useMachineAtom<T>(key: string): T
```

### 4. Optimistic Updates

#### Mutation definition

```typescript
interface MutationConfig<TAtoms, TPayload, TResult = void> {
  optimistic?: <K extends keyof TAtoms>(
    current: TAtoms[K] extends Lite.Atom<infer T> ? T : never,
    payload: TPayload,
    atomKey: K
  ) => TAtoms[K] extends Lite.Atom<infer T> ? T : never

  mutate: (
    ctx: MutationContext<TAtoms>,
    payload: TPayload
  ) => Promise<TResult>

  onSuccess?: (
    ctx: MutationContext<TAtoms>,
    result: TResult,
    payload: TPayload
  ) => void

  onError?: (
    ctx: MutationContext<TAtoms>,
    error: Error,
    payload: TPayload
  ) => void

  invalidates?: (keyof TAtoms)[]

  retry?: number | {
    count: number
    delay: number | ((attempt: number) => number)
  }
}

interface Mutation<TAtoms, TPayload, TResult = void> {
  readonly [mutationSymbol]: true
  readonly config: MutationConfig<TAtoms, TPayload, TResult>
}

function mutation<TAtoms, TPayload, TResult = void>(
  config: MutationConfig<TAtoms, TPayload, TResult>
): Mutation<TAtoms, TPayload, TResult>
```

#### MutationContext

```typescript
interface MutationContext<TAtoms> {
  readonly atoms: TAtoms
  readonly scope: Lite.Scope
  readonly mutationId: string

  invalidate<K extends keyof TAtoms>(...keys: K[]): void

  get<K extends keyof TAtoms>(
    key: K
  ): TAtoms[K] extends Lite.Atom<infer T> ? T : never
}
```

#### useMutation hook

```typescript
interface MutationResult<TPayload> {
  mutate: (payload: TPayload) => Promise<void>

  mutateAsync: (payload: TPayload) => Promise<void>

  readonly isPending: boolean

  readonly isOptimistic: boolean

  readonly error: Error | undefined

  reset: () => void
}

function useMutation<TPayload>(
  mutationName: string
): MutationResult<TPayload>
```

#### Optimistic state implementation

```typescript
interface OptimisticEntry<T> {
  readonly mutationId: string
  readonly atom: Lite.Atom<T>
  readonly previous: T
  readonly optimistic: T
  readonly timestamp: number
}

class OptimisticStore {
  private entries = new Map<string, OptimisticEntry<unknown>>()
  private listeners = new Set<() => void>()

  apply<T>(mutationId: string, atom: Lite.Atom<T>, previous: T, optimistic: T): void

  rollback(mutationId: string): void

  commit(mutationId: string): void

  getForAtom<T>(atom: Lite.Atom<T>): OptimisticEntry<T>[]

  computeValue<T>(atom: Lite.Atom<T>, serverValue: T): T

  on(listener: () => void): () => void
}
```

#### Optimistic merge algorithm

```typescript
function computeOptimisticValue<T>(
  serverValue: T,
  entries: OptimisticEntry<T>[]
): T {
  if (entries.length === 0) {
    return serverValue
  }

  const sortedEntries = entries.sort((a, b) => a.timestamp - b.timestamp)

  return sortedEntries.reduce(
    (value, entry) => entry.optimistic,
    serverValue
  )
}
```

### 5. Transition States

#### State machine within Machine

The `states` configuration in `machine()` enables explicit state transitions:

```typescript
const formMachine = machine({
  atoms: { form: formAtom, errors: errorsAtom },

  initial: 'idle',

  states: {
    idle: {
      on: {
        SUBMIT: 'validating',
        CHANGE: { action: (ctx) => ctx.invalidate('form') }
      }
    },

    validating: {
      entry: async (ctx) => {
        const errors = await validate(ctx.scope.resolve(ctx.atoms.form))
        if (errors.length > 0) {
          ctx.send('VALIDATION_FAILED', { errors })
        } else {
          ctx.send('VALIDATION_PASSED')
        }
      },
      on: {
        VALIDATION_PASSED: 'submitting',
        VALIDATION_FAILED: {
          target: 'idle',
          action: (ctx, { errors }) => {
            ctx.scope.resolve(ctx.atoms.errors).then(e => {
              ctx.invalidate('errors')
            })
          }
        }
      }
    },

    submitting: {
      entry: async (ctx) => {
        try {
          await submitForm(ctx.scope.resolve(ctx.atoms.form))
          ctx.send('SUBMIT_SUCCESS')
        } catch (error) {
          ctx.send('SUBMIT_ERROR', { error })
        }
      },
      on: {
        SUBMIT_SUCCESS: 'success',
        SUBMIT_ERROR: 'error'
      }
    },

    success: {
      on: {
        RESET: 'idle'
      }
    },

    error: {
      on: {
        RETRY: 'submitting',
        RESET: 'idle'
      }
    }
  }
})
```

#### State transition diagram

```
                              SUBMIT
                    ┌─────────────────────────┐
                    │                         │
                    ▼                         │
   ┌──────────┐    ┌────────────┐    ┌───────┴────┐
   │   idle   │───►│ validating │───►│ submitting │
   └────▲─────┘    └─────┬──────┘    └───┬────┬───┘
        │                │               │    │
        │     VALIDATION_FAILED          │    │
        │◄───────────────┘               │    │
        │                                │    │
        │    RESET                       │    │
        │◄───────────────────────────────┼────┤
        │                                │    │
        │                         SUCCESS│    │ERROR
        │                                │    │
        │                                ▼    ▼
        │                          ┌─────────────┐
        │           RESET          │   success   │
        │◄─────────────────────────├─────────────┤
        │                          │    error    │──► RETRY ──┐
        │◄─────────────────────────┴─────────────┘            │
        │           RESET                                      │
        │                                                      │
        └───────────────────────── (to submitting) ◄───────────┘
```

### 6. Async Resolution & Suspense

#### Suspense integration

```typescript
function useAtom<T>(atom: Lite.Atom<T>): T {
  const scope = useScope()
  const ctrl = scope.controller(atom)

  if (ctrl.state === 'idle') {
    throw ctrl.resolve()
  }

  if (ctrl.state === 'resolving') {
    throw new Promise<void>((resolve) => {
      const unsub = ctrl.on(() => {
        if (ctrl.state !== 'resolving') {
          unsub()
          resolve()
        }
      })
    })
  }

  if (ctrl.state === 'failed') {
    throw ctrl.error
  }

  return useSyncExternalStore(
    (onStoreChange) => ctrl.on(onStoreChange),
    () => ctrl.get(),
    () => ctrl.get()
  )
}
```

#### Non-Suspense async hook

```typescript
interface AtomValue<T> {
  value: T | undefined
  state: AtomState
  error: Error | undefined
  refresh: () => void
}

function useAtomValue<T>(atom: Lite.Atom<T>): AtomValue<T>
```

### 7. Package Structure

```
packages/lite-react/
├── src/
│   ├── index.ts              # Public exports
│   ├── types.ts              # Type definitions
│   ├── symbols.ts            # Unique symbols
│   │
│   ├── core/
│   │   ├── context.ts        # React contexts (ScopeContext, MachineContext)
│   │   ├── provider.tsx      # LiteProvider, MachineProvider
│   │   └── hooks.ts          # useScope, useAtom, useController
│   │
│   ├── selector/
│   │   ├── selector.ts       # selector() factory
│   │   ├── hooks.ts          # useSelector
│   │   └── equals.ts         # Equality functions
│   │
│   ├── machine/
│   │   ├── machine.ts        # createMachine(), Machine implementation
│   │   ├── context.ts        # MachineEventContext, MachineStateContext
│   │   ├── hooks.ts          # useMachine, useMachineState, useSend
│   │   └── types.ts          # Machine type definitions
│   │
│   ├── mutation/
│   │   ├── mutation.ts       # mutation() factory
│   │   ├── store.ts          # OptimisticStore
│   │   ├── hooks.ts          # useMutation
│   │   └── types.ts          # Mutation type definitions
│   │
│   └── suspense/
│       ├── hooks.ts          # useAtomValue (non-suspense async)
│       └── boundary.tsx      # AtomErrorBoundary helper
│
├── tests/
│   ├── core.test.tsx
│   ├── selector.test.tsx
│   ├── machine.test.tsx
│   ├── mutation.test.tsx
│   └── suspense.test.tsx
│
├── package.json
├── tsconfig.json
└── tsdown.config.ts
```

## API Summary {#adr-005-api}

### Core

| Export | Description |
|--------|-------------|
| `LiteProvider` | Injects scope into React tree |
| `useScope` | Access scope directly |
| `useAtom` | Subscribe to atom value (Suspense-compatible) |
| `useController` | Get controller for manual control |
| `useAtomValue` | Subscribe with explicit loading state |

### Selectors

| Export | Description |
|--------|-------------|
| `selector` | Create selector from atom(s) |
| `useSelector` | Subscribe to selector slice |
| `equals` | Equality function helpers |

### Machine

| Export | Description |
|--------|-------------|
| `machine` | Define machine configuration |
| `createMachine` | Create machine instance |
| `MachineProvider` | Inject machine into React tree |
| `useMachine` | Access machine instance |
| `useMachineState` | Get machine state and helpers |
| `useMachineAtom` | Subscribe to atom via machine |
| `useSend` | Get event dispatch function |

### Mutations

| Export | Description |
|--------|-------------|
| `mutation` | Define mutation configuration |
| `useMutation` | Execute mutation with optimistic support |

## Usage Examples {#adr-005-examples}

### Example 1: Simple Atom Subscription

```tsx
import { atom } from '@pumped-fn/lite'
import { LiteProvider, useAtom } from '@pumped-fn/lite-react'

const countAtom = atom({ factory: () => 0 })

function Counter() {
  const count = useAtom(countAtom)
  const ctrl = useController(countAtom)

  return (
    <div>
      <span>{count}</span>
      <button onClick={() => ctrl.invalidate()}>Refresh</button>
    </div>
  )
}

function App() {
  const scope = useMemo(() => createScope(), [])

  return (
    <LiteProvider scope={scope}>
      <Counter />
    </LiteProvider>
  )
}
```

### Example 2: Selector for Optimized Rendering

```tsx
const userAtom = atom({
  factory: async () => fetchUser()
})

const avatarSelector = selector({
  source: userAtom,
  select: (user) => user.profile.avatar
})

const statsSelector = selector({
  source: userAtom,
  select: (user) => user.stats,
  equals: equals.shallow
})

function Avatar() {
  const avatar = useSelector(avatarSelector)
  return <img src={avatar} />
}

function Stats() {
  const stats = useSelector(statsSelector)
  return <div>Posts: {stats.posts}, Followers: {stats.followers}</div>
}
```

### Example 3: Machine with State Transitions

```tsx
const authMachine = machine({
  atoms: { user: userAtom, session: sessionAtom },

  initial: 'anonymous',

  states: {
    anonymous: {
      on: {
        LOGIN: 'authenticating'
      }
    },
    authenticating: {
      entry: async (ctx) => {
        try {
          await authenticate()
          ctx.invalidate('user', 'session')
          ctx.send('AUTH_SUCCESS')
        } catch {
          ctx.send('AUTH_FAILURE')
        }
      },
      on: {
        AUTH_SUCCESS: 'authenticated',
        AUTH_FAILURE: 'anonymous'
      }
    },
    authenticated: {
      on: {
        LOGOUT: {
          target: 'anonymous',
          action: (ctx) => ctx.invalidateAll()
        }
      }
    }
  }
})

function LoginButton() {
  const { state, send, matches } = useMachineState()

  if (matches('authenticated')) {
    return <button onClick={() => send('LOGOUT')}>Logout</button>
  }

  return (
    <button
      onClick={() => send('LOGIN')}
      disabled={matches('authenticating')}
    >
      {matches('authenticating') ? 'Logging in...' : 'Login'}
    </button>
  )
}
```

### Example 4: Optimistic Mutation

```tsx
const likeMutation = mutation({
  optimistic: (posts, { postId }) =>
    posts.map(p => p.id === postId
      ? { ...p, liked: true, likeCount: p.likeCount + 1 }
      : p
    ),

  mutate: async (ctx, { postId }) => {
    await api.likePost(postId)
  },

  onError: (ctx, error) => {
    toast.error('Failed to like post')
  },

  invalidates: ['posts']
})

const feedMachine = machine({
  atoms: { posts: postsAtom },
  mutations: { LIKE: likeMutation }
})

function LikeButton({ post }) {
  const { mutate, isPending, isOptimistic } = useMutation('LIKE')

  return (
    <button
      onClick={() => mutate({ postId: post.id })}
      disabled={isPending}
      className={isOptimistic ? 'optimistic' : ''}
    >
      {post.liked ? '♥' : '♡'} {post.likeCount}
    </button>
  )
}
```

### Example 5: Complete Application

```tsx
import { atom, createScope } from '@pumped-fn/lite'
import {
  LiteProvider,
  machine,
  createMachine,
  MachineProvider,
  useSelector,
  useMachineState,
  useMutation,
  selector,
  mutation
} from '@pumped-fn/lite-react'

const userAtom = atom({ factory: fetchUser })
const postsAtom = atom({
  deps: { user: userAtom },
  factory: (ctx, { user }) => fetchPosts(user.id)
})
const notificationsAtom = atom({
  deps: { user: userAtom },
  factory: (ctx, { user }) => fetchNotifications(user.id)
})

const userNameSelector = selector({
  source: userAtom,
  select: u => u.name
})

const unreadCountSelector = selector({
  source: notificationsAtom,
  select: n => n.filter(x => !x.read).length
})

const likeMutation = mutation({
  optimistic: (posts, { postId }) =>
    posts.map(p => p.id === postId ? { ...p, liked: true } : p),
  mutate: (ctx, { postId }) => api.like(postId)
})

const appMachineConfig = machine({
  atoms: { user: userAtom, posts: postsAtom, notifications: notificationsAtom },
  mutations: { LIKE: likeMutation },

  initial: 'idle',

  on: {
    REFRESH: (ctx) => ctx.invalidate('posts', 'notifications')
  },

  states: {
    idle: {
      on: { REFRESH: 'refreshing' }
    },
    refreshing: {
      entry: (ctx) => ctx.invalidate('posts', 'notifications'),
      on: { DONE: 'idle' }
    }
  }
})

async function bootstrap() {
  const scope = await createScope()
  const appMachine = await createMachine(appMachineConfig, { scope })

  return { scope, appMachine }
}

function App() {
  const [ready, setReady] = useState(false)
  const [context, setContext] = useState<{ scope: Scope; appMachine: Machine }>()

  useEffect(() => {
    bootstrap().then(ctx => {
      setContext(ctx)
      setReady(true)
    })
  }, [])

  if (!ready || !context) return <Loading />

  return (
    <LiteProvider scope={context.scope}>
      <MachineProvider machine={context.appMachine}>
        <Suspense fallback={<Loading />}>
          <Dashboard />
        </Suspense>
      </MachineProvider>
    </LiteProvider>
  )
}

function Header() {
  const userName = useSelector(userNameSelector)
  const unreadCount = useSelector(unreadCountSelector)

  return (
    <header>
      <h1>Welcome, {userName}</h1>
      <NotificationBadge count={unreadCount} />
    </header>
  )
}

function RefreshButton() {
  const { state, send, matches } = useMachineState()

  return (
    <button onClick={() => send('REFRESH')} disabled={matches('refreshing')}>
      {matches('refreshing') ? <Spinner /> : 'Refresh'}
    </button>
  )
}

function PostList() {
  const posts = useMachineAtom('posts')

  return (
    <ul>
      {posts.map(post => <PostItem key={post.id} post={post} />)}
    </ul>
  )
}

function PostItem({ post }) {
  const { mutate, isPending } = useMutation('LIKE')

  return (
    <li>
      <p>{post.content}</p>
      <button onClick={() => mutate({ postId: post.id })} disabled={isPending}>
        {post.liked ? '♥' : '♡'}
      </button>
    </li>
  )
}

function Dashboard() {
  return (
    <div>
      <Header />
      <RefreshButton />
      <PostList />
    </div>
  )
}
```

## Performance Considerations {#adr-005-performance}

### Selector Memoization

Selectors use referential equality by default (`Object.is`). For object slices, use `equals.shallow` or `equals.deep`:

```typescript
const statsSelector = selector({
  source: userAtom,
  select: u => ({ posts: u.stats.posts, followers: u.stats.followers }),
  equals: equals.shallow
})
```

### Optimistic Store Overhead

- Optimistic entries stored in Map with mutation ID keys
- Each pending mutation adds ~100 bytes overhead
- Entries cleaned up immediately on commit/rollback
- Typical apps have <10 concurrent mutations

### Machine Event Processing

- Events processed synchronously when possible
- Async state entry functions use microtask scheduling
- State listeners notified in batch after transition completes

### Re-render Optimization

| Pattern | Re-renders When |
|---------|-----------------|
| `useAtom(atom)` | Any atom value change |
| `useSelector(selector)` | Slice value change (per equality fn) |
| `useMachineState()` | Machine state change |
| `useMutation(name)` | isPending/isOptimistic change |

## Comparison with Alternatives {#adr-005-comparison}

| Feature | lite-react | Zustand | Jotai | Redux Toolkit | TanStack Query |
|---------|------------|---------|-------|---------------|----------------|
| Bundle size | ~3KB* | ~1KB | ~2KB | ~12KB | ~13KB |
| Async built-in | ✓ | Middleware | ✓ | Middleware | ✓ |
| Selectors | ✓ | ✓ | Derived atoms | ✓ | Select option |
| Optimistic updates | ✓ | Manual | Manual | Manual | ✓ |
| State machine | ✓ | External | External | External | ✗ |
| DI/Composition | ✓ | ✗ | Partial | ✗ | ✗ |
| Backend sharing | ✓** | ✗ | ✗ | ✗ | ✗ |
| Cleanup hooks | ✓ | ✗ | ✗ | ✗ | ✗ |
| Suspense | ✓ | ✗ | ✓ | ✗ | ✓ |

\* Excludes @pumped-fn/lite (~17KB) which may already be in bundle
\** Same atoms can run on Node.js backend and React frontend

## Migration Paths {#adr-005-migration}

### From Zustand

```typescript
// Zustand
const useStore = create((set) => ({
  count: 0,
  increment: () => set((state) => ({ count: state.count + 1 }))
}))

// lite-react
const countAtom = atom({ factory: () => 0 })

const counterMachine = machine({
  atoms: { count: countAtom },
  on: {
    INCREMENT: (ctx) => ctx.invalidate('count')
  }
})
```

### From Redux Toolkit

```typescript
// Redux Toolkit
const counterSlice = createSlice({
  name: 'counter',
  initialState: { value: 0 },
  reducers: {
    increment: (state) => { state.value += 1 }
  }
})

// lite-react
const counterAtom = atom({ factory: () => ({ value: 0 }) })

const counterMachine = machine({
  atoms: { counter: counterAtom },
  on: {
    INCREMENT: (ctx) => ctx.invalidate('counter')
  }
})
```

### From TanStack Query (for mutations)

```typescript
// TanStack Query
const likeMutation = useMutation({
  mutationFn: (postId) => api.like(postId),
  onMutate: async (postId) => {
    await queryClient.cancelQueries(['posts'])
    const previous = queryClient.getQueryData(['posts'])
    queryClient.setQueryData(['posts'], (old) =>
      old.map(p => p.id === postId ? { ...p, liked: true } : p)
    )
    return { previous }
  },
  onError: (err, postId, context) => {
    queryClient.setQueryData(['posts'], context.previous)
  }
})

// lite-react
const likeMutation = mutation({
  optimistic: (posts, { postId }) =>
    posts.map(p => p.id === postId ? { ...p, liked: true } : p),
  mutate: (ctx, { postId }) => api.like(postId)
})
```

## Verification {#adr-005-verification}

### Type System

- [ ] `useAtom<T>` returns `T` with correct inference
- [ ] `useSelector` returns slice type with correct inference
- [ ] `machine()` config is fully typed (atoms, events, states)
- [ ] `useMutation` payload type inferred from mutation definition
- [ ] `useSend` event names and payloads are type-checked

### Runtime Behavior

- [ ] `useAtom` triggers re-render on atom invalidation
- [ ] `useSelector` only re-renders when slice changes (per equality fn)
- [ ] Machine state transitions are atomic
- [ ] Optimistic updates apply immediately
- [ ] Optimistic rollback restores previous value
- [ ] Multiple concurrent mutations handled correctly
- [ ] Suspense boundary catches pending resolution
- [ ] Error boundary catches failed resolution

### React Integration

- [ ] Works with React 18 Concurrent features
- [ ] No tearing in concurrent renders
- [ ] StrictMode compatible (double-invoke safe)
- [ ] Server-side rendering support
- [ ] React DevTools integration (component names)

### Performance

- [ ] Selector memoization prevents unnecessary re-renders
- [ ] Machine event dispatch is O(1)
- [ ] Optimistic store operations are O(1)
- [ ] No memory leaks on unmount

## Alternatives Considered {#adr-005-alternatives}

### 1. Keep decentralized pattern only

**Rejected:** While simpler for basic cases, complex apps benefit from centralized state transitions. The machine pattern is opt-in; simple apps can use `useAtom` directly.

### 2. Use XState for state machines

**Rejected:** Adds significant bundle size (~15KB). The machine pattern here is lighter and integrated with lite's atom system.

### 3. Use Immer for optimistic updates

**Rejected:** Adds dependency, and lite atoms are already immutable-by-design (factory returns new value).

### 4. Separate packages (lite-react-core, lite-react-machine, lite-react-mutation)

**Considered:** Could reduce bundle for simple apps. Deferred to future if needed. Tree-shaking should handle unused exports.

### 5. Observable/RxJS integration

**Rejected:** Adds complexity and learning curve. Simple callback-based subscription is sufficient and lighter.

## Future Considerations {#adr-005-future}

### DevTools

Browser extension for:
- Visualizing atom dependency graph
- Inspecting machine state transitions
- Time-travel debugging for mutations
- Performance profiling

### Server Components

React Server Components integration:
- Atom resolution on server
- Hydration of resolved values
- Streaming suspense boundaries

### Persistence

Optional persistence layer:
- localStorage/sessionStorage
- IndexedDB for large data
- Rehydration on app start

### Testing Utilities

```typescript
import { createTestMachine, mockAtom } from '@pumped-fn/lite-react/testing'

const testMachine = createTestMachine(appMachineConfig, {
  presets: [
    mockAtom(userAtom, { id: '1', name: 'Test User' })
  ]
})

await testMachine.send('LOGIN')
expect(testMachine.state).toBe('authenticated')
```

## Related {#adr-005-related}

- [ADR-002](./adr-002-lightweight-lite-package.md) - Base @pumped-fn/lite package design
- [ADR-003](./adr-003-controller-reactivity.md) - Controller pattern that enables React integration
- [c3-201](../c3-2-lite/c3-201-scope.md) - Scope and Controller documentation
- [c3-202](../c3-2-lite/c3-202-atom.md) - Atom documentation
