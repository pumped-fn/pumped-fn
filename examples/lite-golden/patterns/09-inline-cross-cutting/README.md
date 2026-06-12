# 09 - Inline Cross-Cutting
## Smell
Business handlers hand-place start logs, duration calculations, success fields, and error fields around every operation.
## Harm
Instrumentation becomes boilerplate inside the business path, so missing logs or inconsistent fields are hard to audit and every new branch must remember the same cross-cutting work.
## Provenance
- MetaMask/core, `packages/perps-controller/src/services/TradingService.ts`, https://github.com/MetaMask/core/blob/fc728c212bcc8ff5fa7f81d6ba0595bc383e5af4/packages/perps-controller/src/services/TradingService.ts#L454, MIT: trading service operations repeatedly calculate durations and emit analytics/metrics on success and failure.
- stacks-sbtc/sbtc, `docker/stacker/stacking/stacking.ts`, https://github.com/stacks-sbtc/sbtc/blob/b4014f78cffd426b2dc7119879c7397df73891ea/docker/stacker/stacking/stacking.ts#L24, GPL-3.0: stacking automation interleaves logger calls through account and transaction branches.
## Transformation
`before.ts` wraps each handler in local timing and logging. `after.ts` moves that concern into a lite `Extension`: `wrapExec` records execution names, durations, and ok/error status; `wrapResolve` records atom/resource resolution; `init` seeds trace context and `dispose` closes the lifecycle.
## Lens coverage
inside-out, outside-in, and effect-managed are all present. The extension is tested directly, through a nested execution tree, and through init/dispose lifecycle behavior.
## Why 100% is natural
The product branches are init success/failure, seeded versus absent trace tags, transformed versus pass-through exec output, and success versus thrown execs. The named tests reach each branch through `createScope`, `ctx.exec`, `scope.resolve`, `ctx.resolve`, `scope.ready`, and `scope.dispose`.
