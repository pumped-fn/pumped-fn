# Integration principle

pumped-fn requires no special treatment, it just needs a very constraints on environment setting

- it requires a async function body, like, an async function, or any async function
- scope is where the values are stored, as such, scope may need to be shared between files once it's created. It's easier to just resolve scope close to the entry point (main file, where you create and start server, start of cli file etc)

### Why?

In javascript, when we mix both sync and async function, it'll always end up with async function. While we can further optimize making the library optimize to frame, it's yet the priority, as such, at the moment, resolves API requires async environment

### But that's it

you'll need to create the scope somewhere that is sharable, and you can just build the graph of dependency

::: code-group
<<< @/code/integrations/shared.ts [shared.ts]
:::

::: code-group
<<< @/code/integrations/hono.ts [Hono]
:::
