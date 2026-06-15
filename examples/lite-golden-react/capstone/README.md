# Service Health Dashboard Logic Spectrum

Diagram: https://diashort.apps.quickable.co/d/8c731a3d

```mermaid
flowchart LR
  Backend[Backend capstone raw API]
  BFF[BFF package\ncapstoneClient + authProvider + http.ts\nimplemented]
  Fat[Fat frontend + BFF\nimplemented]
  Thin[Thin frontend + fat BFF\nimplemented]
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
| BFF package | `examples/lite-golden-bff` | `capstoneClient` shapes backend data, `authProvider` authenticates and validates sessions, and `src/http.ts` maps HTTP-shaped requests through flows. |
| Fat frontend + BFF | `capstone/fat` + `examples/lite-golden-bff` | Frontend owns auth/session/form state and app derivation; BFF owns dashboard/detail shaping. |
| Thin frontend + fat BFF | `capstone/thin` + `examples/lite-golden-bff` | Frontend owns token/form projection; BFF owns auth/session validation and dashboard/detail shaping. |
| F13 main bootstrap | `patterns/F13-main-bootstrap` | `main.tsx` is a tested composition-root adapter that returns the scope for assertions. |

## Backlog

| Slice | Status |
|---|---|
| Fattest frontend dashboard against the raw backend | Backlog: there is no `capstone/raw` or `capstone/fattest` implementation in this PR. |
| F02-F12 frontend catalog | Backlog: only F01 and F13 are implemented in the React pattern catalog. |

## Current Node Test Inventory

| Slice | Test file | Test count |
|---|---|---|
| fat frontend | capstone/fat/tests/app.test.ts | 3 |
| fat frontend | capstone/fat/tests/auth-provider.test.ts | 2 |
| fat frontend | capstone/fat/tests/auth.test.ts | 10 |
| fat frontend | capstone/fat/tests/bff-client.test.ts | 2 |
| thin frontend | capstone/thin/tests/bff-client.test.ts | 4 |
| thin frontend | capstone/thin/tests/dashboard.test.ts | 3 |
| thin frontend | capstone/thin/tests/signIn.test.ts | 8 |

The inventory above is intentionally file-derived by `tests/capstone-comparison.test.ts`. It is not a
package-wide test-total claim; it documents where frontend node logic currently lives.

## Boundary Rules

- Components observe the graph through `ScopeProvider`, `useAtom`, and `useScope`.
- `main.tsx` is a tested composition-root adapter: create one scope, render through `ScopeProvider`, return
  the scope for assertions, and dispose the root/scope together.
- Browser APIs enter through adapter atoms; only adapter-owned tests fake `fetch`.
- No `vi.mock`, `vi.spyOn`, `msw`, or fetch-mock is needed above the seam.
- Packages stay independent and redeclare their wire/view-model types at the transfer boundary.
