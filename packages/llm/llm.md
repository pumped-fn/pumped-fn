# Pumped Functions Library - LLM Prompts

*Optimized instruction set for AI models to build applications with @pumped-fn/core-next*

---

## 🧠 CORE CONCEPT

**pumped-fn = Dependency Injection + Reactive Programming**

### The ONE Rule
```
.reactive = Pure functions only (no side effects)
Everything else = Standard executors
```

### Decision Matrix
| Need | Pattern | Use |
|------|---------|-----|
| No dependencies | `provide(() => value)` | Source data |
| With dependencies + side effects | `derive([deps], factory)` | Resources, handlers |
| With dependencies + pure transform | `derive([deps.reactive], pure)` | Display, calculations |
| Programmatic updates | `.static` accessor | Controllers |
| Fresh data in callbacks | `accessor.get()` | Event handlers, timers |

**Flow:** Define → Resolve → Use → Dispose

---

## ⚡ API REFERENCE

### Core Operations
```typescript
// Sources (no dependencies)
provide(() => ({ count: 0 }), name('state'))

// Derived (with dependencies)
derive([dep1, dep2], ([a, b]) => a + b, name('sum'))

// Controllers (for updates)
derive(state.static, (accessor) => ({
  increment: () => accessor.update(s => ({ count: s.count + 1 }))
}), name('controller'))

// Display (pure transformations)
derive(state.reactive, (data) => ({
  formatted: `Count: ${data.count}`
}), name('display'))

// Scope operations
const scope = createScope()
const result = await scope.resolve(executor)
await scope.dispose()
```

### Access Patterns
```typescript
executor.reactive  // Auto-updates (pure functions only)
executor.static    // Returns Accessor<T> for manual access
accessor.get()     // Read current value (always fresh)
accessor.update(v) // Write new value
```

---

## 📋 THREE CANONICAL PATTERNS

### Pattern 1: State + Controller + Display (Most Common)
```typescript
// State source
const state = provide(() => ({ count: 0 }), name('state'));

// Controller for updates
const controller = derive(state.static, (accessor) => ({
  increment: () => accessor.update(s => ({ count: s.count + 1 })),
  reset: () => accessor.update({ count: 0 })
}), name('controller'));

// Display for pure transformation
const display = derive(state.reactive, (data) => ({
  formatted: `Count: ${data.count}`
}), name('display'));
```

### Pattern 2: Resource Management
```typescript
const service = derive([config], ([cfg], ctl) => {
  const resource = createResource(cfg);
  ctl.cleanup(() => resource.dispose()); // ✅ Cleanup on disposal
  return resource;
}, name('service'));
```

### Pattern 3: Timer/Fresh Access
```typescript
const timer = derive([source.static, renderer.static],
  ([sourceAccessor, rendererAccessor], ctl) => {
    const tick = () => {
      sourceAccessor.update(new Date());        // Update source
      rendererAccessor.get().render();          // Access fresh renderer
    };

    const interval = setInterval(tick, 1000);
    ctl.cleanup(() => clearInterval(interval));

    tick(); // Initial run
  }, name('timer'));
```

### Pattern 4: Reactive Auto-Update (Avoids Circular Dependencies)
```typescript
// Source that changes over time
const dataSource = provide(() => initialValue, name('source'));

// Component that reacts to changes automatically
const consumer = derive([dataSource.reactive], ([data]) => {
  // Automatically re-runs when dataSource updates
  return processData(data);
}, name('consumer'));

// Updater that modifies source (separate from consumer)
const updater = derive([dataSource.static], ([accessor], ctl) => {
  const interval = setInterval(() => {
    accessor.update(generateNewValue());
  }, 1000);
  ctl.cleanup(() => clearInterval(interval));
  return { update: () => accessor.update(generateNewValue()) };
}, name('updater'));

// App coordination (all components resolved together)
const app = derive([updater, consumer], ([update, result]) => ({
  ...update,
  result
}), name('app'));
```

---

## 🚫 ANTI-PATTERNS TABLE

| ❌ Wrong | ✅ Correct | Why Wrong |
|----------|-----------|-----------|
| `derive(deps.reactive, (data, ctl) => { console.log(data); ctl.cleanup(...); })` | `derive(deps, (data, ctl) => { console.log(data); ctl.cleanup(...); })` | Side effects in reactive factory re-run on every change |
| `derive([renderer], ([render]) => { return { doWork: () => render.render() }; })` | `derive([renderer.static], ([renderAcc]) => { return { doWork: () => renderAcc.get().render() }; })` | Stale closure over initial value |
| `setInterval(work, 1000); return { timer };` | `const timer = setInterval(work, 1000); ctl.cleanup(() => clearInterval(timer));` | Resource leak without cleanup |
| Chain: `a.reactive → b.reactive → c.reactive` | Use common source: `source.reactive → [a, b, c]` | Cascading re-runs on every source change |
| `ctl.cleanup()` in .reactive | `ctl.cleanup()` in standard | Cleanup runs on every dependency change |
| Accessing unresolved executor: `derive([a.static], ([aAcc]) => { bAcc.get() })` where b depends on a | Reorganize dependencies or use `.reactive` for automatic propagation | Circular dependency causes "Executor is not resolved" error |

