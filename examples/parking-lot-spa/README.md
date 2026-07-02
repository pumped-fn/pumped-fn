# Parking Lot SPA

Vite React SPA over the shared parking lot management flows.

## Canonical Shape

React owns rendering and user interaction. State and workflows live in Lite atoms and flows, `ScopeProvider`
owns the graph scope, `ExecutionContextProvider` injects actor and clock tags, and components observe or
dispatch with Lite React hooks.

## Shape

- `src/state.ts` defines UI state and flow handlers over the shared parking graph.
- `src/app.tsx` renders the role-based UI and dispatches flow handlers.
- `src/main.tsx` mounts the app.
- `tests/app.browser.test.tsx` proves the rendered UI dispatches real shared workflows.

## Run

```bash
pnpm test
pnpm typecheck
pnpm build
```
