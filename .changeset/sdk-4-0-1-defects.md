---
"@pumped-fn/sdk": patch
"@pumped-fn/sdk-claude": patch
"@pumped-fn/sdk-codex": patch
"@pumped-fn/sdk-pi": patch
"@pumped-fn/sdk-just-bash": patch
"@pumped-fn/sdk-test": patch
---

Fix defects found by adversarial review of 4.0.0.

A Claude prompt that was aborted or timed out could let its late result settle the *next* prompt, returning one turn's answer for another. The cancelled turn now retains the stream until its terminal result arrives and is discarded, while the caller rejects immediately. If the process never finishes an interrupted turn, the session fails with `ClaudeInterruptError` within `shutdownTimeoutMs` rather than blocking queued prompts. A malformed model reply no longer releases a record-bound lease, so one bad turn cannot end a live session.

`parseModelResponse` no longer guesses when model output contains more than one response-shaped JSON object; it throws `ModelResponseParseError` instead of selecting the first, which could adopt an illustrative example and dispatch its tool calls. A single response object embedded in prose still parses.

Truncated `sandbox.exec` events and results now carry `truncated: true`, so shortened output is never mistaken for complete output, and truncation cuts on a whole-character boundary instead of silently dropping a partial character. The sandbox deadline remains cooperative: the SDK aborts the run binding's signal and refuses to deliver a result past the deadline, but a binding that ignores its signal can keep the call pending.

`runCli` keeps the original `CliWorkerError` as the primary failure and reports a failing cleanup separately.

Codex records a provider invocation as failed when a turn fails to parse, instead of recording it completed while the work failed.
