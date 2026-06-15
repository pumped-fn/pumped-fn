# @pumped-fn/lite-golden-bff

A Backend-For-Frontend tier for the [`lite-golden`](../lite-golden) Service Health Monitor. It talks to
the backend capstone and reshapes its data into frontend-friendly view-models, so the frontend does
**interaction, not calculation**.

This is one anchor on the logic-boundary spectrum (see the
[plan §13](../../tasks/golden-examples-plan.md) if present, or the comparison below): the BFF always owns
data shaping; the React frontends consume these view-models and observe them.

## The seam

The BFF reaches the backend through a single adapter — the `capstoneClient` port, an atom that wraps
`fetch`. View-model flows (`dashboardView`, `serviceDetailView`) declare it as a dependency and never
touch the network themselves. Tests `preset(capstoneClient, fake)` to drive the shaping logic through the
scope seam — no `msw`, no `fetch-mock`. The one place `fetch` is faked is the adapter's **own** unit test
(`tests/client.test.ts`), which is below the seam: it verifies the adapter builds the right paths and
surfaces non-ok responses. Everything above it is tested against the port.

Because all logic lives in flows behind the seam, the package is node-tested (no browser) at 100/100/100/100.

## Shape

- `src/wire.ts` — wire types mirroring the backend Data Model (the BFF re-declares them; packages stay
  independent).
- `src/client.ts` — `CapstoneClient` port + the `capstoneClient` fetch adapter + `capstoneBaseUrl` tag.
- `src/dashboard.ts` — `dashboardView`: counts services by status, counts active incidents, and produces
  a criticality-sorted attention list. The calculation the frontend is spared.
- `src/detail.ts` — `serviceDetailView`: formats uptime, maps recent checks, counts open incidents.

## Run

```
pnpm -F @pumped-fn/lite-golden-bff test       # vitest run --coverage (the gate)
pnpm -F @pumped-fn/lite-golden-bff typecheck
```
