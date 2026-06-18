# Service Health Dashboard Logic Spectrum

Diagram: https://diashort.apps.quickable.co/d/859f2072

```mermaid
flowchart LR
  Backend[Backend capstone raw API]
  BFF[BFF package\ncapstoneClient + authProvider + http.ts + main.ts\nimplemented]
  Fat[Fat frontend + BFF\nimplemented]
  Thin[Thin frontend + fat BFF\nimplemented]
  Kanban[Complex Kanban React stress\nimplemented]
  Raw[Fattest frontend dashboard\nraw backend\nBACKLOG]
  F13[F13 main bootstrap\nimplemented]
  Catalog[F02-F12 React catalog\nBACKLOG]

  Fat --> BFF --> Backend
  Thin --> BFF
  Raw -. backlog .-> Backend
  F13 -. composition root .-> Fat
  F13 -. composition root .-> Thin
  Catalog -. backlog .-> Fat
```

## Implemented Slices

| Slice | Source | Claim |
|---|---|---|
| BFF package | BFF practical example package | `capstoneClient` shapes backend data, `authProvider` authenticates and validates sessions, `src/http.ts` maps HTTP-shaped requests through flows, and `src/main.ts` mounts one lite scope for the process boundary. |
| Fat frontend + BFF | `capstone/fat` + BFF practical example package | Frontend owns auth/session/form state, composes `authedBffClient`, and projects BFF-shaped dashboard data. |
| Thin frontend + fat BFF | `capstone/thin` + BFF practical example package | Frontend owns token/form projection, composes `authedBffClient`, and projects BFF-shaped dashboard data. |
| Complex Kanban React stress | `capstone/kanban` | Map-backed board state, derived lane/workload/blocker projections, current-owned action audit, boundary-owned UI session, nested scoped card drafts, tags, presets, extensions, and React observer components prove a dense workspace without Kanban-specific helpers. |
| F13 main bootstrap | `patterns/F13-main-bootstrap` | `main.tsx` is a tested composition-root adapter that returns the scope for assertions. |

## Backlog

| Slice | Status |
|---|---|
| Fattest frontend dashboard against the raw backend | Backlog: there is no `capstone/raw` or `capstone/fattest` implementation in this PR. |
| F02-F12 frontend catalog | Backlog: only F01 and F13 are implemented in the React pattern catalog. |

## Current Node Test Inventory

| Slice | Test file | Test count |
|---|---|---|
| fat frontend | capstone/fat/tests/app.test.ts | 4 |
| fat frontend | capstone/fat/tests/auth-provider.test.ts | 3 |
| fat frontend | capstone/fat/tests/auth.test.ts | 10 |
| fat frontend | capstone/fat/tests/bff-client.test.ts | 3 |
| thin frontend | capstone/thin/tests/bff-client.test.ts | 5 |
| thin frontend | capstone/thin/tests/dashboard.test.ts | 5 |
| thin frontend | capstone/thin/tests/signIn.test.ts | 8 |
| kanban frontend | capstone/kanban/tests/board.test.ts | 10 |

The inventory above is intentionally file-derived by `tests/capstone-comparison.test.ts`. It is not a
package-wide test-total claim; it documents where frontend node logic currently lives.

## Boundary Rules

- Components observe the graph through `ScopeProvider`, `ExecutionContextProvider`, `useAtom`, and
  `useExecutionContext`; observers do not create or close execution contexts manually.
- `main.tsx` is a tested composition-root adapter: create one scope, render through `ScopeProvider`, return
  the scope for assertions, and dispose the root/scope together.
- BFF `main.ts` is a tested lite composition root: create one scope and one process execution context,
  execute requests through the `handleBffRequest` flow, return the scope for assertions, and close the
  process context before disposing the scope.
- Ambient browser/runtime APIs (`fetch`, `document`, timers, storage, clock, random) enter only through
  transport atoms or composition-root adapters; capability atoms, feature graph nodes, and observers do not
  call them inline.
- Feature atoms depend on auth-capable ports such as `authedBffClient`; they do not combine raw HTTP
  clients with session/token storage or manually pass credentials into service calls.
- Dense frontend state should still enter through the same seam: tags select workspace/project/actor,
  current-owned resources own action-local audit, boundary-owned resources own UI execution identity,
  scoped values own form drafts, and React observers subscribe and dispatch.
- No `vi.mock`, `vi.spyOn`, `msw`, or fetch-mock is needed above the seam.
- Packages stay independent and redeclare their wire/view-model types at the transfer boundary.
