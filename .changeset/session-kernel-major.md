---
"@pumped-fn/sdk": major
"@pumped-fn/sdk-claude": major
"@pumped-fn/sdk-codex": major
"@pumped-fn/sdk-pi": major
"@pumped-fn/sdk-just-bash": major
"@pumped-fn/sdk-test": major
---

Replace the Agent facade and material session with resource-backed role, tool, session, work, and attempt primitives. Existing Model providers remain usable. Migrate `agent()`, `agent.turn`, `session()`, `send()`, and `Sandbox` imports using the package migration table. This release intentionally has no legacy execution loop.
