objective_from_frame: "cold_build_eval_score >= 85% weighted rubric across ~10 novel-domain build tasks proves a repo-distributable skill trains an LLM to design and write pumped-fn code at invoice-triage quality"
cross_model: gpt-5.6-sol challenger vs claude-fable-5 orchestrator
---
hypothesis_id: H2-T1
statement: "Under G6, this task cannot be passed by an invoice-triage transplant, and its differentiators require the competence the task claims to measure."
evidence_reviewed:
  - ref: .okra/runs/pumped-fn-skill-20260710/workers/dkr-3b/eval-suite-candidate-v2.md:64-68
    quote: "scenario 1 answered with resource(), ownership boundary ... scenario 2 answered with a scope-owned (current-ownership) resource whose deps include a watched controller on the port-config atom"
  - ref: pkg/core/lite/PATTERNS.md:179-182
    quote: "boundary | One request, job, or UI boundary shares the value ... current | One action or editor gets a private pocket. Nested ctx.exec() children can use it; sibling actions ... reset."
  - ref: pkg/core/lite/PATTERNS.md:232-249
    quote: "Use controller(resource) ... Use watch: true only in resource deps ... config: controller(config, { resolve: true, watch: true })"
  - ref: pkg/core/lite/src/scope.ts:1000-1027
    quote: "Resource controller watch is only supported in resource dependencies ... controller({ watch: true }) is only supported in atom dependencies"
kill_attempt:
  transplant_attack: "The renamed invoice shell uses cleanup atoms/tags and misses T1-D1/D2/D3, so its G6 multiplier is 0."
  differentiator_faking_attack: "DESIGN.md can repeat boundary/current/watch/result-close vocabulary and obtain every required quote; Tier A has no typecheck or behavioral gate. The answer key itself is semantically wrong: per-misting-run isolation calls for current ownership, while a resource cannot watch the port-config atom from resource deps."
  unfairness_attack: "The register teaches current-vs-boundary and resource-to-resource watch, but the task demands the opposite ownership and an unsupported atom-to-resource watch."
verdict: dead
verdict_evidence: "T1-D1 rewards ownership that can share the lease across sibling executions, contradicting the prompt. T1-D2 describes an API shape rejected by the runtime. A vocabulary-complete DESIGN.md can therefore pass G6 while being non-functional."
proposed_next: amend-task-T1-use-current-for-operation-resources-and-test-actual-resource-to-resource-watch
---
hypothesis_id: H2-T2
statement: "Under G6, this task cannot be passed by an invoice-triage transplant, and its differentiators require the competence the task claims to measure."
evidence_reviewed:
  - ref: .okra/runs/pumped-fn-skill-20260710/workers/dkr-3b/eval-suite-candidate-v2.md:82-89
    quote: "A session must be opened fresh for each drain pass ... two overlapping drain passes ... must never share a session ... resource() with ownership: boundary"
  - ref: pkg/core/lite/tests/scope.test.ts:1151-1208
    quote: "stores current-owned resource misses on the current execution context ... shares current-owned resources with nested executions only ... first ... id: 1 ... second ... id: 2"
  - ref: pkg/core/lite/PATTERNS.md:179-182
    quote: "boundary ... shares the value ... current ... Nested ctx.exec() children can use it; sibling actions ... reset."
kill_attempt:
  transplant_attack: "The invoice queue/signal transplant has no printer resource, so T2-D1 is absent and task_score=0."
  differentiator_faking_attack: "Declare the answer-key boundary resource and test each pass under a fresh root context. Open/close and dirty-close assertions pass, but real passes executed as siblings under one daemon context can reuse the same boundary-owned session. G1-G4 do not require the same-parent overlapping-pass case."
  semantic_attack: "A failing transaction producing zero slips does not prove the signal was updated strictly after commit; it proves only one failure path emitted no slip."
  unfairness_attack: "Resource and signal-after-commit are taught, but the mandated ownership is contrary to the library's documented execution isolation."
