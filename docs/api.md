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

#### accessing variations

```ts twoslash
import { provide, derive } from "@pumped-fn/core-next";

const value = provide(() => 0);

const derivedValue = derive(
  [value.lazy, value.static, value.reactive],
  ([accessor, value, anotherAccessor]) => {}
);
```

#### presetting

An executor can be "assumed" to be a specific value, on scope resolving that particular executor, if the scope recognized there's an assumed value, it'll resolved with the "assumed" value instead of triggering the original factory

```ts twoslash
import { provide, derive, createScope, preset } from "@pumped-fn/core-next";

const value = provide(() => 0);

const assumedValue = preset(value, 1);
const scope = createScope(assumedValue);

const resolvedValue = await scope.resolve(value); // will be 1
```

Preset is the technique built-in pumped-fn to use in testing and building middleware

## scope

Scope is the unit that in charge of resolving the graph of dependencies, bring value to life (an escape hatch)

```ts twoslash
import { createScope } from "@pumped-fn/core-next";
```

#### createScope

```ts twoslash
import { createScope } from "@pumped-fn/core-next";
// ---cut---
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

- Updating requires the executor to be resolved upfront, via direct resolve or as a part of the graph

On update, the following mechanism happen

- cleanups got called
- The .reactive dependencies got triggered
- factory function is called

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

#### scope.accessor

Retrieve the singleton of an executor respresentative in a scope

```ts twoslash
// @noErrors
import { provide, createScope, type Core } from "@pumped-fn/core-next";
const value = provide(() => 0);

const scope = createScope();
// ---cut---

const valueAccessor = scope.accessor(value);

const getValue = valueAccessor.get(); // retrieve value. Will throw error if executor is yet resolved
const maybeValue = valueAccessor.lookup();
const resolvedValue = await valueAccessor.resolve();
typeof valueAccessor['
//                    ^|


```

#### scope.dispose

```ts twoslash
// @noErrors
import { provide, createScope, type Core } from "@pumped-fn/core-next";
const value = provide((ctl) => {
  // acquire connection

  ctl.cleanup(() => {
    /** cleanup logic */
  });

  return 0;
});

const scope = createScope();
await scope.dispose();
```

Dispose will cleanup all resources resolved in the scope, also mark the scope as `disposed`. Disposed scope will not be able to do anything afteward
