# Null-hypothesis evidence

This directory tests the Pumped application scaffold against the simpler Lite baseline.

## Authoring import

The experiment builds the same one-file browser entry twice. One imports `flow` from
`@pumped-fn/lite`; the other imports the exact re-export from the tested Pumped entry.

The gate was frozen before capture:

- Both entries must build for a browser.
- The flow handle must retain exact identity.
- The meta entry may emit at most 256 extra bytes.
- The meta entry may reference no Node, Vite, Hono, CLI, server, job, or workflow runtime module.

Build the packages, capture evidence, then verify it is reproducible:

```bash
corepack pnpm --filter @pumped-fn/lite build
corepack pnpm --filter @pumped-fn/pumped build
node pkg/framework/pumped/evidence/null-hypothesis/capture.mjs --write
node pkg/framework/pumped/evidence/null-hypothesis/capture.mjs
node pkg/framework/pumped/evidence/null-hypothesis/verify.mjs
```

`authoring-import-v1.json` records the rejected package-root import. It loaded 166 modules and emitted
1,923,432 bytes. That result stopped the root re-export approach.

`authoring-import-v2.json` tests the replacement `@pumped-fn/pumped/app` entry against the same frozen
gate while it still re-exported metadata tags. It removed Node framework modules but emitted 1,847
extra bytes, so the gate still failed.

`authoring-import-v3.json` tests `/app` after metadata moves to the separate lightweight `/meta`
entry. It emits the same 4,236 bytes as Lite, keeps exact handle identity, and references no forbidden
framework module, so it rejects the null hypothesis under the frozen gate.

Each file records the full module lists, emitted bytes, decision, input hashes, and a SHA-256 hash of
the evidence payload without its `selfHash` field.

## App and target roots

This experiment builds default, east, and west app compositions for both production targets. East
and west derive from default, so the gate requires the exact declared app closure. It also requires
the exact runtime roots for each target:

- `server`: server, agents, jobs, and workflows
- `cli`: CLI and agents

Run the current capture and lineage check:

```bash
node pkg/framework/pumped/evidence/null-hypothesis/capture-app-targets.mjs
node pkg/framework/pumped/evidence/null-hypothesis/verify.mjs
```

`app-target-roots-v1.json` records the shared-manifest failure. All six builds contained every root
kind, so zero passed. `app-target-roots-v2.json` uses target-specific manifests. All six builds
contain the exact target roots and selected app closure, with no unrelated profile marker, so it
rejects this null hypothesis. Its evidence hash is
`9d6cad23a9ee68df6c5d3423c7e15f1a04f1a274a4548f262850d655774dc0bb`.

## Truthful graph

This experiment freezes the smallest useful application graph: one server root executes a flow,
the flow depends on one atom and one required tag, and the app provides that tag. Because factories
are opaque functions, both factory bodies must remain explicit unknowns.

The runtime probe uses public Lite extension hooks. It confirms that the expected flow and atom run,
and that removing the required tag fails with its label.

```bash
node pkg/framework/pumped/evidence/null-hypothesis/capture-graph.mjs
node pkg/framework/pumped/evidence/null-hypothesis/verify.mjs
```

`graph-v1.json` records the missing analyzer: runtime behavior passed, but no static report existed.
`graph-v2.json` records the admitted slice. Its five nodes, four proven edges, and two explicit
factory-body unknowns match the frozen report exactly. Its evidence hash is
`6485d863b0f6996beca36f3886274fbcfe8950b1f1f14bf394118aa988d9100a`.
