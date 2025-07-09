# Pumped fn

Minimal set of library providing functional encapsulation.

# Usages
- Assume all of those functions are from `@pumped-fn/core-next`
- Operator are all directly exported from the package
- Always try to infer instead of explicit declaration

## Container and resolver
Fns helps you create multiple containers. Those are lazy by default and will only resolve via a scope

A scope is a simple facility created using `createScope`

## Scope

- `scope#resolve(executor)` will resolve to a `Promise<value>`
- `scope#accessor(executor)` will return a Core.Accessor which can help to `get`, `resolve`, `lookup` or `subscribe` 

## Executor
Executor is the container. Executor has different access modes for use as dependencies:

- **Default**: Returns the resolved value (non-reactive)
- **`.reactive`**: Returns the resolved value and subscribes to future updates
- **`.lazy`**: Returns an accessor without resolving the executor (deferred resolution)
- **`.static`**: Returns an accessor with the executor resolved (controller pattern)

## Usage

```typescript
const counter = provide(() => 0) // Core.Executor<number>

// different usage of derive, look at the argument of the callback
const derivedValue = derive(counter, (counter) => { /* code */ })
const derivedValue = derive({ counter }, ({ counter }) => { /* code */ })
const derivedValue = derive([counter], ([counter]) => { /* code */ })
```

```typescript
// container can also be reactive, the factory function will be recalled as those dependencies change
const derivedValue = derive(counter.reactive, (counter) => /* this code will be called whenever counter got updated */)

// to update counter
scope.update(counter, /* new value */)
```

### Controller Pattern with `.static`

The `.static` mode provides access to the executor's controller, allowing you to create services that can update state:

```typescript
const counter = provide(() => 0)

// Create a controller service using .static
const counterController = derive(counter.static, (counterCtl) => ({
  increment: () => counterCtl.update(current => current + 1),
  decrement: () => counterCtl.update(current => current - 1),
  reset: () => counterCtl.update(0),
  setValue: (value: number) => counterCtl.update(value)
}))

// Usage - no need to access scope directly
const controller = await scope.resolve(counterController)
await controller.increment()  // Updates counter through its controller
```

### Lazy Resolution with `.lazy`

The `.lazy` mode provides access to the executor's accessor without resolving it, useful for deferred execution:

```typescript
const expensiveComputation = provide(() => {
  console.log('Computing expensive value...')
  return performExpensiveCalculation()
})

// Get lazy accessor - computation hasn't run yet
const lazyService = derive(expensiveComputation.lazy, (lazyCtl) => ({
  getResult: () => lazyCtl.resolve(), // Only compute when explicitly called
  isResolved: () => lazyCtl.lookup()?.kind === 'resolved'
}))

const service = await scope.resolve(lazyService)
console.log(service.isResolved()) // false - not computed yet
const result = await service.getResult() // Now computation runs
```

```typescript
// life cycle. The cleanup will be called on [scope dispose], [or resource update], [or resource being released]
const derivedValue = derive(counter.reactive, (counter, controller) => {
  // create resource ...
  controller.cleanup(() => { /* cleanup code */ })

  return resource
})

// to release
scope.release(derivedValue)

// or be released as the dependency released
scope.release(counter)
```

## Meta

Meta are decorative information to the executor. Meta uses StandardSchema (zod, valibot, arktype etc) to enforce typing. `custom` is included within the library, it doesn't do any validation

```typescript
// adding debug name
const debugName = meta('debug', custom<string>())

const counter = provide(() => 0, debugName('counter'))

// then meta can be accessed using accessor
const derivedCounter = derive(counter.static, counter => {
  counter.metas // would give you access to the given meta
  // or
  debugName.find(counter) // should give you 'counter' | undefined
  // or
  debugName.get(counter) // will throw error if no value found
})
```