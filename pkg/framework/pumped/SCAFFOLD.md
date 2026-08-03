# Pumped application scaffold

> Status: falsification scaffold. This describes a proposed authoring and production model. It is not the current public contract.

Experimental foundation: `app()`, exact Lite re-exports through `@pumped-fn/pumped/app`, base-app composition, flat
`src/apps/*.ts` discovery, `--app` selection, and target-specific production manifests. Per-app root
declarations, recursive roots, the source catalog, analysis, and the system graph remain proposed
below. The implemented parts are not admitted until they reject the null hypotheses in this document.

## Goal

A useful app starts as one file:

```text
src/
  server/
    hello.ts
```

```ts
import { flow } from "@pumped-fn/pumped/app"

export default flow({
  factory: () => ({ message: "hello" }),
})
```

The same app can grow into several production deployments without changing how its domain logic is written. Files identify roots. Pumped primitives describe the graph. Tags provide facts and policy choices. Extensions change the execution pipeline. Atoms and resources own state.

The framework owns discovery, compilation, lifecycle, health, and production checks. It does not infer undeclared dependencies.

## Null hypothesis

The baseline is plain Lite primitives, explicit imports, one `createScope()` seam, and the current
flat Pumped entry discovery.

The global null hypothesis is:

> The proposed meta structure adds no trustworthy capability or material ease over the baseline,
> while adding package coupling, hidden loading, composition rules, and build modes.

The proposal is rejected by default. A feature stays experimental unless a fixture proves all of
its acceptance gates. Passing unit tests for the implementation is necessary but does not reject the
null hypothesis: the comparison must include the simpler baseline.

Decision rules:

- Test the smallest counterexample first.
- Rank risks by impact multiplied by likelihood.
- Work in risk order, not feature order.
- Treat an unknown graph edge as unknown, never absent.
- Stop a slice when its evidence fails; do not build later slices on it.
- Prefer removing a convention over adding an escape hatch for it.
- Keep the baseline fixture runnable through the public Lite API throughout the work.

## Baseline scenarios

Every experiment uses the same checked-in scenarios:

1. One-file HTTP hello flow.
2. HTTP flow requiring a database atom and a request tag.
3. A shared flow re-exported as both an HTTP and CLI root, with a preset targeting the original
   handle.
4. A default app plus east, west, and worker compositions.
5. A scheduled flow, a flow-controller edge, a resource, a role-tag implementor, and one extension.
6. Development reload, production build, direct scope test, and browser import of authoring
   primitives.

For each scenario, record required files, imports, type errors, loaded modules, emitted bytes,
manifest roots, graph edges, and runtime trace edges. A proposed form only wins when it is no less
explicit and measurably removes work or adds a truthful capability.

## Main rule

```text
catalog
  + selected app
  + runtime app
  + context tags
  + input events
  = effective graph
```

Composition is deterministic given the same catalog, ordered tags, extensions, presets, and input events. External systems are still external inputs. They enter through visible graph edges.

## File conventions

The smallest app needs only an entry file. Every other file is optional.

```text
src/
  app.ts
  apps/
    east.ts
    west.ts
    worker.ts
  server/
    invoices/
      list.ts
      create.ts
  cli/
    import-invoices.ts
  jobs/
    expire-invoices.ts
  agents/
    invoice-reviewer.ts
  workflows/
    onboard-customer.ts
  startup/
    database.ts
  domain/
    invoices/
      atoms/
        store.ts
      resources/
        transaction.ts
      flows/
        list.ts
        create.ts
      tags/
        actor.ts
        database-url.ts
```

Proposed discovery rules:

| Path | Default export | Role |
| --- | --- | --- |
| `src/app.ts` | app definition | Default app composition |
| `src/apps/*.ts` | app definition | Named app composition |
| `src/server/**/*.ts` | flow | HTTP root |
| `src/cli/**/*.ts` | flow | CLI root |
| `src/jobs/**/*.ts` | schedule atom | Recurring job root |
| `src/agents/**/*.ts` | flow or agent adapter | Agent root |
| `src/workflows/**/*.ts` | flow | Workflow root |
| `src/startup/**/*.ts` | flow | Readiness-blocking startup root |

