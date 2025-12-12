---
"@pumped-fn/lite-react": minor
---

feat(lite-react): add non-Suspense mode and resolve options for useAtom/useController

- Add `{ suspense: false }` option to `useAtom` returning `UseAtomState<T>` with `data`, `loading`, `error`, `controller`
- Add `{ resolve: boolean }` option to control auto-resolution behavior
  - Suspense mode: `resolve` defaults to `true` (auto-resolves idle atoms)
  - Non-Suspense mode: `resolve` defaults to `false` (no auto-resolve)
- Add `{ resolve: true }` option to `useController` for Suspense integration
- Export new types: `UseAtomSuspenseOptions`, `UseAtomManualOptions`, `UseAtomOptions`, `UseAtomState`, `UseControllerOptions`
