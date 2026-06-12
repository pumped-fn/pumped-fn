# 10 - Request Scoped Globals
## Smell
Request-local values live in a mutable module variable or hidden `AsyncLocalStorage` lookup instead of an explicit dependency owned by the request execution.
## Harm
Concurrent requests can corrupt each other when mutable state is used, and ambient storage makes dependencies invisible in function signatures. Callers outside the expected async scope fail at runtime.
## Provenance
| repo | file path | license | description |
|---|---|---|---|
| honojs/hono | [`src/middleware/context-storage/index.ts`](https://github.com/honojs/hono/blob/e50df01453e71b071c3e6136b161b160b9fdf916/src/middleware/context-storage/index.ts) | MIT | Middleware stores the active Hono context in `AsyncLocalStorage` so helpers can read it later. |
| vercel/next.js | [`packages/next/src/server/app-render/work-unit-async-storage.external.ts`](https://github.com/vercel/next.js/blob/a9e076d5af0c415d21ba725ff81ddbbdb6c0f524/packages/next/src/server/app-render/work-unit-async-storage.external.ts) | MIT | App-render internals expose request, cache, and prerender work-unit state through shared async storage. |
| open-telemetry/opentelemetry-js | [`packages/opentelemetry-context-async-hooks/src/AsyncLocalStorageContextManager.ts`](https://github.com/open-telemetry/opentelemetry-js/blob/71d195c508320295f1892aaed1ee2f1971ffb470/packages/opentelemetry-context-async-hooks/src/AsyncLocalStorageContextManager.ts) | Apache-2.0 | Trace context is stored as ambient async state, so missed binding loses parentage. |
## Transformation
`after.ts` models request-local state as a `resource` with `tags.required(requestUser)`. The resource is cached on the owning execution context, nested flows seek upward to reuse it, sibling root contexts get separate instances, and cleanup is registered with `ctx.cleanup`.
## Lens coverage
inside-out: present. outside-in: present. effect-managed: present.
## Why 100% is natural
The tests cover the preset path, two interleaved nested exec chains reading the session across multiple async gaps, parent seek-up, sibling isolation, context close cleanup, owner-local release, and both present and absent event-tag branches. No global request state branch remains in `after.ts`.
