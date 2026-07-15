import { createScope, flow, tags, typed } from "@pumped-fn/lite"
import { describe, expect, it } from "vitest"
import {
  authority,
  clock,
  createAuthority,
  current,
  execution,
  record,
  run,
  scheduler,
  session,
  wait,
  wake,
  type Authority,
  type SessionRecord,
  type SessionRuntime,
  type Wake,
} from "../src/session.js"

function initial(bound: Authority): SessionRecord {
  return Object.freeze({
    id: "session-review",
    version: 0,
    schemaVersion: 1,
    status: "open",
    authorityFingerprint: bound.fingerprint,
    authorityConstraints: bound,
    currentBranchId: "main",
    branches: Object.freeze([{
      id: "main",
      version: 0,
      createdBy: "bootstrap",
      authorityFingerprint: bound.fingerprint,
      authority: bound,
      evidence: Object.freeze([]),
    }]),
    work: Object.freeze([]),
    attempts: Object.freeze([]),
    invocations: Object.freeze([]),
    artifacts: Object.freeze([]),
    memory: Object.freeze([]),
    schedules: Object.freeze([]),
    providerContinuations: Object.freeze({}),
    nextEventSequence: 1,
  })
}

function authorityValue(): Authority {
  return createAuthority({
    tenant: "tenant-a",
    roots: ["/workspace"],
    permissions: [],
    tools: [],
    sandbox: { roots: ["/workspace"], commands: [], write: false, network: false },
  })
}

const fixedClock = { now: () => "2026-07-14T00:00:00.000Z" }

describe("session review regressions", () => {
  it("checks cancellation after work.started before entering the turn", async () => {
    const bound = authorityValue()
    let effects = 0
    const turn = flow({
      name: "review.cancel-safe-point.turn",
      factory: () => {
        effects++
        return "effect"
      },
    })
    const scope = createScope({ tags: [
      authority(bound),
      record(initial(bound)),
      clock(fixedClock),
      execution.turn({ flow: turn }),
    ] })
    const ctx = scope.createContext()
    const runtime = await ctx.resolve(session)
    const stream = ctx.execStream({
      flow: run,
      input: {
        work: { id: "cancelled", branchId: "main", role: "review", policy: "all" },
        input: undefined,
      },
    })
    const iterator = stream[Symbol.asyncIterator]()
    const started = await iterator.next()
    const result = stream.result.catch((error: unknown) => error)
    const attempt = runtime.record.attempts.find((value) => value.workId === "cancelled")!
    const cancellation = { reason: "stop" }

    expect(started).toMatchObject({ done: false, value: { type: "work.started" } })
    runtime.controls.enqueue({
      id: "cancel-after-start",
      workId: "cancelled",
      attempt: attempt.attempt,
      expectedEpoch: attempt.snapshotEpoch,
      sequence: 1,
      mode: "cancel",
      source: "human",
      payload: cancellation,
    })

    await expect(iterator.next()).rejects.toBe(cancellation)
    await expect(result).resolves.toBe(cancellation)
    expect(effects).toBe(0)
    expect(runtime.record.work.find((value) => value.id === "cancelled")?.status).toBe("cancelled")

    await ctx.close()
    await scope.dispose()
  })

  it("does not deliver steering from an earlier attempt after resume", async () => {
    const bound = authorityValue()
    let runtime!: SessionRuntime
    const wakeImpl: Wake = flow({
      name: "review.scheduler.wake",
      parse: typed<{ id: string }>(),
      factory: () => {
        const work = runtime.record.work.find((value) => value.id === "resumed")!
        return Object.freeze({ ...work, status: "ready" as const, attempt: work.attempt + 1 })
      },
    })
    const inspect = flow({
      name: "review.steering-fence.turn",
      deps: {
        runtime: tags.required(current.session),
        work: tags.required(current.work),
      },
      factory: (_ctx, { runtime, work }) => runtime.controls.drain(work.id, -1).map((value) => value.id),
    })
    const scope = createScope({ tags: [
      authority(bound),
      record(initial(bound)),
      clock(fixedClock),
      execution.turn({ flow: inspect }),
      scheduler.wake(wakeImpl),
    ] })
    const ctx = scope.createContext()
    runtime = await ctx.resolve(session)
    await ctx.exec({
      flow: wait,
      input: {
        work: { id: "resumed", branchId: "main", role: "review", policy: "all" },
        intent: {
          id: "resume-work",
          dueAt: "2026-07-15T00:00:00.000Z",
          priority: 1,
          expectedSessionVersion: 0,
        },
      },
    })
    const first = runtime.record.attempts.find((value) => value.workId === "resumed")!
    runtime.controls.enqueue({
      id: "attempt-one-steering",
      workId: "resumed",
      attempt: first.attempt,
      expectedEpoch: first.snapshotEpoch,
      sequence: 1,
      mode: "input",
      source: "human",
      payload: { focus: "stale" },
    })
    expect(runtime.controls.drain("resumed", -1)).toHaveLength(1)

    await ctx.exec({ flow: wake, input: { id: "resume-work" } })
    await expect(ctx.exec({
      flow: run,
      input: {
        work: { id: "resumed", branchId: "main", role: "review", policy: "all" },
        input: undefined,
      },
    })).resolves.toEqual([])
    expect(runtime.controls.drain("resumed", -1)).toEqual([])
    expect(runtime.record.attempts.map((value) => value.attempt)).toEqual([1, 2])

    await ctx.close()
    await scope.dispose()
  })

  it("rejects duplicate schedule IDs before admitting another work item", async () => {
    const bound = authorityValue()
    const scope = createScope({ tags: [authority(bound), record(initial(bound)), clock(fixedClock)] })
    const ctx = scope.createContext()
    const runtime = await ctx.resolve(session)
    const intent = {
      id: "one-intent",
      dueAt: "2026-07-15T00:00:00.000Z",
      priority: 1,
      expectedSessionVersion: 0,
    }
    await ctx.exec({
      flow: wait,
      input: {
        work: { id: "first", branchId: "main", role: "review", policy: "all" },
        intent,
      },
    })

    await expect(ctx.exec({
      flow: wait,
      input: {
        work: { id: "orphan", branchId: "main", role: "review", policy: "all" },
        intent,
      },
    })).rejects.toThrow("Schedule one-intent already exists")
    expect(runtime.record.schedules).toHaveLength(1)
    expect(runtime.record.work).toMatchObject([{ id: "first", status: "waiting" }])
    expect(runtime.record.work.some((value) => value.id === "orphan")).toBe(false)

    await ctx.close()
    await scope.dispose()
  })
})
