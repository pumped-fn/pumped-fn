---
"@pumped-fn/lite-lint": minor
---

Add `pumped/no-hidden-exec-params` so inline `ctx.exec` functions record used flow input in `params`. Real arguments stay visible to extensions; logging and observable runtime tags own omission and redaction.
