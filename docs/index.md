# Pumped Functions - Graph-Based Architecture

Resolve your entire application with a single function call. No wiring, no initialization order, no manual dependency management.

## Why Graph Resolution?

**Traditional Code**: Wire dependencies manually, manage initialization order, debug complex setups
```javascript
const config = { logLevel: 'info', database: 'db://prod', redis: 'redis://prod' }
const logger = { log: (msg) => console.log(`[${config.logLevel}] ${msg}`) }
const db = { query: () => [], url: config.database }
const cache = { get: () => null, set: () => true }
const api = { start: () => logger.log('API started') }
```

**Graph Resolution**: Define relationships, resolve automatically
```javascript
const app = derive([db, cache, logger], ([db, cache, log]) => ({
  start: () => log.log('API started with all dependencies')
}))
await scope.resolve(app)
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

::: code-group

<<< @/code/1-minute.ts#snippet{ts:line-numbers twoslash} [Basic Graph]
<<< @/code/5-minutes.ts#snippet{29,34 ts:line-numbers twoslash} [Complex Dependencies]
<<< @/code/10-minutes.ts#snippet{53,75,55-60 ts:line-numbers twoslash} [Full Application]
:::

## How Graph Resolution Works

1. **Define Nodes**: Each `provide()` or `derive()` creates a graph node
2. **Declare Dependencies**: Dependencies are explicit in the function signature
3. **Resolve Graph**: `scope.resolve()` traverses and resolves in dependency order
4. **Singleton Caching**: Each node resolves once per scope, cached automatically

**Key Insight**: You define the shape of your dependency graph, the library handles the rest.

## Testing Revolution

Traditional testing requires mocking every dependency. Graph resolution lets you test entire systems by changing single nodes:

```ts twoslash
// Change environment = different entire system
const testScope = createScope(preset(config, testConfig))
const prodScope = createScope(preset(config, prodConfig))

// Same code, different behavior based on graph node
const result = await scope.resolve(application)
```

## Code Organization Benefits

- **Natural Separation**: Each component declares only what it needs
- **No Manual Wiring**: Graph resolution handles initialization order
- **Easy Refactoring**: Change dependencies without touching consumers
- **Composable Design**: Mix and match components across projects
- **Type Safety**: Full TypeScript support with inference

## Documentation

### Core Library
- [**API Reference**](./api.md) - Complete API documentation for graph construction, resolution, plugins, meta, and flows
- [**Testing**](./testings.md) - Graph-based testing strategies with preset power
- [**How It Works**](./how-does-it-work.md) - Deep dive into graph resolution mechanics
- [**Graph vs Traditional**](./graph-vs-traditional.md) - Comparison with traditional dependency injection

### Advanced Guides
- [**Flow API**](./flow.md) - Structured business logic with validation and context management
- [**DataAccessor**](./accessor.md) - Type-safe data access for Map-like structures with validation
- [**Extensions**](./extensions.md) - Build cross-cutting functionality with unified extension API
- [**Component Authoring**](./authoring.md) - Create reusable components with meta-based configuration
- [**Meta System**](./meta.md) - Type-safe metadata decoration for extensibility

### Quick Navigation
| I want to... | Go to |
|--------------|-------|
| **Start building apps** | [API Reference](./api.md) → Graph Construction |
| **Add business logic** | [Flow API](./flow.md) → Patterns |
| **Manage context data** | [DataAccessor](./accessor.md) → Integration with Flows |
| **Build reusable components** | [Component Authoring](./authoring.md) → Meta Configuration |
| **Add monitoring/logging** | [Extensions](./extensions.md) → Extension Patterns |
| **Test my application** | [Testing](./testings.md) → Graph Testing |
| **Understand the concepts** | [How It Works](./how-does-it-work.md) |
