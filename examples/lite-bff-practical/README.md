# BFF practical examples

A Backend-For-Frontend tier for the backend Service Health Monitor practical examples. It talks to the
backend capstone and reshapes data into frontend-friendly view-models, so React does interaction, not
calculation.

This package is one implemented slice in the React capstone spectrum. It owns data shaping for the fat
frontend and owns auth/session validation for the thin frontend.

## The seam

The BFF separates transport atoms from higher-level capability atoms:

- `capstoneHttp` wraps backend service-health fetches. `capstoneClient` depends on that transport atom and
  exposes domain methods; `dashboardView` and `serviceDetailView` depend on `capstoneClient`.
- `authHttp` wraps authentication fetches. `authProvider` depends on that transport atom and exposes
  `authenticate`/`validate`; `login` and `validateSession` depend on `authProvider`.

Logic tests drive both seams through `createScope` and `preset(...)`: `preset(capstoneClient, fake)` for
view-model shaping and `preset(authProvider, fake)` for login/session rules. Adapter-composition tests
preset `capstoneHttp` or `authHttp`. The only tests that fake `fetch` are the transport-atom tests below
the seam, and a structural guard fails if `fetch` appears in capability atoms.

`src/http.ts` is an HTTP boundary flow for the BFF package, not an in-process import path for frontend
code. `handleBffRequest` accepts HTTP-shaped requests as flow input, maps `POST /login` to the `login`
flow and returns token JSON, validates `GET /dashboard` Bearer auth through `validateSession`, and returns
`dashboardView` JSON. Unsupported methods return 405; unknown paths return 404. Auth denials become 401,
while provider or backend failures still propagate. Its tests execute the public flow through
`createScope` with preset ports, so the boundary is verified without a server or browser.

`src/main.ts` is the lite composition root for the BFF. It creates one scope and one process execution
context for the mounted BFF, executes requests through the `handleBffRequest` flow, returns the scope for
assertions, and closes the process context before disposing the scope. It is intentionally not a server
wrapper; HTTP transport can sit outside this adapter. Source guards reject route functions that accept
`scope` and helper wrappers that manually recreate request lifecycle outside this composition root.

Because all logic lives in flows behind the seam, the package is node-tested at 100/100/100/100.

## Shape

- `src/wire.ts` — wire types mirroring the backend Data Model; the BFF re-declares them so packages stay
  independent.
- `src/client.ts` — `CapstoneHttp` transport, `CapstoneClient` capability, and `capstoneBaseUrl` tag.
- `src/auth.ts` — `AuthHttp` transport, `AuthProvider` capability, `login`, and `validateSession`.
- `src/dashboard.ts` — `dashboardView`: counts services by status, counts active incidents, and produces
  a criticality-sorted attention list.
- `src/detail.ts` — `serviceDetailView`: formats uptime, maps recent checks, counts open incidents.
- `src/http.ts` — HTTP-shaped request flow over BFF flows.
- `src/main.ts` — lite composition root that mounts one scope/context, executes requests, and owns disposal.

## Run

```bash
pnpm test
pnpm typecheck
```
