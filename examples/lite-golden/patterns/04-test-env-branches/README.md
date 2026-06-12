# 04 - Test-Env Branches
## Smell
Product code changes behavior when it detects the test environment, usually to skip filesystem writes, suppress reporting, or run fixture-only paths.
## Harm
One environment can never cover the other environment's dead branch, so tests either miss shipped behavior or assert behavior that production never runs.
## Provenance
| Repo | File | License | Adaptation |
|---|---|---|---|
| vercel/next.js | `packages/next-codemod/transforms/middleware-to-proxy.ts` - https://github.com/vercel/next.js/blob/a9e076d5af0c415d21ba725ff81ddbbdb6c0f524/packages/next-codemod/transforms/middleware-to-proxy.ts#L41-L50 and https://github.com/vercel/next.js/blob/a9e076d5af0c415d21ba725ff81ddbbdb6c0f524/packages/next-codemod/transforms/middleware-to-proxy.ts#L526-L538 | MIT | Codemod file selection and filesystem behavior diverge under test; `before.ts` paraphrases that as fixture-only conversion versus real write/remove work. |
| gatsbyjs/gatsby | `packages/gatsby/src/redux/actions/restricted.ts` - https://github.com/gatsbyjs/gatsby/blob/1f38c85963fd6bcfa9ccee2f925e5e02b00eafbb/packages/gatsby/src/redux/actions/restricted.ts#L485-L501 | MIT | Restricted-action validation suppresses panic reporting under test; `before.ts` includes a reporting branch that disappears in the test path. |
## Transformation
The receipt store is an `atom`, receipt submission is one `flow`, and environment variation moves to `createScope` with `preset(deliveryStore, double)`. Product code has one path and exports only the real ledger-sequencing implementation plus its types; the double is defined in the test file against the exported `ReceiptStore` interface. Composition decides which edge implementation serves that scope.
## Lens coverage
inside-out and outside-in are present. effect-managed is absent because this pattern changes configuration topology, not owned effects.
## Why 100% is natural
The before shape has two unreachable branches per environment: test-only fixture behavior and shipped write/report behavior. `after.ts` has zero environment branches; tests cover the real in-memory store including its distinguishing ledger sequencing past the nominal case (a second submission confirms `stored:2:...`), the test-defined preset double, the source grep assertion, and the same flow diverging only by scope construction.
