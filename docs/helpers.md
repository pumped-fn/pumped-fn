# Graph Helpers - Resolution & Access Utilities

Utilities for graph interaction: batch resolution, accessor creation, and type-safe navigation.

## resolves - Batch Resolution Helper

Resolves multiple executors in parallel while preserving structure.

```typescript
import { provide, derive, createScope, resolves } from "@pumped-fn/core-next";

const config = provide(() => ({ apiUrl: "https://api.example.com", timeout: 5000 }));
const logger = provide(() => ({ log: (msg: string) => console.log(msg) }));
const database = provide(() => ({ query: async () => [] }));

const scope = createScope();

// Array resolution - preserves array structure
const [cfg, log, db] = await resolves(scope, [config, logger, database]);

// Object resolution - preserves object structure
const deps = await resolves(scope, { config, logger, database });
deps.config.apiUrl;
deps.logger.log("Ready");
deps.database.query();
```

### Type Safety

`resolves` maintains full type inference:

```typescript
import { provide, createScope, resolves } from "@pumped-fn/core-next";

const stringValue = provide(() => "hello");
const numberValue = provide(() => 42);
const objectValue = provide(() => ({ key: "value" }));

const scope = createScope();

// Array: [string, number, { key: string }]
const [s, n, o] = await resolves(scope, [stringValue, numberValue, objectValue]);

// Object: { str: string, num: number, obj: { key: string } }
const result = await resolves(scope, {
  str: stringValue,
  num: numberValue,
  obj: objectValue
});
```

### Use Cases

**1. Testing - Batch Setup**

```typescript
import { provide, derive, createScope, resolves, preset } from "@pumped-fn/core-next";

const config = provide(() => ({ env: "prod" }));
const logger = provide(() => ({ log: console.log }));
const service = derive([config, logger], ([cfg, log]) => ({
  run: () => log(`Running in ${cfg.env}`)
}));

describe("service tests", () => {
  test("initializes dependencies", async () => {
    const testScope = createScope(
      preset(config, { env: "test" })
    );

    const { config: cfg, logger: log, service: svc } = await resolves(
      testScope,
      { config, logger, service }
    );

    expect(cfg.env).toBe("test");
    expect(svc).toBeDefined();
  });
});
```

**2. Multi-Service Initialization**

```typescript
import { provide, derive, createScope, resolves } from "@pumped-fn/core-next";

const database = provide(async () => ({ connected: true }));
const cache = provide(async () => ({ ready: true }));
const queue = provide(async () => ({ listening: true }));
const metrics = provide(async () => ({ tracking: true }));

async function initializeApp() {
  const scope = createScope();

  const [db, cacheService, queueService, metricsService] = await resolves(
    scope,
    [database, cache, queue, metrics]
  );

  console.log("All services ready:", { db, cacheService, queueService, metricsService });
  return scope;
}
```

**3. Conditional Resolution with Executors**

```typescript
import { provide, derive, createScope, resolves, preset, type Core } from "@pumped-fn/core-next";

const isProd = provide(() => true);
const devLogger = provide(() => ({ log: (msg: string) => console.log("[DEV]", msg) }));
const prodLogger = provide(() => ({ log: (msg: string) => console.log("[PROD]", msg) }));

const conditionalServices = derive([isProd], ([prod]) => ({
  logger: prod ? prodLogger : devLogger,
  monitoring: prod ? provide(() => "datadog") : provide(() => "local")
}));

const scope = createScope();
const services = await scope.resolve(conditionalServices);

const resolved = await resolves(scope, [
  services.logger,
  services.monitoring
]);
```

## scope.accessor - Get Executor Accessor

Creates a singleton accessor for an executor in the scope.

```typescript
import { provide, createScope } from "@pumped-fn/core-next";

const counter = provide(() => 0);
const scope = createScope();

const accessor = scope.accessor(counter);

// Accessor methods
accessor.get();           // throws if not resolved
accessor.lookup();        // returns state | undefined
await accessor.resolve(); // resolves executor
await accessor.update(5); // updates value
await accessor.release(); // releases executor
```

### Accessor Singleton Pattern

Each executor has one accessor per scope:

```typescript
import { provide, createScope } from "@pumped-fn/core-next";

const value = provide(() => "initial");
const scope = createScope();

const accessor1 = scope.accessor(value);
const accessor2 = scope.accessor(value);

// Same instance
console.log(accessor1 === accessor2); // true
```

### vs resolveAccessor

```typescript
import { provide, createScope } from "@pumped-fn/core-next";

const executor = provide(() => "value");
const scope = createScope();

// accessor() - returns accessor immediately (may not be resolved)
const accessor = scope.accessor(executor);
accessor.lookup(); // undefined - not resolved yet
await accessor.resolve();
accessor.get(); // "value"

// resolveAccessor() - resolves then returns accessor
const resolvedAccessor = await scope.resolveAccessor(executor);
resolvedAccessor.get(); // "value" - already resolved
```

