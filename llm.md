# Usage
```typescript
import { provide, derive, createScope, resolves, type Core } from "@pumped-fn/core-next"
//                                     ^? type Core has definition of Core types, like Executor, Accessor, Scope

/**
 * Accessor is a representation of the Executor<T> in the scope
**/
type Accessor<T> = {
  lookup(): undefined | ResolveState<T>;
  get(): T; // will throw error if the executor is yet resolved
  resolve(force?: boolean): Promise<T>; // can resolve the value (if yet there). Using force will bypass caching
  release(soft?: boolean): Promise<void>; // can release the executor off the scope
  update(updateFn: T | ((current: T) => T)): Promise<void>; // update the value, will trigger cleanup and reactivity to other dependencies
  subscribe(callback: (value: T) => void): Cleanup; // listen to changes
}

/**
 * controller gives you access to cleanup lifecycle, self release and the scope on its own
 **/
type Controller = {
  cleanup: (cleanup: Cleanup) => void;
  release: () => Promise<void>;
  scope: Scope;
};

/** Patterns **/

const value = provide(() => /** value goes here **/)
//    ^? Core.Executor<infered value type>
const value = provide((ctl) => /** value goes here **/)
//                     ^? Core.Controller (as defined up there)
//    ^? Core.Executor<infered value type>

const derivedValue = derive(value, value => /** derived logic goes here **/)
//    ^? Core.Executor<infered derivedValue type>
//                                 ^? resolved value, not the Core.Executor

const derivedValue = derive(value, (value, ctl) => /** derived logic goes here **/)
//    ^? Core.Executor<infered derivedValue type>
//                                 ^? resolved value, not the Core.Executor
//                                         ^? Core.Controller (as defined up there)

const derivedValue = derive([value, anotherValue], [resolvedValue, resolvedanotherValue] => /** derived logic goes here **/)
//                                                  ^? array of resolved values

const derivedValue = derive({ value, anotherValue }, ({ value, anotherValue }) => /** derived logic goes here **/)
//                                                     ^? destructured object of resolved values

const reactivatedValue = derive(value.reactive, value => /* function body will be recalled on any dependencies change */)

const valueController = derive([value.lazy, value2.lazy], [valueCtl, value2Ctl] => /* */)
//                                         ^? Accessor of the value
// .lazy gives the lazy access to the value, without resolving it, useful for conditional resources

const valueController = derive(value.static, valueCtl => /* */)
//                                         ^? Accessor of the value
// .static gives you the accessor and will resolve the value, useful on controlling value's value

/** Resolving **/
const scope = createScope()
//    ^? Core.Scope. Scope is isolated

const resolvedValue = await scope.resolve(value)
//    ^? infered value of the executor. Resolve the value if it's yet cached, return the cache value if already resolved

// use utility to resolve multiples, similar to the derive API
const resolvedValue = resolves(scope, [value, anotherValue])
//    ^? [resolvedValue, resolvedAnotherValue]

const resolvedValue = resolves(scope, {value, anotherValue})
//    ^? {resolvedValue, resolvedAnotherValue}

const valueAccessor = scope.accessor(value)
//    ^? Accessor<infered Value>

/** Updating. Will run cleanup, update new value, trigger reactive changes on all reactivity dependencies **/
await scope.update(value, (oldValue) => /****/)
await scope.update(value, newValue)

/** Releasing. Recursively release all dependencies. Then cleanup and release **/
await scope.release(value)

/** Scope life cycle. It'll release all holding values, running all cleanups in reversed order. Scope is dead once disposed **/
await scope.dispose()

/** Resource cleannup **/
const value = provide((ctl) => {
  /** code **/
  ctl.cleanup(() => /*clean up will be executed on update or release*/)
  /** code **/
})

const derivedValue = derive(value, (value, ctl) => {
  /** code **/
  ctl.cleanup(() => /*clean up will be executed on update or release*/)
  /** code **/
})

/** Testing **/
// Given scope are isolated, each test should have its own scope and control the life cycle as it wished. Can assume certain value in the DAG to lower cost of mocking

const assumedValue = preset(value, assumedValue) // value will be resolved as assumedValue in the scope. AssumedValue may not honor the reactivity setup

// setup the scope with those assumed values
const scope = createScope(assumedValue, assumedValue1...)

```

# Usage with react
```tsx
import { Suspense } from "react"
import { ScopeProvider, useResolves, useResolve, Resolves, Reselect } from "@pumped-fn/react"

// up on the tree, wrap with. Scope is optional. Suspense is required with at least one
<ScopeProvider scope={scope}>
  <Suspense>
    {/** rest of the children **/}
  </Suspense>
</ScopeProvider>

// usage inside a component. .reactive values will trigger rerender on changes
const resolved = useResolves(value, anotherValue, elseValue.reactive)
//    ^? [resolvedValued, anotherResolvedValue, ...]

// slice of data
// requires stable selector
const resolved = useResolve(value, (resolvedValue) => { /** subset **/})

const resolved = useResolve(value.reactive, (resolvedValue) => { /** subset **/}) // this'll rerender on change

const resolved = useResolve(value.reactive, (resolvedValue) => { /** subset **/}, {
  equality?: (thiz, that) => boolean // custom equality (default is Object.is),
  snapshot?: (slice) => slice // default is as it is
}) // this'll rerender on change

// usage using component (prefered way, the closure scope is good at sharing controller, while the component will rerender on data changes)

const controller = userResolves(...)
<Resolves e={[
  value.reactive,
  anotherValue
]}>
  {([value, anotherValue]) => { /* this children can access controller */}}
</Resolves>

// Reselect API is similar to useResolve
<Reselect e={value} selector={selector} options={{equality, snapshot}}>
{(value) => { /* rest of the code */}}
</Reselect>

/** Testing **/
// Use similar testing strategy as in [# Usage]. Feed the scope to the ScopeProvider, can control by interacting on screen or via scope

```