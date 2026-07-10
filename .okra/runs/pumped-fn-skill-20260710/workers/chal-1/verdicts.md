objective_from_frame: "cold_build_eval_score >= 85% weighted rubric across ~10 novel-domain build tasks proves a repo-distributable skill trains an LLM to design and write pumped-fn code at invoice-triage quality"
cross_model: gpt-5.6-sol challenger vs claude-fable-5 orchestrator
---
hypothesis_id: H-T2
statement: "This task is not solvable by pattern-matching/transplanting invoice-triage; its hidden answer key requires idioms or judgment the example alone cannot supply."
evidence_reviewed:
  - ref: .okra/runs/pumped-fn-skill-20260710/workers/dkr-3/eval-suite-candidate.md:51-60
    quote: "A long-running dispatcher drains ALL pending holds whenever new ones appear ... must not act on a hold whose insert has not committed."
  - ref: examples/invoice-triage/src/store.ts:49-70
    quote: "const accepted = await db.transaction ... outstanding.update ... queueSignal.update"
  - ref: examples/invoice-triage/src/flows.ts:122-135
    quote: "for await ... ctx.changes(queueSignal) ... const batch = await listPending.exec()"
  - ref: examples/invoice-triage/tests/invoice-triage.test.ts:520-558
    quote: "burst-no-loss: enqueue bursts drain from state without dropping invoices"
  - ref: examples/invoice-triage/tests/invoice-triage.test.ts:955-970
    quote: "a second worker settling the same invoice cannot overwrite or double-audit"
kill_attempt: "Rename enqueue→recordReturn, pendingInvoices→holds, importBatch→printBatch, notifier→slipPrinter, and retain queueSignal, state-backed drain, post-commit signaling, stop choreography, seam tests, burst gate, and conflict-safe claim. Conservatively award R1=20, R2=18, R3=15, R5=10, R6=8, R4=6/12 because finish-current-drain differs: 77/83 = 92.8%."
verdict: dead
verdict_evidence: "The reference already supplies the primary I-6/I-7/I-8/I-10 architecture and deterministic proofs. The task's novel printer invariant can be missed while the transplant still exceeds half the applicable weight by 42.8 points."
proposed_next: amend-task-T-2-pair-queue-signal-with-a-boundary-resource-owned-printer-session-and-hard-gate-R1-R4-R5
---
hypothesis_id: H-T1
statement: "This task is not solvable by pattern-matching/transplanting invoice-triage; its hidden answer key requires idioms or judgment the example alone cannot supply."
evidence_reviewed:
  - ref: .okra/runs/pumped-fn-skill-20260710/workers/dkr-3/eval-suite-candidate.md:27-39
    quote: "For each requirement 1-8, state which pumped-fn construct you would use."
  - ref: examples/invoice-triage/src/database.ts:18-25
    quote: "export const database = atom ... ctx.cleanup(() => pool.end())"
  - ref: examples/invoice-triage/src/ports.ts:12-62
    quote: "clock = tag ... queueSignal = atom ... drained = atom ... watch: true"
  - ref: examples/invoice-triage/src/notifier.ts:17-17
    quote: "export const notifier = tag<Notifier>"
  - ref: examples/invoice-triage/src/flows.ts:308-324
    quote: "scheduler.schedule ... overlap ... catchUp"
  - ref: .okra/runs/pumped-fn-skill-20260710/workers/dkr-1/idiom-register.md:89-90
    quote: "resource() entirely ... NOT exercised by invoice-triage"
kill_attempt: "Map serial connection→cleanup atom, site configuration→tag, readings→atom, vent adjustment→flow, notifications→notifier-style port, nightly report→scheduler, safe state→drained-style derived atom, and createScope→bin/tests. Only the water-line resource is absent. R1=0.5 and R2=1 gives (10+18)/38 = 73.7%."
verdict: dead
verdict_evidence: "Seven of eight design rows and the entire graph-boundary answer are directly represented by the example. Missing resource judgment does not keep the transplant below half."
proposed_next: amend-task-T-1-replace-the-eight-row-survey-with-resource-ownership-current-vs-boundary-result-dependent-release-and-resource-watch
---
hypothesis_id: H-T3
statement: "This task is not solvable by pattern-matching/transplanting invoice-triage; its hidden answer key requires idioms or judgment the example alone cannot supply."
evidence_reviewed:
  - ref: .okra/runs/pumped-fn-skill-20260710/workers/dkr-3/eval-suite-candidate.md:70-78
    quote: "prove exactly the catch-up difference between the two jobs"
  - ref: examples/invoice-triage/src/flows.ts:308-324
    quote: "overlap: \"skip\" ... overlap: \"queue\" ... catchUp: \"skip\""
  - ref: examples/invoice-triage/tests/invoice-triage.test.ts:1058-1084
    quote: "cron registration uses deterministic manual ticks without sleeps"
  - ref: examples/invoice-triage/bin/daemon.ts:13-32
    quote: "extensions: [observable.extension(), logging.extension()] ... scheduler.backend"
