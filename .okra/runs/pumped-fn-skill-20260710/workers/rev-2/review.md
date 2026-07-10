path_used: ".okra/runs/pumped-fn-skill-20260710/workers/eval-r2/T-*-solution/"
scope: "preference tier only"
findings:
  - task: T-1
    item: "Observability names"
    file: "T-1-solution/src/greenhouse.ts:30"
    quote: "export const connection = atom({ factory: (ctx) => {"
    severity: idiomatic
    violation: "Several observable atoms use anonymous factory functions, including connection, weatherService, readings, and status."

  - task: T-1
    item: "Tag behavior"
    file: "T-1-solution/tests/greenhouse.test.ts:17"
    quote: 'describe("greenhouse control", () => {'
    severity: idiomatic
    violation: "Required siteConfig and ventDriver are used deliberately, but the tests never prove that either missing tag fails loudly."

  - task: T-1
    item: "Type contract"
    file: "T-1-solution/tests/greenhouse.test.ts:38"
    quote: "const first = session.exec({ flow: runVentAdjustment, input: { temperatureC: 23.4 } })"
    severity: cosmetic
    violation: "Stored execution promises are awaited but their inferred result type is not asserted."

  - task: T-2
    item: "Observability names"
    file: "T-2-solution/src/holdshelf.ts:48"
    quote: "export const wake = atom({ keepAlive: true, factory: () => 0 })"
    severity: idiomatic
    violation: "The long-lived wake atom has an anonymous factory."

  - task: T-2
    item: "Type contract"
    file: "T-2-solution/tests/holdshelf.test.ts:60"
    quote: "const dispatcher = daemon.exec({ flow: runDispatcher })"
    severity: cosmetic
    violation: "The stored dispatcher execution promise is awaited later without an inferred-type assertion."

  - task: T-3
    item: "Lifecycle/recovery"
    file: "T-3-solution/tests/observatory.test.ts:65"
    quote: 'it("replays every missed upload window in order and keeps frames after rejection", async () => {'
    severity: structural
    violation: "Recovery is simulated by pre-seeding one scope. The test does not use two scopes sharing the same durable store to prove restart recovery."

  - task: T-3
    item: "Type contract"
    file: "T-3-solution/tests/observatory.test.ts:54"
    quote: "const first = job.trigger()"
    severity: cosmetic
    violation: "The stored trigger promise is later awaited without a type assertion."

  - task: T-4
    item: "Fault taxonomy"
    file: "T-4-solution/src/telemetry.ts:85"
    quote: |-
      } catch (error) {
        if (error instanceof PickupRejectedError) {
          return ctx.fail({ kind: "pickup-rejected", scooterId: error.entity })
        }
        return ctx.fail({ kind: "pickup-rejected", scooterId: position.scooterId })
      }
    severity: structural
    violation: "Every exceptional client failure is converted into the planned pickup-rejected fault. Unexpected adapter/library failures lose their distinct taxonomy."

  - task: T-4
    item: "Observability names"
    file: "T-4-solution/src/audit.ts:20"
    quote: |-
      async wrapExec(next, target, ctx) {
        const startedAt = now()
        const name = ctx.name ?? target.name ?? "anonymous-execution"
    severity: idiomatic
    violation: "The wrapper snapshots ctx.name and parent before next() instead of reading the finalized execution identity after awaiting next()."

  - task: T-6
    item: "Type contract"
    file: "T-6-solution/tests/climate.test.ts:75"
    quote: "const monitor = session.exec({ flow: watchAtRisk, input: { view } })"
    severity: cosmetic
    violation: "The stored monitor execution promise is awaited later without an inferred-type assertion."

  - task: T-7
    item: "Aggregate atomicity"
    file: "T-7-solution/src/tournament.ts:74"
    quote: |-
      if (bye !== null) {
        await assignBye.exec({ input: { candidate: bye } })
      }
      ...
      rounds.update((published) => [
    severity: structural
    violation: "Bye validation and round publication are separated by an await and are not one atomic transaction. Two concurrent generations can both validate the same unused bye before either publishes it."

  - task: T-7
    item: "Observability names"
    file: "T-7-solution/src/tournament.ts:9"
    quote: "const rounds = atom({ factory: () => [] as Round[] })"
    severity: idiomatic
    violation: "The persistent rounds atom has an anonymous factory."

  - task: T-7
    item: "Type contract"
    file: "T-7-solution/tests/tournament.test.ts:100"
    quote: "const first = session.exec({"
    severity: cosmetic
    violation: "The concurrent execution promises are stored and awaited without result-type assertions."

  - task: T-8
    item: "Observability names"
    file: "T-8-solution/src/alerts.ts:23"
    quote: "const channels = atom({"
    severity: idiomatic
    violation: "The channel-aggregation atom uses an anonymous factory."

  - task: T-8
    item: "Type contract"
    file: "T-8-solution/tests/alerts.test.ts:17"
    quote: "const run = session.exec({ flow: issueAlert, input: alert })"
    severity: cosmetic
    violation: "The stored execution promise is awaited without an inferred-type assertion."

  - task: T-10
    item: "Derived/watch"
    file: "T-10-solution/src/board.ts:13"
    quote: |-
      const changes = ctx.changes(displayAddress)[Symbol.asyncIterator]()
      async function watchAddress() {
        ...
        await ctx.release(displayFeed)
        await ctx.resolve(displayFeed)
      }
      void watchAddress()
    severity: structural
    violation: "displayFeed manually watches an atom and self-releases/re-resolves through a detached task. The preference design calls for controller resolve+watch derivation and dependency-driven resource invalidation/reacquisition."

  - task: T-10
    item: "Observability names"
    file: "T-10-solution/src/board.ts:4"
    quote: "export const displayAddress = atom({ factory: () => \"harbor-main\" })"
    severity: idiomatic
    violation: "The process-state atom has an anonymous factory."

  - task: T-10
    item: "Test seam"
    file: "T-10-solution/tests/board.test.ts:72"
    quote: 'it("closes the live session at shutdown", async () => {'
    severity: idiomatic
    violation: "The suite does not test process isolation across two scopes or the retarget-without-render shutdown case that proves no session is opened merely to close it."

exemplary:
  - task: T-1
    item: "Derived/watch"
    file: "T-1-solution/src/greenhouse.ts:55"
    quote: "readings: controller(readings, { resolve: true, watch: true })"
    note: "Status remains a watched derivation instead of being rebuilt by captureReading."

  - task: T-1
    item: "Resource ownership"
    file: "T-1-solution/src/greenhouse.ts:91"
    quote: 'ownership: "current"'
    note: "The private work record cleanly isolates standalone and concurrent adjustment executions."

  - task: T-2
    item: "Commit ordering"
    file: "T-2-solution/src/holdshelf.ts:117"
    quote: |-
      shelf.update(...)
      wake.update((value) => value + 1)
    note: "Durable work is committed before the wake edge fires."

  - task: T-2
    item: "State and wakes"
    file: "T-2-solution/src/holdshelf.ts:201"
    quote: "while (hasPendingHold(shelf.get()))"
    note: "The shelf is the source of truth; wakeups only prompt complete draining."

  - task: T-3
    item: "Scheduling"
    file: "T-3-solution/src/observatory.ts:61"
    quote: |-
      overlap: "skip",
      catchUp: "skip"
      ...
      overlap: "queue",
      catchUp: "all"
    note: "The two jobs state their opposite scheduling guarantees literally."

  - task: T-3
    item: "Scheduler teardown"
    file: "T-3-solution/tests/observatory.test.ts:113"
    quote: |-
      await capture.stop()
      await upload.stop()
      await close(scope)
    note: "Registrations are stopped and awaited before scope disposal."

  - task: T-4
    item: "Boundary parsing"
    file: "T-4-solution/src/telemetry.ts:37"
    quote: "parse: (raw) => Position.parse(raw)"
    note: "Untrusted wire input is parsed exactly at the flow boundary."

  - task: T-4
    item: "Injected capability is a tag"
    file: "T-4-solution/src/telemetry.ts:8"
    quote: 'export const fleetOps = tag<FleetOps>({ label: "fleet-ops" })'
    note: "The foreign fleet client is supplied as a required composition tag."

  - task: T-5
    item: "Streams"
    file: "T-5-solution/src/export.ts:75"
    quote: "factory: async function*"
    note: "Collection work is pull-driven through generator execution and forwarded progress."

  - task: T-5
    item: "Lifecycle/recovery"
    file: "T-5-solution/tests/export.test.ts:77"
    quote: |-
      await expect(stream.result).rejects.toThrow(/aborted/i)
      expect(outcomes.some(result => !result.ok && result.aborted)).toBe(true)
    note: "Abandonment is asserted both through the result and the externally observed close outcome."

  - task: T-6
    item: "Equality/select"
    file: "T-6-solution/tests/climate.test.ts:36"
    quote: "scope.select(readings, atRiskOf, { eq: sameRoomSet })"
    note: "Selection and equality are composed at the root with distinct responsibilities."

  - task: T-6
    item: "Liveness/GC"
    file: "T-6-solution/src/climate.ts:22"
    quote: "keepAlive: true"
    note: "Readings intentionally survive zero-observer periods, backed by an explicit test."

  - task: T-7
    item: "Resource ownership"
    file: "T-7-solution/src/tournament.ts:13"
    quote: 'ownership: "current"'
    note: "Per-generation staging is private and standalone sub-operations publish nothing."

  - task: T-7
    item: "Contract fidelity"
    file: "T-7-solution/src/tournament.ts:86"
    quote: "return { pairingCount: pairing.pairingCount, bye, staged: workspace.pairings.length + Number(bye !== null) }"
    note: "The generation result matches the prescribed shape and excludes the round number."

  - task: T-8
    item: "Ports"
    file: "T-8-solution/src/alerts.ts:19"
    quote: 'export const channel = tag<Channel>({ label: "alerts.channel" })'
    note: "Arbitrary implementations arrive through a multi-valued tag; feature code names no concrete channel."

  - task: T-8
    item: "Extensions"
    file: "T-8-solution/src/alerts.ts:44"
    quote: 'name: `alert.send.${registeredChannel.name}`'
    note: "Every attempt is a distinct named execution, while allSettled isolates failures without hiding their traced outcome."

  - task: T-9
    item: "Prepare staging"
    file: "T-9-solution/src/transcripts.ts:56"
    quote: |-
      const invocation = transcribeEpisode.prepare({ key: episodeId, input: { episodeId } })
      ...
      await invocation.exec()
    note: "Each episode is prepared once outside the retry loop and fully re-executed per attempt."

  - task: T-9
    item: "Type contract"
    file: "T-9-solution/tests/transcripts.test.ts:34"
    quote: |-
      const run = session.exec(...)
      expectTypeOf(run).toEqualTypeOf<Promise<...>>()
      await expect(run).resolves.toEqual(...)
    note: "One execution promise is stored, type-asserted, and then awaited."

  - task: T-10
    item: "Layers"
    file: "T-10-solution/src/board.ts:29"
    quote: "export const displaySession = resource({"
    note: "The board-link transport is mediated by a session resource; renderDepartures depends only on that session."

  - task: T-10
    item: "Resource ownership"
    file: "T-10-solution/src/board.ts:31"
    quote: 'ownership: "boundary"'
    note: "The expensive live session is boundary-owned and closed through resource cleanup."

frequency_rank:
  - rank: 1
    item: "Observability names"
    tasks: 5
    task_ids: [T-1, T-2, T-7, T-8, T-10]
  - rank: 2
    item: "Type contract"
    tasks: 5
    task_ids: [T-1, T-2, T-3, T-6, T-7]
    note: "T-8 adds a sixth occurrence if every stored execution promise is included."
  - rank: 3
    item: "Tag behavior"
    tasks: 1
    task_ids: [T-1]
  - rank: 3
    item: "Lifecycle/recovery"
    tasks: 1
    task_ids: [T-3]
  - rank: 3
    item: "Fault taxonomy"
    tasks: 1
    task_ids: [T-4]
  - rank: 3
    item: "Aggregate atomicity"
    tasks: 1
    task_ids: [T-7]
  - rank: 3
    item: "Derived/watch"
    tasks: 1
    task_ids: [T-10]
  - rank: 3
    item: "Test seam"
    tasks: 1
    task_ids: [T-10]

verdicts:
  T-1: minor
  T-2: minor
  T-3: notable
  T-4: notable
  T-5: clean
  T-6: minor
  T-7: notable
  T-8: minor
  T-9: clean
  T-10: notable