### Use Cases

**1. Manual Resolution Control**

```typescript
import { provide, derive, createScope } from "@pumped-fn/core-next";

const config = provide(() => ({ loaded: false }));
const service = derive([config], ([cfg]) => ({ ready: cfg.loaded }));

const scope = createScope();

const configAccessor = scope.accessor(config);
const serviceAccessor = scope.accessor(service);

// Check state before resolving
if (!configAccessor.lookup()) {
  console.log("Config not loaded yet");
  await configAccessor.resolve();
}

// Conditional resolution
const configState = configAccessor.lookup();
if (configState?.kind === "resolved") {
  await serviceAccessor.resolve();
}
```

**2. Reactive Programming**

```typescript
import { provide, derive, createScope } from "@pumped-fn/core-next";

const counter = provide(() => 0);
const doubled = derive(counter.reactive, (count) => count * 2);

const scope = createScope();

const counterAccessor = scope.accessor(counter);
const doubledAccessor = await scope.resolveAccessor(doubled);

const cleanup = doubledAccessor.subscribe((value) => {
  console.log("Doubled value changed:", value);
});

await counterAccessor.update(5); // logs: "Doubled value changed: 10"
await counterAccessor.update(10); // logs: "Doubled value changed: 20"

await cleanup();
```

**3. State Inspection**

```typescript
import { provide, createScope, type Core } from "@pumped-fn/core-next";

const asyncService = provide(async () => {
  await new Promise(resolve => setTimeout(resolve, 1000));
  return { ready: true };
});

const scope = createScope();
const accessor = scope.accessor(asyncService);

const state = accessor.lookup();

if (!state) {
  console.log("Not started");
  accessor.resolve();
} else if (state.kind === "pending") {
  console.log("Loading...");
  await state.promise;
} else if (state.kind === "resolved") {
  console.log("Ready:", state.value);
} else if (state.kind === "rejected") {
  console.error("Failed:", state.error);
}
```

## Accessor Type - Executor Representative

The `Accessor<T>` type represents a resolved or resolving executor in a scope.

### Type Definition

```typescript
export interface Accessor<T> extends MetaContainer {
  lookup(): undefined | ResolveState<T>;
  get(): T;
  resolve(force?: boolean): Promise<T>;
  release(soft?: boolean): Promise<void>;
  update(updateFn: T | ((current: T) => T)): Promise<void>;
  set(value: T): Promise<void>;
  subscribe(callback: (value: T) => void): Cleanup;
}

type ResolveState<T> =
  | { kind: "pending"; promise: Promise<T> }
  | { kind: "resolved"; value: T }
  | { kind: "rejected"; error: unknown };
```

### Methods

**lookup() - Safe State Access**

```typescript
import { provide, createScope } from "@pumped-fn/core-next";

const value = provide(() => 42);
const scope = createScope();
const accessor = scope.accessor(value);

const state = accessor.lookup();

if (!state) {
  console.log("Not resolved yet");
} else if (state.kind === "resolved") {
  console.log("Value:", state.value);
}
```

**get() - Direct Value Access**

```typescript
import { provide, createScope } from "@pumped-fn/core-next";

const value = provide(() => "hello");
const scope = createScope();
const accessor = scope.accessor(value);

await accessor.resolve();
const result = accessor.get(); // "hello"
```

**resolve(force?) - Async Resolution**

```typescript
import { provide, createScope } from "@pumped-fn/core-next";

const expensive = provide(() => {
  console.log("Computing...");
  return Math.random();
});

const scope = createScope();
const accessor = scope.accessor(expensive);

const v1 = await accessor.resolve(); // logs: "Computing..."
const v2 = await accessor.resolve(); // cached, no log
const v3 = await accessor.resolve(true); // logs: "Computing..." - forced
```

**update(fn) - Reactive Updates**

```typescript
import { provide, derive, createScope } from "@pumped-fn/core-next";

const counter = provide(() => 0);
const display = derive(counter.reactive, (count) => `Count: ${count}`);

const scope = createScope();
const accessor = await scope.resolveAccessor(counter);
const displayAccessor = await scope.resolveAccessor(display);

console.log(displayAccessor.get()); // "Count: 0"

await accessor.update(5);
console.log(displayAccessor.get()); // "Count: 5"

await accessor.update(current => current + 1);
console.log(displayAccessor.get()); // "Count: 6"
```

**set(value) - Direct Value Update**

```typescript
import { provide, createScope } from "@pumped-fn/core-next";

const config = provide(() => ({ theme: "light" }));
const scope = createScope();
const accessor = await scope.resolveAccessor(config);

await accessor.set({ theme: "dark" });
console.log(accessor.get()); // { theme: "dark" }
```

