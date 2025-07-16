# Usage

```typescript
import { provide, derive, createScope, resolves, type Core, name } from "@pumped-fn/core-next"
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

const value = provide(() => /** value goes here **/, ... /** metas can be added freely, for example name('value') */)
//    ^? Core.Executor<infered value type>
const value = provide((ctl) => /** value goes here **/)
//                     ^? Core.Controller (as defined up there)
//    ^? Core.Executor<infered value type>

const derivedValue = derive(value, value => /** derived logic goes here **/, ... /** metas can be added freely, for example name('value') */)
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

# Standard schema

Standardschema [https://github.com/standard-schema/standard-schema] is a standardize validation/type declaration supporting integration with various libraries, for example zod, arktypes, valibot etc

```typescript
import { custom, validate } from "@pumped-fn/core-next";

const stringType = custom<string>(); // custom doesn't do anything, similar to custom of zod. It just helps storing type

const validatedString = validate(stringType, "abc"); // type checking will kick in automatically. On validation cases, error will be thrown on failure
```

# Advanced

## Using pod

Pod is a subscope, deriving from a main scope. Purposely built for flow execution, where it'll hold execution value, like request, tracing etc. While the scope hold long running value like database connection etc

```typescript
import { placeholder, createScope, podOnly } from "@pumped-fn/core-next"
//                                 ^? Meta.MetaFn that will be read by scope. This resouce will only resolve in pod

const requestHolder = placeholder<Request>(podOnly) // the value on resolved will throw error. Only use with presetting. It gives type infering and referencing

const dependingOnRequest = derive(requestHolder, request => /* do something with request*/, podOnly)
/***
 * At the moment, only resource marked with podOnly be resolved in pod, literally (so nothing in DAG will be resolved in pod automatically). Other resources will be resolved in the scope and then be copied over to pod. As such, disposing a pod will not clean resource in use, however, it'll leave residue in the scope, though, that's the design decision to make those resources reusable by default
 **/

// within request handle
const pod = scope.pod(preset(requestHolder, request /* coming from request handler */))

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
// useResolve will automatically resolve the executor. Dispose scope or release an executor must be done manually, otherwise, the rerendering kicks in and it'll cause infinite loop
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

# Usage patterns on backend

## Placeholder common used services

- common use foundational services like logging, monitoring can be done via exposing service placeholder (like logger)
- explicit typing what's the service looks like
- requires preset on the scope, otherwise the startup will be failed

## Integration with other services (like db, redis, etc) or any services require certain level of configuration (file generation, cache etc)

- create config using placeholder, typing what's needed for the config of the service
- derive the config, use zod to verify and adding default values
- expose client-like, interact-points depending on service
- normally integrating with other services doesn't require testing. Those'll be tested on higher level like reusable services
- adding resource cleanup as needed
- use `name` meta to add meaningful name for debugging

## Logic-like, business logic-like

- derive only needed services
- rather use function closure over class, class' constructor cannot do async/await
- normally those services that changes to database, fulfilling certain logics are all required to be tested

## Integrating with framework

1. major glueing should happen within a main function. The main function should take care

- creation of scope and those presets. If it is needed to separate the concern between startingup and operational, use 2 scopes instead of one.
- the startingup scope should be able to resolve values that's needed to start server (for example)
- resolve the main executor and catch all operational going with it
- listen to signals, errors to handle graceful exit
- set the timeout in case of too slow startup

2. use `resolves(scope, ...)` to resolve values. keep the result as `resolved` or `r` so variable naming will not be duplicated
3. use zod to share type where applicable

# Usage patterns on frontend

## Live outside of framework lifecycle

Given the @pumped-fn/core-next is reactive on its own. Majority of frontend work can be done outside of react. That'll eliminate waterfall

1. explain the required logic using executors, each should reflect the data dependencies need and its meaning. For example, a path required authentication, we'll organize at least as of following

- endpoint configurations (incase of proxying, paths/domains can be different)
- authentication action
- current state of authentication. This will be changed based on the status of authentication action/chronical ping to see if the state of authentication has changed

2. frontend just need to render based on the state of those resolved executors. changes are going to be done via controllers
3. test can be done by setup scopes, providers, presets and a tree of components, or by testing executors (given most of logics are in executors)
4. For built-in APIs like fetch, Date etc, cookie, always wrap the using functionalities using `provide`. As such, we don't need any fancy tool to execute tests. A scope and preset should be sufficient
