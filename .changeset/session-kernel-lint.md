---
"@pumped-fn/lite-lint": minor
---

Add `pumped/no-hidden-exec-dependencies` and extend execution analysis to named inline `scope.run` and `ctx.exec` operations. Hidden captures are rejected; graph dependencies belong in `deps`, and execution inputs belong in `params`.
