---
"@pumped-fn/pumped": patch
---

Fix three defects that only surface when the framework is consumed from outside this repository.

**`pumped dev` no longer answers discovered `GET` routes with 404.** The plugin registers its request handler as a Vite *post* middleware, so Vite's own html-fallback and 404 middlewares answered every `GET` before pumped saw it. `POST` routes were unaffected, which hid the split: the same app served `GET /list` correctly from `dist/server.mjs` and returned `404 Not Found` under `pumped dev`. Pumped now uses Vite's `"custom"` app type because it owns the request pipeline and has no HTML fallback. If an application explicitly sets another app type, Pumped warns with the ignored value before using `"custom"`.

**`analyze()` accepts an entry flow that declares `faults`.** `ManifestEntry.flow` was declared `Lite.Flow<any, any>`, which leaves the fault and yield type parameters at their `never` defaults, so passing a flow built with `faults: typed<F>()` — the pattern the README recommends — failed to typecheck. It is now `Lite.Flow<any, any, any, any>`. Generated manifests are emitted JavaScript and were never affected; this only bit hand-written `analyze()` calls and tests.

**Production servers and CLIs no longer require `vite` at runtime.** The generated entries imported the package index, which re-exports the Vite plugin and therefore pulled `vite` into the production module graph — removing `vite` from a deployment made `node dist/server.mjs` fail with `ERR_MODULE_NOT_FOUND`. A new `@pumped-fn/pumped/runtime` subpath exports only what a running application needs (`createServer`, `createAppScope`, `runCli`, `runJobs`, `runWorkflows`, `normalizeAgentEntry`, `normalizeApp`, and the route/command/workflow/job tags), and the generated server and CLI entries now import from it. The package index keeps every existing export, so nothing consumers import today changes.
