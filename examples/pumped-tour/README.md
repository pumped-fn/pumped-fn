# Pumped tour

This is the smallest app that exercises Pumped as a real convention compiler. One entry carries a
`route` tag and a `command` tag, so one shared flow serves HTTP and the CLI. A named app changes
its region tag without changing the flow. Tests use the same public handles through the scope seam.

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

Verify and inspect the east manifest without starting the app:

```bash
pnpm -F @pumped-fn/pumped-tour check
pnpm -F @pumped-fn/pumped-tour graph:east
```

`check` exits 1 on statically provable defects — an entry no host mounts, duplicate mount points,
or a required tag some mounted host can never supply. `graph` prints the identity, the static
graph, explicit unknowns, and those failures.

## Canonical Shape

```text
src/
  app.ts                 default composition: app({ tags: [region("default")] })
  apps/east.ts           derived composition: app(base, { tags: [region("east")] })
  domain/greet.ts        shared tag, capability atom, and flow
  entries/greet.ts       entry({ flow: greet, tags: [route(...), command(...)] })
tests/greet.test.ts      direct scope-seam test
```

Domain code imports Lite primitives from `@pumped-fn/lite`; entry and app files import `entry`,
the mount tags, and `app` from `@pumped-fn/pumped`. One name has one home. The entry holds the
flow by reference; it does not wrap or copy it, so a `preset()` targeting the flow reaches through.

`src/app.ts` supplies the default region tag. `src/apps/east.ts` derives from it and puts the east
value first. The test replaces the directory atom with `preset()` and needs no module mock.

The same test passes an assembled manifest to `analyze()`. It proves the entry's flow declares its
directory and region edges, opaque factory work stays visible under `unknowns`, and both mounted
hosts can satisfy every required tag, so `failures` is empty.

The production compiler emits `dist/server.mjs` from `route` entries and `dist/cli.mjs` from
`command` entries; this entry carries both tags, so it lands in both. Named apps use their own
directory, such as `dist/apps/east/`, so builds cannot mix app selections. Each artifact embeds its
app, target, and manifest hash with project-relative source names. The CLI artifact contains no
HTTP server, no scheduler, and no build toolchain.

## Package boundary verdict

This example gives `@pumped-fn/pumped` one clear job that Lite does not own: compile file
conventions into runnable target manifests and mount them on HTTP, CLI, cron, and workflow hosts
with one lifecycle. Disposing the scope stops everything the hosts started.

The verdict is to keep the package experimental. It removes two hand-written composition roots and
their build wiring, emits isolated and identified production artifacts, and proves mount and tag
contracts before anything runs. The compiler earns a boundary. `app()` alone would not earn one.
