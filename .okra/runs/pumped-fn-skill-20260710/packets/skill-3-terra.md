# Role: OKRA writer (progression worker) — skill v3 (SKILL-3): trap corpus + scheduler fix

You are the OKRA writer updating the pumped-fn skill you previously authored and revised. Execute exactly this packet; write ONLY under skills/pumped-fn/. Your output will be deterministically re-gated (VAL-3) — no self-certification. Unknowns → questions_unanswered.

Working dir: the git worktree (current dir).

## Fix 1 — the open VAL-2 defect (extensions.md e3)
The scheduler snippet imports @pumped-fn/lite-extension-scheduler as if plainly installable. Reality (verified by workers/val-2/audit.md and workers/pkr-t3/): the published/packed package peers on @pumped-fn/lite ^3.1.0 (lite is 4.0.0) and npm-pack tarballs carry unresolvable catalog: deps — installation needs a pnpm-packed tarball + --legacy-peer-deps today. Rewrite the scheduler section so a cold session succeeds: keep the API teaching (scheduler.schedule({name, cadence, overlap, catchUp, flow, input}), backend-as-tag), state the install caveat in one compact note, and teach the PROVEN pattern from workers/pkr-t3/reference-solution/: the shipped inProcess() backend accepts only catchUp:"skip" — durable catch-up ("last"/"all") requires implementing a Scheduler.Backend (injected store + clock); include a minimal correct backend skeleton verified against the scheduler package's d.mts (probe pkg/ext/scheduler/dist or the packed tarball in workers/pkr-t3/harness/tarballs/). Also add: queued catch-up ticks open contexts via ctx.scope.createContext, so `await registration.stop()` BEFORE `scope.dispose()`.

## Fix 2 — fold in the trap corpus from six independent task builders (all probe-verified; cite-check each against the named source before writing)
Add these to SKILL.md's trap list and/or the right reference (keep each terse — rule + why + micro-snippet where needed):
1. fn edges: ctx.exec({fn, params: [], name}) — params REQUIRED even for zero-arg fns; PATTERNS.md's own snippet omits it (runtime: "params is not iterable"). [already partially in v2 — verify it names the params-required rule explicitly]
2. isFault(flow, error) matches error.flow === flow.name: gate retries on error.fault.code with the FLOW OBJECT; a deps handle or controller(child,{name}) rename silently misclassifies. (workers/pkr-t9)
3. prepare() is runtime-transparent: options captured once, but parse/deps/wrapExec run per exec attempt — no once-staged runtime signal; treat staging-site uniqueness as a code-review DO. (workers/pkr-t9, scope.ts:1120-1134)
4. tags.all asymmetry: in ATOM deps it collects every scope binding; in FLOW deps it dedupes per context level — registry-atom is the fan-out pattern. Array-of-flows tag bindings type-project but throw at exec (projectTagValue doesn't recurse arrays). (workers/pkr-t8)
5. set vs update on controllers: behaviorally indistinguishable for resolved atoms — prefer ctrl.set(wholeValue) for whole-state replacement as a readability DO, not a correctness claim. (workers/pkr-t6)
6. no-scope-argument flags EXPORTED scope-taking functions even in composition-path files: export pure functions; wire scope.select/scope.exec inline at roots. Composition-filename allowance is exact (bin/main.ts yes; bin/monitor.ts no) — name entry files main/server/daemon-style per the lint list. (workers/pkr-t6, workers/pkr-t4 wire.ts note)
7. no-module-state fires on module-level lookup TABLES closed over by factories — make them functions. no-unattributed-await fires on awaited port-client methods in factories — wrap in named fn edges. setTimeout counts as ambient IO even in bin/. (workers/pkr-t5, pkr-t9)
8. atom() rejects a name key (flows accept name; atoms don't). (workers/pkr-t1)
9. wrapResolve naming: resources carry .name; atoms are named via named factory function expressions (event.target.factory.name). wrapExec sees fn edges under ctx.name with ctx.parent?.name attribution; record after `await next()` for completion order. (workers/pkr-t4)
10. Resource-to-resource watch: watch in RESOURCE deps watches an upstream RESOURCE; atom-watch belongs in atom deps (runtime-enforced, scope.ts:1000-1027). The atom→resource bridge is a self-re-establishing resource holding an owner-bound subscription; graph-driven re-establishment is LAZY (closes old, opens on next use). (workers/pkr-t10)

## Fix 3 — review.md
Add preference-tier DOs surfaced this round: single prepare() staging site; ctrl.set for whole-value replacement; await registration.stop() before dispose; named factory function expressions for observability. Keep the two-tier structure intact.

## Verification you must run yourself (report outputs; VAL-3 will replay)
Every NEW/CHANGED snippet: typecheck against the pinned lite tarball workspace (workers/dkr-5/harness/workspace-template + tarball) — and the scheduler skeleton against the scheduler tarball workers/pkr-t3/harness/tarballs/pumped-fn-lite-extension-scheduler-0.2.0.tgz with --legacy-peer-deps. Keep files within ratified size budgets.

## Output (final message)
Files changed with sizes; per-fix: what changed + the source you cite-checked; snippet-verification command outputs (verbatim exit lines); questions_unanswered.
