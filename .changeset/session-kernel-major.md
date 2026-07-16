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

Replace the Agent facade and material session with stable resource-backed role, tool, session, work, and attempt primitives. Lite entry execution now activates declared dependency trees, exposes structured cancellation through `ExecutionContext.signal`, and supports tagged controller readiness through `FlowInvocation`. `scope.run` and `scope.runStream` own one temporary execution boundary beside managed `ctx.exec` and `ctx.execStream` lifetimes. Named `scope.run({ name, deps, params, fn })` operations provide a graph-visible one-off entry without a reusable flow handle or injected context parameter. Callback registration and `ctx.exec` function calls accept inferred parameter tuples, keeping captured inputs explicit while preserving direct zero-parameter callback paths. Lite lint rejects hidden `ctx.exec` and inline `scope.run` captures and recognizes exported graph namespaces without requiring `Object.freeze`. Existing Model providers remain usable. Migrate `agent()`, `agent.turn`, `session()`, `send()`, and `Sandbox` imports using the package migration table. This release intentionally has no legacy execution loop.

`SessionRuntime` now declares the full session contract used by public flows: `finishWith`, `park`, `previewWake`, `wake`, `merge`, and `settlement`. Effect edges are unchanged: `finishWith` receives the commit callback from `sdk.session.finish`, and `wake` validates the scheduler boundary inside the runtime. `invocations.settle` is terminal and throws on an already-settled invocation instead of overwriting its status.
