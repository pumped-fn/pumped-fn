# C3 Structural Index
<!-- hash: sha256:318f49b63acfc61030fd92be0ef382b0c3dc0fc4a29f57aa13567ce3d5d59151 -->

## adr-011 — Sequential Invalidation Chain with Loop Detection (adr)
blocks: Goal ✓

## adr-013 — Controller.set() and Controller.update() for Direct Value Mutation (adr)
blocks: Goal ✓

## adr-014 — DataStore Map-like Semantics (adr)
blocks: Goal ✓

## adr-015 — Devtools via Extension + Fire-and-Forget Transports (adr)
blocks: Goal ✓

## adr-017 — Controller Auto-Resolution Option (adr)
blocks: Goal ✓

## adr-018 — OpenTelemetry Extension for Lite Package (adr)
blocks: Goal ✓

## adr-019 — Scope.controller() Options for API Consistency (adr)
blocks: Goal ✓

## adr-020 — Raw Input Execution for Flows with Parse (adr)
blocks: Goal ✓

## adr-024 — Add name Option to ExecFnOptions for API Consistency (adr)
blocks: Goal ✓

## adr-025 — Simplify OTEL Extension with Self-Contained Provider Management (adr)
blocks: Goal ✓

## adr-027 — Non-Suspense Mode for useAtom (adr)
blocks: Goal ✓

## adr-20260312-fix-watch-shallow-equal — Fix watch:true false cascades via shallow equality default (adr)
blocks: Goal ✓

## adr-20260313-audit-and-refresh-c3-lite-docs — Audit and Refresh Lite C3 Docs (adr)
blocks: Goal ✓

## adr-20260313-complete-code-map-coverage — complete-code-map-coverage (adr)
blocks: Goal ✓

## adr-20260313-harden-lite-types-issue-241 — Harden Lite Type Contracts for Issue 241 (adr)
blocks: Goal ✓

## c3-0 — pumped-fn System Overview (context)
reverse deps: adr-20260313-complete-code-map-coverage, c3-2, c3-3, c3-4, c3-5, c3-6, c3-7, c3-8
blocks: Abstract Constraints ○, Containers ✓, Goal ✓

## c3-2 — Lite Library (@pumped-fn/lite) (container)
context: c3-0
reverse deps: c3-201, c3-202, c3-203, c3-204, c3-205
constraints from: c3-0
blocks: Complexity Assessment ○, Components ✓, Goal ✓, Responsibilities ✓

## c3-201 — Scope & Controller (component)
container: c3-2 | context: c3-0
files: packages/lite/src/scope.ts, packages/lite/src/types.ts, packages/lite/src/equality.ts
constraints from: c3-0, c3-2
blocks: Container Connection ✓, Dependencies ✓, Goal ✓, Related Refs ○

## c3-202 — Atom (component)
container: c3-2 | context: c3-0
files: packages/lite/src/atom.ts, packages/lite/src/service.ts
constraints from: c3-0, c3-2
blocks: Container Connection ✓, Dependencies ✓, Goal ✓, Related Refs ○

## c3-203 — Flow & ExecutionContext (component)
container: c3-2 | context: c3-0
files: packages/lite/src/flow.ts, packages/lite/src/resource.ts
constraints from: c3-0, c3-2
blocks: Container Connection ✓, Dependencies ○, Goal ✓, Related Refs ○

## c3-204 — Tag System (component)
container: c3-2 | context: c3-0
files: packages/lite/src/tag.ts
constraints from: c3-0, c3-2
blocks: Container Connection ✓, Dependencies ✓, Goal ✓, Related Refs ○

## c3-205 — Preset (component)
container: c3-2 | context: c3-0
files: packages/lite/src/preset.ts
constraints from: c3-0, c3-2
blocks: Container Connection ✓, Dependencies ✓, Goal ✓, Related Refs ○

## c3-3 — Lite React Library (@pumped-fn/lite-react) (container)
context: c3-0
reverse deps: c3-301
constraints from: c3-0
blocks: Complexity Assessment ○, Components ✓, Goal ✓, Responsibilities ✓

## c3-301 — React Hooks (component)
container: c3-3 | context: c3-0
files: packages/lite-react/src/index.ts, packages/lite-react/src/context.tsx, packages/lite-react/src/hooks.ts
constraints from: c3-0, c3-3
blocks: Container Connection ✓, Dependencies ✓, Goal ✓, Related Refs ○

## c3-4 — Lite Devtools Library (@pumped-fn/lite-devtools) (container)
context: c3-0
reverse deps: adr-20260313-complete-code-map-coverage, c3-401, c3-402
constraints from: c3-0
blocks: Complexity Assessment ○, Components ✓, Goal ✓, Responsibilities ✓

## c3-401 — Extension Runtime (component)
container: c3-4 | context: c3-0
files: packages/lite-devtools/src/index.ts, packages/lite-devtools/src/extension.ts, packages/lite-devtools/src/types.ts, packages/lite-devtools/src/symbols.ts
constraints from: c3-0, c3-4
blocks: Container Connection ✓, Dependencies ✓, Goal ✓, Related Refs ○

