---
"@pumped-fn/core-next": patch
"@pumped-fn/devtools": patch
---

Simplify Extension.Operation types and remove generic from wrap method

- Consolidated 5 operation kinds (execute, journal, subflow, parallel, resolve) into 2 kinds (execution, resolve)
- Removed generic type parameter from Extension.wrap method for simpler type signatures
- Updated all wrapWithExtensions implementations to use type assertions
- Migrated all tests to new operation type structure
- Updated documentation for simplified 2-kind operation model
- Benefits: Simpler mental model, easier AI explanation, more flexible tag-based nesting context
