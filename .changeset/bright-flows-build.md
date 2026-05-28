---
"@pumped-fn/lite": major
"@pumped-fn/lite-extension-suspense": major
"@pumped-fn/codemod": patch
"@pumped-fn/lite-devtools": major
"@pumped-fn/lite-extension-otel": major
"@pumped-fn/lite-hmr": patch
"@pumped-fn/lite-react": major
"@pumped-fn/agent-sdk": major
"@pumped-fn/agent-sdk-test": major
---

Add tag-first agent workflow helpers and tighten context tag handling across lite primitives.

Move serializability policy out of lite core, remove the experimental primitive `use` surface, make `workflowRun()` a composable workflow tag, expose workflow and agent runtime contracts as required tags, and split workflow replay/logging from agent remote routing.

Preserve exec extension async error semantics, make the lite CLI bin install-safe before build, and suppress the lite-hmr CJS import.meta build warning.

Upgrade the repo build/test toolchain for the Vite 8 ecosystem, remove the stale docs site generation path, and refresh affected package build metadata.

Remove the unmaintained `@pumped-fn/lite-devtools-server` package.

Breaking extension note: `wrapExec` now wraps dependency resolution as well as factories so extensions can install tags before deps resolve. `ResolveEvent` now carries atom resolve context and resource context shapes explicitly.
