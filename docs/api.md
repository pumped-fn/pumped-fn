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

## middleware

Middleware provides cross-cutting concerns without modifying core logic. It can intercept resolution, updates, and releases.

#### scope.use

Register middleware to intercept scope operations:

```ts twoslash
import { createScope, plugin } from "@pumped-fn/core-next";

const scope = createScope();

const cleanup = scope.use(plugin({
  init: (scope) => {
    // Called when middleware is registered
  },
  dispose: async (scope) => {
    // Called when scope is disposed
  }
}));
```

#### scope.onChange

Intercept resolution and update events:

```ts twoslash
// @errors: 7006
import { createScope, preset, provide } from "@pumped-fn/core-next";

const scope = createScope();
const value = provide(() => "original");

scope.onChange((event, executor, value, scope) => {
  if (event === "resolve") {
    console.log("Resolved:", value);
  }
  if (event === "update") {
    console.log("Updated:", value);
  }
  // Return preset() to transform the value
  if (value === "transform-me") {
    return preset(executor, "transformed");
  }
});
```

#### scope.onRelease

Handle executor cleanup:

```ts twoslash
// @errors: 7006
import { createScope, provide } from "@pumped-fn/core-next";

const scope = createScope();
const connection = provide(() => ({ id: "db-1" }));

scope.onRelease(async (event, executor, scope) => {
  // Cleanup when executor is released
  console.log("Releasing executor");
});
```

#### practical middleware examples

```ts twoslash
// @errors: 7006
import { createScope, plugin, provide, derive, preset } from "@pumped-fn/core-next";

// Analytics middleware
const analytics = plugin({
  init: (scope) => {
    scope.onChange((event, executor, value) => {
      if (event === "resolve") {
        // Track resolution metrics
      }
    });
  }
});

// Value sanitizer
const sanitizer = plugin({
  init: (scope) => {
    scope.onChange((event, executor, value, scope) => {
      if (typeof value === "string" && value.includes("unsafe")) {
        return preset(executor, value.replace("unsafe", "safe"));
      }
    });
  }
});

const scope = createScope();
scope.use(analytics);
scope.use(sanitizer);
```

## meta

Meta provides type-safe decorative information attached to executors. It uses StandardSchema for validation and integrates seamlessly with middleware for runtime inspection.

#### creating meta functions

```ts twoslash
import { meta, custom } from "@pumped-fn/core-next";

// Create a meta function with a schema
const name = meta("service-name", custom<string>());
const port = meta("port", custom<number>());
const config = meta("config", custom<{ url: string; timeout: number }>());
```

#### attaching meta to executors

```ts twoslash
import { provide, derive, meta, custom } from "@pumped-fn/core-next";

const name = meta("name", custom<string>());
const priority = meta("priority", custom<number>());

// Attach meta during creation
const database = provide(
  () => ({ connection: "postgres://..." }),
  name("database"),
  priority(1)
);

// Multiple metas
const cache = provide(
  () => new Map(),
  name("cache"),
  priority(2)
);
```

#### accessing meta values

```ts twoslash
import { provide, meta, custom } from "@pumped-fn/core-next";

const name = meta("name", custom<string>());
const service = provide(() => {}, name("auth"));

// Get meta value from executor
const serviceName = name.get(service); // "auth"

// Find first matching meta
const maybeName = name.find(service); // "auth" | undefined

// Get all matching metas (executors can have multiple of same type)
const allNames = name.some(service); // string[]
```

#### meta with middleware

```ts twoslash
// @errors: 7006
import { createScope, plugin, provide, meta, custom } from "@pumped-fn/core-next";

const name = meta("name", custom<string>());
const metrics = meta("metrics", custom<boolean>());

// Middleware that uses meta for conditional logic
const metricsMiddleware = plugin({
  init: (scope) => {
    scope.onChange((event, executor, value) => {
      // Check if executor has metrics enabled
      if (metrics.find(executor)) {
        const serviceName = name.get(executor) ?? "unknown";
        console.log(`[${serviceName}] ${event}:`, value);
      }
    });
  }
});

const api = provide(
  () => ({ endpoint: "/api" }),
  name("api-service"),
  metrics(true) // Enable metrics for this executor
);

const internal = provide(
  () => ({ data: "internal" }),
  name("internal-service")
  // No metrics meta - won't be tracked
);
```

#### meta accessor integration

```ts twoslash
import { createScope, provide, meta, custom } from "@pumped-fn/core-next";

const description = meta("description", custom<string>());
const service = provide(() => "service", description("Main service"));

const scope = createScope();
const accessor = scope.accessor(service);

// Accessor includes metas
const desc = description.find(accessor); // "Main service"
```

#### practical meta patterns

```ts twoslash
// @errors: 7006
import { provide, derive, meta, custom, createScope, plugin } from "@pumped-fn/core-next";

// Version tracking
const version = meta("version", custom<string>());

// Deprecation warnings
const deprecated = meta("deprecated", custom<{ since: string; alternative?: string }>());

// Service classification
const tier = meta("tier", custom<"critical" | "standard" | "low">());

// Deprecation middleware
const deprecationWarning = plugin({
  init: (scope) => {
    scope.onChange((event, executor) => {
      const deprecation = deprecated.find(executor);
      if (deprecation && event === "resolve") {
        console.warn(
          `Deprecated since ${deprecation.since}`,
          deprecation.alternative ? `Use ${deprecation.alternative} instead` : ""
        );
      }
    });
  }
});

// Usage
const oldApi = provide(
  () => ({ v1: true }),
  version("1.0.0"),
  deprecated({ since: "2.0.0", alternative: "newApi" }),
  tier("low")
);

const newApi = provide(
  () => ({ v2: true }),
  version("2.0.0"),
  tier("critical")
);
```
