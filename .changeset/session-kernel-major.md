---
"@pumped-fn/sdk": major
---

Replace the Agent facade and material session with stable module-level role, tool, session, work, and attempt definitions. Move agent, session, validation, and sandbox contracts to canonical package subpaths while keeping the scalar Model seam.

Add the durable session kernel for authority, branches, work, attempts, invocations, events, steering, artifacts, memory, scheduling, and finish. Tagged and loaded records receive recursive authority, lineage, reference, and identity validation before activation. Raw memory mutation is private; commit and accept results bind to their source, authority, and normalized evidence. Working or quarantined invocations fence finish, and invocation settlement is terminal.

Remove the provider-specific worker and harness constructors from core. Provider packages now own their module-level handles and config tags. `formatModelPrompt` and `parseModelResponse` remain as provider building blocks.