Domain layout is a convention, not a requirement. Any primitive imported through a declared dependency remains part of the reachable graph. Cataloged domain files gain stable source names and can be checked for reachability.

Discovery never means automatic dependency injection. A route that uses a database imports its database handle and declares it in `deps`.

## One authoring package

Application code imports from the meta package:

```ts
import {
  app,
  atom,
  controller,
  flow,
  preset,
  resource,
  tag,
  tags,
  typed,
} from "@pumped-fn/pumped/app"
```

The lightweight app entry re-exports the exact Lite functions and values. It does not wrap primitive creation. Handle identity therefore remains valid for presets, dependency traversal, and graph analysis.

Shared libraries may continue to import `@pumped-fn/lite` directly.

Local app imports remain ordinary module imports:

```ts
import db from "#app/domain/invoices/atoms/store"
```

`#app/*` can be a standard package import alias. It must work in plain tests without the Pumped plugin. A generated app-wide barrel is avoided because it can evaluate unrelated modules, enlarge bundles, and create cycles.

## App definitions

`app()` validates and preserves an app definition. It does not create a scope or start work.

```ts
import { app } from "@pumped-fn/pumped/app"
import { observable } from "@pumped-fn/pumped/observable"
import databaseUrl from "#app/domain/invoices/tags/database-url"

export default app({
  tags: [
    databaseUrl(readEnvironment("DATABASE_URL")),
  ],
  extensions: [
    observable.extension(),
  ],
})
```

`readEnvironment()` is shorthand for a controlled deployment-input adapter. It validates an external value and turns it into a tag binding. Domain primitives and extensions never read `process.env` directly. Tests provide the deployment input or resulting tag binding.

The first shape is intentionally small:

```ts
interface AppOptions {
  tags?: readonly Lite.Tagged<unknown>[]
  presets?: readonly Lite.Preset<unknown, unknown>[]
  extensions?: readonly Lite.Extension[]
}

declare function app<const Options extends AppOptions>(options?: Options): AppDefinition
declare function app<const Options extends AppOptions>(base: AppDefinition, options: Options): AppDefinition
```

An `AppDefinition` is immutable composition data. Every runner still creates its own scope from the effective definition.

## Named apps instead of profiles

A profile is another app definition. It does not introduce mode checks inside business code.

```ts
import { app } from "@pumped-fn/pumped/app"
import base from "../app"
import databaseUrl from "#app/domain/invoices/tags/database-url"
import region from "#app/domain/shared/tags/region"

export default app(base, {
  tags: [
    region("east"),
    databaseUrl(readEnvironment("EAST_DATABASE_URL")),
  ],
})
```

```bash
pumped dev
pumped dev --app east
pumped check --app east
pumped check --app all
pumped build --app east --target server
```

Each selected app has its own effective manifest, scope, lifecycle, and build artifact.

Separate deployments such as east and west are separate apps. If one process serves both regions, region is a request tag in one app instead.

## Tag layers

Tags provide immutable facts and policy choices. Their layers have a fixed order:

```text
framework defaults
  < selected app
  < runtime app
  < request, job, workflow, or agent context
```

Rules:

- A more specific layer appears before the layers it derives from.
- A single-value lookup selects the first matching binding.
- A multi-value lookup keeps every binding in precedence order.
- The effective manifest records every binding's origin and precedence.
- Mutable runtime state does not live in a tag.

Examples:

| Concern | Representation |
| --- | --- |
| Region | tag |
| Database URL | tag |
| Server address | tag |
| Request limits | tag |
| Shutdown policy | tag |
| Error policy | tag |
| Trace sink and sampling | tags |
| Scheduler backend choice | tag |
| Build identity | runtime tag |
| Request identity | context tag |
| Readiness state | atom |
| Connection pool | atom |
| Transaction | resource |
| Startup check | flow |

## Extensions

Extensions are ordered parts of an app definition. Tags configure them.

```ts
export default app({
  tags: [
    traceSink(otel),
    traceSampling(0.1),
  ],
  extensions: [
    observable.extension(),
  ],
})
```

