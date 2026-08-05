# @pumped-fn/sdk-pi

## 4.0.0

### Major Changes

- 42779a8: Fix userland correctness defects and reduce public-surface ceremony across the SDK.

  MCP tools now advertise their real input schemas instead of type-erased `z.unknown()` shapes. Codex ACP permission grants match only the stable tool-call `kind`, never the agent-controlled `title`. A Claude prompt abort or timeout sends the in-band `control_request` interrupt and leaves the session usable, and the always-throwing `isolate` option is gone. `parseModelResponse` throws `ModelResponseParseError` on malformed model output instead of ending the turn as a silent success, and JSON extraction scans balanced objects. `runCli` always settles even when cleanup rejects; `CliResult.exitCode` is `0` and failures expose `CliFailureResult` through `CliWorkerError.result`. `sandbox.exec` enforces `timeoutMs` and `maxOutputBytes`, and the `run` binding owns network enforcement. Pi provider errors carry the configured provider and model.

  `@pumped-fn/sdk-test` adds `initialRecord`, `testAuthority`, `modelRequest`, `validationStub`, and `sessionKit`, which supplies the full session and agent tag bundle for executing agent turns against stubs.

  Breaking renames: `Runtime` merges into `WorkflowContext` with tag label `workflow.context`; only `SuspendSignal` is exported; `sandbox.ExecEvent` becomes `sandbox.CommandOutputEvent`; `judge()`, `formatStepKey()`, and Claude's single-value `permission` field are removed. Adapters share one `auth: { kind, env? }` shape, so Pi's `apiKeyEnv` is gone. Claude's `engine` becomes `spawnProcess`, Bash's `engine` becomes `interpreter`, Codex barrel aliases follow the CLI flavor, ACP `additionalDirectories` becomes `roots`, and Bash error classes gain the `Bash` prefix.

  `session.run` work input accepts an omitted `branchId`, which resolves from the session record's current branch at admission and is stored explicitly. `id`, `role`, and `policy` remain required.

## 3.0.1

### Patch Changes

- 344862e: Publish declarations with TypeScript 7.0.2 through tsdown's package-local `tsconfig.dts.json` files, keeping ESM and CommonJS type entrypoints aligned. Legacy Compiler API consumers use the `typescript-api` alias.

## 3.0.0

### Major Changes

- 2e95323: Add the in-process pi-ai provider with catalog validation, supported-model discovery, native tool mapping, and resolved tool schemas. Provider-neutral streaming attempts normalize text, reasoning, and lifecycle events; scalar turns drain the same stream. Consumer cancellation aborts the producer, and session provenance and authority are validated before execution.
