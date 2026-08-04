---
"@pumped-fn/lite": minor
"@pumped-fn/lite-react": minor
---

Replace the Lite runtime with a smaller synchronous-first implementation: synchronous cold resolution, direct watch edges, and lazy scope allocations, with the public API unchanged. Emitted ESM+CJS is about 46% smaller raw and 29% smaller gzipped, and common scope and cell retained memory drops. Cold synchronous dependency failures run their factory and cleanup exactly once, and frozen or sealed atom handles are supported. `VERSION` is injected from `package.json` at build time and falls back to `"0.0.0-source"` when running from source. In Lite React, `useAtom` subscribes in a commit-time layout effect and rechecks state and value after subscribing, closing the render-to-subscribe race; failed atoms throw their stored error explicitly.