Extension rules:

- Base extensions appear first in the effective extension order.
- Extension order is preserved in the manifest.
- Duplicate extension names in one effective app are an error.
- An extension does not read deployment globals itself.
- Changing extension configuration normally changes tags, not extension topology.
- Semantic extensions that change behavior remain explicitly installed.

Logging, tracing, and metrics are observational extensions. Their sinks and policies are tags. Suspense, durability, and synchronization are semantic extensions. Their presence changes the effective app and must remain visible.

The framework runtime is also composed as an app layer. Development can add HMR. Production can add the server lifecycle. These additions appear in the effective manifest with a framework or runtime origin.

## Declared application graph

A tag definition:

```ts
import { tag } from "@pumped-fn/pumped/app"

export default tag<string>({
  label: "database.url",
})
```

A database atom:

```ts
import { atom, tags } from "@pumped-fn/pumped/app"
import databaseUrl from "../tags/database-url"

export default atom({
  deps: {
    databaseUrl: tags.required(databaseUrl),
  },
  factory: (ctx, { databaseUrl }) => {
    const db = createDatabase(databaseUrl)
    ctx.cleanup((value) => value.close(), db)
    return db
  },
})
```

A route:

```ts
import { flow } from "@pumped-fn/pumped/app"
import db from "#app/domain/invoices/atoms/store"

export default flow({
  deps: { db },
  factory: (ctx, { db }) => db.listInvoices(),
})
```

The analyzer can derive:

```text
server:invoices/list
  -> atom:domain/invoices/store [key=db, mode=resolve]
    -> tag:database.url [key=databaseUrl, mode=required]
```

## System graph

Production machinery is made from Pumped primitives rather than hidden runner callbacks:

```text
system:boot
  -> app startup roots
  -> system:readiness

system:serve
  -> system:server
  -> tag:server.address
  -> tag:http.request-limits
  -> tag:http.errors
  -> system:readiness

system:shutdown
  -> tag:shutdown.policy
  -> system:active-requests
  -> system:server controller

system:health/live
  -> system:lifecycle

system:health/ready
  -> system:readiness
```

Tags select policy. Atoms hold lifecycle state. Flows perform lifecycle actions. Extensions observe them.

The lifecycle is fixed:

```text
check -> build -> start -> ready -> drain -> stopped
                  |
                  +-> failed
```

Startup roots run before readiness becomes true. Shutdown stops new work, drains active contexts, stops runners, disposes the scope, and applies the tagged shutdown deadline.

## Effective manifest

Discovery produces a source catalog. App selection and runtime composition produce an effective manifest.

```ts
interface EffectiveManifest {
  app: string
  roots: readonly RootDescriptor[]
  nodes: readonly NodeDescriptor[]
  edges: readonly EdgeDescriptor[]
  tags: readonly TagBindingDescriptor[]
  presets: readonly PresetDescriptor[]
  extensions: readonly ExtensionDescriptor[]
  diagnostics: readonly Diagnostic[]
  build: BuildDescriptor
}
```

Every item has an origin such as `app`, `meta`, `framework-default`, `runtime`, or `context`. Secret values are never serialized. The manifest stores their tag identity and origin only.

An edge keeps its dependency meaning:

```ts
interface EdgeDescriptor {
  from: string
  to: string
  key: string
  mode: "resolve" | "control" | "execute" | "required" | "optional" | "all"
}
```

Object identity deduplicates nodes while the graph is assembled. Catalog paths provide stable build IDs. A reachable primitive outside the source catalog remains valid and receives a package or structural identity.

## Analysis

Analysis reads handles and dependency records. It never calls an atom, resource, or flow factory.

```ts
const report = analyze(manifest)
```

Initial diagnostics:

- Invalid default export for a conventional file.
- Duplicate route or command.
- Dependency cycle.
- Duplicate extension name.
- Missing production backend.
- Unreachable cataloged node.
- Unsafe production default.

Useful projections:

```bash
pumped graph --app east
pumped graph --app east --format json
pumped graph --app east --compare west
```

