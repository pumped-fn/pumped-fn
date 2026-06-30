# TanStack Start Todo Practical

This example is a small fullstack todo surface using `@pumped-fn/lite-tanstack-start`.

The domain module owns todos and flows. `src/start.ts` is the application composition root: it creates the adapter, the scope, request middleware, and per-server-function call middleware. `src/functions.ts` exposes TanStack Start server functions, and `src/TodoApp.tsx` calls those functions from React.

## Shape

- `src/domain.ts` defines tags, store, input types, and todo flows.
- `src/start.ts` wires `tanstackStart.adapter()` once at the app root.
- `src/functions.ts` attaches request and function middleware to server functions.
- `src/TodoApp.tsx` is the client-facing fullstack todo UI.
- `tests/domain.test.ts` exercises the domain through a fresh scope.
- `tests/server-functions.test.ts` drives the exported Start middleware chain with real `Request` objects.
- `tests/guardrails.test.ts` checks the example for implicit external reads and scope helper drift.

The framework integration stays narrow:

```ts
export const createTodoFn = createServerFn({ method: "POST" })
  .middleware([request, createCall])
  .validator((input: CreateTodoInput) => input)
  .handler(lite.handler(createTodo))
```
