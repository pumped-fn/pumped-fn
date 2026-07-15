# @pumped-fn/sdk-just-bash

## 3.0.0

### Major Changes

- Replace the sandbox method bag with session-mediated read, write, and streaming exec port implementors. Add explicit authority, readiness, workspace, and engine resources with cancellation, timeout, output-cap, and session-isolation checks.

## 2.0.0

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