verdict: dead
verdict_evidence: "T2-D1 cannot simultaneously use boundary ownership and guarantee per-pass/sibling isolation. The proposed test evidence can pass under a topology that hides this defect."
proposed_next: amend-task-T2-require-current-ownership-and-same-parent-overlapping-pass-identity-proof
---
hypothesis_id: H2-T3
statement: "Under G6, this task cannot be passed by an invoice-triage transplant, and its differentiators require the competence the task claims to measure."
evidence_reviewed:
  - ref: .okra/runs/pumped-fn-skill-20260710/workers/dkr-3b/eval-suite-candidate-v2.md:100-103
    quote: "capture job ... no-overlap AND no-catch-up ... upload job ... catch-up enabled ... manual-backend test"
  - ref: examples/invoice-triage/src/flows.ts:308-323
    quote: "dailyReportJob ... overlap: \"skip\", catchUp: \"skip\" ... sendRemindersJob ... overlap: \"queue\", catchUp: \"skip\""
  - ref: pkg/ext/scheduler/README.md:46-58
    quote: "inProcess ... not durable ... catchUp ... only \"skip\" is accepted; \"last\"/\"all\" throw immediately"
kill_attempt:
  transplant_attack: "Copying invoice-triage gives capture the required skip/skip policy but leaves upload at catchUp: skip; T3-D2 is absent, so G6=0. The v2 claim that capture uses the opposite pair from the example is false."
  differentiator_faking_attack: "A custom ManualBackend can expose advanceHours() that directly invokes upload jobs in order, while never exercising scheduler catch-up derivation. The declaration, call-order assertions, and fixed clock all exist and tests pass."
  unfairness_attack: "The normal inProcess backend cannot run catchUp last/all. The candidate does not provide the cold-workspace scaffold, durable backend, complete G3 manifest, or G4 smoke contract showing how the entrypoint can satisfy D2."
verdict: drifted
verdict_evidence: "The pure transplant is killed, but the suite lacks enough executable backend and manifest detail to distinguish a real catch-up proof from a ManualBackend that scripts the expected outputs. Missing evidence: the provided backend scaffold, exact assertion manifest, and entrypoint smoke."
proposed_next: amend-task-T3-provide-a-durable-manual-backend-and-require-production-job-registration-to-drive-the-asserted-runs
---
hypothesis_id: H2-T4
statement: "Under G6, this task cannot be passed by an invoice-triage transplant, and its differentiators require the competence the task claims to measure."
evidence_reviewed:
  - ref: .okra/runs/pumped-fn-skill-20260710/workers/dkr-3b/eval-suite-candidate-v2.md:115-123
    quote: "auditTrail extension ... wrapExec (and wrapResolve) ... ring eviction ... nested failure outcomes ... boundary parse"
  - ref: .okra/runs/pumped-fn-skill-20260710/workers/dkr-3b/eval-suite-candidate-v2.md:293-293
    quote: "grader verifies each manifest item with a verbatim quote of the asserting expression"
  - ref: pkg/core/lite/src/types.ts:480-518
    quote: "ResolveEvent ... atom ... resource ... wrapResolve ... wrapExec"
kill_attempt:
  transplant_attack: "The invoice observability/parse/daemon transplant lacks wrapResolve, real ring eviction, and dual nested failure entries; G6=0."
  differentiator_faking_attack: "A detached test extension can synthesize 105 executions and two failing test flows, producing every required assertion and quote, while the daemon's actual operations use the transplant and never install or reach that extension."
  unfairness_attack: "The constructs are within register rings (d) and testing scope."
verdict: drifted
verdict_evidence: "G6 does not state that quoted extension behavior must be reachable from each public task operation and the shipped root. A conscientious grader may reject the detached harness, but another can accept all named mechanisms. Missing evidence: an executable reachability manifest tying auditTrail to reportPosition, lowBatterySweep, the named client call, and bin/daemon.ts."
proposed_next: amend-task-T4-bind-each-extension-assertion-to-public-operations-through-the-shipped-composition-root
---
hypothesis_id: H2-T5
statement: "Under G6, this task cannot be passed by an invoice-triage transplant, and its differentiators require the competence the task claims to measure."
evidence_reviewed:
  - ref: .okra/runs/pumped-fn-skill-20260710/workers/dkr-3b/eval-suite-candidate-v2.md:136-147
    quote: "fetch for recipe k+1 must not begin until the consumer has consumed recipe k's final event ... fetch counter is exactly k ... close result ... failure isolation ... transformed"
  - ref: examples/invoice-triage/src/flows.ts:94-108
    quote: "for (const invoice ... const stream = triage.execStream ... yield* stream ... await stream.result"
  - ref: examples/invoice-triage/tests/invoice-triage.test.ts:413-456
    quote: "abandonment aborts a streaming batch ... expect(closes[0]).toMatchObject({ ok: false, aborted: true })"