A comparison reports graph, tag, preset, root, and extension differences without exposing secret values.

## Runtime boundaries

Runtime inputs are converted into tags at controlled boundaries:

- Deployment input becomes runtime tags.
- An HTTP request becomes request context tags.
- A scheduled tick becomes job context tags.
- A workflow run becomes workflow context tags.
- An agent turn becomes agent context tags.
- A process signal becomes input to the shutdown flow.

The effective ordering and origin remain inspectable. Business factories do not read ambient request state or framework globals.

## Build and run

Development interprets the graph and adds its runtime extensions:

```bash
pumped dev --app east
```

Production compiles a fixed target:

```bash
pumped check --app east
pumped build --app east --target server
node dist/server.mjs
```

Production does not scan application directories. The artifact contains reachable target code, the effective manifest, a build ID, a manifest hash, and the selected app name. Development-only code is absent.

## Testing

The scope remains the only substitution seam. App definitions are composition data, not shared scopes.

```ts
const scope = createScope({
  tags: [
    region("test"),
    shutdown({ graceMs: 10 }),
  ],
  presets: [
    preset(db, fakeDb),
  ],
})
```

Tests can choose their radius:

- Execute one domain flow with direct presets.
- Assemble one named app and replace edge adapters.
- Run the compiled production entry against fake external adapters.

No test requires directory discovery, a framework plugin, module mocks, or a shared preconfigured scope.

## Ranked failure hypotheses

The score is impact times likelihood, each rated from one to five. Equal scores are ordered by which
risk blocks more later work.

| Rank | Score | Null hypothesis | Why it is credible | Rejection gate |
| --- | ---: | --- | --- | --- |
| 1 | 25 | The one-package authoring import is worse than importing Lite. | The current root bundle imports the plugin, Node filesystem code, Vite, Hono, scheduler code, and `cac` when an app asks only for `flow`. | A Node test and browser build import only `flow`; no Node-only framework module is resolved or evaluated, handle identity is exact, and emitted authoring overhead stays within a frozen small ceiling. |
| 2 | 25 | Named apps are labels over config, not real apps. | The selected definition changes tags, presets, and extensions, but every discovered server, CLI, job, agent, and workflow root remains in the manifest. A worker therefore still contains server roots. | Default, east, and worker fixtures produce exact declared root sets; runners start only those roots; the artifact records the selected app and roots. If roots never vary, rename the feature to profiles. |
| 3 | 25 | Static analysis will claim a complete graph while missing real edges. | `schedule()` closes over its flow, extensions expose hooks rather than deps, callbacks can be opaque, and runtime tag implementors depend on evaluated registrations. | A golden edge matrix covers every primitive and framework edge. Static output matches runtime trace coverage. Missing static knowledge is emitted as `unknown` with a reason. Zero real edges are silently omitted. |
| 4 | 20 | A source catalog must execute modules or lose handle identity. | Static syntax can find exports but not runtime object identity and resolved deps. Importing every catalog file can run unrelated top-level code and destroy reachability-based loading. | A sentinel fixture proves cataloging does not evaluate unrelated modules. Shared and re-exported handles deduplicate correctly. The chosen mechanism preserves source identity without an app-wide eager barrel. |
| 5 | 20 | Base-app composition is a hidden configuration language with unsafe merge rules. | Tag lookup uses first-match order, `tags.all()` retains base and derived values, contexts both run, presets use last-target wins, error mappers chain, and extension order changes wrapping behavior. | A composition truth table covers duplicate tags, `required`, `optional`, `all`, presets, contexts, mapper fallback, extension init, wrap order, and failure. Dev, build, and direct tests produce the same result. Any unsupported merge is a named error. |
| 6 | 16 | App selection is not reproducible. | `PUMPED_APP` is process-global, Vite config loads more than once, HMR rebuilds later, and successive app builds share `dist` without an admitted app identity in the artifact. | Parallel and sequential east/west builds cannot cross-select or mix output. HMR keeps the selected app. The artifact embeds app name, root set, and manifest hash. No selection depends on mutable process state after composition. |
| 7 | 15 | Moving production lifecycle into the graph creates ownership loops and partial-start leaks. | The server owns requests that execute on the scope while the scope would own server startup and shutdown. Jobs, extensions, and startup flows can fail at different points. | A lifecycle matrix covers init failure, startup failure, job registration failure, active requests, repeated signals, cleanup failure, and deadline expiry. Every owned value is disposed exactly once and readiness is never true during partial startup or drain. |
| 8 | 12 | Recursive conventions and path IDs create more ceremony and brittle identity than they remove. | Nested support files can become roots, renames can break trace or durable IDs, and shared package handles have no single app path. | Baseline and proposed fixtures compare files and imports. Support modules never become entries. Renames have a stated compatibility rule. Shared handles get stable package identity. The one-file app remains one file. |