kill_attempt: "Copy both scheduled-job declarations, the swappable clock, root scheduler backend, ManualBackend/ManualRegistration, scope tests, and observability root. Even awarding zero for R1 policy correctness and R4 lifecycle semantics, R2+R3+R6+R7 = 18+15+8+9 = 50/82 = 61.0%."
verdict: dead
verdict_evidence: "The opposite catch-up policy is novel, but the reusable scheduler/test/root shell alone exceeds half the applicable rubric."
proposed_next: reweight-T-3-make-overlap-catchUp-behavior-and-manual-backend-proofs-pass-gates-before-common-shell-points
---
hypothesis_id: H-T4
statement: "This task is not solvable by pattern-matching/transplanting invoice-triage; its hidden answer key requires idioms or judgment the example alone cannot supply."
evidence_reviewed:
  - ref: .okra/runs/pumped-fn-skill-20260710/workers/dkr-3/eval-suite-candidate.md:90-98
    quote: "untrusted JSON line ... structured logs/traces ... custom extension auditTrail"
  - ref: examples/invoice-triage/src/types.ts:26-48
    quote: "z.string().transform ... JSON.parse ... z.union"
  - ref: examples/invoice-triage/src/flows.ts:158-177
    quote: "catch (err) ... err instanceof ParseError ... rejected += 1"
  - ref: examples/invoice-triage/src/flows.ts:260-280
    quote: "ctx.exec({ fn ... name: \"notifier.send\" ... })"
  - ref: examples/invoice-triage/tests/invoice-triage.test.ts:420-432
    quote: "wrapExec ... ctx.onClose((result) => { closes.push(result) })"
  - ref: examples/invoice-triage/bin/daemon.ts:38-68
    quote: "Promise.allSettled ... ctx.close(failed ? { ok: false ... } : { ok: true })"
kill_attempt: "Reuse the JSON-line parser, ParseError mapping, root observability, named foreign edge, inline wrapExec/onClose extension pattern, deterministic scope tests, and daemon shutdown. With R1 and R5 only half-credit and R2/R3/R4/R6/R7/R8 full, score = 85/100."
verdict: dead
verdict_evidence: "The ring-buffer policy is new, but every surrounding implementation and proof surface is already present. A shallow adaptation reaches the objective threshold exactly."
proposed_next: amend-task-T-4-hard-gate-wrapResolve-wrapExec-ordering-nested-failure-outcomes-and-ring-eviction
---
hypothesis_id: H-T5
statement: "This task is not solvable by pattern-matching/transplanting invoice-triage; its hidden answer key requires idioms or judgment the example alone cannot supply."
evidence_reviewed:
  - ref: .okra/runs/pumped-fn-skill-20260710/workers/dkr-3/eval-suite-candidate.md:110-117
    quote: "consume the progress events ... from the same operation ... forwarding every child progress event"
  - ref: examples/invoice-triage/src/flows.ts:67-110
    quote: "async function* ... execStream ... yield* stream ... await stream.result"
  - ref: examples/invoice-triage/tests/invoice-triage.test.ts:338-387
    quote: "execStream consumption shows progress ... and .result summary"
  - ref: examples/invoice-triage/tests/invoice-triage.test.ts:389-459
    quote: "exec consumption drains generator progress ... abandonment aborts a streaming batch"
