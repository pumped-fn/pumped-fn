# 02 - Parameter Drilling
## Smell
Request metadata such as `requestId` and `tenantId` is threaded through every function between the boundary and the leaf that actually needs it.
## Harm
Adding one metadata field churns multiple signatures. The intermediate layers become coupled to data they do not use, and every handler must remember to pass the field onward.
## Provenance
| repo | file path | license | description |
|---|---|---|---|
| modelcontextprotocol/typescript-sdk | [`src/shared/protocol.ts`](https://github.com/modelcontextprotocol/typescript-sdk/blob/e7ee57c2f33b8290a78a3cefa27ab635fe67fbff/src/shared/protocol.ts) | NOASSERTION | JSON-RPC request IDs are carried through request options, handler extras, progress maps, and queued task messages. |
| supabase/storage | [`src/http/plugins/storage.ts`](https://github.com/supabase/storage/blob/4d8a8d2a55906f66c81306eed385ec8cc36e4ee9/src/http/plugins/storage.ts) | Apache-2.0 | Fastify request tenant and request IDs are copied into storage and database wrappers used by object routes. |
| xynehq/xyne | [`server/api/admin.ts`](https://github.com/xynehq/xyne/blob/e1c2e69e18ad53f0ba3b5d1d3a27a1c8471980e5/server/api/admin.ts) | Apache-2.0 | Admin handlers repeat user and workspace metadata across connector, OAuth, and ingestion calls. |
## Transformation
`after.ts` replaces threaded parameters with `tag` definitions and `tags.required` or `tags.optional` dependencies. The boundary creates an execution context with request tags, nested `flow` calls inherit the context chain, and the leaf flow reads the request ID without intermediate signatures carrying it.
## Lens coverage
inside-out: present. outside-in: present. effect-managed: absent because this pattern is pure ambient data propagation with no owned side effects.
## Why 100% is natural
The product branches are the lite tag-resolution branches reached through public APIs: present required tag, missing required tag, absent optional tag, defaulted tag, exec-level shadowing, and parent-context `seekTag`. No lifecycle or environment branch exists in `after.ts`.
