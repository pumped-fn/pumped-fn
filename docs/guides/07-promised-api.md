---
title: Promised API
description: Lazy composition with map, switch, and error handling
keywords: [promised, map, switch, lazy]
---

# Promised API

`Promised<T>` provides lazy composition over async values. Transform, chain, and handle errors without awaiting until necessary.

## Core Methods

### map() - Transform Values

```ts twoslash
import { provide, createScope } from '@pumped-fn/core-next'

const value = provide(() => 42)

const scope = createScope()
const promised = scope.resolve(value)

const doubled = promised.map(n => n * 2)
const result = await doubled
```

### switch() - Chain Promised

```ts twoslash
import { provide, derive, createScope } from '@pumped-fn/core-next'

const config = provide(() => ({ env: 'prod' }))
const db = derive(config, (cfg) => ({ host: cfg.env }))

const scope = createScope()

const promised = scope.resolve(config)
  .switch(cfg => scope.resolve(db))

const result = await promised
```

### catch() - Error Handling

```ts twoslash
import { provide, createScope } from '@pumped-fn/core-next'

const risky = provide(() => {
  throw new Error('Failed')
})

const scope = createScope()

const safe = scope.resolve(risky)
  .catch(error => ({ fallback: true }))

const result = await safe
```

## Static Methods

### Promised.all()

```ts twoslash
import { Promised, provide, createScope } from '@pumped-fn/core-next'

const a = provide(() => 1)
const b = provide(() => 2)

const scope = createScope()

const combined = Promised.all([
  scope.resolve(a),
  scope.resolve(b)
])

const [first, second] = await combined
```

### Promised.allSettled()

```ts twoslash
import { Promised, provide, createScope } from '@pumped-fn/core-next'

const success = provide(() => 42)
const failure = provide(() => { throw new Error('Failed') })

const scope = createScope()

const results = await Promised.allSettled([
  scope.resolve(success),
  scope.resolve(failure)
])

const fulfilled = results.filter(r => r.status === 'fulfilled')
const rejected = results.filter(r => r.status === 'rejected')
```

## Lazy Composition

Promised chains don't execute until awaited:

```ts twoslash
import { provide, createScope } from '@pumped-fn/core-next'

const value = provide(() => {
  console.log('Executing')
  return 42
})

const scope = createScope()

const promised = scope.resolve(value)
  .map(n => n * 2)
  .map(n => n + 10)

console.log('Not executed yet')

const result = await promised
```

## Complete Example

<<< @/../examples/http-server/promised-comprehensive.ts

## Key Points

- `.map()` transforms values
- `.switch()` chains Promised instances
- `.catch()` handles errors
- Static methods for parallel composition
- Execution deferred until await

## See Also

- [Executors and Dependencies](./01-executors-and-dependencies.md)
- [Flow Basics](./05-flow-basics.md)
- [Error Handling](./10-error-handling.md)