kill_attempt: "Rename triage→importRecipe and importBatch→importCollection, retain generator flow, controller child, execStream, yield*, stream.result, awaiting-only test, and abandonment close recorder. Treat prefix transformation and per-child failure isolation as material half-credit deviations in R4/R5: R1+R2+R3+R6+0.5R4+0.5R5 = 72/83 = 86.7%."
verdict: dead
verdict_evidence: "The exact operation topology, dual-consumption contract, stream composition, and abandonment proof are transplantable. The two novel details do not pull the score below half or below 85%."
proposed_next: amend-task-T-5-replace-sequential-child-import-with-a-pull-driven-export-whose-abandonment-prevents-the-next-side-effect-and-hard-gate-the-close-result
---
hypothesis_id: H-T6
statement: "This task is not solvable by pattern-matching/transplanting invoice-triage; its hidden answer key requires idioms or judgment the example alone cannot supply."
evidence_reviewed:
  - ref: .okra/runs/pumped-fn-skill-20260710/workers/dkr-3/eval-suite-candidate.md:129-137
    quote: "derived value atRisk ... recomputes automatically ... Rapid reading bursts may coalesce"
  - ref: examples/invoice-triage/src/ports.ts:31-62
    quote: "keepAlive: true ... controller(outstanding, { resolve: true, watch: true })"
  - ref: examples/invoice-triage/src/flows.ts:139-155
    quote: "for await ... ctx.changes(storedSignal) ... if (count === last) continue"
  - ref: examples/invoice-triage/tests/invoice-triage.test.ts:881-921
    quote: "changes ops view conflates review-count observations during import"
kill_attempt: "Copy keepAlive state atoms, the watched derived atom, a changes-driven monitor loop, last-observed suppression, scope seam tests, and deterministic burst driving. Even assigning R1=0 and R5=0, the common R2+R3+R6 shell scores 41/71 = 57.7%; adapting the shown watch/changes pattern raises it further."
verdict: dead
verdict_evidence: "The custom equality and set-diff judgment are novel, but the rubric awards more than half before either is correct."
proposed_next: amend-task-T-6-require-select-selector-eq-and-ctrl-set-instead-of-the-example-controller-derived-atom
---
hypothesis_id: H-T7
statement: "This task is not solvable by pattern-matching/transplanting invoice-triage; its hidden answer key requires idioms or judgment the example alone cannot supply."
evidence_reviewed:
  - ref: .okra/runs/pumped-fn-skill-20260710/workers/dkr-3/eval-suite-candidate.md:149-155
    quote: "single unit-of-work object ... created fresh ... shared by that execution's whole call tree"
  - ref: .okra/runs/pumped-fn-skill-20260710/workers/dkr-1/idiom-register.md:89-90
    quote: "resource() entirely ... Invoice-triage does transactions via db.transaction(...) inside flows"
  - ref: examples/invoice-triage/src/store.ts:84-115
    quote: "factory: ... db.transaction(async (tx) => ...)"
  - ref: examples/invoice-triage/tests/invoice-triage.test.ts:342-359
    quote: "createScope ... presets: [preset(database ...)]"
kill_attempt: "Use the example's inline db.transaction, controller child flows, composition root, seam tests, deterministic concurrent contexts, and clean style. This fails the central resource ownership requirement, so assign R1=0 and R4=0. R2+R3+R6 still scores 18+15+8 = 41/73 = 56.2%."
verdict: dead
verdict_evidence: "The task itself asks for an example-absent construct, but the applicable rubric lets an implementation that completely misses it exceed the forced kill threshold."
proposed_next: reweight-T-7-make-resource-R1-and-result-bound-R4-independent-pass-gates
---
hypothesis_id: H-T8
statement: "This task is not solvable by pattern-matching/transplanting invoice-triage; its hidden answer key requires idioms or judgment the example alone cannot supply."
evidence_reviewed:
  - ref: .okra/runs/pumped-fn-skill-20260710/workers/dkr-3/eval-suite-candidate.md:167-175
    quote: "delivers the alert through EVERY registered delivery channel ... tags.all ... tags.optional"
  - ref: examples/invoice-triage/src/notifier.ts:4-17
    quote: "interface Notifier ... export const notifier = tag<Notifier>"
  - ref: examples/invoice-triage/src/flows.ts:237-280
    quote: "notifier: tags.required(notifier) ... name: \"notifier.send\""
  - ref: examples/invoice-triage/tests/invoice-triage.test.ts:924-952
    quote: "notifier(collecting(messages)) ... expect(messages)"
  - ref: .okra/runs/pumped-fn-skill-20260710/workers/dkr-1/idiom-register.md:92-93
    quote: "tags.optional / tags.all ... example uses only tags.required and default"
