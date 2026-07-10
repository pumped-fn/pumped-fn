# Design-trace rubric

For every edge ask: where is it declared, who owns it, how does a test replace it, and how does it close? Lint catches syntax-shaped violations; the rest is reviewer judgment.

## Machine-checked DON'Ts

| Rule | Why | Violation |
|---|---|---|
| `pumped/no-ambient-io-outside-boundary` | effects stay controlled | `fetch`/timer/random in feature factory |
| `pumped/no-ctx-argument` | ctx is not a hidden helper parameter | passing `ctx` to a product helper |
| `pumped/no-definition-handle-suffix` | kind is inferred | `queueAtom`, `sendFlow` |
| `pumped/no-direct-flow-composition` | child edge stays visible/presettable | flow-body `ctx.exec({ flow: child })` |
| `pumped/no-handle-spread` | preserve handle identity/presets | `{ ...flow, tags }` |
| `pumped/no-implicit-tag-read` | ambient input is declared | undeclared `ctx.data.seekTag(x)` |
| `pumped/no-internal-example-label` | public vocabulary stays current | stale internal example label |
| `pumped/no-jsdom-backend` | browser tests use supported mode | jsdom observer backend |
| `pumped/no-module-mocks` | scope is one seam | `vi.mock`, `jest.mock`, `vi.spyOn` |
| `pumped/no-module-state` | state is materialized/presettable | mutable module variable closed over by node |
| `pumped/no-naked-globals` | ambient effects become edges | `Date.now`, env, fs in factory |
| `pumped/no-render-outside-browser-test` | browser test boundary is explicit | Testing Library render in node test |
| `pumped/no-react-local-state` | graph owns graph state | `useState` mirroring an atom |
| `pumped/no-react-manual-execution-context` | UI boundary owns context | component creates/closes context |
| `pumped/no-react-use-execution-context` | UI invokes flows declaratively | feature calls `useExecutionContext` |
| `pumped/no-react-use-scope` | feature does not own composition | feature calls `useScope` |
| `pumped/no-scope-argument` | roots own scope | exported helper accepts scope |
| `pumped/no-scope-reach` | factories do not create boundaries | `ctx.scope.createContext()` in factory |
| `pumped/no-shared-scope-factory` | each root declares composition | `makeScope()` helper |
| `pumped/no-swallowed-error` | failure remains observable | empty/discarding catch |
| `pumped/no-test-only-branches` | tests substitute edges | `if (isTest)` product branch |
| `pumped/no-unattributed-await` | foreign effects get spans | `await deps.client.send()` |
| `pumped/no-untyped-throw` | planned faults are structured | `throw new Error()` in factory |
| `pumped/prefer-destructured-deps` | edges scan at the signature | `factory: (_, deps) => deps.db` |

## Preference-tier DO/DON'Ts

| Rule | Why | Violation |
|---|---|---|
| DO transport -> capability -> feature | effects remain traceable | feature imports process/network client |
| DO resource ownership by user boundary | lifecycle is honest | request tx as atom; `current` mistaken for sibling-shared |
| DO state for work, stream for view/wakeup | conflation cannot lose work | queue items only in `changes`/stream |
| DO signal after durable commit | consumers see committed work | signal increment before transaction commit |
| DO atomic aggregate writes | retries/races stay controlled | row and audit write in separate commits |
| DO parse at boundary, typed internally | trusted paths avoid runtime cost | zod parses internal handoff |
| DO child flow controller deps | composition is visible | same-file hidden `ctx.exec({ flow })` |
| DO named `ctx.exec({ fn, name })` foreign calls | observability has edges | direct awaited client method |
| DO root extensions | policy is consistent | logging/spans in each flow |
| DO explicit request tags, no ALS | context is testable | ambient request lookup |
| DO deterministic gates/manual ticks | tests prove ordering | `setTimeout` sleep test |
| DO assert close and recovery | lifecycle failure is testable | only output assertion after abort/crash |
| DO atom-watch only in atom deps; resource-watch only in resource deps | invalidation ownership is valid | atom watch in resource/flow deps |
| DO remember select `eq` only suppresses notification | performance reasoning stays correct | claim selector stops recomputing |
| DO `prepare()` for staged/retry/fanout | no work/span before execution | eager child exec to stage loop |
| DO bounded drain and keep-alive signals | memory/liveness stay controlled | drain infinite feed; GC'd wake signal |
| DON'T facade objects or ceremony generics | graph remains directly consumable | `{ run, stop }` facade; `atom<Port>` |
| DON'T hand-write inferable wiring types | types reflect graph | interface repeating inferred factory output |
| DO named types at transfer boundaries | contracts stay clear | named glue type for local deps |
