# Parking Lot App

Convention-driven `@pumped-fn/pumped` entrypoint over the shared parking lot management flows. One `src/`
tree produces both an HTTP server and a CLI from the same manifest.

## Canonical Shape

`src/app.ts` default-exports the scope config (presets, context tags). Every file under `src/server/`
and `src/cli/` default-exports a shared flow verbatim — no wrapper, no facade. The `pumped` CLI
discovers those files by directory (`server`, `cli`, `jobs`), reads `route`/`command` tags off each
flow for method/path/name overrides, and generates the manifest that `createServer`/`runCli` execute
through a scope built from `src/app.ts`. Domain code never imports `@pumped-fn/pumped`; only the generated
entries do.

## Shape

- `src/app.ts` — scope config: in-memory store preset, actor/now context tags from request headers
  (HTTP) or env vars (CLI).
- `src/server/{lots,bookings,check-ins,exits,payments-pair,reports}.ts` — one-line default exports of
  the shared flows, routed by filename.
- `src/cli/{configure,book,report}.ts` — one-line default exports of the shared flows, run as CLI
  commands by filename.
- `vite.config.ts` — installs the `pumped.plugin()` Vite plugin that powers `pumped dev`/`pumped build`.
- `tests/booking.test.ts` — plain `createScope({presets})` + `ctx.exec`, importing only
  `@pumped-fn/lite` and `@pumped-fn/parking-lot-shared`.
- `tests/server-entry.test.ts` / `tests/cli-entry.test.ts` — hand-built manifests driven through
  `@pumped-fn/pumped`'s `createServer`/`runCli` runtime, mirroring `parking-lot-hono`'s Hono round trips.

## Run

```bash
pnpm test
pnpm typecheck
pnpm dev            # pumped dev — starts the Vite dev server with HMR
pnpm build           # pumped build --target all — emits dist/server.mjs + dist/cli.mjs
node dist/server.mjs
node dist/cli.mjs configure --json '{"name":"Downtown","capacity":10,"rateCentsPerHour":500,"graceMinutes":10,"bookingLeadMinutes":120,"currency":"USD","refundWindowMinutes":1440}'
```

Compare with `examples/parking-lot-cli` and `examples/parking-lot-hono`, which wire the same domain by
hand instead of through convention-driven discovery.
