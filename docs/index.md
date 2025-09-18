# Pumped Functions - Graph-Based Architecture

Resolve your entire application with a single function call. No wiring, no initialization order, no manual dependency management.

## Why Graph Resolution?

**Traditional Code**: Wire dependencies manually, manage initialization order, debug complex setups
```javascript
// Traditional approach - manual wiring nightmare
const config = { logLevel: 'info', database: 'db://prod', redis: 'redis://prod' }
const logger = { log: (msg) => console.log(`[${config.logLevel}] ${msg}`) }
const db = { query: () => [], url: config.database }
const cache = { get: () => null, set: () => true }
const api = { start: () => logger.log('API started') }
```

**Graph Resolution**: Define relationships, resolve automatically
```javascript
// Graph approach - define once, resolve anywhere
const app = derive([db, cache, logger], ([db, cache, log]) => ({
  start: () => log.log('API started with all dependencies')
}))
await scope.resolve(app) // Everything resolves in correct order
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

```typescript
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