## c3-402 — Transport Adapters (component)
container: c3-4 | context: c3-0
files: packages/lite-devtools/src/transports/**
constraints from: c3-0, c3-4
blocks: Container Connection ✓, Dependencies ✓, Goal ✓, Related Refs ○

## c3-5 — Lite HMR Plugin (@pumped-fn/lite-hmr) (container)
context: c3-0
reverse deps: adr-20260313-complete-code-map-coverage, c3-501, c3-502
constraints from: c3-0
blocks: Complexity Assessment ○, Components ✓, Goal ✓, Responsibilities ✓

## c3-501 — Vite Plugin (component)
container: c3-5 | context: c3-0
files: packages/lite-hmr/src/index.ts, packages/lite-hmr/src/plugin.ts, packages/lite-hmr/src/transform.ts
constraints from: c3-0, c3-5
blocks: Container Connection ✓, Dependencies ✓, Goal ✓, Related Refs ○

## c3-502 — HMR Runtime (component)
container: c3-5 | context: c3-0
files: packages/lite-hmr/src/runtime.ts, packages/lite-hmr/src/types.ts
constraints from: c3-0, c3-5
blocks: Container Connection ✓, Dependencies ✓, Goal ✓, Related Refs ○

## c3-6 — Lite Devtools Server (@pumped-fn/lite-devtools-server) (container)
context: c3-0
reverse deps: adr-20260313-complete-code-map-coverage, c3-601, c3-602
constraints from: c3-0
blocks: Complexity Assessment ○, Components ✓, Goal ✓, Responsibilities ✓

## c3-601 — Server State (component)
container: c3-6 | context: c3-0
files: packages/lite-devtools-server/src/index.ts, packages/lite-devtools-server/src/server.ts, packages/lite-devtools-server/src/state.ts
constraints from: c3-0, c3-6
blocks: Container Connection ✓, Dependencies ✓, Goal ✓, Related Refs ○

## c3-602 — Terminal Dashboard (component)
container: c3-6 | context: c3-0
files: packages/lite-devtools-server/src/bin.tsx, packages/lite-devtools-server/src/ui.tsx
constraints from: c3-0, c3-6
blocks: Container Connection ✓, Dependencies ✓, Goal ✓, Related Refs ○

## c3-7 — Lite Extension OTel (@pumped-fn/lite-extension-otel) (container)
context: c3-0
reverse deps: adr-20260313-complete-code-map-coverage, c3-701
constraints from: c3-0
blocks: Complexity Assessment ○, Components ✓, Goal ✓, Responsibilities ✓

## c3-701 — OTel Extension (component)
container: c3-7 | context: c3-0
files: packages/lite-extension-otel/src/index.ts
constraints from: c3-0, c3-7
blocks: Container Connection ✓, Dependencies ✓, Goal ✓, Related Refs ○

## c3-8 — Codemod Library (@pumped-fn/codemod) (container)
context: c3-0
reverse deps: adr-20260313-complete-code-map-coverage, c3-801, c3-802, c3-803
constraints from: c3-0
blocks: Complexity Assessment ✓, Components ✓, Goal ✓, Responsibilities ✓

## c3-801 — CLI & Entry Points (component)
container: c3-8 | context: c3-0
files: packages/codemod/src/cli.ts, packages/codemod/src/index.ts
constraints from: c3-0, c3-8
blocks: Container Connection ✓, Dependencies ✓, Goal ✓, Related Refs ○

## c3-802 — Transforms (component)
container: c3-8 | context: c3-0
files: packages/codemod/src/transforms/**
constraints from: c3-0, c3-8
blocks: Container Connection ✓, Dependencies ✓, Goal ✓, Related Refs ○

## c3-803 — Reporting (component)
container: c3-8 | context: c3-0
files: packages/codemod/src/report/**
constraints from: c3-0, c3-8
blocks: Container Connection ✓, Dependencies ✓, Goal ✓, Related Refs ○

## ref-tanstack-start-lite-backend — TanStack Start Backend Integration (ref)
blocks: Choice ✓, Goal ✓, How ✓, Why ✓

## File Map
packages/codemod/src/cli.ts → c3-801
packages/codemod/src/index.ts → c3-801
packages/codemod/src/report/** → c3-803
packages/codemod/src/transforms/** → c3-802
packages/lite-devtools-server/src/bin.tsx → c3-602
packages/lite-devtools-server/src/index.ts → c3-601
packages/lite-devtools-server/src/server.ts → c3-601
packages/lite-devtools-server/src/state.ts → c3-601
packages/lite-devtools-server/src/ui.tsx → c3-602
packages/lite-devtools/src/extension.ts → c3-401
packages/lite-devtools/src/index.ts → c3-401
packages/lite-devtools/src/symbols.ts → c3-401
packages/lite-devtools/src/transports/** → c3-402
packages/lite-devtools/src/types.ts → c3-401
packages/lite-extension-otel/src/index.ts → c3-701
packages/lite-hmr/src/index.ts → c3-501
packages/lite-hmr/src/plugin.ts → c3-501
packages/lite-hmr/src/runtime.ts → c3-502
packages/lite-hmr/src/transform.ts → c3-501
packages/lite-hmr/src/types.ts → c3-502
packages/lite-react/src/context.tsx → c3-301
packages/lite-react/src/hooks.ts → c3-301
packages/lite-react/src/index.ts → c3-301
packages/lite/src/atom.ts → c3-202
packages/lite/src/equality.ts → c3-201
packages/lite/src/flow.ts → c3-203
packages/lite/src/preset.ts → c3-205
packages/lite/src/resource.ts → c3-203
packages/lite/src/scope.ts → c3-201
packages/lite/src/service.ts → c3-202
packages/lite/src/tag.ts → c3-204
packages/lite/src/types.ts → c3-201

## Ref Map
ref-tanstack-start-lite-backend
