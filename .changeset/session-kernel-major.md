---
"@pumped-fn/sdk": major
"@pumped-fn/sdk-claude": major
"@pumped-fn/sdk-codex": major
"@pumped-fn/sdk-pi": major
"@pumped-fn/sdk-just-bash": major
"@pumped-fn/sdk-test": major
"@pumped-fn/lite": major
"@pumped-fn/lite-lint": minor
"@pumped-fn/lite-extension-logging": major
"@pumped-fn/lite-extension-observable": major
"@pumped-fn/lite-extension-scheduler": major
"@pumped-fn/lite-extension-sync": major
"@pumped-fn/lite-react": major
---

Replace the Agent facade and material session with stable resource-backed role, tool, session, work, and attempt primitives. Lite entry execution now activates declared dependency trees, exposes structured cancellation through `ExecutionContext.signal`, and supports tagged controller readiness through `FlowInvocation`. `scope.run` and `scope.runStream` own one temporary execution boundary beside managed `ctx.exec` and `ctx.execStream` lifetimes. Named `scope.run({ name, params, fn })` operations provide a graph-visible one-off entry without a reusable flow handle or injected context parameter; add `deps` only for graph dependencies. Operations without `deps` receive `params` directly. Callback registration and inline execution accept inferred parameter tuples, keeping captured inputs explicit while preserving direct zero-parameter callback paths. Lite lint rejects hidden `ctx.exec` and inline `scope.run` captures and recognizes exported graph namespaces without requiring `Object.freeze`. Existing Model providers remain usable. Migrate `agent()`, `agent.turn`, `session()`, `send()`, and `Sandbox` imports using the package migration table. This release intentionally has no legacy execution loop.

Atom resolve contexts now expose a generation-bound `ctx.release()`. Cleanup may await release of its own generation without deadlock, while outside release, resolve, and dispose callers join the same exactly-once cleanup. A stale capability cannot release a replacement generation.

`SessionRuntime` now declares the full session contract used by public flows: `finishWith`, `park`, `previewWake`, `wake`, `merge`, and `settlement`. Effect edges are unchanged: `finishWith` receives the commit callback from `sdk.session.finish`, and `wake` validates the scheduler boundary inside the runtime. Branch replacement is private to merge. Tagged and loaded records receive recursive authority, lineage, reference, and identity validation before activation. Raw memory mutation is private; commit and accept results bind to their allowed source, authority, and normalized evidence. Invocations bind to active attempts with unique idempotency keys. Finish rejects while an invocation is working or quarantined, and invocation settlement remains terminal.

Packages using inferred callback parameters now require Lite 6. The pre-1.0 logging, observable, scheduler, and sync packages graduate to 1.0. Lite React moves to 3.0. Compatible adapters widen their peer ranges through Lite 6 without dropping supported older majors.

`@pumped-fn/sdk-codex` now requires an absolute `cwd` in its CLI config and uses that root for every `codex exec` process. Current SDK work authority bounds canonical, symlink-resolved Codex CLI and ACP roots, write access, and network access before execution. CLI extra arguments are a harmless allowlist. ACP cancellation timeout terminates and replaces its transport, while failed termination leaves a quarantined invocation that fences session finish. Claude process errors reject queued lease work before it starts.