kill_attempt: "Copy the notifier port, root binding, collecting fake, named foreign edge, seam tests, and error-visible tracing, but retain one required notifier and therefore fail multiplicity. Even with R1=0 and R8=0, R2+R3+R6+R7 = 50/78 = 64.1%."
verdict: dead
verdict_evidence: "The example cannot supply tags.all/tags.optional, yet the rubric still awards a majority to the single-channel transplant."
proposed_next: reweight-T-8-make-tags-all-fanout-and-tags-optional-absence-behavior-pass-gates
---
hypothesis_id: H-T9
statement: "This task is not solvable by pattern-matching/transplanting invoice-triage; its hidden answer key requires idioms or judgment the example alone cannot supply."
evidence_reviewed:
  - ref: .okra/runs/pumped-fn-skill-20260710/workers/dkr-3/eval-suite-candidate.md:187-194
    quote: "invocation should be staged ONCE and re-executed up to maxAttempts"
  - ref: .okra/runs/pumped-fn-skill-20260710/workers/dkr-1/idiom-register.md:92-92
    quote: "prepare() / step.ready ... example only uses .exec/.execStream"
  - ref: examples/invoice-triage/tests/invoice-triage.test.ts:83-118
    quote: "scripted(outputs) ... gated(outputs)"
  - ref: examples/invoice-triage/src/flows.ts:260-280
    quote: "ctx.exec ... name: \"notifier.send\" ... throw error"
  - ref: examples/invoice-triage/tests/invoice-triage.test.ts:420-432
    quote: "wrapExec ... ctx.onClose"
kill_attempt: "Reuse scripted foreign-client fakes, named ctx.exec, extension wrapper, scope tests, structured errors, tags, and clean roots, while implementing retry with repeated direct exec rather than prepare. Even with R1=0, R4=0, and R8=0, R2+R3+R6+R7 = 50/90 = 55.6%."
verdict: dead
verdict_evidence: "Prepare semantics are genuinely absent from the example, but missing them does not keep the solution below the forced majority threshold."
proposed_next: reweight-T-9-make-prepare-stage-once-and-error-class-gated-retry-pass-gates
---
hypothesis_id: H-T10
statement: "This task is not solvable by pattern-matching/transplanting invoice-triage; its hidden answer key requires idioms or judgment the example alone cannot supply."
evidence_reviewed:
  - ref: .okra/runs/pumped-fn-skill-20260710/workers/dkr-3/eval-suite-candidate.md:206-213
    quote: "newline-delimited JSON on stdin, two accepted shapes ... Valid records pass to an appendEntry operation"
  - ref: .okra/runs/pumped-fn-skill-20260710/workers/dkr-3/eval-suite-candidate.md:207-209
    quote: "\"at\": ISO datetime string ... current date for defaulting a missing at"
  - ref: examples/invoice-triage/src/adapters/stdin.ts:4-9
    quote: "intakeLines = atom ... createInterface({ input: process.stdin })"
  - ref: examples/invoice-triage/src/types.ts:26-48
    quote: "JSON.parse ... z.union"
  - ref: examples/invoice-triage/src/flows.ts:158-177
    quote: "for await (const line of lines) ... err instanceof ParseError"
  - ref: examples/invoice-triage/bin/server.ts:51-64
    quote: "if (error instanceof ParseError) ... context.json"
kill_attempt: "Copy the stdin transport atom, zod union parsing, ParseError boundary catch, clock tag, typed internal flow, summary counters, and entrypoint. Conservatively award R2=18, R6=8, and only half R8=4, with R1=0: 30/54 = 55.6%."
verdict: dead
verdict_evidence: "The exact input and boundary topology is example-borne and already exceeds half without primitive-selection credit. The prompt also contradicts itself by making at required in the accepted shape while requiring a missing-at default."
proposed_next: kill-task
---
hypothesis_id: H-RUBRIC
statement: "The rubric (weights 20/18/15/12/10/8/9/8, gate semantics, tier multipliers 0.5/0.75/1.0/1.25, suite formula /9.75) measures skill-taught competence and cannot be gamed to 85% by shallow output."
evidence_reviewed:
  - ref: .okra/runs/pumped-fn-skill-20260710/workers/dkr-1/idiom-register.md:111-124
    quote: "R1+R2 are gating"
  - ref: .okra/runs/pumped-fn-skill-20260710/workers/dkr-3/eval-suite-candidate.md:243-255
    quote: "R1 Primitive selection 20 ... R2 Graph visibility 18 ... scores renormalize"
  - ref: .okra/runs/pumped-fn-skill-20260710/workers/dkr-3/eval-suite-candidate.md:257-267
    quote: "G1 lint-zero ... G5 format ... any applicable gate failure ⇒ task score = 0"
  - ref: .okra/runs/pumped-fn-skill-20260710/workers/dkr-3/eval-suite-candidate.md:269-285
    quote: "task_score(t) = gate(t) × rubric(t) ... Σ tier_mult = ... 9.75"
  - ref: .okra/runs/pumped-fn-skill-20260710/workers/dkr-3/eval-suite-candidate.md:263-264
    quote: "script counts test names against a per-task manifest ... scripted smoke"
