---
"@pumped-fn/lite-tanstack-start": major
---

Breaking change: `@pumped-fn/lite-tanstack-start` is now ESM-only, matching the ESM-only TanStack Start runtime. The CommonJS build, `require` export condition, `main` field, and `.d.cts` types were removed. Use ESM imports, or dynamic `import()` from CommonJS code.
