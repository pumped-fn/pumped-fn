---
"@pumped-fn/lite": patch
---

Fix `watch: true` default equality so structurally equal plain-object results do not trigger false cascades, while non-plain values like `Map` and symbol-keyed state still invalidate correctly.
