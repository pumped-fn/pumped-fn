---
"@pumped-fn/core-next": patch
---

Consolidate tag system tests and fix Tag.Container type safety

- Consolidate 7 overlapping tag test files into single organized tag.test.ts (283 tests)
- Use source-first organization with test.each patterns (Map, Array, Scope)
- Fix Tag.Container support by using isContainer type guard instead of type assertions
- Remove tests accessing internal scope methods (resolveTag, resolveTagExecutor)
- Properly handle optional Tag.Container.tags property
