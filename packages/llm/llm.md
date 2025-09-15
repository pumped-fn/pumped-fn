# Pumped Functions Library - LLM Prompts

*Optimized instruction set for AI models to build applications with @pumped-fn/core-next*

---

## 🧠 CORE MENTAL MODEL

**pumped-fn = Dependency Injection + Reactive Programming**

**3 Core Concepts:**
- `Executor` = Container holding values with dependencies
- `Scope` = Resolution context managing lifecycles
- `.reactive` = Auto-update variant for pure transformations

**THE Critical Decision:**
```
Need factory to re-run when dependencies change?
    ↓
   NO → Standard executor
    ↓
   YES → Has side effects?
    ↓        ↓
   YES      NO
    ↓        ↓
  NEVER    .reactive
 reactive   (pure only)
```

**Flow:** Define → Resolve → Use → Dispose
**Graph:** Source → Derived → App

---

## ⚡ QUICK REFERENCE

### API Cheat Sheet
```typescript
// Create Executors
provide(() => value, name('source'))                    // No dependencies
derive([dep1, dep2], ([a,b]) => result, name('derived')) // With dependencies
createScope()                                            // Resolution context

// Access Variants
executor.reactive  // Auto-updates (pure functions only)
executor.static    // Manual updates (returns Accessor<T>)

// Scope Operations
scope.resolve(executor)  // Get resolved value
scope.dispose()          // Cleanup all resources

// Static Access (for programmatic updates)
accessor.get()              // Read current value
accessor.update(newValue)   // Write new value
```

### Decision Tree
```
What does your factory do?

📊 Transform data only?
   (pure function, no side effects)
   └── USE .reactive

🔧 Setup resources?
   Setup handlers?
   Register cleanup?
   One-time initialization?
   └── USE standard (no .reactive)
```

### Anti-Pattern Quick Check
```typescript
// 🚫 RED FLAGS in .reactive factories:
addEventListener()  // Side effect
setInterval()      // Side effect
ctl.cleanup()      // Runs on every change!
fetch()           // Side effect
console.log()     // Side effect

// ✅ SAFE in .reactive factories:
data.map()        // Pure transformation
Math.round()      // Pure function
{ key: value }    // Pure object creation
```

---

## 📋 ESSENTIAL PATTERNS

### Pattern 1: State + Display (Most Common)
*For counters, timers, data displays*

```typescript
// State source (programmatic updates)
const state = provide(() => ({ count: 0 }), name('state'));

// Controller for updates (side effects)
const controller = derive(state.static, (accessor, ctl) => ({
  increment: () => accessor.update(s => ({ count: s.count + 1 })),
  reset: () => accessor.update({ count: 0 })
}), name('controller'));

// Display (pure transformation)
const display = derive(state.reactive, (data) => ({
  formatted: `Count: ${data.count}`
}), name('display'));
```

### Pattern 2: Resource Management
*For services, connections, timers*

```typescript
const service = derive([config], ([cfg], ctl) => {
  const resource = createResource(cfg);
  ctl.cleanup(() => resource.dispose()); // ✅ Cleanup once
  return resource;
}, name('service'));
```

### Pattern 3: App Coordinator
*Wire everything together*

```typescript
const app = derive([display, controller], ([ui, ctrl], ctl) => {
  // ✅ One-time setup (no .reactive)
  setupKeyBindings(ctrl);
  ctl.cleanup(() => console.log("Goodbye!"));

  return {
    render: () => console.log(ui.formatted),
    ...ctrl
  };
}, name('app'));
```

### Core Types
```typescript
interface Core.Scope {
  resolve<T>(executor: Core.Executor<T>): Promise<T>
  dispose(): Promise<void>
}

interface Accessor<T> {
  get(): T
  update(value: T | ((current: T) => T)): void
}
```

---

## 🚫 ANTI-PATTERNS & TROUBLESHOOTING

### Top 5 Critical Mistakes

#### ❌ #1: Side Effects in Reactive Factories
```typescript
// ❌ WRONG: Runs on every dependency change
const app = derive([state.reactive], ([data], ctl) => {
  addEventListener('click', handler);  // ❌ Re-registers on every update!
  ctl.cleanup(() => {});              // ❌ Cleanup runs on every change!
  return { data };
});

// ✅ CORRECT: One-time setup
const app = derive([state], ([data], ctl) => {
  addEventListener('click', handler);  // ✅ Runs once
  ctl.cleanup(() => {});              // ✅ Cleanup on disposal only
  return { data };
});
```

#### ❌ #2: Stale State Access
```typescript
// ❌ WRONG: displayData never updates
const renderer = derive([display], ([displayData], ctl) => ({
  render: () => console.log(displayData.formatted)  // ❌ Stale data
}));

// ✅ CORRECT: Fresh state access
const renderer = derive([state.static], ([stateAccessor], ctl) => ({
  render: () => {
    const currentData = stateAccessor.get();  // ✅ Fresh data
    console.log(formatData(currentData));
  }
}));
```

