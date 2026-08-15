---
"@pumped-fn/lite-extension-logging": patch
"@pumped-fn/lite-extension-observable": patch
---

Register per-context runtime sinks for flush and close at context creation through the lite `initContext` hook. A context carrying a runtime tag now settles its sinks on close even when no traced execution or logger resource ran inside it. On lite versions without context lifecycle hooks the previous execution-time registration still applies unchanged.
