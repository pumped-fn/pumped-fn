---
"@pumped-fn/lite": patch
---

docs: add Flow Deps & Execution pattern and improve documentation

- Add "Flow Deps & Execution" section to PATTERNS.md covering:
  - Deps resolution (atoms from Scope vs tags from context hierarchy)
  - Service invocation via ctx.exec (observable by extensions)
  - Cleanup pattern with ctx.onClose (pessimistic cleanup)
- Remove redundant patterns (Command, Interceptor) covered by composite patterns
- Remove verbose Error Boundary diagram, replaced with bullet point
- Add Documentation section to README linking PATTERNS.md and API reference
