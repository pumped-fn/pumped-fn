---
"@pumped-fn/devtools": patch
---

fix: correct package exports for TypeScript type resolution

- Add `types` conditions to exports map for ESM and CJS
- Correct file extensions from `.js`/`.d.ts` to `.mjs`/`.d.mts` and `.cjs`/`.d.cts`
