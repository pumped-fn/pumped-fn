# 12 - Tenant Instance Maps
## Smell
Process-level maps lazily create service bundles by tenant, app, account, or region key.
## Harm
Eviction and cleanup become manual registry chores, tenant config is baked into factory calls, and one cache bug can bleed state across tenants.
## Provenance
| Repo | File | License | Adaptation |
|---|---|---|---|
| giogaspa/fastify-multitenant | `src/providers/tenant-resource-provider.ts` - https://github.com/giogaspa/fastify-multitenant/blob/74459d987eb624d583663fe3f3d7a87d4243921d/src/providers/tenant-resource-provider.ts#L13-L24 | MIT | Tenant resources are cached in a tenant-id keyed promise map; `before.ts` paraphrases this as a lazy service bundle registry. |
| parse-community/parse-server | `src/cache.js` and `src/Config.js` - https://github.com/parse-community/parse-server/blob/0644675f37b5f226a973df823ab7505b93dca1e9/src/cache.js#L1-L4 and https://github.com/parse-community/parse-server/blob/0644675f37b5f226a973df823ab7505b93dca1e9/src/Config.js#L47-L56 | Apache-2.0 | App-id keyed state rebuilds config and database controllers from a global cache; the example keeps the keyed lifetime shape without copying source. |
| localstack/localstack | `localstack-core/localstack/services/stores.py` - https://github.com/localstack/localstack/blob/8b9a79f05846835cf4dff63ab7eefdde9df83783/localstack-core/localstack/services/stores.py#L284-L320 | Apache-2.0; GitHub API reports NOASSERTION | Account and region keyed service stores are lazily retained until reset; the example adapts the central registry harm to tenant scopes. |
## Transformation
Tenant identity is a `tag`, tenant services are ordinary `atom` definitions, and `createTenantScope` builds `createScope({ tags, presets })` per tenant. Plan-specific behavior is `tierPresets` choosing `preset(strategy, freeStrategy)` or `preset(strategy, proStrategy)`, while eviction is `scope.dispose()`.
## Lens coverage
inside-out, outside-in, and effect-managed are present.
## Why 100% is natural
The only branches in `after.ts` are the plan selection in `tierPresets` and the optional cleanup-log preset in `createTenantScope`; tests cover free and pro plans plus scopes with and without an injected cleanup log. The remaining lines are atom factories, flow factories, counter methods, strategy formatting, and cleanup, all reached through public scope and flow APIs.
