---
"@pumped-fn/lite": minor
"@pumped-fn/lite-extension-suspense": minor
"@pumped-fn/codemod": patch
"@pumped-fn/lite-devtools": patch
"@pumped-fn/lite-devtools-server": patch
"@pumped-fn/lite-extension-otel": patch
"@pumped-fn/lite-hmr": patch
"@pumped-fn/lite-react": patch
"@pumped-fn/agent-sdk": minor
"@pumped-fn/agent-sdk-test": patch
---

Add explicit primitive extension registration for lite flows, atoms, resources, and configs; add agent workflow helpers; and tighten context tag handling.

Preserve exec extension async error semantics, make the lite CLI bin install-safe before build, and suppress the lite-hmr CJS import.meta build warning.

Upgrade the repo build/test toolchain for the Vite 8 ecosystem, remove the stale docs site generation path, and refresh affected package build metadata.
