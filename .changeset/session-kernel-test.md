---
"@pumped-fn/sdk-test": major
---

Keep the existing workflow test exports and add module-level scalar-model, streaming-attempt, and session-store stubs for the resource-backed session kernel. Tests now own their `createScope` composition and current-owned session context explicitly; helpers do not create or cache a scope.
