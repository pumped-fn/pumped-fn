---
"@pumped-fn/core-next": patch
"@pumped-fn/devtools": patch
"@pumped-fn/react": patch
---

Fix type mappings for tsdown beta.50 and revert namespace aliases

- Update package.json exports to use .d.mts/.d.cts extensions instead of .d.ts
- Revert from `export * as` pattern to const declarations for smaller bundle size
- Add main/module/types fields to React package for consistency
- Update skill references to use correct import paths
