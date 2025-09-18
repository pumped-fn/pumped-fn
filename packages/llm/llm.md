# Pumped Functions Library - LLM Prompts

_Optimized instruction set for AI models to build applications with @pumped-fn/core-next_

---

## 🧠 CORE CONCEPT

pumped-fn is a library to orchestrate dependency in graph. pumped-fn units are called executor. Each executor retains its own dependency to other resources, and giving it to the scope, it'll resolve all required dependency by the graph prior to resolve the requestor. That's called resolve by graph.

With that, every single resolve is integrated and completed, and even better, the order is reserved in the order of declaration. That makes using this easy, only resolving the tip is required, no need to resolve all of dependencies

## Core Definitions

**Executor**: Unit holding dependencies and factory function. Reference for scope caching/resolution.

**Scope**: Object from `createScope()` that resolves executors by recursively resolving dependencies first.

**Resolving**: Process where scope detects dependencies, resolves them in order, passes results to factory.

**Accessor**: Handle to executor's value with methods: `get()`, `update()`, `subscribe()`.

**Pod**: Isolated sub-scope for flows. No reactive support. Disposed with parent or manually.

## Reactive Updates

### Trigger Conditions
- `accessor.update(value)` on source
- `scope.update(executor, value)`
- NOT direct assignment

### Subscription Rules
- Created: Only when using `.reactive` in dependencies
- Updates: Sequential and batched
- Cleanup: Automatic on scope.dispose()
- Performance: Each `.reactive` adds overhead

### Example
```typescript
const source = provide(() => 0);
const consumer = derive([source.reactive], ([val]) => val * 2);
// consumer auto-updates when source changes via:
await scope.update(source, 1);
```

## Lifecycle Timeline

```
1. createScope()
2. scope.resolve(executor)
   → Resolve dependencies recursively
   → Call factory ONCE (singleton)
   → Cache result
3. On update:
   → Run cleanup callbacks
   → Re-execute factory
   → Trigger reactive updates
4. scope.dispose()
   → Run all cleanups
   → Clear cache
   → Dispose pods
```

### Cleanup Timing
- `ctl.cleanup()` runs on:
  - Manual release
  - Before re-resolve (on update)
  - Scope disposal

### The ONE Rule

```
.reactive = Pure functions only (no side effects)
Everything else = Standard executors
```

## Decision Guide

| Scenario | Use | Example |
|----------|-----|---------|
| Config/constants | `provide()` | `provide(() => config)` |
| Resources with cleanup | `derive() + ctl.cleanup()` | DB connections |
| Auto-updating UI | `.reactive` (not in flows) | Display components |
| Manual control | `.static` | Controllers |
| Business logic | `flow.define()` | API handlers |
| Testing | `preset() + initialValues` | Mock services |
| Fresh value in callbacks | `accessor.get()` | Timers |

**Usage Flow:** Define → Resolve → Use → Dispose

## Naming

Name by intention, no suffix is recommended

For example

- logger instead of loggerExecutor. Use single noun for obvious, common utilities, like db, config etc
- append svc for service on reusable services, that's where things getting more specific

---

## ⚡ API REFERENCE

### Core Operations

```typescript
// Sources (no dependencies)
provide(() => ({ count: 0 }), name("state")); // name() is debug-only

// Derived (with dependencies)
derive([dep1, dep2], ([a, b]) => a + b, name("sum"));

// Controllers (for updates)
derive(
  state.static,
  (accessor) => ({
    increment: () => accessor.update((s) => ({ count: s.count + 1 })),
  }),
  name("controller")
);

// Display (pure transformations)
derive(
  state.reactive,
  (data) => ({
    formatted: `Count: ${data.count}`,
  }),
  name("display")
);

// Scope operations
const scope = createScope();
const result = await scope.resolve(executor);
await scope.dispose();
```

### Access Patterns

```typescript
executor.reactive; // Auto-updates (pure functions only)
executor.static; // Returns Accessor<T> for manual access
accessor.get(); // Read current value (always fresh)
accessor.update(v); // Write new value
```

## Error Handling

### Key Rules
- Errors bubble up and fail entire resolution chain
- No global handler - wrap `scope.resolve()` in try/catch
- No built-in retry - implement via scope plugins
- `force: true` re-executes, doesn't retry failures

