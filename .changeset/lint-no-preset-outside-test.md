---
"@pumped-fn/lite-lint": minor
---

New rule `pumped/no-preset-outside-test` (error by default): flags `preset(...)` calls in
files outside test paths (`tests/`, `*.test.*`, `*.spec.*`), including namespaced
`lite.preset(...)` calls. Preset is the test seam; production composition supplies
implementations through tags. Markdown snippets are untouched — the rule runs only on
source files.
