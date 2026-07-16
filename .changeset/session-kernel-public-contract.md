---
"@pumped-fn/codemod": patch
"@pumped-fn/lite-extension-logging": patch
"@pumped-fn/lite-extension-observable": patch
"@pumped-fn/lite-extension-scheduler": patch
"@pumped-fn/lite-extension-suspense": patch
"@pumped-fn/lite-extension-sync": patch
"@pumped-fn/lite-react": patch
"@pumped-fn/lite-react-json-render": patch
"@pumped-fn/lite-render-core": patch
"@pumped-fn/pumped": patch
"@pumped-fn/sdk-mcp": patch
---

Document exported interfaces and align callback registrations with Lite's explicit trailing-parameter contract. The changed extension and React call sites preserve runtime behavior while keeping captured cleanup inputs visible.
