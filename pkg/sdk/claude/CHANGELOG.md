# @pumped-fn/sdk-claude

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

- 2e95323: Replace the provider factory and re-exported core harnesses with stable module-level Claude config, run, turn, model, attempt, and lease handles. Provider-neutral streaming attempts use isolated sequential process leases keyed to the active session, work, and authority.

  Validate session provenance and canonical roots before process creation. Abort and consumer cancellation release only the selected lease, child process failures poison queued work before it starts, and bounded shutdown fails closed when the process remains alive.

## 2.0.0

### Major Changes

- 444e524: Role tags and port flows. A tag can carry a flow; in deps position it projects
  to a context-bound `FlowHandle` (`tags.optional` yields handle-or-undefined,
  `tags.all` an array of handles), mirroring the bare-flow-dep rule. The sdk
  `Model` contract is now `Lite.Flow<ModelResponse, ModelRequest>`: implementors
  are graph nodes selected via the `model` tag, and the new `complete` port flow
  owns the `kind: "llm"` step span once for every consumer. `bound()` is removed
  from lite — value-level ctx currying is replaced by graph-native composition
  (it never shipped in a published release). `@pumped-fn/sdk-claude` /
  `@pumped-fn/sdk-codex` validate harness configuration eagerly at binding.
  `@pumped-fn/sdk-test` gains `modelStub` to lift a plain responder into an
  implementor flow. lite-lint gains `pumped/no-unattributed-await` (awaited
  foreign calls must sit inside a step-tagged flow or go through a port flow)
  and the `no-ctx-argument` remedy now points at port flows.

  Also fixes lost controller writes: `set`/`update` on a resolved atom now apply
  immediately even while an invalidation chain is active (previously they were
  deferred into a single pending slot — concurrent `update` callbacks were
  silently dropped and capture-inside-updater read stale state whenever a
  `watch: true` derived atom was subscribed). Updates queued during `resolving`
  now compose instead of overwriting.

### Patch Changes

- Updated dependencies [444e524]
  - @pumped-fn/sdk@2.0.0

## 1.2.0

### Minor Changes

- 80e17f0: The pumped meta-framework and typed faults.

  `@pumped-fn/pumped` (new): vite-based scope compiler — discovery dirs
  (server/, cli/, jobs/, agents/, workflows/) assemble one lite scope via a
  generated virtual manifest, driven per run mode (dev with module-runner HMR,
  build to per-target bundles, tests bypass the framework entirely). Includes
  `mapError` edge seam, jobRun/workflowRun tags, croner-backed jobs runner.

  `@pumped-fn/lite`: `Flow<Output, Input, Fault>` with `faults: typed<F>()`,
  `ctx.fail(fault)` throwing `FlowFault`, `isFault` guard and
  `Lite.Utils.FaultsOf`. Backward compatible — fault param defaults to never.

  Extensions: observable/logging error events carry the `FlowFault` payload
  (`fault` field) so planned failures are structurally distinguishable.

  `@pumped-fn/lite-lint`: graph-coverage rule family — no-implicit-tag-read,
  no-naked-globals, no-module-state, prefer-destructured-deps,
  no-untyped-throw, no-swallowed-error — plus per-rule severity config and
  --max-warnings.

  `@pumped-fn/sdk*`: renamed from `@pumped-fn/agent-sdk*` — the generic
  runtime-primitive toolkit counterpart to pumped; agents/models are one
  primitive family. API unchanged.

## 1.1.0

### Minor Changes

- fb8329c: Ship the agent workflow surface over lite primitives.

  Adds concise agent authoring helpers, workflow-backed turns, skills, tools, subagents, sessions, run inspection, Fetch request adapters, eval summaries, in-memory test runtime helpers, isolated Codex/Claude CLI model harnesses, lazy Codex/Claude provider packages, and a lazy just-bash sandbox provider package.
