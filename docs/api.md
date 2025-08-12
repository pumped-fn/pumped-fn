# introduction

`@pumped-fn/core-next` tried its best to stay on very low amount of APIs, it makes programming fun, ease on importing and also LLM-friendly

## primitives

### executors

Executor is the atom of `pumped-fn`. At its heart, it's measely an object to be used as a reference. It contains the factory function, dependencies and metas

Executor has a few references used as signal the scope to treat the graph of dependencies slightly differently

- `lazy` is a representation of an Executor at the Scope. It gives you the access to the Accessor. It fuels conditional dependency, lazy evalution
- `reactive` is a Reactive indicator of an Executor at the Scope. When a value depending on a reactive variation, whenever the main Executor got updated, the factory will be triggered
- `static` is a static representation of an Executor at the Scope. On resol

## creation

There are very few way creating

```ts twoslash
import { provide, derive } from "@pumped-fn/core-next";
```

#### provide

```ts twoslash
import { provide } from "@pumped-fn/core-next";

// ---cut---
const value = provide(() => "string");
```

#### derive

```ts twoslash
import { provide, derive } from "@pumped-fn/core-next";

const value = provide(() => "string");
const otherValue = provide(() => 20);

// ---cut---
const derived = derive(value, (value) => {
  /* */
});
const derivedUsingArray = derive([value, otherValue], ([value, otherValue]) => {
  /* */
});
const derivedUsingObject = derive(
  { value, otherValue },
  ({ value, otherValue }) => {
    /* */
  }
);
```

#### accessing controller

```ts twoslash
// @noErrors
import { provide, derive, type Core } from "@pumped-fn/core-next";

// ---cut---
const value = provide((ctl) => "string");
const otherValue = provide((ctl) => 20);

const derived = derive(value, (value, ctl) => {
  /* */
});
const derivedUsingArray = derive(
  [value, otherValue],
  ([value, otherValue], ctl) => {
    /* */
  }
);
const derivedUsingObject = derive(
  { value, otherValue },
  ({ value, otherValue }, ctl) => {
    //                        ^^^
  ctl.
  //  ^|
    /* */
  }
);

type Controller = Core.Controller
//   ^^^^^^^^^^

```

#### using variations

```ts twoslash
import { provide, derive } from "@pumped-fn/core-next";

const value = provide(() => "string");
const derived = derive(value, (value) => {
  /* */
});

const valueUpdator = derive();

const valuePrinter = derive(value.reactive, (value) => console.log(value));

const derivedUsingObject = derive(
  { value, otherValue },
  ({ value, otherValue }) => {
    /* */
  }
);
```

## scope

Scope is the unit that in charge of resolving the graph of dependencies, bring value to life (an escape hatch)

```ts twoslash
import { createScope } from "@pumped-fn/core-next";
```

#### createScope

```ts twoslash
const scope = createScope();
```

#### scope.resolve

```ts twoslash
import { provide, createScope } from "@pumped-fn/core-next";
const value = provide(() => 0);
const scope = createScope();
// ---cut---
const resolvedValue = await scope.resolve(value);
```

#### scope.update

```ts twoslash
import { provide, createScope } from "@pumped-fn/core-next";
const value = provide(() => 0);
const scope = createScope();
// ---cut---
let resolvedValue = await scope.resolve(value);
//  0
await scope.update(value, 1);
await scope.update(value, (current) => 1); // react setState style

resolvedValue = await scope.resolve(value);
//  1
```

Updating requires the executor to be resolved upfront, via direct resolve or as a part of the graph

#### scope.release

Release a reference and its value (and also all of dependencies relying on the reference)

```ts twoslash
import { provide, derive, createScope } from "@pumped-fn/core-next";
const value = provide(() => 0);

const scope = createScope();
// ---cut---
const derivedValue = derive(value, (value) => value + "1");
let resolvedValue = await scope.resolve(derivedValue);
await scope.release(value);

// will also release derivedValue
```