### Examples
```typescript
// Executor errors propagate
const risky = derive([source], async ([data]) => {
  try {
    return await process(data);
  } catch (e) {
    // Log and rethrow or return default
    throw new Error(`Processing failed: ${e.message}`);
  }
});

// Handle at resolution
try {
  const result = await scope.resolve(risky);
} catch (error) {
  // Handle ExecutorResolutionError
  console.error(error.dependencyChain);
}
```

---

## 📋 THREE CANONICAL PATTERNS

### Pattern 0: Scope and entrypoint stays very close to each other

To make testings relevant for very long time, the escape (resolve utitilies) should happen in a very centralized place, that'll reduce the chance of making side-effects.

Entrypoint here meant the place you kickstart the whole application flow as well as handling application termination (inside out or outside in). Some example

- application entrypoint (node run etc)
- test entry
- webserver starts

### Pattern 1: State + Controller + Display (Most Common)

```typescript
// State source
const state = provide(() => ({ count: 0 }), name("state"));

// Controller for updates
const controller = derive(
  state.static,
  (accessor) => ({
    increment: () => accessor.update((s) => ({ count: s.count + 1 })),
    reset: () => accessor.update({ count: 0 }),
  }),
  name("controller")
);

// Display for pure transformation
const display = derive(
  state.reactive,
  (data) => ({
    formatted: `Count: ${data.count}`,
  }),
  name("display")
);
```

### Pattern 2: Resource Management

```typescript
const service = derive(
  [config],
  ([cfg], ctl) => {
    const resource = createResource(cfg);
    ctl.cleanup(() => resource.dispose()); // ✅ Cleanup on disposal
    return resource;
  },
  name("service")
);
```

### Pattern 3: Timer/Fresh Access

```typescript
const timer = derive(
  [source.static, renderer.static],
  ([sourceAccessor, rendererAccessor], ctl) => {
    const tick = () => {
      sourceAccessor.update(new Date()); // Update source
      rendererAccessor.get().render(); // Access fresh renderer
    };

    const interval = setInterval(tick, 1000);
    ctl.cleanup(() => clearInterval(interval));

    tick(); // Initial run
  },
  name("timer")
);
```

### Pattern 4: Reactive Auto-Update (Avoids Circular Dependencies)

```typescript
// Source that changes over time
const dataSource = provide(() => initialValue, name("source"));

// Component that reacts to changes automatically
const consumer = derive(
  [dataSource.reactive],
  ([data]) => {
    // Automatically re-runs when dataSource updates
    return processData(data);
  },
  name("consumer")
);

// Updater that modifies source (separate from consumer)
const updater = derive(
  [dataSource.static],
  ([accessor], ctl) => {
    const interval = setInterval(() => {
      accessor.update(generateNewValue());
    }, 1000);
    ctl.cleanup(() => clearInterval(interval));
    return { update: () => accessor.update(generateNewValue()) };
  },
  name("updater")
);

// App coordination (all components resolved together)
const app = derive(
  [updater, consumer],
  ([update, result]) => ({
    ...update,
    result,
  }),
  name("app")
);
```

---

## Common Mistakes

- ❌ Side effects in `.reactive` → Re-runs on every change
- ❌ Missing cleanup → Memory leaks
- ❌ Direct value in callbacks → Use `accessor.get()` for fresh
- ❌ Circular deps → Use common source pattern
- ❌ Passing scope around → Use ctl parameter
- ❌ Grouping services unnecessarily → Use exact dependencies needed

---

## Testing with Presets

```typescript
// Replace implementations for testing
const testScope = createScope({
  initialValues: [
    preset(dbExecutor, mockDb),        // Replace with mock
    preset(configExecutor, testConfig), // Override config
  ]
});

// Original executors use test values
const result = await testScope.resolve(appExecutor);
```

---

## 💡 COMPLETE EXAMPLE: Time Display TUI