## Experiment results

### Risk 1: authoring import

The frozen browser gate allowed no forbidden framework module, required exact handle identity, and
allowed at most 256 bytes over the Lite entry.

| Evidence | Import | Modules | Bytes | Extra bytes | Result |
| --- | --- | ---: | ---: | ---: | --- |
| `authoring-import-v1.json` | package root | 166 | 1,923,432 | 1,921,862 | Rejected |
| `authoring-import-v2.json` | `/app` with metadata tags | 4 | 3,417 | 1,847 | Rejected |
| `authoring-import-v3.json` | `/app` without metadata tags | 2 | 3,152 | 0 | Admitted |

All three retain exact Lite handle identity. V1 pulled the Node framework into the browser build. V2
removed the Node framework but retained metadata tag creation. V3 moves route and command metadata
to the separate lightweight `/meta` entry and rejects the null hypothesis with zero emitted-byte
penalty. The package root remains the framework operations entry.

Evidence and reproduction commands live in [the null-hypothesis evidence directory](evidence/null-hypothesis/README.md).

### Risk 2 slice: build-target root isolation

The frozen production-build gate selected default, east, and west for both targets. It required the
exact selected app closure and exact target root set in each emitted artifact.

| Evidence | Manifest | Passed cases | Result |
| --- | --- | ---: | --- |
| `app-target-roots-v1.json` | shared by both targets | 0/6 | Rejected |
| `app-target-roots-v2.json` | target-specific | 6/6 | Admitted |

V1 imported all five root kinds into every artifact. V2 gives the server only server, agent, job,
and workflow roots, and gives the CLI only CLI and agent roots. Unrelated app markers stay out.

This rejects the shared-manifest counterexample. It does not yet reject all of Risk 2: named apps do
not declare different root sets, and artifacts do not yet carry an admitted app name and manifest
hash. Those claims remain gated.

### Risk 3 slice: truthful declared graph

The frozen graph contains one server root, one flow, one atom, one required tag, and one app tag
provider. Public extension hooks confirm the flow and atom that execute. Removing the tag must fail.
Because factories are opaque functions, their bodies must remain explicit unknowns.

| Evidence | Analyzer | Static graph | Runtime | Result |
| --- | --- | --- | --- | --- |
| `graph-v1.json` | absent | missing | exact | Rejected |
| `graph-v2.json` | public handles | exact | exact | Admitted |

V2 reports five nodes, four proven edges, and two `factory-body` unknowns without executing a
factory during analysis. This rejects the smallest missing-edge counterexample. The full Risk 3
matrix still needs resources, controllers, schedules, role-tag implementors, presets, extensions,
and inline named execution before Pumped can claim broad graph coverage.

## Risk-first execution plan

### Phase 0: freeze the baseline

Purpose: prevent the proposal from declaring success against a moving or imaginary comparison.

Work:

- Check in the six baseline scenarios.
- Capture the public commands for direct scope tests, dev, server build, CLI build, and browser build.
- Record loaded modules, emitted bytes, roots, static edges, runtime edges, and required user code.
- Give every measurement a machine-readable artifact and hash.

Exit gate:

- A clean checkout can reproduce every baseline artifact.
- No proposed meta feature is required to run the baseline.

Stop rule:

- If the baseline cannot be stated without subjective scoring, keep only binary claims such as
  import success, root equality, edge equality, and artifact content.

