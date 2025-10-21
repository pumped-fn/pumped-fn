# Pumped Functions - Graph-Based Architecture

Resolve your entire application with a single function call. No wiring, no initialization order, no manual dependency management.

## Why Graph Resolution?

**Traditional Code**: Wire dependencies manually, manage initialization order, debug complex setups

```typescript
const config = {
  logLevel: "info",
  database: "db://prod",
  redis: "redis://prod",
};
const logger = {
  log: (msg: string) => console.log(`[${config.logLevel}] ${msg}`),
};
const db = { query: () => [], url: config.database };
const cache = { get: () => null, set: () => true };
const api = { start: () => logger.log("API started") };
```

**Graph Resolution**: Define relationships, resolve automatically

```typescript
const app = derive([db, cache, logger], ([db, cache, log]) => ({
  start: () => log.log("API started with all dependencies"),
}));
await scope.resolve(app);
```

**Benefits**:

- **Single Point Resolution**: Resolve the tip, get the entire graph
- **Automatic Ordering**: Dependencies resolve in correct sequence
- **Zero Configuration**: No frameworks, no decorators, no magic
- **Test Friendly**: Change one node, test entire systems

## start in a minute (or maybe a little bit more)

### install that really quickly

::: code-group

```sh [npm]
$ npm add @pumped-fn/core-next
```

```sh [pnpm]
$ pnpm add @pumped-fn/core-next
```

```sh [yarn]
$ yarn add @pumped-fn/core-next
```

```sh [bun]
$ bun add @pumped-fn/core-next
```

:::

### Graph Resolution in Action

```ts twoslash
import { provide, derive, createScope } from '@pumped-fn/core-next'

const config = provide(() => ({
  port: 3000,
  dbHost: 'localhost'
}))

const db = derive(config, (cfg) => ({
  query: async (sql: string) => {
    console.log(`Querying ${cfg.dbHost}: ${sql}`)
    return []
  }
}))

const userService = derive({ db, config }, ({ db, config }) => ({
  getUser: async (id: string) => {
    const results = await db.query(`SELECT * FROM users WHERE id = '${id}'`)
    return results[0]
  }
}))

const scope = createScope()
const service = await scope.resolve(userService)
const user = await service.getUser('123')
await scope.dispose()
```

## How Graph Resolution Works

1. **Define Nodes**: Each `provide()` or `derive()` creates a graph node
2. **Declare Dependencies**: Dependencies are explicit in the function signature
3. **Resolve Graph**: `scope.resolve()` traverses and resolves in dependency order
4. **Singleton Caching**: Each node resolves once per scope, cached automatically

**Key Insight**: You define the shape of your dependency graph, the library handles the rest.

## Testing Revolution

Traditional testing requires mocking every dependency. Graph resolution lets you test entire systems by changing single nodes:

```typescript
// Change environment = different entire system
const testScope = createScope(preset(config, testConfig));
const prodScope = createScope(preset(config, prodConfig));

// Same code, different behavior based on graph node
const result = await scope.resolve(application);
```

## Code Organization Benefits

- **Natural Separation**: Each component declares only what it needs
- **No Manual Wiring**: Graph resolution handles initialization order
- **Easy Refactoring**: Change dependencies without touching consumers
- **Composable Design**: Mix and match components across projects
- **Type Safety**: Full TypeScript support with inference

## Documentation

### Getting Started

- [**Executors and Dependencies**](./guides/01-executors-and-dependencies.md) - Build your dependency graph
- [**Tags: The Type System**](./guides/02-tags-the-type-system.md) - Type-safe runtime data access
- [**Scope Lifecycle**](./guides/03-scope-lifecycle.md) - Manage long-running resources
- [**Type Inference Patterns**](./guides/04-type-inference-patterns.md) - Zero-annotation TypeScript

### Core Guides

- [**Flow Basics**](./guides/05-flow-basics.md) - Handle short-lived operations
- [**Flow Composition**](./guides/06-flow-composition.md) - Compose flows with ctx.exec
- [**Extensions**](./guides/09-extensions.md) - Cross-cutting concerns
- [**Error Handling**](./guides/10-error-handling.md) - Error boundaries and recovery

### Patterns

- [**Testing Strategies**](./patterns/testing-strategies.md) - Graph-based testing with presets
- [**HTTP Server Setup**](./patterns/http-server-setup.md) - Complete server lifecycle
- [**Database Transactions**](./patterns/database-transactions.md) - Transaction-per-flow pattern
- [**Middleware Composition**](./patterns/middleware-composition.md) - Extension pipelines

### Reference

- [**API Cheatsheet**](./reference/api-cheatsheet.md) - Quick API reference
- [**Common Mistakes**](./reference/common-mistakes.md) - Anti-patterns and fixes
- [**Error Solutions**](./reference/error-solutions.md) - TypeScript error mappings

### Quick Navigation

| I want to...                  | Go to                                                           |
| ----------------------------- | --------------------------------------------------------------- |
| **Start building apps**       | [Executors and Dependencies](./guides/01-executors-and-dependencies.md) |
| **Add business logic**        | [Flow Basics](./guides/05-flow-basics.md)                      |
| **Manage context data**       | [Tags: The Type System](./guides/02-tags-the-type-system.md)  |
| **Build reusable components** | [Extensions](./guides/09-extensions.md)                        |
| **Add monitoring/logging**    | [Extensions](./guides/09-extensions.md)                        |
| **Test my application**       | [Testing Strategies](./patterns/testing-strategies.md)        |
| **Understand the concepts**   | [Scope Lifecycle](./guides/03-scope-lifecycle.md)              |
