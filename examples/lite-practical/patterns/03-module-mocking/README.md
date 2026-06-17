# 03 - Module Mocking
## Smell
Tests replace imported modules by path string at runner setup time, so the test module graph differs from production wiring.
## Harm
Path-keyed doubles leak between tests, break on file moves, and bypass the type-safe construction point where the dependency is actually needed.
## Provenance
| Repo | File | License | Adaptation |
|---|---|---|---|
| backstage/backstage | `plugins/catalog-import/src/api/CatalogImportClient.test.ts` - https://github.com/backstage/backstage/blob/fc4e624cfd7dbaa92a9adcd47516b994295aed0a/plugins/catalog-import/src/api/CatalogImportClient.test.ts#L40-L50 | Apache-2.0 | Catalog import tests hoist external and relative API replacements; `before.ts` paraphrases that as a path-keyed transport registry. |
| n8n-io/n8n | `packages/nodes-base/nodes/Microsoft/AzureCosmosDb/test/helpers/utils.test.ts` - https://github.com/n8n-io/n8n/blob/55dc1690a03717dabb9c54a836c7ca0ad2faf5a0/packages/nodes-base/nodes/Microsoft/AzureCosmosDb/test/helpers/utils.test.ts#L11-L12 | Sustainable Use License; GitHub API reports NOASSERTION | Cosmos helper tests replace a relative transport module; `before.ts` keeps only the shared transport-substitution shape. |
## Transformation
The mailer, user directory, and template are module-level atom constants and welcome work is a `flow` — this is the idiom the pattern teaches: atoms are inert shared definitions, so every test imports the same constants and isolation comes from scopes, never from re-creating the graph. The production mailer is a real in-memory outbox that assigns monotonic receipt ids; all doubles live in the test file and substitute via `preset(mailer, double)`, `preset(mailer, otherAtom)`, or `preset(sendWelcome, fn)` at `createScope` time.
## Lens coverage
inside-out and outside-in are present. effect-managed is absent because substitution mechanics own no resources or cleanup lifecycle.
## Why 100% is natural
`after.ts` has no product branches and no test probes. Factory runs are observed through lite's documented event semantics: a preset-hit atom emits `resolved` without `resolving`, so a `scope.on("resolving", atom, listener)` counter stays at zero exactly when the real factory is skipped, and baseline resolves in the same tests prove the counter fires when the factory does run. The tests exercise the real outbox mailer, direct preset value, redirected atom preset, flow-fn preset (deps unresolved), isolated scopes, and the composed send-welcome flow entirely through public lite APIs.
