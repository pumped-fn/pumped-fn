---
"@pumped-fn/sdk": major
"@pumped-fn/sdk-claude": major
"@pumped-fn/sdk-codex": major
"@pumped-fn/sdk-pi": major
"@pumped-fn/sdk-just-bash": major
"@pumped-fn/sdk-test": major
"@pumped-fn/sdk-mcp": minor
---

Fix userland correctness defects and reduce public-surface ceremony across the SDK.

MCP tools now advertise their real input schemas instead of type-erased `z.unknown()` shapes. Codex ACP permission grants match only the stable tool-call `kind`, never the agent-controlled `title`. A Claude prompt abort or timeout sends the in-band `control_request` interrupt and leaves the session usable, and the always-throwing `isolate` option is gone. `parseModelResponse` throws `ModelResponseParseError` on malformed model output instead of ending the turn as a silent success, and JSON extraction scans balanced objects. `runCli` always settles even when cleanup rejects; `CliResult.exitCode` is `0` and failures expose `CliFailureResult` through `CliWorkerError.result`. `sandbox.exec` enforces `timeoutMs` and `maxOutputBytes`, and the `run` binding owns network enforcement. Pi provider errors carry the configured provider and model.

`@pumped-fn/sdk-test` adds `initialRecord`, `testAuthority`, `modelRequest`, `validationStub`, and `sessionKit`, which supplies the full session and agent tag bundle for executing agent turns against stubs.

Breaking renames: `Runtime` merges into `WorkflowContext` with tag label `workflow.context`; only `SuspendSignal` is exported; `sandbox.ExecEvent` becomes `sandbox.CommandOutputEvent`; `judge()`, `formatStepKey()`, and Claude's single-value `permission` field are removed. Adapters share one `auth: { kind, env? }` shape, so Pi's `apiKeyEnv` is gone. Claude's `engine` becomes `spawnProcess`, Bash's `engine` becomes `interpreter`, Codex barrel aliases follow the CLI flavor, ACP `additionalDirectories` becomes `roots`, and Bash error classes gain the `Bash` prefix.

`session.run` work input accepts an omitted `branchId`, which resolves from the session record's current branch at admission and is stored explicitly. `id`, `role`, and `policy` remain required.
