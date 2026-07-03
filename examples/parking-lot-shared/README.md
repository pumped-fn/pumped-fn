# Parking Lot Shared

Shared parking lot management domain for the CLI, Hono, TanStack Start, and SPA examples.

## Canonical Shape

The package owns the domain model, stores, tags, resources, and public flows. Entrypoints import these
handles and provide actor, clock, and store runtime values through `createScope`, `preset`, and tags.

## Shape

- `src/model.ts` defines the parking data model.
- `src/store.ts` provides the in-memory store used by tests and examples.
- `src/sqlite.ts` provides the SQLite adapter below the scope seam. The `store` atom (`src/atom.store.ts`)
  defaults to it, driven by the `dbPath` tag (`parking-lot.sqlite` by default) and dynamically imported so
  browser bundles (e.g. the SPA) never pull in `node:sqlite`; preset `store` with `createMemoryStore()`
  for tests and other non-sqlite-backed demos.
- `src/atom.clock.ts` is the one adapter atom allowed to read `Date`; substitute it with `preset(clock, fn)` for fixed-time tests.
- `src/tags.ts`, `src/resource.tx.ts`, `src/flow.*.ts` define tags, the transaction resource, and public workflow/rule flows.
- `tests/workflows.test.ts` proves the multi-role workflow matrix through the public graph.
- `tests/flow.observability.test.ts` proves a rejected nested rule exec (e.g. `allow`) is attributable in an `observable` trace alongside its parent flow's error.

## Run

```bash
pnpm test
pnpm typecheck
```