#### ❌ #3: Unnecessary Pass-Through Executors
```typescript
// ❌ WRONG: Extra layer
const timeDisplay = derive(time.reactive, t => t, name('time-display'));
const ui = derive(timeDisplay.reactive, t => format(t), name('ui'));

// ✅ CORRECT: Direct dependency
const ui = derive(time.reactive, t => format(t), name('ui'));
```

#### ❌ #4: Missing Cleanup
```typescript
// ❌ WRONG: Resource leak
const service = derive([], () => {
  const timer = setInterval(work, 1000);
  return { timer };  // ❌ Never cleared
});

// ✅ CORRECT: Proper cleanup
const service = derive([], (deps, ctl) => {
  const timer = setInterval(work, 1000);
  ctl.cleanup(() => clearInterval(timer));  // ✅ Cleanup registered
  return { timer };
});
```

#### ❌ #5: Wrong Pattern Choice
```typescript
// ❌ WRONG: Everything reactive
const everything = derive([a.reactive, b.reactive, c.reactive], ...);

// ✅ CORRECT: Match pattern to purpose
const display = derive(state.reactive, s => format(s));     // Data transformation
const controller = derive(state.static, accessor => ({ ... })); // Updates
const app = derive([display, controller], ([ui, ctrl]) => { ... }); // Coordination
```

### Common Error Messages → Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| "Factory re-executed unexpectedly" | Using `.reactive` with side effects | Remove `.reactive` or make factory pure |
| "Memory leak detected" | Missing `ctl.cleanup()` | Add cleanup for resources |
| "Stale data in render" | Non-reactive accessing old values | Use `.static` accessor or `.reactive` |
| "Circular dependency" | Import cycles | Use callback patterns to break cycles |

---

## 🔧 ADVANCED PATTERNS

### TUI Application Patterns

#### Flicker-Free Rendering
```typescript
// ❌ WRONG: Screen flickers
const renderer = derive(display.reactive, (data, ctl) => {
  process.stdout.write('\x1b[2J\x1b[H'); // ❌ Clears entire screen
  console.log(data.render());
  ctl.cleanup(() => console.log("Thanks!")); // ❌ Runs on every change!
});

// ✅ CORRECT: Smooth rendering
const renderer = derive([state.static], ([stateAccessor], ctl) => {
  let lastOutput = '';
  let isInit = false;

  const render = () => {
    const currentState = stateAccessor.get();
    const output = formatDisplay(currentState);

    if (output !== lastOutput) {
      if (!isInit) {
        process.stdout.write('\x1b[?25l\x1b[2J\x1b[H'); // Hide cursor, clear once
        isInit = true;
      }
      process.stdout.write('\x1b[H'); // ✅ Move cursor, don't clear
      process.stdout.write(output);
      lastOutput = output;
    }
  };

  ctl.cleanup(() => {
    process.stdout.write('\x1b[?25h'); // ✅ Show cursor on exit
    console.log('\nThanks for playing!');
  });

  return { render };
});
```

#### Breaking Circular Dependencies
```typescript
// ✅ Use callback patterns for game loops
const gameLoop = derive([controller, state.static], ([ctrl, stateAccessor], ctl) => {
  let interval: NodeJS.Timeout | null = null;

  const start = (onRender?: () => void) => {
    interval = setInterval(() => {
      ctrl.tick();
      onRender?.(); // ✅ Callback breaks import cycle
    }, stateAccessor.get().speed);
  };

  ctl.cleanup(() => {
    if (interval) clearInterval(interval);
  });

  return { start };
});

// Wire in main app
const app = derive([gameLoop, renderer], ([loop, render], ctl) => {
  const startup = () => loop.start(() => render.render());
  return { startup };
});
```

### Performance Optimizations

#### Separate Static from Dynamic Data
```typescript
// ✅ Static data outside executors
const GAME_CONFIG = {
  maxScore: 1000,
  levels: [...],
  powerUps: [...]
};

// Only dynamic state in executors
const gameState = provide(() => ({
  score: 0,
  level: 1,
  playerPos: { x: 0, y: 0 }
}), name('game-state'));

// Reference static data directly
const display = derive(gameState.reactive, (state) => ({
  formatted: `Score: ${state.score}/${GAME_CONFIG.maxScore}`
}), name('display'));
```

#### Avoid Pass-Through Executors
```typescript
// ❌ WRONG: Unnecessary layer
const currentTime = derive(timeSource.reactive, t => t);
const display = derive(currentTime.reactive, t => format(t));

// ✅ CORRECT: Direct dependency
const display = derive(timeSource.reactive, t => format(t));
```

### Main Function Best Practices

```typescript
async function main() {
  const scope = createScope();

  try {
    // Resolve only root executors
    const app = await scope.resolve(appExecutor);

    // Setup graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\nShutting down...');
      await scope.dispose();
      process.exit(0);
    });

    // Initialize
    console.log('Application started!');

  } catch (error) {
    console.error('Error:', error);
    await scope.dispose();
    process.exit(1);
  }
}

main().catch(console.error);
```