kill_attempt:
  transplant_attack: "The reference already supplies pull-driven iteration and externally recorded abandonment. A direct transplant still misses failure isolation and transformed child events, so T5-D3/D4 make G6=0."
  differentiator_faking_attack: "A fake LegacyArchive can increment its 'fetch count' only when a returned promise resolves rather than when fetch is invoked. Eager k+1 work is issued but abandonment leaves the asserted counter at k. A mapped wrapper around a test-only child stream supplies D4 quotes without proving the production child."
  unfairness_attack: "Generator composition, abandonment, and child-flow controllers are inside the taught scope."
verdict: drifted
verdict_evidence: "The differentiators are directionally stronger, but 'fetch issued' has no instrumentation contract and G3 has no enumerated causal manifest. Missing evidence: a required synchronous call-site counter on the injected client and proof that the asserted stream is exportCollection's production child."
proposed_next: amend-task-T5-define-fetch-issued-at-method-entry-and-bind-counter-close-and-prefix-assertions-to-the-public-production-flow
---
hypothesis_id: H2-T6
statement: "Under G6, this task cannot be passed by an invoice-triage transplant, and its differentiators require the competence the task claims to measure."
evidence_reviewed:
  - ref: .okra/runs/pumped-fn-skill-20260710/workers/dkr-3b/eval-suite-candidate-v2.md:161-168
    quote: "does not recompute when a new reading leaves the at-risk set unchanged ... selector-call counter ... select(readings, selector, { eq })"
  - ref: pkg/core/lite/src/scope.ts:233-258
    quote: "const nextValue = this.selector(source); if (!this.eq(this.currentValue, nextValue)) ... notifyListeners"
  - ref: pkg/core/lite/src/index.ts:16-21
    quote: "export { atom ... controller ... } ... export { createScope ... }"
kill_attempt:
  transplant_attack: "The invoice derived-atom/controller transplant uses the explicitly forbidden mechanism and update rather than ctrl.set; G6=0."
  differentiator_faking_attack: "A test can ctrl.set the identical readings object, causing SelectHandleImpl to skip at Object.is(source, sourceValue), and claim the selector count stayed fixed. That is not a new reading or whole-value replacement."
  semantic_attack: "For a genuinely new readings object, select must run the selector before eq can decide whether to suppress notification. Therefore D3's unchanged selector-call count is impossible."
  unfairness_attack: "The skill teaches select equality as notification suppression, not avoiding selector execution. The hidden answer key demands behavior the API cannot provide."
verdict: dead
verdict_evidence: "T6-D3 contradicts SelectHandleImpl. Equality prevents publication, not recomputation. A correct implementation must fail the required selector-call assertion."
proposed_next: amend-task-T6-assert-unchanged-subscriber-or-alert-count-not-unchanged-selector-call-count
---
hypothesis_id: H2-T7
statement: "Under G6, this task cannot be passed by an invoice-triage transplant, and its differentiators require the competence the task claims to measure."
evidence_reviewed:
  - ref: .okra/runs/pumped-fn-skill-20260710/workers/dkr-3b/eval-suite-candidate-v2.md:180-184
    quote: "resource() with ownership: boundary ... two concurrent generateRound executions observe distinct unit-of-work instances ... sub-operation reaches the same unit-of-work"
  - ref: pkg/core/lite/tests/scope.test.ts:1185-1208
    quote: "shares current-owned resources with nested executions only ... outer ... inner ... [1, 1] ... [2, 2]"
  - ref: pkg/core/lite/PATTERNS.md:179-182
    quote: "boundary ... shares the value ... current ... sibling actions ... reset"
kill_attempt:
  transplant_attack: "Inline db.transaction has no resource/onClose/concurrent identity proof, so G6=0."
  differentiator_faking_attack: "Follow the answer key with a boundary resource and run each concurrency assertion under separate root contexts. Tests show distinct instances, while two sibling generateRound calls on the same context can share the resource."
  unfairness_attack: "The taught API supplies the required behavior through current ownership; the answer key requires boundary instead."
