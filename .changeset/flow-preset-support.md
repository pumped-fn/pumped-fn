---
"@pumped-fn/lite": patch
---

Extend preset() to support Flow in addition to Atom

- `preset(flow, fn)` - replacement function bypasses deps resolution (mock scenario)
- `preset(flow, otherFlow)` - delegates parse/deps/factory entirely to replacement
- Self-preset throws at creation time
- Extensions wrap both preset variants
