# Lite Docs Codegen Usage Autoresearch

Session: `lite-docs-codegen-usage`

Goal: improve `pkg/core/lite` and `pkg/react/lite-react` docs so code generators apply execution-scoped resource and scoped-value patterns correctly from docs alone.

Harness:
- prompts are generated from `pkg/core/lite/README.md`, `pkg/core/lite/PATTERNS.md`, `pkg/react/lite-react/README.md`, `pkg/react/lite-react/PATTERNS.md`, and `docs/index.md`
- runner sessions are managed through tmux
- generated code is scored by output text only; no generated code is run or compiled
- Claude and Codex are both configured as runners
- Claude Code must not be invoked with `--bare` for this harness because bare mode ignores OAuth/keychain auth and reports `Not logged in`

Strict Codex baseline after rubric hardening:
- run 3: `total_score=40.4`, `anti_pattern_hits=5`

Docs iteration 1:
- documented `ctx.resolve(resource)`, `ctx.release(resource)`, `ResourceContext.cleanup`, and resource controller watch semantics in lite docs
- documented `ExecutionContextProvider ctx`, `useResource(..., { suspense: false })` load union, `scopedValue` `initial/actions` shape, and no-`useState` scoped form usage in lite-react docs
- run 4: `total_score=71.2`, `anti_pattern_hits=1`

Docs iteration 2:
- strengthened the `ExecutionContextProvider` docs to forbid `createScope()` and `scope.createContext()` inside component bodies
- run 5: `total_score=74.4`, `anti_pattern_hits=0`

Harness fixes:
- run 7: removing Claude `--bare` enabled both runners, `total_score=74.4`, `runner_failures=0`
- run 9: generic resource calls such as `resource<AuthClient>({ ... })` are valid and should count as resource usage, `total_score=76.0`, `anti_pattern_hits=0`

Docs iteration 3:
- complete scoped-form modules should include the React boundary: `ScopeProvider` plus `ExecutionContextProvider`
- run 8: `total_score=74.8`, `anti_pattern_hits=0`; run 9 scored the same docs as `76.0` after fixing the generic-resource scorer

Docs iteration 4:
- outside React, resolved scoped-value access uses `getSnapshot()` or `get()`; only `useScopedValue` adds the React-only `snapshot` property
- run 10 exposed this as `anti_pattern_hits=2`
- run 12 after docs and scorer tightening: `total_score=76.0`, `claude_score=76.0`, `codex_score=76.0`, `anti_pattern_hits=0`

Current gap:
- the scored checks are saturated; further improvement should add higher-signal rubric checks for compile-shape errors or production lifecycle issues before changing docs
