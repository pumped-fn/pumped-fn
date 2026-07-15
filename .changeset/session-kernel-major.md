---
"@pumped-fn/sdk": major
"@pumped-fn/sdk-claude": major
"@pumped-fn/sdk-codex": major
"@pumped-fn/sdk-pi": major
"@pumped-fn/sdk-just-bash": major
"@pumped-fn/sdk-test": major
"@pumped-fn/lite": major
"@pumped-fn/lite-lint": minor
---

Replace the Agent facade and material session with stable resource-backed role, tool, session, work, and attempt primitives. Lite entry execution now activates declared dependency trees, exposes structured cancellation through `ExecutionContext.signal`, and supports tagged controller readiness through `FlowInvocation`. `scope.run` and `scope.runStream` own one temporary execution boundary beside managed `ctx.exec` and `ctx.execStream` lifetimes. Callback registration and `ctx.exec` function calls accept inferred parameter tuples, keeping captured inputs explicit while preserving direct zero-parameter callback paths. Lite lint rejects hidden `ctx.exec` captures and recognizes exported graph namespaces without requiring `Object.freeze`. Existing Model providers remain usable. Migrate `agent()`, `agent.turn`, `session()`, `send()`, and `Sandbox` imports using the package migration table. This release intentionally has no legacy execution loop.
