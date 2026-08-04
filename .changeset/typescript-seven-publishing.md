---
"@pumped-fn/lite-hmr": patch
"@pumped-fn/lite-extension-logging": patch
"@pumped-fn/lite-extension-logging-pino": patch
"@pumped-fn/lite-extension-observable": patch
"@pumped-fn/lite-extension-observable-otel": patch
"@pumped-fn/lite-extension-scheduler": patch
"@pumped-fn/lite-extension-scheduler-nats": patch
"@pumped-fn/lite-extension-suspense": patch
"@pumped-fn/lite-extension-sync": patch
"@pumped-fn/lite-extension-sync-nats": patch
"@pumped-fn/lite-hono": patch
"@pumped-fn/pumped": patch
"@pumped-fn/lite-react-json-render": patch
"@pumped-fn/lite-render-core": patch
"@pumped-fn/lite-render-react": patch
"@pumped-fn/sdk-just-bash": patch
"@pumped-fn/sdk-claude": patch
"@pumped-fn/sdk-codex": patch
"@pumped-fn/sdk": patch
"@pumped-fn/sdk-mcp": patch
"@pumped-fn/sdk-pi": patch
"@pumped-fn/sdk-test": patch
"@pumped-fn/codemod": patch
"@pumped-fn/lite-lint": patch
---

Publish declarations with TypeScript 7.0.2 through tsdown's package-local `tsconfig.dts.json` files, keeping ESM and CommonJS type entrypoints aligned. Legacy Compiler API consumers use the `typescript-api` alias.