verdict: dead
verdict_evidence: "T7-D1 and T7-D3 are mutually incompatible under the normal same-parent execution topology. Current ownership is the documented primitive for one action plus its nested call tree."
proposed_next: amend-task-T7-change-D1-to-current-and-require-concurrent-sibling-execs-on-one-parent-context
---
hypothesis_id: H2-T8
statement: "Under G6, this task cannot be passed by an invoice-triage transplant, and its differentiators require the competence the task claims to measure."
evidence_reviewed:
  - ref: .okra/runs/pumped-fn-skill-20260710/workers/dkr-3b/eval-suite-candidate-v2.md:196-200
    quote: "tags.all ... feature code iterates ... tags.optional ... throwing channel ... correct accounting ... failure visible in traces"
  - ref: .okra/runs/pumped-fn-skill-20260710/workers/dkr-1/idiom-register.md:92-94
    quote: "tags.optional / tags.all ... example uses only tags.required ... select(atom, selector, { eq })"
  - ref: .okra/runs/pumped-fn-skill-20260710/workers/dkr-3b/eval-suite-candidate-v2.md:36-39
    quote: "at least one verbatim quote ... showing the named mechanism ... Any absent differentiator => task score = 0"
kill_attempt:
  transplant_attack: "A single required notifier has no tags.all or tags.optional, so G6=0."
  differentiator_faking_attack: "Resolve and iterate tags.all, but never call the channel. Instead inspect fake metadata and execute a named synthetic success/failure function to return the expected attempted/delivered totals. Use tags.optional only to branch the returned totals. Tests asserting totals and both wiring cases pass; trace names exist; no alert is delivered."
  unfairness_attack: "tags.all/optional and named foreign edges are within scope."
verdict: dead
verdict_evidence: "Every D1-D3 quote can exist while the channel capability is never invoked. The manifest examples require accounting but do not require per-channel side-effect evidence or fake-channel call logs."
proposed_next: amend-task-T8-require-each-fake-channel-call-log-plus-trace-record-identity-and-quiet-hours-side-effect-proof
---
hypothesis_id: H2-T9
statement: "Under G6, this task cannot be passed by an invoice-triage transplant, and its differentiators require the competence the task claims to measure."
evidence_reviewed:
  - ref: .okra/runs/pumped-fn-skill-20260710/workers/dkr-3b/eval-suite-candidate-v2.md:211-215
    quote: "invocation is staged ONCE via prepare() and re-executed ... retry gated on error class ... swappable source ... attemptLedger"
  - ref: .okra/runs/pumped-fn-skill-20260710/workers/dkr-3/eval-suite-candidate.md:187-192
    quote: "calls a scaffolded flaky SpeechVendor client ... stores the transcript on success"
  - ref: .okra/runs/pumped-fn-skill-20260710/workers/dkr-1/idiom-register.md:92-92
    quote: "prepare() / step.ready ... example only uses .exec/.execStream"
kill_attempt:
  transplant_attack: "Repeated direct exec has no prepare staging site, so T9-D1 makes G6=0."
  differentiator_faking_attack: "Prepare and repeatedly execute a no-op child that consumes scripted error tags, while a separate named no-op edge stands in for speech.transcribe. Busy/non-busy attempts, zero-delay, and ledger totals all pass; SpeechVendor is never called and no transcript is stored."
  unfairness_attack: "prepare, error classes, tags, and extensions are taught. The failure is differentiator incompleteness, not scope."
verdict: dead
verdict_evidence: "G6 never requires evidence that the prepared invocation performs the scaffolded vendor call or stores the transcript. Right prepare/error/ledger syntax can therefore gate in a non-functional backfill."
proposed_next: amend-task-T9-require-vendor-call-log-transcript-store-state-and-prepared-invocation-identity-across-attempts
---
hypothesis_id: H2-T10
statement: "Under G6, this task cannot be passed by an invoice-triage transplant, and its differentiators require the competence the task claims to measure."
evidence_reviewed:
  - ref: .okra/runs/pumped-fn-skill-20260710/workers/dkr-3b/eval-suite-candidate-v2.md:231-241
    quote: "address lives in process state ... current-ownership resource whose deps include a watched controller on the address atom"
  - ref: pkg/core/lite/PATTERNS.md:232-249
    quote: "Use controller(resource) ... Use watch: true only in resource deps ... controller(config, { resolve: true, watch: true })"
  - ref: pkg/core/lite/src/scope.ts:1000-1027
    quote: "Resource controller watch is only supported in resource dependencies ... controller({ watch: true }) is only supported in atom dependencies"
