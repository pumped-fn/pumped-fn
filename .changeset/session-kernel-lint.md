---
"@pumped-fn/lite-lint": minor
---

Add `pumped/no-hidden-exec-dependencies` and extend execution analysis to named inline `scope.run` and `ctx.exec` operations. Hidden captures are rejected; graph dependencies belong in `deps`, execution inputs belong in `params`, and exported graph-handle namespaces remain valid without `Object.freeze`.
