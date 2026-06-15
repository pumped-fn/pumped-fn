# @pumped-fn/lite-golden-bff

A Backend-For-Frontend tier for the [`lite-golden`](../lite-golden) Service Health Monitor. It talks to
the backend capstone and reshapes data into frontend-friendly view-models, so React does interaction,
not calculation.

This package is one implemented slice in the React capstone spectrum. It owns data shaping for the fat
frontend and owns auth/session validation for the thin frontend.

## The seam

The BFF has two adapter seams:

- `capstoneClient` wraps backend service-health fetches. `dashboardView` and `serviceDetailView` depend
  on this port and never touch the network directly.
- `authProvider` wraps authentication fetches. `login` calls `authenticate`; `validateSession` calls
  `validate` before auth-gated dashboard work.

Logic tests drive both seams through `createScope` and `preset(...)`: `preset(capstoneClient, fake)` for
view-model shaping and `preset(authProvider, fake)` for login/session rules. The only tests that fake
`fetch` are the adapter-own tests below the seam.

`src/http.ts` is an HTTP boundary for the BFF package, not an in-process import path for frontend code. It
accepts HTTP-shaped requests, maps `POST /login` to the `login` flow and returns token JSON, validates
`GET /dashboard` Bearer auth through `validateSession`, and returns `dashboardView` JSON. Unsupported
methods return 405; unknown paths return 404. Auth denials become 401, while provider or backend failures
still propagate. Its tests still use `createScope` with preset ports, so the boundary is verified without a
server or browser.

Because all logic lives in flows behind the seam, the package is node-tested at 100/100/100/100.

## Shape

- `src/wire.ts` — wire types mirroring the backend Data Model; the BFF re-declares them so packages stay
  independent.
- `src/client.ts` — `CapstoneClient` port, `capstoneClient` fetch adapter, and `capstoneBaseUrl` tag.
- `src/auth.ts` — `AuthProvider` port, `authProvider` fetch adapter, `login`, and `validateSession`.
- `src/dashboard.ts` — `dashboardView`: counts services by status, counts active incidents, and produces
  a criticality-sorted attention list.
- `src/detail.ts` — `serviceDetailView`: formats uptime, maps recent checks, counts open incidents.
- `src/http.ts` — HTTP-shaped request boundary over BFF flows.

## Run

```bash
pnpm -F @pumped-fn/lite-golden-bff test
pnpm -F @pumped-fn/lite-golden-bff typecheck
```
