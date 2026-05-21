# Lite Docs Codegen Usage Autoresearch

Session: `lite-docs-codegen-usage`

Goal: improve `packages/lite` and `packages/lite-react` docs so code generators apply execution-scoped resource and scoped-value patterns correctly from docs alone.

Harness:
- prompts are generated from `packages/lite/README.md`, `packages/lite/PATTERNS.md`, `packages/lite-react/README.md`, `packages/lite-react/PATTERNS.md`, and `docs/index.md`
- runner sessions are managed through tmux
- generated code is scored by output text only; no generated code is run or compiled
- Claude and Codex are both configured as runners, but local Claude CLI currently fails with `Not logged in`

Strict Codex baseline after rubric hardening:
- run 3: `total_score=40.4`, `anti_pattern_hits=5`

Docs iteration 1:
- documented `ctx.resolve(resource)`, `ctx.release(resource)`, `ResourceContext.cleanup`, and resource controller watch semantics in lite docs
- documented `ExecutionContextProvider ctx`, `useResource(..., { suspense: false })` load union, `scopedValue` `initial/actions` shape, and no-`useState` scoped form usage in lite-react docs
- run 4: `total_score=71.2`, `anti_pattern_hits=1`

Docs iteration 2:
- strengthened the `ExecutionContextProvider` docs to forbid `createScope()` and `scope.createContext()` inside component bodies
- run 5: `total_score=74.4`, `anti_pattern_hits=0`

Remaining gap:
- scoped login output can omit an explicit `ExecutionContextProvider` wrapper when the prompt asks for a full React form module