kill_attempt:
  transplant_attack: "Cleanup atom plus manual retarget close/open misses T10-D1, so G6=0."
  differentiator_faking_attack: "Include an unused watched atom controller in a separate derived atom and a current session resource elsewhere. Quotes contain resource/current/watch/address and ordering tests can exercise manual close/open, while the required graph relation does not exist."
  unfairness_attack: "The register's concept-only surface is resource-to-resource watch. T10 instead mandates atom-to-resource watch, which the runtime rejects."
verdict: dead
verdict_evidence: "The primary coverage task cannot implement its primary differentiator. It does not test the concept-only surface cited as its justification."
proposed_next: amend-task-T10-make-address-an-upstream-resource-and-test-a-dependent-session-resource-watching-that-resource
---
hypothesis_id: H2-RUBRIC
statement: "Under gates G1-G6 + weights 20/18/15/12/10/8/9/8 + tier multipliers (Sigma=10.0) the suite cannot be gamed to >=85% by any vector that lacks the taught competence."
evidence_reviewed:
  - ref: .okra/runs/pumped-fn-skill-20260710/workers/dkr-3b/eval-suite-candidate-v2.md:36-40
    quote: "at least one verbatim quote ... spot-replays every quote mechanically ... Any absent differentiator => task score = 0"
  - ref: .okra/runs/pumped-fn-skill-20260710/workers/dkr-3b/eval-suite-candidate-v2.md:293-295
    quote: "grader verifies each manifest item with a verbatim quote of the asserting expression"
  - ref: .okra/runs/pumped-fn-skill-20260710/workers/dkr-3b/eval-suite-candidate-v2.md:303-307
    quote: "gate(t) = 1 if G1-G6 all pass ... suite_% = 100 x ... / 10.0"
  - ref: .okra/runs/pumped-fn-skill-20260710/workers/dkr-3b/eval-suite-candidate-v2.md:331-334
    quote: "grader gpt-5.6-sol ... orchestrator ... spot-replays quotes ... G6 is computed ... from replayed evidence"
kill_attempt:
  gaming_vector_1:
    name: "detached proof-harness laundering"
    construction: "Keep a renamed invoice-style product and minimal canned-output bin. Add dead exported modules containing every required construct. Add tests that exercise only those modules and pre-seeded assertion logs. G1 passes object-literal declarations; G2 compiles; G3 tests and quoted assertions pass; G4 canned smoke passes; G6 finds every mechanism quote. No gate checks reachability from the shipped entrypoint or public operation."
    score: "All task_score(t)=1. Weighted numerator = 0.5 + 7x1.0 + 2x1.25 = 10.0. suite_% = 100 x 10.0/10.0 = 100.0%."
  gaming_vector_2:
    name: "evidence-file and assertion-expression keyword stuffing"
    construction: "Place answer-key pseudo-code and claims in REVIEW.md/test names, then use tautological assertions over literal arrays. G1/G2 ignore markdown; G3 asks for a quoted asserting expression; G6 does not restrict evidence to executed files or require causal linkage. Even if one D task is rejected, nine tasks can be accepted."
    score: "Zero T4 (multiplier 1.25), score every other task 1. Weighted numerator = 10.0 - 1.25 = 8.75. suite_% = 100 x 8.75/10.0 = 87.5%."
