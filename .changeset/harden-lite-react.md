---
"@pumped-fn/lite": patch
"@pumped-fn/lite-react": minor
---

**@pumped-fn/lite-react** — Harden for modern React (RSC, Compiler, useSelect non-suspense)

- Add `'use client'` directive for RSC/Next.js App Router compatibility
- `useController({ resolve: true })` retries once on failed atoms before throwing to ErrorBoundary
- `useSelect` gains `{ suspense: false }` mode returning `UseSelectState<S>` with data/loading/error
- Selector errors in non-suspense `useSelect` now surface in the `error` field
- React Compiler-safe: selector/eq via plain closures, useRef caches in getSnapshot only
- `UseSelectOptions<S>` split into discriminated union for sound overload resolution
- New exports: `UseSelectSuspenseOptions`, `UseSelectManualOptions`, `UseSelectOptions`, `UseSelectState`

**@pumped-fn/lite** — `release()` now notifies listeners before cache deletion (fixes hanging promises)
