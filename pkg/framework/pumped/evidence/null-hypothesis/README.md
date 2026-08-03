# Null-hypothesis gates

These executable gates compare the Pumped app layer with the smaller Lite baseline. They print a
compact live verdict and exit with a failure when the frozen requirement is not met. Generated
captures are not checked in.

Build the packages first:

```bash
corepack pnpm --filter @pumped-fn/lite build
corepack pnpm --filter @pumped-fn/pumped build
```

## Authoring import

The same browser entry imports `flow` from Lite and from `@pumped-fn/pumped/app`. The Pumped entry
must preserve exact handle identity, emit at most 256 extra bytes, and include no forbidden Node or
framework module.

```bash
node pkg/framework/pumped/evidence/null-hypothesis/capture.mjs
```

The admitted entry currently has two modules and zero extra bytes. Earlier package-root and
metadata-coupled forms failed this gate and were removed.

## App and target roots

Default, east, and west app compositions are built for server and CLI. Each of the six artifacts
must contain only its selected app closure and exact target roots. It must also contain exact app
and target identity, one unique manifest hash, and no absolute checkout path.

```bash
node pkg/framework/pumped/evidence/null-hypothesis/capture-app-targets.mjs
```

The server target admits server, agent, job, and workflow roots. The CLI target admits CLI and
agent roots. Source-only probes inside and outside the app root must change the hash, and `pumped
graph` must print the same hash as the matching production artifact. All six cases reject the null.

## Truthful graph slice

The graph slice covers server and job roots, a flow, an inline child flow, atoms, a resource, a
controller, a required tag, and an app extension. Static structure must match exactly. Runtime hooks
must observe the concrete flow, atom, resource, extension, and inline child execution while factory
bodies remain honest unknowns. A missing required tag must fail.

```bash
node pkg/framework/pumped/evidence/null-hypothesis/capture-graph.mjs
```

The same gate runs `pumped graph --app east --target server` against a convention fixture. The
command must print the exact selected identity and server roots, start no app runner, and remove its
temporary build directory.
