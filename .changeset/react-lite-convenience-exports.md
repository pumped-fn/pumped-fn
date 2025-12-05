---
"@pumped-fn/react-lite": minor
---

### Features
- Re-export `createScope`, `atom`, `flow`, `preset` from `@pumped-fn/lite` for convenience
- Update React peer dependency to support both React 18 and React 19 (`^18.0.0 || ^19.0.0`)

### Bug Fixes
- **Critical**: Fix Suspense infinite loop by caching pending promises (React expects same promise during re-renders)
- Auto-resolve idle atoms lazily instead of throwing error (more ergonomic)
- Subscribe only to `resolved` events instead of `*` to avoid unnecessary re-renders
