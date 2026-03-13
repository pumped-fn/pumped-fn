# C3 Structural Index
<!-- hash: sha256:b6245a7b64c563079e0be675fd2a2aea259a83df3a98d9517035c50c242f70ba -->

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
blocks: Goal ○

## adr-20260313-harden-lite-types-issue-241 — Harden Lite Type Contracts for Issue 241 (adr)
blocks: Goal ✓

## c3-0 — pumped-fn System Overview (context)
reverse deps: c3-10, c3-2, c3-3, c3-4, c3-5, c3-6, c3-7, c3-8, c3-9
blocks: Abstract Constraints ○, Containers ✓, Goal ✓

## c3-10 — codemod (container)
context: c3-0
constraints from: c3-0
blocks: Complexity Assessment ○, Components ○, Goal ✓, Responsibilities ○

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
reverse deps: c3-401, c3-402, c3-403, c3-404, c3-405
constraints from: c3-0
blocks: Complexity Assessment ○, Components ○, Goal ✓, Responsibilities ✓

## c3-401 — extension (component)
container: c3-4 | context: c3-0
constraints from: c3-0, c3-4
blocks: Container Connection ✓, Dependencies ✓, Goal ○, Related Refs ○

## c3-402 — transports (component)
container: c3-4 | context: c3-0
constraints from: c3-0, c3-4
blocks: Container Connection ✓, Dependencies ✓, Goal ○, Related Refs ○

## c3-403 — devtools-runtime (component)
container: c3-4 | context: c3-0
constraints from: c3-0, c3-4
blocks: Container Connection ○, Dependencies ○, Goal ✓, Related Refs ○

## c3-404 — transports (component)
container: c3-4 | context: c3-0
constraints from: c3-0, c3-4
blocks: Container Connection ○, Dependencies ○, Goal ✓, Related Refs ○

## c3-405 — devtools-runtime (component)
container: c3-4 | context: c3-0
constraints from: c3-0, c3-4
blocks: Container Connection ○, Dependencies ○, Goal ✓, Related Refs ○

## c3-5 — Lite HMR Plugin (@pumped-fn/lite-hmr) (container)
context: c3-0
reverse deps: c3-501, c3-502, c3-503, c3-504
constraints from: c3-0
blocks: Complexity Assessment ○, Components ○, Goal ✓, Responsibilities ✓

## c3-501 — plugin (component)
container: c3-5 | context: c3-0
constraints from: c3-0, c3-5
blocks: Container Connection ✓, Dependencies ✓, Goal ○, Related Refs ○

## c3-502 — runtime (component)
container: c3-5 | context: c3-0
constraints from: c3-0, c3-5
blocks: Container Connection ✓, Dependencies ✓, Goal ○, Related Refs ○

## c3-503 — hmr-runtime (component)
container: c3-5 | context: c3-0
constraints from: c3-0, c3-5
blocks: Container Connection ○, Dependencies ○, Goal ✓, Related Refs ○

## c3-504 — hmr-runtime (component)
container: c3-5 | context: c3-0
constraints from: c3-0, c3-5
blocks: Container Connection ○, Dependencies ○, Goal ✓, Related Refs ○

## c3-6 — Lite Devtools Server (@pumped-fn/lite-devtools-server) (container)
context: c3-0
reverse deps: c3-601, c3-602, c3-603, c3-604, c3-605
constraints from: c3-0
blocks: Complexity Assessment ○, Components ○, Goal ✓, Responsibilities ✓

## c3-601 — server (component)
container: c3-6 | context: c3-0
constraints from: c3-0, c3-6
blocks: Container Connection ✓, Dependencies ✓, Goal ○, Related Refs ○

## c3-602 — dashboard (component)
container: c3-6 | context: c3-0
constraints from: c3-0, c3-6
blocks: Container Connection ✓, Dependencies ✓, Goal ○, Related Refs ○

## c3-603 — server-state (component)
container: c3-6 | context: c3-0
constraints from: c3-0, c3-6
blocks: Container Connection ○, Dependencies ○, Goal ✓, Related Refs ○

## c3-604 — terminal-ui (component)
container: c3-6 | context: c3-0
constraints from: c3-0, c3-6
blocks: Container Connection ○, Dependencies ○, Goal ✓, Related Refs ○

## c3-605 — dashboard-runtime (component)
container: c3-6 | context: c3-0
constraints from: c3-0, c3-6
blocks: Container Connection ○, Dependencies ○, Goal ✓, Related Refs ○

## c3-7 — Lite Extension OTel (@pumped-fn/lite-extension-otel) (container)
context: c3-0
reverse deps: c3-701, c3-702, c3-703
constraints from: c3-0
blocks: Complexity Assessment ○, Components ○, Goal ✓, Responsibilities ✓

## c3-701 — extension (component)
container: c3-7 | context: c3-0
constraints from: c3-0, c3-7
blocks: Container Connection ✓, Dependencies ✓, Goal ○, Related Refs ○

## c3-702 — otel-extension (component)
container: c3-7 | context: c3-0
constraints from: c3-0, c3-7
blocks: Container Connection ○, Dependencies ○, Goal ✓, Related Refs ○

## c3-703 — tracing-extension (component)
container: c3-7 | context: c3-0
constraints from: c3-0, c3-7
blocks: Container Connection ○, Dependencies ○, Goal ✓, Related Refs ○

## c3-8 — codemod (container)
context: c3-0
reverse deps: c3-801, c3-802, c3-803, c3-804
constraints from: c3-0
blocks: Complexity Assessment ✓, Components ○, Goal ○, Responsibilities ✓

## c3-801 — cli (component)
container: c3-8 | context: c3-0
constraints from: c3-0, c3-8
blocks: Container Connection ✓, Dependencies ✓, Goal ○, Related Refs ○

## c3-802 — transforms (component)
container: c3-8 | context: c3-0
constraints from: c3-0, c3-8
blocks: Container Connection ✓, Dependencies ✓, Goal ○, Related Refs ○

## c3-803 — reporting (component)
container: c3-8 | context: c3-0
constraints from: c3-0, c3-8
blocks: Container Connection ✓, Dependencies ✓, Goal ○, Related Refs ○

## c3-804 — migration-runtime (component)
container: c3-8 | context: c3-0
constraints from: c3-0, c3-8
blocks: Container Connection ○, Dependencies ○, Goal ✓, Related Refs ○

## c3-9 — codemod (container)
context: c3-0
reverse deps: c3-901
constraints from: c3-0
blocks: Complexity Assessment ○, Components ○, Goal ✓, Responsibilities ○

## c3-901 — transforms (component)
container: c3-9 | context: c3-0
constraints from: c3-0, c3-9
blocks: Container Connection ○, Dependencies ○, Goal ✓, Related Refs ○

## File Map
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

