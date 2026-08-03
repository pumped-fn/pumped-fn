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
must contain only its selected app closure and exact target roots.

```bash
node pkg/framework/pumped/evidence/null-hypothesis/capture-app-targets.mjs
```

The server target admits server, agent, job, and workflow roots. The CLI target admits CLI and
agent roots.

## Truthful graph slice

The smallest graph has one server root, one flow, one atom, one required tag, and one app tag
provider. Static structure must match exactly. Runtime hooks must observe the flow and atom, and a
missing required tag must fail.

```bash
node pkg/framework/pumped/evidence/null-hypothesis/capture-graph.mjs
```

Factories remain explicit unknowns. Broader graph coverage stays open until its own runtime-backed
gate is added.
