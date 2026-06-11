---
"@pumped-fn/lite-react": minor
---

SSR support: `'use client'` is preserved in the build output, managed `ExecutionContextProvider` creates its context synchronously during render so the subtree renders on the server (contexts from renders that suspend before commit are reclaimed automatically once in-flight resource work settles), Suspense resolution starts during server rendering for streaming renderers, and `useLayoutEffect` no longer warns on React 18 servers.

React Compiler compatibility: all source ships `'use no memo'` so source-compiling setups never auto-memoize hook internals that read live controller state during render; compiled consumer apps get stable inline selectors without handle churn.

Performance: suspense-mode `useAtom` skips re-rendering when a `set` carries a value identical to what the component last rendered (redundant updates against 100 subscribed components drop from ~0.9ms to ~4µs).

Pair with `@pumped-fn/lite` 3.0.1+ to get leak-free select handles under StrictMode.
