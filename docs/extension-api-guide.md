# Extension API Guide

Extensions provide cross-cutting functionality through lifecycle hooks and middleware.

## Core API

```typescript
import { extension } from "@pumped-fn/core-next"

const myExtension = extension({
  name: "my-extension",

  // scope lifecycle
  init?(scope: Scope): void | Promise<void>
  dispose?(scope: Scope): void | Promise<void>
  onError?(error: Error, scope: Scope): void

  // intercept operations
  wrap?<T>(context: DataStore, next: () => Promise<T>, operation: Operation): Promise<T>
})

// register
createScope({ extensions: [...]})
scope.use(myExtension)
flow.execute(myFlow, input, { extensions: [myExtension] })
```

**Operation kinds:** `"resolve"` | `"execute"` | `"journal"` | `"subflow"` | `"parallel"`

**Wrapping order:** Last registered = outer wrapper

## Pattern: Monitor Execution

```typescript
// performance tracking
extension({
  name: "perf",
  wrap: async (ctx, next, op) => {
    // track time, call next(), log if slow
  },
});

// logging
extension({
  name: "logger",
  wrap: async (ctx, next, op) => {
    if (op.kind === "execute") {
      // log input, call next(), log output
    }
    return next();
  },
});

// metrics
extension({
  name: "metrics",
  wrap: async (ctx, next, op) => {
    // start timer, call next(), record metrics
  },
});

// audit
extension({
  name: "audit",
  wrap: async (ctx, next, op) => {
    // build record, call next(), save audit log
  },
});
```

## Pattern: Extend Functionality

```typescript
// distributed tracing
extension({
  name: "tracing",
  wrap: async (ctx, next, op) => {
    if (op.kind !== "execute") return next();
    // start span, call next(), end span
  },
});

// scope initialization
extension({
  name: "resources",
  init: async (scope) => {
    // initialize long-running resources
  },
  dispose: async (scope) => {
    // cleanup resources
  },
});
```

## Pattern: Replace Values with Presets

```typescript
import { preset } from "@pumped-fn/core-next";

// flow execution with presets
scope.exec(myFlow, input, {
  presets: [preset(configExecutor, testConfig)],
});

// dynamic replacement via onChange
scope.onChange((event, executor, resolved, scope) => {
  if (event === "resolve" && executor === targetExecutor) {
    // return preset to replace value
    return preset(executor, proxyValue);
  }
});
```

## Pattern: Control Behavior

```typescript
// retry
const retry = (maxAttempts = 3, delayMs = 1000) =>
  extension({
    name: "retry",
    wrap: async (ctx, next, op) => {
      if (op.kind !== "resolve" && op.kind !== "execute") return next();
      // loop attempts, call next(), handle errors with delay
    },
  });

// rate limiting
const rateLimit = (maxRequests: number, windowMs: number) =>
  extension({
    name: "rate-limit",
    wrap: async (ctx, next, op) => {
      if (op.kind !== "execute") return next();
      // check request count, throw if exceeded, call next()
    },
  });

// feature flags
extension({
  name: "feature-flags",
  wrap: async (ctx, next, op) => {
    if (op.kind !== "execute") return next();
    // check flag, throw if disabled, call next()
  },
});

// validation
const validate = <T>(schema: (input: unknown) => T) =>
  extension({
    name: "validation",
    wrap: async (ctx, next, op) => {
      if (op.kind === "execute" || op.kind === "subflow") {
        schema(op.input);
      }
      return next();
    },
  });

// caching
const cache = (ttlMs = 60000) =>
  extension({
    name: "cache",
    wrap: async (ctx, next, op) => {
      if (op.kind !== "resolve") return next();
      // check cache, return if valid, call next(), store result
    },
  });
```

## Best Practices

- One responsibility per extension
- Use `context` for execution-scoped data
- Check `operation.kind` to filter operations
- Handle errors in `onError`
- Clean up resources in `dispose`
- Compose small extensions
