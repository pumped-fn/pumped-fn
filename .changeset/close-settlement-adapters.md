---
"@pumped-fn/lite-react": patch
"@pumped-fn/lite-hono": patch
---

Adapters honor close-settlement semantics: the hono middleware closes the
request context with `ok: false` when hono handled a route error
(`context.error`), so boundary resources settle in the failure direction
instead of committing on failed requests; lite-react's managed-context
teardown reports settlement failures instead of leaking an unhandled
rejection.
