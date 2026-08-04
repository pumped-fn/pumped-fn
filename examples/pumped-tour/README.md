# Pumped tour

This is the smallest app that exercises Pumped as a real convention compiler. One shared flow is
discovered as an HTTP route and a CLI command. A named app changes its region tag without changing
the flow. Tests use the same public handle through the scope seam.

## Run it

From the repository root:

```bash
pnpm -F @pumped-fn/pumped build
pnpm -F @pumped-fn/pumped-tour build
pnpm -F @pumped-fn/pumped-tour test
```

Run the built server:

```bash
PORT=3000 pnpm -F @pumped-fn/pumped-tour run server
curl 'http://localhost:3000/greet?name=Ada'
```

The response is:

```json
{"message":"Hello, Ada from default"}
```

Run the same flow through the built CLI:

```bash
pnpm -F @pumped-fn/pumped-tour cli greet --json '{"name":"Ada"}'
```

Build the derived east app instead:

```bash
pnpm -F @pumped-fn/pumped-tour build:east
pnpm -F @pumped-fn/pumped-tour cli:east greet --json '{"name":"Ada"}'
```

Its output ends with `from east`.

Inspect the east manifest without starting the app:

```bash
pnpm -F @pumped-fn/pumped-tour graph:east
```

The JSON identity says `east` and `server`, followed by the static graph and explicit unknowns.

## Canonical Shape

```text
src/
  app.ts                 default composition
  apps/east.ts           derived composition
  domain/greet.ts        shared tag, capability atom, and flow
  server/greet.ts        HTTP root and route metadata
  cli/greet.ts           CLI root and command metadata
tests/greet.test.ts      direct scope-seam test
```

The domain flow imports only `@pumped-fn/pumped/app`. That entry is the exact lightweight Lite
authoring surface. Transport roots re-export the same flow handle and add metadata from
`@pumped-fn/pumped/meta`. They do not wrap or copy the flow.

`src/app.ts` supplies the default region tag. `src/apps/east.ts` derives from it and puts the east
value first. The test replaces the directory atom with `preset()` and needs no module mock.

The same test passes an assembled manifest to `analyze()`. It proves the two roots share one flow
node, the flow declares its directory and region edges, and opaque factory work stays visible under
`unknowns`.

The production compiler emits `dist/server.mjs` with server roots and `dist/cli.mjs` with CLI roots.
Named apps use their own directory, such as `dist/apps/east/`, so builds cannot mix app selections.
Each artifact embeds its app, target, and manifest hash with project-relative source names. No
artifact contains the other target's exclusive roots or an absolute checkout path.

## Package boundary verdict

This example gives `@pumped-fn/pumped` one clear job that Lite does not own: compile file conventions
into runnable target manifests and own their HTTP, CLI, job, workflow, and development lifecycle.
The `/app` entry is intentionally only a lightweight authoring bridge.

The verdict is to keep the package experimental. It removes two hand-written composition roots and
their build wiring, emits isolated and identified production artifacts, and inspects the generated
graph without starting the app. The compiler earns a boundary. `app()` alone would not earn one.
