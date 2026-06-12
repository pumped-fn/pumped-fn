# 05 - Leaked Timers
## Smell
A constructor registers an emitter listener and starts a repeating timer, but the object that owns those effects has no teardown boundary.
## Harm
Tests and hot reloads can retain active handles, duplicate pollers, and stacked listeners after reinitialization.
## Provenance
- `directus/directus`, `api/src/websocket/handlers/heartbeat.ts`, https://github.com/directus/directus/blob/1bcb5ddcd6200d4aef884d31b82620c9d42a5789/api/src/websocket/handlers/heartbeat.ts, MSCL-1.0-GPL (`license`): heartbeat construction registers websocket emitter behavior and manages a pulse interval while clients exist.
- `medusajs/medusa`, `packages/modules/workflow-engine-redis/src/services/workflow-orchestrator.ts`, https://github.com/medusajs/medusa/blob/6411357b867a093e28620c2baddfdd8935fddc1e/packages/modules/workflow-engine-redis/src/services/workflow-orchestrator.ts, MIT (`packages/medusa/package.json`): constructor attaches a Redis subscriber listener whose lifetime is separate from registration.
## Transformation
The `poller` atom owns the timer and emitter listener, registers teardown through `ctx.cleanup`, and exposes lifecycle control through `scope.dispose`, `scope.release`, and `controller.invalidate`. The default emitter dispatches `emit` payloads to its registered listeners; tests preset a lifecycle sink atom; product code has a default no-op sink.
## Lens coverage
inside-out and effect-managed are present. outside-in absent: the smell and its fix are lifecycle-local; capstone scheduler covers the composed case.
## Why 100% is natural
`after.ts` has no product branches. The tests exercise the listener callback (through default-emitter `emit` dispatch in IO2, no preset), the interval callback and pulse counter under fake time, the default sink and lifecycle sink factories, listener removal silencing dispatch after dispose, release cleanup, dispose cleanup, invalidation cleanup, and LIFO cleanup order through public lite APIs.