```typescript
import { provide, derive, createScope, name } from "@pumped-fn/core-next";

// 1. Time source (programmatic updates)
const timeSource = provide(() => new Date(), name("time-source"));

// 2. Config state
const config = provide(
  () => ({
    formatIndex: 0,
    showHelp: false,
  }),
  name("config")
);

// 3. Config controller
const configController = derive(
  config.static,
  (accessor) => ({
    cycleFormat: () =>
      accessor.update((cfg) => ({
        ...cfg,
        formatIndex: (cfg.formatIndex + 1) % 3,
      })),
    toggleHelp: () =>
      accessor.update((cfg) => ({
        ...cfg,
        showHelp: !cfg.showHelp,
      })),
  }),
  name("config-controller")
);

// 4. Time display (pure transformation)
const display = derive(
  [timeSource.reactive, config.reactive],
  ([time, cfg]) => {
    const formats = ["24-hour", "12-hour", "ISO"];
    const formatted =
      cfg.formatIndex === 0
        ? time.toLocaleTimeString("en-GB", { hour12: false })
        : cfg.formatIndex === 1
        ? time.toLocaleTimeString("en-US", { hour12: true })
        : time.toISOString().split("T")[1].split(".")[0];

    const content = [
      `Time: ${formatted}`,
      `Format: ${formats[cfg.formatIndex]}`,
    ];

    if (cfg.showHelp) {
      content.push("", "f - cycle format", "h - toggle help", "q - quit");
    }

    return { rendered: content.join("\n") };
  },
  name("display")
);

// 5. Renderer (reactive display - auto-updates when display changes)
const renderer = derive(
  [display.reactive],
  ([displayData], ctl) => {
    let lastOutput = "";

    // Auto-render when display data changes
    if (displayData.rendered !== lastOutput) {
      process.stdout.write("\x1b[H\x1b[J"); // Home + clear
      process.stdout.write(displayData.rendered);
      lastOutput = displayData.rendered;
    }

    ctl.cleanup(() => {
      process.stdout.write("\x1b[?25h\n"); // Show cursor
      console.log("Thanks!");
    });

    return { data: displayData };
  },
  name("renderer")
);

// 6. Input handler
const inputHandler = derive(
  [configController],
  ([ctrl], ctl) => {
    const handleKey = (key: string) => {
      switch (key) {
        case "f":
          ctrl.cycleFormat();
          break;
        case "h":
          ctrl.toggleHelp();
          break;
        case "q":
        case "\u0003":
          process.exit(0);
      }
    };

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", handleKey);

    ctl.cleanup(() => {
      process.stdin.removeListener("data", handleKey);
      process.stdin.setRawMode(false);
    });

    return { handleKey };
  },
  name("input-handler")
);

// 7. Timer (updates time source only - rendering happens automatically)
const timer = derive(
  [timeSource.static],
  ([timeAccessor], ctl) => {
    const tick = () => {
      timeAccessor.update(new Date()); // Update source, triggers reactive chain
    };

    process.stdout.write("\x1b[?25l"); // Hide cursor
    tick(); // Initial update

    const interval = setInterval(tick, 1000);
    ctl.cleanup(() => clearInterval(interval));

    return { tick };
  },
  name("timer")
);

// 8. App coordinator (includes renderer to ensure it's resolved)
const app = derive(
  [timer, inputHandler, renderer],
  ([timerCtrl, input, display]) => ({
    ...timerCtrl,
    ...input,
    display,
  }),
  name("app")
);

// Main
async function main() {
  const scope = createScope();
  try {
    await scope.resolve(app);
    process.on("SIGINT", async () => {
      await scope.dispose();
      process.exit(0);
    });
  } catch (error) {
    console.error("Error:", error);
    await scope.dispose();
    process.exit(1);
  }
}

main().catch(console.error);
```

---

# Coding style

- strict coding style, concrete reasonable naming
- no any, unknonw or casting to direct type required
- always make sure typecheck pass/ or use tsc --noEmit to verify, especially tests
- don't add comments, most of the time those are codesmells (that's why it'll require comments)
- group types using namespace, less cluttered
- combine tests where possible, test running quite quickly, add test error message so it'll be easy to track from the stdout
- with dependency of @pumped-fn/core-next, when using derive, prefer using destructure on factory function call where possible
- cleanup redundant codes, dead codes
- use `import { type ...}` where it's needed