### Phase 1: try to disprove the implemented foundation

Risks addressed: 1, 2, 5, and 6.

Work:

1. Add a consumer that imports `flow` from the package root in Node and a browser build.
2. Compare it with the same consumer importing `@pumped-fn/lite`.
3. Add exact root expectations for default, east, and worker apps.
4. Add the complete app-composition truth table.
5. Run sequential and concurrent named-app builds and inspect their manifests and output paths.
6. Exercise selection through CLI flags, plugin options, existing Vite config, environment input, and
   HMR invalidation.

Exit gate:

- All four rejection gates pass.
- The package root is either proven lightweight or replaced by a lightweight authoring subpath.
- An app either owns an explicit root set or the feature is honestly narrowed and named profile.
- Composition and selection have one documented algebra with no environment-dependent exceptions.

Stop rule:

- Revert or narrow any implemented feature that fails its gate. Do not begin catalog work while a
  selected app or authoring import has ambiguous meaning.

### Phase 2: prove that structure can be observed truthfully

Risks addressed: 3, 4, and 8.

Work:

1. Define the edge matrix before defining the analyzer API.
2. Include atoms, resources, flow controllers, tags, presets, schedules, tag implementors,
   extensions, inline named execution, and framework mounts.
3. Capture runtime traces for the same fixture.
4. Prototype source identity and traversal as an internal tool.
5. Compare static edges with runtime edges and classify every difference.
6. Add sentinel modules that fail if catalog discovery eagerly evaluates them.
7. Test re-exports, shared packages, aliases, cycles, and file renames.

Exit gate:

- Static and runtime graphs agree for every statically representable edge.
- Every non-representable edge is an explicit `unknown`, not a missing row.
- Cataloging does not eagerly evaluate unrelated modules.
- Stable IDs survive the admitted rename and shared-package cases.

Stop rule:

- If completeness requires executing arbitrary factories or changing the admitted Lite core, stop.
  Narrow the analyzer claim to the subset that can be proven from existing public handles and
  framework metadata.

### Phase 3: try to break the production system graph

Risks addressed: 7, plus the production parts of 3 and 6.

Work:

1. Model boot, ready, drain, stop, and failed states with explicit owners.
2. Drive policies through tags while keeping state in atoms and resources.
3. Inject a failure at every acquisition, runner start, request, and cleanup boundary.
4. Test repeated and concurrent shutdown signals.
5. Verify readiness, bounded draining, LIFO cleanup, and exactly-once disposal.
6. Build fixed server, CLI, and worker artifacts and compare their roots with the selected app.

Exit gate:

- The lifecycle matrix passes with no leaked owner, double cleanup, or false readiness.
- Production artifacts contain no discovery watcher or development runtime.
- Unsafe backends fail before readiness with a graph-addressable error.

Stop rule:

- If framework ownership cannot be expressed without a scope owning the boundary that must dispose
  that scope, keep lifecycle in the runner and expose it as manifest metadata rather than claiming it
  is an ordinary app subgraph.

### Phase 4: expose the admitted surface

Work begins only after Phases 1 through 3 pass.

- Publish `analyze(manifest)` for the proven graph subset.
- Add `pumped check` using only admitted diagnostics.
- Add JSON and human graph projections from the same report.
- Document unknown edges and honest limits beside every projection.
- Add a comparison command only after effective app manifests are reproducible.
- Cut a release only when the changeset describes admitted behavior rather than proposed behavior.

## Claims under test

- Convention can select roots and stable names without selecting dependencies.
- Default exports can remain the conventional file contract without eager loading.
- A meta authoring entry can preserve Lite identity without loading the Node framework.
- `app()` can compose apps with a small, complete algebra.
- Named apps can own distinct roots, tags, presets, and extensions.
- Tags can configure policy without becoming mutable state or an ambient service locator.
- Extensions can remain ordered, explicit, and analyzable enough for their claimed role.
- Framework lifecycle can be represented without hiding ownership or creating disposal loops.
- Production checks can add evidence without adding ceremony to a one-file app.
