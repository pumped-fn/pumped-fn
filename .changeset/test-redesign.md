---
"@pumped-fn/core-next": patch
---

Redesign test suite for better maintainability and coverage

- Consolidate 10+ fragmented test files into unified `index.test.ts`
- 160 tests covering all public API exports
- 83% code coverage (statements, functions, lines)
- Tests now mirror public API structure (Scope, Flow, Tag, Extension, etc.)
- Add realistic AOP scenario demonstrating tags + extensions patterns