---

## 💡 COMPLETE EXAMPLE: Time Display TUI

```typescript
import { provide, derive, createScope, name } from "@pumped-fn/core-next";

// 1. Time source (programmatic updates)
const timeSource = provide(() => new Date(), name("time-source"));

// 2. Config state
const config = provide(() => ({
  formatIndex: 0,
  showHelp: false
}), name("config"));

// 3. Config controller
const configController = derive(config.static, (accessor) => ({
  cycleFormat: () => accessor.update(cfg => ({
    ...cfg,
    formatIndex: (cfg.formatIndex + 1) % 3
  })),
  toggleHelp: () => accessor.update(cfg => ({
    ...cfg,
    showHelp: !cfg.showHelp
  }))
}), name("config-controller"));

// 4. Time display (pure transformation)
const display = derive([timeSource.reactive, config.reactive],
  ([time, cfg]) => {
    const formats = ["24-hour", "12-hour", "ISO"];
    const formatted = cfg.formatIndex === 0
      ? time.toLocaleTimeString("en-GB", { hour12: false })
      : cfg.formatIndex === 1
      ? time.toLocaleTimeString("en-US", { hour12: true })
      : time.toISOString().split('T')[1].split('.')[0];

    const content = [
      `Time: ${formatted}`,
      `Format: ${formats[cfg.formatIndex]}`
    ];

    if (cfg.showHelp) {
      content.push("", "f - cycle format", "h - toggle help", "q - quit");
    }

    return { rendered: content.join('\n') };
  }, name("display"));

// 5. Renderer (reactive display - auto-updates when display changes)
const renderer = derive([display.reactive], ([displayData], ctl) => {
  let lastOutput = "";

  // Auto-render when display data changes
  if (displayData.rendered !== lastOutput) {
    process.stdout.write('\x1b[H\x1b[J'); // Home + clear
    process.stdout.write(displayData.rendered);
    lastOutput = displayData.rendered;
  }

  ctl.cleanup(() => {
    process.stdout.write('\x1b[?25h\n'); // Show cursor
    console.log("Thanks!");
  });

  return { data: displayData };
}, name("renderer"));

// 6. Input handler
const inputHandler = derive([configController], ([ctrl], ctl) => {
  const handleKey = (key: string) => {
    switch (key) {
      case 'f': ctrl.cycleFormat(); break;
      case 'h': ctrl.toggleHelp(); break;
      case 'q': case '\u0003': process.exit(0);
    }
  };

  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on('data', handleKey);

  ctl.cleanup(() => {
    process.stdin.removeListener('data', handleKey);
    process.stdin.setRawMode(false);
  });

  return { handleKey };
}, name("input-handler"));

// 7. Timer (updates time source only - rendering happens automatically)
const timer = derive([timeSource.static], ([timeAccessor], ctl) => {
  const tick = () => {
    timeAccessor.update(new Date());      // Update source, triggers reactive chain
  };

  process.stdout.write('\x1b[?25l');      // Hide cursor
  tick(); // Initial update

  const interval = setInterval(tick, 1000);
  ctl.cleanup(() => clearInterval(interval));

  return { tick };
}, name("timer"));

// 8. App coordinator (includes renderer to ensure it's resolved)
const app = derive([timer, inputHandler, renderer], ([timerCtrl, input, display]) => ({
  ...timerCtrl,
  ...input,
  display
}), name("app"));

// Main
async function main() {
  const scope = createScope();
  try {
    await scope.resolve(app);
    process.on('SIGINT', async () => {
      await scope.dispose();
      process.exit(0);
    });
  } catch (error) {
    console.error('Error:', error);
    await scope.dispose();
    process.exit(1);
  }
}

main().catch(console.error);
```

---

## 🛠️ TROUBLESHOOTING

| Error/Issue | Cause | Solution |
|-------------|--------|----------|
| "Factory re-executed unexpectedly" | Using `.reactive` with side effects | Remove `.reactive` or make factory pure |
| "Memory leak detected" | Missing `ctl.cleanup()` | Add cleanup for all resources |
| "Stale data in callbacks" | Using direct value instead of accessor | Use `accessor.get()` for fresh data |
| "Cleanup runs too often" | `ctl.cleanup()` in `.reactive` factory | Move to standard executor |
| "Executor is not resolved" | Accessing executor via `.get()` before it's resolved in dependency chain | Ensure proper dependency order or use `.reactive` for automatic updates |
| Screen flickers/multiple renders | Clearing screen on every update | Use cursor positioning, check lastOutput |

---

## ✅ SUCCESS CHECKLIST

- [ ] All executors use `name()` decorator
- [ ] Controllers use `.static` for updates
- [ ] Pure transformations use `.reactive`
- [ ] Fresh data accessed with `accessor.get()`
- [ ] Resources cleaned up with `ctl.cleanup()`
- [ ] Scope disposed on shutdown
- [ ] No `.reactive` with side effects
- [ ] TypeScript compiles without errors