---

## 📝 APPLICATION TEMPLATES

### Hello World (Counter App)
*Perfect for learning the basics*

```typescript
import { provide, derive, createScope, name } from '@pumped-fn/core-next';

// State
const counter = provide(() => ({ count: 0 }), name('counter'));

// Controller
const controls = derive(counter.static, (accessor) => ({
  increment: () => accessor.update(s => ({ count: s.count + 1 })),
  decrement: () => accessor.update(s => ({ count: s.count - 1 })),
  reset: () => accessor.update({ count: 0 })
}), name('controls'));

// Display
const display = derive(counter.reactive, (state) => ({
  formatted: `Count: ${state.count}`
}), name('display'));

// App
const app = derive([display, controls], ([ui, ctrl]) => ({
  render: () => console.log(ui.formatted),
  ...ctrl
}), name('app'));

// Main
async function main() {
  const scope = createScope();
  const { render, increment, decrement } = await scope.resolve(app);

  render(); // Count: 0
  increment();
  render(); // Count: 1

  await scope.dispose();
}
```

### Real App (Todo List)
*Production-ready pattern*

```typescript
// State
const todos = provide(() => ({
  items: [] as { id: number, text: string, done: boolean }[],
  nextId: 1
}), name('todos'));

// Controller
const todoControls = derive(todos.static, (accessor) => ({
  add: (text: string) => accessor.update(s => ({
    items: [...s.items, { id: s.nextId, text, done: false }],
    nextId: s.nextId + 1
  })),
  toggle: (id: number) => accessor.update(s => ({
    ...s,
    items: s.items.map(item =>
      item.id === id ? { ...item, done: !item.done } : item
    )
  })),
  remove: (id: number) => accessor.update(s => ({
    ...s,
    items: s.items.filter(item => item.id !== id)
  }))
}), name('todo-controls'));

// Display
const todoDisplay = derive(todos.reactive, (state) => ({
  summary: `${state.items.length} total, ${state.items.filter(t => !t.done).length} pending`,
  list: state.items.map(item => `[${item.done ? 'x' : ' '}] ${item.text}`)
}), name('todo-display'));

// App
const todoApp = derive([todoDisplay, todoControls], ([ui, ctrl], ctl) => {
  // Setup any resources here
  ctl.cleanup(() => console.log('Todo app shut down'));

  return {
    render: () => {
      console.log(ui.summary);
      ui.list.forEach(line => console.log(line));
    },
    ...ctrl
  };
}, name('todo-app'));
```

### TUI Game Template
*For interactive terminal applications*

```typescript
// Game State
const gameState = provide(() => ({
  playerPos: { x: 5, y: 5 },
  score: 0,
  isRunning: false
}), name('game-state'));

// Controller
const gameController = derive(gameState.static, (accessor) => ({
  move: (dx: number, dy: number) => accessor.update(s => ({
    ...s,
    playerPos: { x: s.playerPos.x + dx, y: s.playerPos.y + dy },
    score: s.score + 1
  })),
  start: () => accessor.update(s => ({ ...s, isRunning: true })),
  stop: () => accessor.update(s => ({ ...s, isRunning: false }))
}), name('game-controller'));

// Renderer (uses fresh state access)
const renderer = derive([gameState.static], ([stateAccessor], ctl) => {
  const render = () => {
    const state = stateAccessor.get();
    process.stdout.write('\x1b[H'); // Move cursor to top
    console.log(`Score: ${state.score}`);
    console.log(`Player at (${state.playerPos.x}, ${state.playerPos.y})`);
  };

  ctl.cleanup(() => {
    process.stdout.write('\x1b[?25h'); // Show cursor
    console.log('\nGame Over!');
  });

  return { render };
}, name('renderer'));

// Game Loop (callback pattern)
const gameLoop = derive([gameController, gameState.static], ([ctrl, stateAccessor], ctl) => {
  let interval: NodeJS.Timeout | null = null;

  const start = (onTick?: () => void) => {
    interval = setInterval(() => {
      const state = stateAccessor.get();
      if (state.isRunning) {
        onTick?.();
      }
    }, 100);
  };

  ctl.cleanup(() => {
    if (interval) clearInterval(interval);
  });

  return { start };
}, name('game-loop'));

// Main Game App
const game = derive([gameLoop, renderer, gameController], ([loop, render, ctrl], ctl) => {
  const startup = () => {
    process.stdout.write('\x1b[?25l\x1b[2J\x1b[H'); // Hide cursor, clear screen
    ctrl.start();
    loop.start(() => render.render());
  };

  return { startup, ...ctrl };
}, name('game'));
```

### Success Criteria Checklist

- [ ] All executors use `name()` decorator
- [ ] Controllers use `.static` for updates
- [ ] Displays use `.reactive` for pure transformations
- [ ] App coordinators avoid `.reactive`
- [ ] Resources properly cleaned up with `ctl.cleanup()`
- [ ] Scope disposed on shutdown
- [ ] TypeScript compiles without errors
- [ ] No anti-patterns present