kill_attempt: "R1 and R2 do not gate: G1-G5 contain no primitive-selection or graph-visibility gate, and the formula is additive. A gate-clean solution receiving full R1/R2/R3/R6/R7/R8 but only half R4/R5 scores, by task, 100.0, 86.75, 92.68, 89.0, 86.75, 92.96, 91.78, 100.0, 93.33, 100.0; tier-weighted suite score = 92.70%. This output can have right declarations, visible deps, seam-shaped tests, lint cleanliness, named edges, and error classes while materially deviating on lifecycle and state semantics. G3's name counting permits shallow assertions to stay green."
verdict: dead
verdict_evidence: "The claimed R1+R2 gating is absent from the executable gates and formula. The 85% anti-gaming claim is contradicted by a 92.70% shallow-semantic scoring vector. The arithmetic claim about one zeroed C task is correct: 100/9.75 = 10.256 points, so the stated approximately 10.3-point sensitivity holds, but that does not rescue the compound hypothesis."
proposed_next: reweight-make-R1-and-R2-true-pass-gates-and-make-G3-check-semantic-assertions-while-retaining-9.75-and-the-10.3-point-sensitivity
---
hypothesis_id: H-COVERAGE
statement: "The 10 tasks collectively cover the register's AG-2 mandates (resource-centric, port-multiplicity, prepare/retry, queue+signal, scheduler, shutdown, derived state, parse-at-boundary, observability, streaming) with no major taught surface unexamined."
evidence_reviewed:
  - ref: .okra/runs/pumped-fn-skill-20260710/workers/dkr-3/eval-suite-candidate.md:219-233
    quote: "resource-centric T-7 ... port multiplicity T-8 ... prepare/retry T-9 ... streaming/generator flows T-5"
  - ref: .okra/runs/pumped-fn-skill-20260710/workers/dkr-1/idiom-register.md:89-99
    quote: "resource controllers with watch ... select(atom, selector, { eq }) ... GC options ... incremental adoption ... seekTag/getTag"
  - ref: .okra/runs/pumped-fn-skill-20260710/workers/dkr-1/idiom-register.md:101-109
    quote: "skill should teach every ring-(a)-(e) idiom ... separately cover the 10 concept-only surfaces above"
  - ref: .okra/runs/pumped-fn-skill-20260710/workers/dkr-3/eval-suite-candidate.md:5-6
    quote: "scope constraint honored: React and Hono adapter surfaces excluded"
kill_attempt: "The named ten mandates all have at least one answer-key assignment, so nominal coverage survives. Attack the broader clause: no task examines resource-controller watch, select/selector equality, GC/flush, incremental-adoption shape, or parent-chain tag reads. React/Hono are explicitly excluded, but no evidence defines whether the remaining omissions are non-major or ratified out of scope."
verdict: drifted
verdict_evidence: "The enumerated mandate list is covered, but 'no major taught surface unexamined' cannot be supported against the register's explicit concept-only teaching obligation. Missing evidence: a ratified major-surface definition or explicit exclusions for resource-watch, select, GC/flush, incremental adoption, and parent-chain tag reads."
proposed_next: amend-task-set-add-select-eq-resource-watch-and-GC-flush-coverage-or-ratify-those-surfaces-out-of-scope
---
summary: "0 intact, 1 drifted, 11 dead"
ratification_notes:
  - "Do not freeze the denominator: all ten task hypotheses fail the explicit more-than-half transplant test."
  - "T-2 and T-5 are direct mechanism replays; T-7 through T-9 contain genuinely novel constructs but still die because common R2/R3/R6/R7 weight exceeds half."
  - "R1 and R2 are described as gating but are not executable gates; the shallow-semantic probe scores 92.70%."
  - "Strict-zero sensitivity is arithmetically correct at approximately -10.3 points per zeroed C task, but G3 test-name counting and G4 all-or-nothing treatment need ratification."
  - "T-10 has a required-at versus missing-at-default contradiction; broader coverage also needs an explicit decision on select, resource-watch, GC/flush, adoption, and parent-chain tag surfaces."