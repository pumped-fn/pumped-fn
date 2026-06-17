# React practical examples

Practical frontend examples for `@pumped-fn/lite` + `@pumped-fn/lite-react`. Same thesis as the
backend practical examples, applied to React: **components observe the atom graph; they never own
or construct state.** The seam is unchanged — given `createScope({ presets, tags, extensions })` and the
public API, all logic is testable. React is an adapter layer at the edge.

This package exists to keep the library docs honest. Public README/PATTERNS claims about seams,
provider-owned execution, transport/capability boundaries, and observer-only React are backed here by
source shape plus structural tests.

## The structural proof

Tests run in the **node** environment by default — no DOM, no React renderer. A test of feature logic
therefore *cannot* reach the browser; it must go through the graph. Only files named
`*.browser.test.tsx` render and observe components in Vitest browser mode.
`tests/environment-split.test.ts` enforces this: logic tests stay graph-only and observer tests use the browser project.

Each pattern splits into the **graph** (`after.ts` — atoms, flows, adapters: the logic) and the
**observer** (`view.tsx` — a thin component). Bootstrap patterns also include **main** (`main.tsx` —
the composition-root adapter that creates the scope once and renders through `ScopeProvider`). Logic is
node-tested to 100%; components and bootstrap adapters are browser-tested to 100%. Coverage is gated at
100/100/100/100 across all three — provable because the component holds no logic to leave uncovered.

No `vi.mock` / `msw` / `fetch-mock`: browser APIs enter through transport atoms or composition-root
adapters and tests `preset` the capability or transport at the matching layer — the frontend form of "no
module mocks". `fetch`, DOM globals, timers, storage, clock, and random are structurally guarded by owning
declaration, so a feature node or capability atom cannot hide inline ambient IO in the same file as a
transport. A transport's own unit test is the one sanctioned place to fake the global it wraps (below the
seam).

## Run

```
pnpm test       # vitest run --coverage (the gate)
pnpm typecheck
```

## Index

| # | Smell | Transformation | Lenses |
|---|---|---|---|
| F01 | State / derived soup in a component | atoms + derived atom; component observes | IO, OI |
| F13 | Untested `main.tsx` owning state/root setup | main as composition-root adapter; graph owns state | IO, OI |
| K | Complex Kanban workspace board | map-backed graph state + resources + scoped drafts; component observes | IO, OI |

(More patterns and capstone slices land incrementally.)

See [`@pumped-fn/lite` patterns](../../packages/lite/PATTERNS.md) and the backend practical examples for the shared doctrine.
