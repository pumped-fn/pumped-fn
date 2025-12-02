---
"@pumped-fn/lite": minor
---

Add parse functions for Tag and Flow with full type inference

- Add `parse` property to Tag for runtime validation (sync-only)
- Add `parse` property to Flow for input validation (async-supported)
- Add `ParseError` class with structured error context (phase, label, cause)
- Add optional `name` property to Flow for better error messages
- Type inference: `TInput` automatically inferred from parser return type