verdict: dead
verdict_evidence: "G6 converts one grader's semantic impression into a gate and the replay validates only quote location. Neither G3 nor G6 proves execution, causality, public-operation reachability, or entrypoint wiring. Both new vectors exceed 85% without functional competence."
proposed_next: reweight-add-machine-checked-reachability-and-causal-manifest-gates-before-any-additive-rubric-score
---
hypothesis_id: H2-COVERAGE
statement: "v2's coverage mapping (select/eq->T-6, resource-watch->T-10v2/T-1) plus the explicit out-of-scope proposal (GC/flush, incremental adoption, parent-chain tag reads) resolves chal-1's H-COVERAGE drift."
evidence_reviewed:
  - ref: .okra/runs/pumped-fn-skill-20260710/workers/dkr-3b/eval-suite-candidate-v2.md:253-271
    quote: "resource watch ... T-10v2 ... select/eq ... T-6 ... proposed OUT ... GC options ... Incremental adoption ... Parent-chain tag reads"
  - ref: .okra/runs/pumped-fn-skill-20260710/workers/dkr-1/idiom-register.md:91-99
    quote: "Resource controllers with watch in resource deps ... select(atom, selector, { eq }) ... GC options ... Incremental adoption ... seekTag/getTag"
  - ref: pkg/core/lite/src/scope.ts:237-258
    quote: "const nextValue = this.selector(source); if (!this.eq(this.currentValue, nextValue))"
  - ref: pkg/core/lite/src/scope.ts:1000-1027
    quote: "Resource controller watch is only supported in resource dependencies ... watch ... only supported in atom dependencies"
kill_attempt: "T6 maps select/eq to an impossible no-selector-recompute assertion. T1/T10 map resource watch to a watched atom, not the resource-to-resource controller surface in the register. The three exclusions are only proposed for ratification, so they are not yet frozen scope decisions."
verdict: dead
verdict_evidence: "Neither newly claimed mapping examines the actual API behavior. The exclusions improve visibility but remain unratified and cannot compensate for invalid positive coverage."
proposed_next: amend-task-set-fix-select-notification-semantics-add-real-resource-to-resource-watch-and-ratify-each-exclusion
---
hypothesis_id: H2-GRADEABILITY
statement: "Each differentiator is decidable by a grader from the solution diff + quotes alone — two honest graders would agree present/absent."
evidence_reviewed:
  - ref: .okra/runs/pumped-fn-skill-20260710/workers/dkr-3b/eval-suite-candidate-v2.md:36-39
    quote: "at least one verbatim quote ... showing the named mechanism ... different mechanism = absent"
  - ref: .okra/runs/pumped-fn-skill-20260710/workers/dkr-3b/eval-suite-candidate-v2.md:65-68
    quote: "release behavior bound to ... result ... watched controller ... shared by call tree ... distinct/unreachable"
  - ref: .okra/runs/pumped-fn-skill-20260710/workers/dkr-3b/eval-suite-candidate-v2.md:87-89
    quote: "strictly after ... proven ... drains from state, not from stream payloads ... exactly-once"
  - ref: .okra/runs/pumped-fn-skill-20260710/workers/dkr-3b/eval-suite-candidate-v2.md:196-200
    quote: "never names a concrete channel ... deployments differ only in wiring ... failure is visible in traces"
  - ref: .okra/runs/pumped-fn-skill-20260710/workers/dkr-3b/eval-suite-candidate-v2.md:239-241
    quote: "graph-driven ... not manual ... retarget only updates ... does not touch the session"
kill_attempt: "Most differentiators combine positive syntax, temporal behavior, causal linkage, reachability, and global negative claims. A file:line quote can establish the syntax but not 'strictly after', 'never', 'only', 'exactly once', 'distinct across concurrent executions', or production-root reachability. T1-D2/T10-D1 and T6-D3 additionally describe impossible behavior, guaranteeing disagreement between literal-answer-key grading and API-semantic grading."
verdict: dead
verdict_evidence: "Two honest graders can disagree while every quote is genuine: one grades the named construct/assertion as present; the other rejects it as disconnected, causally weak, or incompatible with runtime semantics. No atomic decision procedure or complete per-task manifest exists."
proposed_next: amend-task-split-each-differentiator-into-atomic-declaration-reachability-behavior-and-negative-search-checks
---
summary: "0 intact, 3 drifted, 10 dead"
ratification_notes:
  - "Do not freeze v2: T1, T2, and T7 mandate boundary ownership where the prompt requires current-owned sibling isolation."
  - "T1 and T10 do not test resource watch; they demand an unsupported watched atom inside resource deps."
  - "T6-D3 is impossible: select equality suppresses notification only after running the selector."
  - "G3 manifests are described but not enumerated, and quote replay verifies text location rather than causal execution or root reachability."
  - "New gaming vectors score 100.0% and 87.5% under the literal v2 formula."
  - "Residual unresolved evidence: the cold-workspace scaffolds, exact G4 smoke contracts, and complete per-task assertion manifests were not supplied."