---
"@pumped-fn/core-next": minor
---

Curate public API exports with comprehensive TSDoc and namespace organization

**Breaking Changes:**
- Removed internal-only Core types: `GeneratorOutput`, `NoDependencyGeneratorFn`, `DependentGeneratorFn`, `RecordLike`, `Kind`, `PendingState`, `ResolvedState`, `RejectedState`, `ResolveState`
- These types were never intended for consumer use and are not used in public API signatures

**New Exports:**
- Added `Tag` namespace with consumer-facing types: `Store`, `Tagged`, `Container`, `Source`, `TagExecutor`
- All public exports now include mandatory TSDoc documentation

**Improvements:**
- Integrated `verify-public-docs` script into typecheck workflow
- Organized type exports by function adjacency (only types used in public APIs are exported)
- Better IDE intellisense with comprehensive TSDoc comments
- Updated skill references with Tag namespace documentation
