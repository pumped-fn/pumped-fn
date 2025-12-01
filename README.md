# pumped-fn

[![npm version](https://img.shields.io/npm/v/@pumped-fn/lite)](https://www.npmjs.com/package/@pumped-fn/lite)

A lightweight effect system for TypeScript with managed lifecycles and minimal reactivity.

## What is an Effect System?

An effect system manages **how** and **when** computations run:
- **Resource lifecycle** - acquire, use, release
- **Computation ordering** - dependency resolution
- **Side effect isolation** - controlled execution boundaries

## Install

```bash
npm install @pumped-fn/lite
```

## Core Concepts

```
┌─────────────────────────────────────────────────────────────┐
│                         Scope                               │
│  (long-lived execution boundary)                            │
│                                                             │
│   ┌─────────┐      ┌─────────┐      ┌─────────┐            │
│   │  Atom   │ ──── │  Atom   │ ──── │  Atom   │            │
│   │ (effect)│      │ (effect)│      │ (effect)│            │
│   └─────────┘      └─────────┘      └─────────┘            │
│        │                                  │                 │
│        └──────────────┬───────────────────┘                 │
│                       ▼                                     │
│   ┌─────────────────────────────────────────────────────┐   │
│   │              ExecutionContext                       │   │
│   │  (short-lived operation with input, tags, cleanup)  │   │
│   └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

| Concept | Purpose |
|---------|---------|
| **Scope** | Long-lived boundary that manages atom lifecycles |
| **Atom** | A managed effect with lifecycle (create, cache, cleanup, recreate) |
| **ExecutionContext** | Short-lived context for running operations |
| **Controller** | Handle for observing and controlling an atom's state |
| **Tag** | Contextual value passed through execution |

## Quick Example

```typescript
import { atom, flow, createScope } from '@pumped-fn/lite'

const dbAtom = atom({
  factory: async (ctx) => {
    const conn = await createConnection()
    ctx.cleanup(() => conn.close())
    return conn
  }
})

const repoAtom = atom({
  deps: { db: dbAtom },
  factory: (ctx, { db }) => new UserRepository(db)
})

const getUser = flow({
  deps: { repo: repoAtom },
  factory: async (ctx, { repo }) => {
    return repo.findById(ctx.input as string)
  }
})

const scope = await createScope()
const ctx = scope.createContext()

const user = await ctx.exec({ flow: getUser, input: 'user-123' })

await ctx.close()
await scope.dispose()
```

## Effect Lifecycle

```mermaid
stateDiagram-v2
    [*] --> idle
    idle --> resolving: resolve()
    resolving --> resolved: success
    resolving --> failed: error
    resolved --> resolving: invalidate()
    failed --> resolving: invalidate()
    resolved --> idle: release()
    failed --> idle: release()
```

## API Reference

| Function | Description |
|----------|-------------|
| `createScope(options?)` | Create execution boundary |
| `atom(config)` | Define managed effect (long-lived) |
| `flow(config)` | Define operation template |
| `tag(config)` | Define contextual value |
| `controller(atom)` | Wrap atom for deferred resolution |
| `preset(atom, value)` | Override atom value in scope |

## Features in Action: Snake Game

A complete example showing **tags**, **ctx.data**, **controller**, **invalidate**, and **cleanup** working together:

```typescript
import { atom, flow, tag, tags, controller, createScope } from '@pumped-fn/lite'

type Point = { x: number; y: number }
type Dir = 'up' | 'down' | 'left' | 'right'

// Config via tags
const gridSize = tag<number>({ label: 'gridSize', default: 20 })
const tickMs = tag<number>({ label: 'tickMs', default: 100 })

// Reactive state - UI subscribes to this
const stateAtom = atom({
  deps: { size: tags.required(gridSize) },
  factory: (ctx, { size }) => ({
    snake: [{ x: 10, y: 10 }] as Point[],
    food: { x: 5, y: 5 } as Point,
    dir: 'right' as Dir,
    score: 0,
    hi: (ctx.data.get('hi') as number) ?? 0,  // persists across restarts
    dead: false,
    size
  })
})

// Auto-ticker - lazily loaded via controller
const tickerAtom = atom({
  deps: { ms: tags.required(tickMs), state: controller(stateAtom) },
  factory: (ctx, { ms, state }) => {
    const id = setInterval(() => state.invalidate(), ms)
    ctx.cleanup(() => clearInterval(id))
  }
})

// Actions as flows
const moveFlow = flow({
  deps: { state: stateAtom },
  factory: (ctx, { state }) => {
    if (state.dead) return state
    const head = { ...state.snake[0]! }
    // ... move head based on state.dir, check collisions
    // ... update state.snake, state.food, state.score
    // if (collision) { state.dead = true; ctx.data.set('hi', Math.max(state.hi, state.score)) }
    return state
  }
})

// Facade for UI
async function createSnakeGame(size = 20, tick = 100) {
  const scope = createScope({ tags: [gridSize(size), tickMs(tick)] })
  const ctx = scope.createContext()
  const stateCtrl = scope.controller(stateAtom)
  const tickerCtrl = scope.controller(tickerAtom)
  await stateCtrl.resolve()

  return {
    state: stateCtrl,                                    // reactive: .on(), .get()
    move: () => ctx.exec({ flow: moveFlow, input: null }),
    turn: (d: Dir) => { stateCtrl.get().dir = d },
    start: () => tickerCtrl.resolve(),                   // lazy-load ticker
    stop: () => tickerCtrl.release(),
    restart: () => stateCtrl.invalidate(),               // hi-score preserved
    dispose: () => scope.dispose()
  }
}

// Usage
const game = await createSnakeGame(15, 100)
game.state.on('resolved', () => render(game.state.get()))  // UI subscribes
await game.start()                                          // begin auto-tick
game.turn('down')                                           // user input
```

**What's demonstrated:**
- **`tag`** - `gridSize`, `tickMs` configure game per-instance
- **`ctx.data`** - High score persists across `restart()` (survives invalidation)
- **`controller()`** - Ticker atom lazily loaded only when `start()` called
- **`invalidate()`** - Ticker triggers state refresh; `restart()` resets game
- **`cleanup()`** - Interval cleared when ticker released
- **`ctrl.on()`** - UI subscribes to state changes for re-render

## Design Principles

1. **Minimal API** - Every export is expensive to learn
2. **Zero dependencies** - No runtime dependencies
3. **Explicit lifecycle** - No magic, clear state transitions
4. **Composable** - Effects compose through deps

## Deprecated Packages

The following packages are deprecated and no longer maintained:
- `@pumped-fn/core-next` - Use `@pumped-fn/lite` instead
- `@pumped-fn/react` - Legacy React bindings
- `@pumped-fn/devtools` - Legacy devtools

## License

MIT
