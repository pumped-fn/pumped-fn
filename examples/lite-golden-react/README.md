# @pumped-fn/lite-golden-react

Golden frontend examples for `@pumped-fn/lite` + `@pumped-fn/lite-react`. Same thesis as
[`lite-golden`](../lite-golden), applied to React: **components observe the atom graph; they never own
or construct state.** The seam is unchanged — given `createScope({ presets, tags, extensions })` and the
public API, all logic is testable. React is an adapter layer at the edge.

## The structural proof

Tests run in the **node** environment by default — no DOM, no React renderer. A test of feature logic
therefore *cannot* reach the browser; it must go through the graph. Only files named `*.dom.test.tsx`
opt into jsdom (via a `// @vitest-environment jsdom` docblock) to render and observe components.
`tests/environment-split.test.ts` enforces this: a logic test cannot smuggle the jsdom directive to
touch the DOM.

Each pattern splits into the **graph** (`after.ts` — atoms, flows, adapters: the logic) and the
**observer** (`view.tsx` — a thin component). Bootstrap patterns also include **main** (`main.tsx` —
the composition-root adapter that creates the scope once and renders through `ScopeProvider`). Logic is
node-tested to 100%; components and bootstrap adapters are jsdom-tested to 100%. Coverage is gated at
100/100/100/100 across all three — provable because the component holds no logic to leave uncovered.

No `vi.mock` / `msw` / `fetch-mock`: browser APIs enter through adapter atoms or composition-root
adapters and tests `preset` them — the frontend form of "no module mocks". `fetch`, DOM globals, timers,
storage, clock, and random are structurally guarded by owning declaration, so a feature node cannot hide
inline ambient IO in the same file as an adapter. An adapter's own unit test is the one sanctioned place
to fake the global it wraps (below the seam).

## Run

```
pnpm -F @pumped-fn/lite-golden-react test       # vitest run --coverage (the gate)
pnpm -F @pumped-fn/lite-golden-react typecheck
```

## Index

| # | Smell | Transformation | Lenses |
|---|---|---|---|
| F01 | State / derived soup in a component | atoms + derived atom; component observes | IO, OI |
| F13 | Untested `main.tsx` owning state/root setup | main as composition-root adapter; graph owns state | IO, OI |

(More patterns and the Service Health Dashboard capstone land incrementally.)

See [`lite-golden/PATTERNS` pointer](../../packages/lite/PATTERNS.md) and the backend
[`lite-golden`](../lite-golden) for the shared doctrine.
