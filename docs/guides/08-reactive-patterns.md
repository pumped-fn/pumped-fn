---
title: Reactive Patterns
description: Live updates with .reactive property
keywords: [reactive, updates, scope.update]
---

# Reactive Patterns

Reactive executors re-execute when upstream dependencies change via `scope.update()`. Use for caches, computed values, and live configuration.

## Core Pattern

```ts twoslash
import { provide, derive, createScope, tag, custom } from '@pumped-fn/core-next'

const config = tag(custom<{ env: string }>(), { label: 'config' })
const source = provide((controller) => config.get(controller.scope))

const reactive = derive(source.reactive, (cfg) => {
  console.log('Config changed:', cfg.env)
  return cfg
})

const scope = createScope({
  tags: [config({ env: 'dev' })]
})

await scope.resolve(reactive)

await scope.update(source, { env: 'prod' })
```

## Reactive vs Non-Reactive

Only executors using `.reactive` re-execute on updates:

```ts twoslash
import { provide, derive, createScope, tag, custom } from '@pumped-fn/core-next'

const data = tag(custom<number>(), { label: 'data' })
const source = provide((controller) => data.get(controller.scope))

const normal = derive(source, (n) => n * 2)
const reactive = derive(source.reactive, (n) => n * 2)

const scope = createScope({ tags: [data(10)] })

const n1 = await scope.resolve(normal)
const r1 = await scope.resolve(reactive)

await scope.update(source, 20)

const n2 = await scope.resolve(normal)
const r2 = await scope.resolve(reactive)
```

`normal` returns same cached value (20), `reactive` returns new value (40).

## Use Cases

### Configuration Reloading

```ts twoslash
import { provide, derive, createScope, tag, custom } from '@pumped-fn/core-next'

const appConfig = tag(custom<{ logLevel: string }>(), { label: 'config' })

const configSource = provide((controller) => appConfig.get(controller.scope))

const logger = derive(configSource.reactive, (cfg) => ({
  log: (msg: string) => {
    if (cfg.logLevel === 'debug') {
      console.log(msg)
    }
  }
}))
```

### Cache Invalidation

```ts twoslash
import { provide, derive, createScope, tag, custom } from '@pumped-fn/core-next'

const cacheKey = tag(custom<string>(), { label: 'cache.key' })

const keySource = provide((controller) => cacheKey.get(controller.scope))

const cache = derive(keySource.reactive, (key) => {
  console.log('Loading cache for:', key)
  return new Map()
})
```

## Complete Example

<<< @/../examples/http-server/reactive-updates.ts

## Key Points

- Use `.reactive` property for live updates
- `scope.update()` triggers re-execution
- Only reactive executors re-execute
- Normal executors stay cached

## See Also

- [Executors and Dependencies](./01-executors-and-dependencies.md)
- [Scope Lifecycle](./03-scope-lifecycle.md)
- [Tags: The Type System](./02-tags-the-type-system.md)
