# TanStack Start Todo Practical

This example is a small fullstack todo surface using `@pumped-fn/lite-tanstack-start`.

The domain module owns todos and flows. `src/start.ts` follows TanStack Start's global configuration shape with `createStart({ requestMiddleware })`. `src/todo.functions.ts` exposes server functions with function-level operation middleware, and `src/routes/index.tsx` is the file route that loads and mutates todos.

## Shape

- `src/domain.ts` defines tags, store, input types, and todo flows.
- `src/start.ts` wires `tanstackStart.adapter()` once at the app root and exports `startInstance`.
- `src/todo.functions.ts` attaches function middleware to server functions.
- `src/routes/__root.tsx` and `src/routes/index.tsx` are normal TanStack Router file routes.
- `src/routeTree.gen.ts` is the generated route-tree shape kept in this standalone package.
- `src/router.tsx` is the Start router entry used by the Vite dev server.
- `vite.config.ts` installs `pumpedVite({ graph: true })`, `tanstackStart()`, and `tanstackStartBoundary()`.
- `tests/dev-mode.test.ts` boots Vite dev mode, transforms the Start modules, and reads the Lite HMR feed.
- `tests/domain.test.ts` exercises the domain through a fresh scope.
- `tests/server-functions.test.ts` drives the exported Start middleware chain with real `Request` objects.
- `tests/guardrails.test.ts` checks the example for implicit external reads and scope helper drift.

## Dev Mode

```sh
pnpm -F @pumped-fn/lite-tanstack-start-todo-practical dev
pnpm -F @pumped-fn/lite-tanstack-start-todo-practical test:dev
```

The `test:dev` script starts a Vite dev server with the same config as `dev`, verifies the Start boundary transform path, and checks `/__pumped-fn/lite-hmr.json` for the example's discovered Lite handles.

The framework integration stays narrow:

```ts
export const Route = createFileRoute("/")({
  loader: () => listTodosFn(),
  component: TodoRoute,
})
```
