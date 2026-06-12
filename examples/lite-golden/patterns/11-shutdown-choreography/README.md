# 11 - Shutdown Choreography
## Smell
An entrypoint signal handler manually awaits `server.close`, `pool.end`, and configuration cleanup in a maintained order.
## Harm
The order can drift as the graph grows; partially initialized resources can be skipped; repeated shutdown can run close logic twice.
## Provenance
- `payloadcms/payload`, `packages/plugin-mcp/src/stdio.ts`, https://github.com/payloadcms/payload/blob/ce8308fc35eee9e5dab3674d0cca475dc22ab163/packages/plugin-mcp/src/stdio.ts, MIT (`LICENSE.md`): shutdown routine closes an MCP server, destroys Payload, then exits from signal/stdin handling.
- `medusajs/medusa`, `packages/medusa/src/commands/start.ts`, https://github.com/medusajs/medusa/blob/6411357b867a093e28620c2baddfdd8935fddc1e/packages/medusa/src/commands/start.ts, MIT (`packages/medusa/package.json`): CLI signal handling closes the HTTP server and then calls loader shutdown.
## Transformation
Each runtime piece is an atom that owns its `ctx.cleanup`; resolving `server` builds the graph, and `scope.dispose` releases the resolved graph without a handwritten shutdown list.
## Lens coverage
outside-in and effect-managed are present. inside-out absent: the unit IS the lifecycle; covered by E.
## Why 100% is natural
`after.ts` has no product branches. E1 covers full graph cleanup order, E2 covers partial graph disposal, and OI1 covers request close before shutdown. E3 pins double-dispose for the extension-free case only: `dispose` (`packages/lite/src/scope.ts:1441`) has no disposed guard, but the first pass releases every cached atom (`packages/lite/src/scope.ts:1404`) and deletes its cache entry (`packages/lite/src/scope.ts:1432`), so a second `dispose()` finds nothing to clean. A scope with extensions re-runs extension `dispose` hooks on a second call, so the pin does not extend to scopes carrying extensions. lite has no double-dispose test of its own; this pin rests on the cited source behavior. E4 pins cleanup throws being swallowed while later cleanups run (`runCleanupsSafe`, `packages/lite/src/scope.ts:27`).
