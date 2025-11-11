---
"@pumped-fn/core-next": patch
---

Internal refactoring: consolidate duplicate patterns

- Extract `wrapWithExtensions` to internal/extension-utils.ts (eliminates duplication between flow.ts and scope.ts)
- Consolidate dependency resolution via internal `resolveShape` utility
- Simplify FlowDefinition.handler overload implementation
- Increase packages/next/src by +0.72% (+33 LOC) due to new internal utilities and comprehensive test coverage

No public API changes. All tests pass. Performance neutral or improved.
