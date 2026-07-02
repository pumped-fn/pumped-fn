# Parking Lot Shared

Shared parking lot management domain for the CLI, Hono, TanStack Start, and SPA examples.

## Canonical Shape

The package owns the domain model, stores, tags, resources, and public flows. Entrypoints import these
handles and provide actor, clock, and store runtime values through `createScope`, `preset`, and tags.

## Shape

- `src/model.ts` defines the parking data model.
- `src/store.ts` provides the in-memory store used by tests and examples.
- `src/sqlite.ts` provides the SQLite adapter below the scope seam.
- `src/graph.ts` defines tags, transaction resource, and public workflow flows.
- `tests/workflows.test.ts` proves the multi-role workflow matrix through the public graph.

## Run

```bash
pnpm test
pnpm typecheck
```
