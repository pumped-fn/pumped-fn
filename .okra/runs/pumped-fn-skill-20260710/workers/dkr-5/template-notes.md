# DKR-5 template notes — what generalizes to the other 9 tasks

worker dkr-5 · run pumped-fn-skill-20260710 · 2026-07-10

## Verdict on the spike question

Executable task validity IS buildable at moderate cost. One task end-to-end (task prompt,
answer key, harness, reference solution through 5 gates, 2 adversarial disproofs) took
~40 min wall clock, of which the reusable harness (~15 min) is one-time. Marginal cost
per additional task ≈ 20-25 min: task prompt + reference solution + checker scenarios +
one mimicry adversarial.

## Reusable checker skeleton (harness/check-t7.mjs)

Structure that generalizes verbatim:

1. Copy checker INTO the workspace, run `node --import tsx check-t7.mjs` from workspace
   root — bare `@pumped-fn/lite` imports then resolve to the workspace's tarball install,
   and the checker shares the module instance (same resolved URL) with the solution.
2. `const mod = await import("./src/<entry>.ts")` — dynamic import so a missing export is
   a granular check failure, not a link-time abort of the whole run.
3. Helpers: `check(id, fn)` try/catch accumulator; `eq` via JSON.stringify; `session(run)`
   creating a FRESH `createScope()` + context per scenario (isolation between checks
   — and module-level state in a bad solution then shows up as cross-scenario bleed,
   which is a feature: it caught the transplant on 4 extra checks);
   `rejectionWithCode(promise, code)` that walks `message`/`fault`/`cause` chain — this
   accepts both the idiomatic `ctx.fail(fault)` (FlowFault) and domain error classes,
   keeping the TASK prompt API-neutral.
4. Verdict: JSON `{checks, errors, failed}` to stdout, exit 1 on any fail. Deterministic;
   zero LLM involvement (AG-3).

## Atomic-check taxonomy (from chal-2's H2-GRADEABILITY fix)

- declaration → `isFlow(mod.x)` on prescribed exports (`decl-*`)
- behavior → real exec on fresh scope (`b*`)
- reachability → make staging the ONLY data channel (sub-flow returns a summary, full
  detail must appear in the committed output) — reachability becomes a behavior check
- negative → failure paths must leave state untouched (`n*`, `b6*`)
- persistence/topology → cross-context reads (`p1`)

Key design trick that gives the checker teeth: pick observables that only the correct
lifecycle can produce — (a) commit visible after the operation returns but the parent
context still open (kills boundary ownership / commit-at-session-end), (b) staged-count
per operation (kills shared/module staging), (c) spec-ordered failure in phase 2 so
staging necessarily precedes the crash (kills eager commit), (d) round number assigned at
publication (kills precomputed ids under concurrency).

## Scaffold layout (lint-safe, from dkr-4's note — held in practice)

- `src/<domain>.ts` (product), `tests/*.test.ts`, `bin/main.ts` (composition allowance).
- No product code under `tests|infra|transport|adapters` dirs; no handle names containing
  ambient substrings (checked: ledger, workspace, pairing, byeStep, seeded all clean).
- Gates: `node <main>/pkg/tool/lint/dist/cli.mjs --max-warnings 0 src bin tests`,
  `tsgo --noEmit`, `vitest run`, `tsx bin/main.ts`, checker. All five green on reference
  (gates/reference-gates.log).

## API surprises found (feed the skill content)

1. **`no-direct-flow-composition` (error tier):** `ctx.exec({flow: child})` inside a flow
   factory is FORBIDDEN by lint. Idiom: `deps: { child: controller(childFlow) }` then
   `child.exec({input})`. The skill MUST teach controller-based flow composition; PATTERNS
   shows it but a cold session reaching for `ctx.exec` writes lint-failing code. (Nested
   current-owned sharing works identically through the controller handle.)
2. **`no-untyped-throw` (warn tier, fatal under --max-warnings 0):** `throw new Error()`
   in factories is a diagnostic. Idiom: `flow({ faults: typed<Fault>() })` +
   `return ctx.fail({code, ...})`. FlowFault exposes `.fault`, so failure contracts should
   be phrased as "code recoverable from message/fault/cause" to stay API-neutral in tasks.
3. **Round-number-at-commit:** onClose handlers run serialized at operation close;
   assigning sequence numbers inside onClose is what makes concurrent siblings produce
   consecutive numbers. Result values cannot contain the committed number (factory returns
   before close) — task contracts must not ask for it in the return value.
4. **`parse: typed<void>()`** needed for no-input flows, else `exec` demands an `input`.
5. **exec resolves only after the operation context fully closes** (onClose + cleanups
   done) — commit-visibility-after-return is a sound check.

## Workspace/env facts

- `npm pack` on pkg/core/lite does NOT rebuild (no prepack script) — safe under AG-4.
  Tarball: pumped-fn-lite-4.0.0.tgz sha256
  16001d130626e01b58d178c28f32250000dfb830b8df5620a02d690cefaee58a.
- npm blocked postinstall scripts (allow-scripts policy) but tsx/esbuild and tsgo still
  work (platform binaries via optional deps). Install ~30s; whole gate suite ~10s.
- Template hardcodes the main-checkout lint path — fine for this machine; a distributable
  harness should carry the lint package as a second tarball.
- Observed mid-run: `pkg/tool/lint/dist/cli.mjs` mtime changed (another concurrent worker
  or process touched main's dist); one lint invocation transiently failed MODULE_NOT_FOUND,
  retry was clean with 0 diagnostics. Flag: main-checkout dists are a shared mutable
  dependency across workers — pin by copying into harness/tarballs for future tasks.

## Cut lines / not done (budget)

- No second-tier adversarial (hand-rolled non-resource behavioral twin) — recorded as
  residual risk in answer-key.md; chal-3 material.
- Checker does not verify lint/tsgo/tests itself (those are separate gates); a wrapper
  `run-all-gates.sh` would be ~15 lines and should exist in the generalized harness.
- Template devDependency versions are ranges, not lockfile-pinned; determinism across
  months is not guaranteed. Pin via `npm shrinkwrap` in the generalized harness.