**subscribe(callback) - Reactive Subscriptions**

```typescript
import { provide, derive, createScope } from "@pumped-fn/core-next";

const value = provide(() => 0);
const derived = derive(value.reactive, (v) => v * 2);

const scope = createScope();
const valueAccessor = await scope.resolveAccessor(value);
const derivedAccessor = await scope.resolveAccessor(derived);

const cleanup = derivedAccessor.subscribe((v) => {
  console.log("Derived updated:", v);
});

await valueAccessor.update(5); // logs: "Derived updated: 10"
await valueAccessor.update(10); // logs: "Derived updated: 20"

await cleanup(); // unsubscribe
```

**release() - Resource Cleanup**

```typescript
import { provide, derive, createScope } from "@pumped-fn/core-next";

const connection = provide((ctl) => {
  console.log("Connecting...");
  ctl.cleanup(() => console.log("Disconnected"));
  return { connected: true };
});

const service = derive([connection], ([conn]) => ({
  data: "service data"
}));

const scope = createScope();
const connAccessor = await scope.resolveAccessor(connection);
const svcAccessor = await scope.resolveAccessor(service);

await connAccessor.release();
// logs: "Disconnected"
// both connection and service are released
```

### Accessor Patterns

**1. Dynamic Graph Navigation**

```typescript
import { provide, derive, createScope } from "@pumped-fn/core-next";

const router = provide(() => ({
  currentRoute: "home"
}));

const pageExecutors = {
  home: provide(() => ({ title: "Home" })),
  about: provide(() => ({ title: "About" })),
  contact: provide(() => ({ title: "Contact" }))
};

const currentPage = derive([router], ([route]) => {
  return pageExecutors[route.currentRoute as keyof typeof pageExecutors];
});

const scope = createScope();
const routerAccessor = await scope.resolveAccessor(router);
const pageAccessor = scope.accessor(currentPage);

const pageExecutor = await pageAccessor.resolve();
const pageData = await scope.resolve(pageExecutor);
console.log(pageData.title); // "Home"

await routerAccessor.update({ currentRoute: "about" });
const newPageExecutor = await pageAccessor.resolve(true);
const newPageData = await scope.resolve(newPageExecutor);
console.log(newPageData.title); // "About"
```

**2. Testing with State Inspection**

```typescript
import { provide, derive, createScope, preset } from "@pumped-fn/core-next";

const apiService = provide(async () => ({ fetch: async () => ({ data: "real" }) }));
const consumer = derive([apiService], ([api]) => api);

describe("service tests", () => {
  test("uses mock in tests", async () => {
    const mockApi = { fetch: async () => ({ data: "mock" }) };
    const scope = createScope(preset(apiService, mockApi));

    const accessor = await scope.resolveAccessor(consumer);
    const state = accessor.lookup();

    expect(state?.kind).toBe("resolved");
    if (state?.kind === "resolved") {
      const result = await state.value.fetch();
      expect(result.data).toBe("mock");
    }
  });
});
```

**3. Lazy Initialization**

```typescript
import { provide, createScope } from "@pumped-fn/core-next";

const heavyService = provide((ctl) => {
  console.log("Initializing heavy service...");
  ctl.cleanup(() => console.log("Cleaning up heavy service"));
  return { compute: () => "result" };
});

const scope = createScope();
const accessor = scope.accessor(heavyService);

const state = accessor.lookup();
if (!state) {
  console.log("Service not initialized");
}

await accessor.resolve();
console.log("Service ready");

const result = accessor.get().compute();
console.log(result);
```

## Best Practices

1. **Use `resolves` for batch operations** - more efficient than individual `resolve` calls
2. **Use `accessor()` for manual control** - when you need to check state before resolution
3. **Use `resolveAccessor()` for guaranteed resolution** - when you need the value immediately
4. **Check `lookup()` before `get()`** - avoid errors from unresolved executors
5. **Clean up subscriptions** - always call the cleanup function returned by `subscribe()`

```typescript
import { provide, derive, createScope, resolves } from "@pumped-fn/core-next";

const a = provide(() => 1);
const b = provide(() => 2);
const c = derive([a, b], ([x, y]) => x + y);

const scope = createScope();

const [valA, valB, valC] = await resolves(scope, [a, b, c]);

const accessor = scope.accessor(c);
const state = accessor.lookup();

if (state?.kind === "resolved") {
  console.log("Value already resolved:", state.value);
}

const resolvedAccessor = await scope.resolveAccessor(c);
console.log("Guaranteed value:", resolvedAccessor.get());

const cleanup = resolvedAccessor.subscribe((value) => {
  console.log("Updated:", value);
});

await scope.dispose();
```
