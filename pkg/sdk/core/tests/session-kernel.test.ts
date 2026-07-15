import { createScope, flow, tags, typed } from "@pumped-fn/lite"
import { describe, expect, it } from "vitest"
import { abortSignal } from "../src/index.js"
import * as sandbox from "../src/sandbox.js"
import {
  AuthorityEscalationError,
  acceptMemory,
  artifacts,
  authority,
  authorityFingerprint,
  clock,
  commit,
  commitMemory,
  createAuthority,
  current,
  events,
  finish,
  fork,
  join,
  loadAndBind,
  merge,
  memory,
  narrowAuthority,
  record,
  recallMemory,
  run,
  scheduler,
  session,
  steer,
  store,
  publishArtifact,
  wait,
  wake,
  type Authority,
  type SessionRecord,
  type Wake,
} from "../src/session.js"

function initial(authority: Authority): SessionRecord {
  return Object.freeze({
    id: "session-1",
    version: 0,
    schemaVersion: 1,
    status: "open",
    authorityFingerprint: authority.fingerprint,
    authorityConstraints: authority,
    currentBranchId: "main",
    branches: Object.freeze([{
      id: "main",
      version: 0,
      createdBy: "bootstrap",
      authorityFingerprint: authority.fingerprint,
      authority,
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

function authorityValue(write = false, network = false): Authority {
  return createAuthority({
    tenant: "tenant-a",
    roots: ["/workspace"],
    permissions: ["database:read"],
    tools: ["inspect_schema"],
    sandbox: { roots: ["/workspace"], commands: [], write, network },
  })
}

const fixedClock = { now: () => "2026-07-14T00:00:00.000Z" }

describe("authority", () => {
  it("matches all four boolean vectors", () => {
    expect(authorityValue(false, false).fingerprint).toBe(
      "sha256:9855f73a43990385da93c5f51a6cb939fbe68f1c11191bf834c6ff100604d998",
    )
    expect(authorityValue(false, true).fingerprint).toBe(
      "sha256:463a4bd8672960ac187808ccd9f5531ac40bc209c8577d4ba11d9909cd32d0f3",
    )
    expect(authorityValue(true, false).fingerprint).toBe(
      "sha256:095d04fe2d1ed64b205070df5382f91aadcbc7b458566e029f73b874f61bd527",
    )
    expect(authorityValue(true, true).fingerprint).toBe(
      "sha256:536001c48fa5d228c4a54e0e840b96b7c86e5eff6e53d56042141eb53d5fc869",
    )
  })

  it("normalizes sets and rejects expansion", () => {
    const value = createAuthority({
      tenant: "tenant-a",
      roots: ["/workspace", "/workspace"],
      permissions: ["database:write", "database:read"],
      tools: ["inspect_schema"],
      sandbox: { roots: ["/workspace"], commands: ["select"], write: false, network: false },
    })

    expect(value.permissions).toEqual(["database:read", "database:write"])
    expect(authorityFingerprint(value)).toBe(value.fingerprint)
    expect(narrowAuthority(value, { permissions: ["database:read"] }).permissions).toEqual(["database:read"])
    expect(() => narrowAuthority(value, { roots: ["/outside"] })).toThrow(AuthorityEscalationError)
    expect(() => narrowAuthority(value, { sandbox: { write: true } })).toThrow(AuthorityEscalationError)
  })

  it("rejects malformed authority and constraint shapes", () => {
    const base = {
      tenant: "tenant-a",
      roots: ["/workspace"],
      permissions: ["database:read"],
      tools: ["inspect_schema"],
      sandbox: { roots: ["/workspace"], commands: [], write: false, network: false },
    }
    const malformed: unknown[] = [
      { ...base, extra: true },
      { ...base, tenant: 1 },
      { ...base, roots: "/workspace" },
      { ...base, permissions: ["database:read", 1] },
      { ...base, sandbox: { ...base.sandbox, extra: true } },
      { ...base, sandbox: { ...base.sandbox, write: "false" } },
      { ...base, tenant: "tenant\ud800" },
    ]

    for (const value of malformed) expect(() => createAuthority(value as Authority)).toThrow(TypeError)
    const bound = createAuthority(base)
    expect(() => narrowAuthority(bound, { extra: true } as never)).toThrow(TypeError)
    expect(() => narrowAuthority(bound, { sandbox: { network: "false" } } as never)).toThrow(TypeError)
    expect(() => narrowAuthority(bound, { tools: ["inspect_schema", 1] } as never)).toThrow(TypeError)
  })
})

describe("load and bind", () => {
  it("recomputes and compares the full authority body before returning tags", async () => {
    const bound = authorityValue()
    const stored = initial(bound)
    const load = flow({
      name: "test.session.load",
      parse: typed<{ id: string }>(),
      factory: () => stored,
    })
    const scope = createScope({ tags: [store.load(load)] })
    const ctx = scope.createContext()

    await expect(ctx.exec({
      flow: loadAndBind,
      input: { id: stored.id, authority: bound },
    })).resolves.toMatchObject({ record: stored, authority: bound })

    const changed = { ...bound, fingerprint: `sha256:${"0".repeat(64)}` as const }
    await expect(ctx.exec({
      flow: loadAndBind,
      input: { id: stored.id, authority: changed },
    })).rejects.toThrow("Supplied authority fingerprint")

    await ctx.close()
    await scope.dispose()
  })
})

describe("session runtime", () => {
  it("admits work, carries current tags, joins, and commits finish", async () => {
    const bound = authorityValue()
    let committed: SessionRecord | undefined
    let finishCalls = 0
    const commitImpl = flow({
      name: "test.session.commit",
      parse: typed<{ record: SessionRecord; expectedVersion: number }>(),
      factory: (ctx) => {
        finishCalls++
        committed = Object.freeze({ ...ctx.input.record, version: ctx.input.expectedVersion + 1 })
        return { version: committed.version }
      },
    })
    const inspect = flow({
      name: "test.turn",
      parse: typed<string>(),
      deps: {
        work: tags.required(current.work),
        attempt: tags.required(current.attempt),
        branch: tags.required(current.branch),
        epoch: tags.required(current.epoch),
      },
      factory: (ctx, { work, attempt, branch, epoch }) => `${ctx.input}:${work.id}:${attempt.attempt}:${branch.id}:${epoch}`,
    })
    const execute = run({ name: "test.run", turn: inspect })
    const scope = createScope({ tags: [
      authority(bound),
      record(initial(bound)),
      clock(fixedClock),
      store.commit(commitImpl),
    ] })
    const ctx = scope.createContext()
    await ctx.resolve(session)

    await expect(ctx.exec({
      flow: execute,
      input: {
        work: { id: "work-1", branchId: "main", role: "test", policy: "all" },
        input: "value",
      },
    })).resolves.toBe("value:work-1:1:main:1")

    await expect(ctx.exec({
      flow: join,
      input: { workIds: ["work-1"], policy: "all" },
    })).resolves.toEqual([{ status: "completed" }])
    expect(finishCalls).toBe(0)
    await expect(ctx.exec({ flow: finish })).resolves.toMatchObject({ status: "finished", version: 1 })
    expect(finishCalls).toBe(1)
    expect(committed).toMatchObject({ status: "finished" })

    await ctx.close()
    await scope.dispose()
  })

  it("persists waiting work and consumes the same intent after load and bind", async () => {
    const bound = authorityValue()
    let stored = initial(bound)
    const commitImpl = flow({
      name: "test.session.commit",
      parse: typed<{ record: SessionRecord; expectedVersion: number }>(),
      factory: (ctx) => {
        stored = Object.freeze({ ...ctx.input.record, version: ctx.input.expectedVersion + 1 })
        return { version: stored.version }
      },
    })
    const loadImpl = flow({
      name: "test.session.load",
      parse: typed<{ id: string }>(),
      factory: () => stored,
    })
    let wakeCalls = 0
    let wakeMode: "fail" | "wrong" | "success" = "fail"
    const wakeImpl: Wake = flow({
      name: "test.scheduler.wake",
      parse: typed<{ id: string }>(),
      factory: () => {
        wakeCalls++
        if (wakeMode === "fail") throw new Error("scheduler unavailable")
        const work = stored.work.find((item) => item.id === "deferred")!
        return Object.freeze({
          ...work,
          status: "ready" as const,
          attempt: work.attempt + (wakeMode === "wrong" ? 2 : 1),
        })
      },
    })
    const scope = createScope({ tags: [
      store.load(loadImpl),
      store.commit(commitImpl),
      scheduler.wake(wakeImpl),
      clock(fixedClock),
    ] })
    const owner = scope.createContext({ tags: [authority(bound), record(stored)] })
    await owner.resolve(session)

    const waiting = await owner.exec({
      flow: wait,
      input: {
        work: { id: "deferred", branchId: "main", role: "test", policy: "all" },
        intent: {
          id: "wake-1",
          dueAt: "2026-07-15T00:00:00.000Z",
          priority: 1,
          expectedSessionVersion: 1,
        },
      },
    })
    expect(waiting.status).toBe("waiting")
    const runtime = await owner.resolve(session)
    await owner.exec({
      flow: commit,
      input: { record: runtime.snapshot("open"), expectedVersion: runtime.record.version },
    })
    expect(runtime.work.active()).toHaveLength(0)
    await owner.close()

    const bootstrap = scope.createContext()
    const bindings = await bootstrap.exec({
      flow: loadAndBind,
      input: { id: stored.id, authority: bound },
    })
    await bootstrap.close()
    const resumed = scope.createContext({ tags: [...bindings.tags] })
    await resumed.resolve(session)
    await expect(resumed.exec({ flow: wake, input: { id: "wake-1" } })).rejects.toThrow("scheduler unavailable")
    expect((await resumed.resolve(session)).record).toMatchObject({
      schedules: [{ id: "wake-1" }],
      work: [{ id: "deferred", status: "waiting", attempt: 1 }],
    })
    wakeMode = "wrong"
    await expect(resumed.exec({ flow: wake, input: { id: "wake-1" } })).rejects.toThrow("scheduler.wake boundary")
    expect((await resumed.resolve(session)).record.work[0]).toMatchObject({ status: "waiting", attempt: 1 })
    wakeMode = "success"
    const awoken = await resumed.exec({ flow: wake, input: { id: "wake-1" } })
    expect(awoken).toMatchObject({ id: "deferred", status: "ready", attempt: 2 })
    expect((await resumed.resolve(session)).record.schedules).toHaveLength(0)
    await expect(resumed.exec({ flow: wake, input: { id: "wake-1" } })).rejects.toThrow("does not exist")
    expect(wakeCalls).toBe(3)
    const inspect = flow({
      name: "test.resumed-turn",
      deps: { attempt: tags.required(current.attempt) },
      factory: (_ctx, { attempt }) => attempt.attempt,
    })
    await expect(resumed.exec({
      flow: run({ name: "test.resumed-run", turn: inspect }),
      input: {
        work: { id: "deferred", branchId: "main", role: "test", policy: "all" },
        input: undefined,
      },
    })).resolves.toBe(2)

    await resumed.close()
    await scope.dispose()
  })

  it("rejects stale wake intents before calling the scheduler", async () => {
    const bound = authorityValue()
    let schedulerCalls = 0
    const wakeImpl: Wake = flow({
      name: "test.stale-wake",
      parse: typed<{ id: string }>(),
      factory: () => {
        schedulerCalls++
        throw new Error("must not run")
      },
    })
    const scope = createScope({ tags: [
      authority(bound),
      record(initial(bound)),
      clock(fixedClock),
      scheduler.wake(wakeImpl),
    ] })
    const ctx = scope.createContext()
    await ctx.resolve(session)
    await ctx.exec({
      flow: wait,
      input: {
        work: { id: "stale", branchId: "main", role: "test", policy: "all" },
        intent: {
          id: "stale-wake",
          dueAt: "2026-07-15T00:00:00.000Z",
          priority: 1,
          expectedSessionVersion: 1,
        },
      },
    })

    await expect(ctx.exec({ flow: wake, input: { id: "stale-wake" } })).rejects.toThrow("stale session version")
    expect(schedulerCalls).toBe(0)

    await ctx.close()
    await scope.dispose()
  })

  it("keeps business effects out of context close", async () => {
    const bound = authorityValue()
    let commits = 0
    const commitImpl = flow({
      name: "test.session.commit",
      parse: typed<{ record: SessionRecord; expectedVersion: number }>(),
      factory: () => {
        commits++
        return { version: 1 }
      },
    })
    const scope = createScope({ tags: [
      authority(bound),
      record(initial(bound)),
      clock(fixedClock),
      store.commit(commitImpl),
    ] })
    const ctx = scope.createContext()
    await ctx.resolve(session)
    await ctx.close()
    expect(commits).toBe(0)
    await scope.dispose()
  })

  it("fences, aborts, and joins active work during resource cleanup", async () => {
    const bound = authorityValue()
    let commits = 0
    const commitImpl = flow({
      name: "test.cleanup-commit",
      parse: typed<{ record: SessionRecord; expectedVersion: number }>(),
      factory: () => {
        commits++
        return { version: 1 }
      },
    })
    const scope = createScope({ tags: [
      authority(bound),
      record(initial(bound)),
      clock(fixedClock),
      store.commit(commitImpl),
    ] })
    const ctx = scope.createContext()
    const runtime = await ctx.resolve(session)
    const active = runtime.work.admit({ id: "cleanup", branchId: "main", role: "test", policy: "all" })
    active.signal.addEventListener("abort", () => {
      runtime.work.settle("cleanup", active.record.attempt, { status: "cancelled" })
    }, { once: true })

    await ctx.close()
    expect(active.signal.aborted).toBe(true)
    await expect(active.settled).resolves.toEqual({ status: "cancelled" })
    expect(runtime.work.active()).toEqual([])
    expect(runtime.status).toBe("finishing")
    expect(commits).toBe(0)

    await scope.dispose()
  })

  it("does not present invocation-owned session state as durable", async () => {
    const bound = authorityValue()
    const execute = run({
      name: "test.temporary-session-run",
      turn: flow({ name: "test.temporary-session-turn", factory: () => "done" }),
    })
    const scope = createScope({ tags: [authority(bound), record(initial(bound)), clock(fixedClock)] })
    const ctx = scope.createContext()

    await expect(ctx.exec({
      flow: execute,
      input: {
        work: { id: "temporary", branchId: "main", role: "test", policy: "all" },
        input: undefined,
      },
    })).resolves.toBe("done")
    expect((await ctx.resolve(session)).record.work).toEqual([])

    await ctx.close()
    await scope.dispose()
  })

  it("keeps abandoned sessions terminal", async () => {
    const bound = authorityValue()
    const abandoned = Object.freeze({ ...initial(bound), status: "abandoned" as const })
    const scope = createScope({ tags: [authority(bound), record(abandoned), clock(fixedClock)] })
    const ctx = scope.createContext()
    const runtime = await ctx.resolve(session)

    expect(runtime.status).toBe("abandoned")
    expect(() => runtime.work.admit({ id: "late", branchId: "main", role: "test", policy: "all" })).toThrow(
      "while abandoned",
    )

    await ctx.close()
    await scope.dispose()
  })

  it("rejects semantic mutations after finish begins", async () => {
    const bound = authorityValue()
    const scope = createScope({ tags: [authority(bound), record(initial(bound)), clock(fixedClock)] })
    const ctx = scope.createContext()
    const runtime = await ctx.resolve(session)
    await runtime.beginFinish()
    const sealed = runtime.record
    const identity = {
      id: "inspect_schema",
      version: "1",
      schemaDigest: "sha256:schema",
      validationEngine: "zod",
      readiness: "ready",
      flow: "inspect",
    }
    const mutations: readonly [string, () => unknown][] = [
      ["work", () => runtime.work.admit({ id: "late", branchId: "main", role: "test", policy: "all" })],
      ["tool", () => runtime.tools.permit(identity)],
      ["branch", () => runtime.branches.fork({ id: "late", parentId: "main", workId: "late", authority: {} })],
      ["invocation", () => runtime.invocations.start({ id: "late", workId: "late", attempt: 1, kind: "model", idempotencyKey: "late" })],
      ["artifact", () => runtime.artifacts.record({
        id: "late",
        version: 1,
        digest: "sha256:late",
        mediaType: "text/plain",
        authorityFingerprint: bound.fingerprint,
        workId: "late",
        branchId: "main",
      })],
      ["memory", () => runtime.memory.record({
        id: "late",
        version: 1,
        status: "candidate",
        source: "session",
        evidence: [],
        authorityFingerprint: bound.fingerprint,
      })],
      ["continuation", () => runtime.continuations.set("late", "value")],
    ]

    for (const [, mutate] of mutations) {
      expect(mutate).toThrow("finishing")
      expect(runtime.record).toBe(sealed)
    }

    await ctx.close()
    await scope.dispose()
  })

  it("joins active work and commits once for concurrent finish callers", async () => {
    const bound = authorityValue()
    let commits = 0
    const commitImpl = flow({
      name: "test.session.commit",
      parse: typed<{ record: SessionRecord; expectedVersion: number }>(),
      factory: (ctx) => {
        commits++
        return { version: ctx.input.expectedVersion + 1 }
      },
    })
    const blocking = flow({
      name: "test.blocking-turn",
      parse: typed<void>(),
      deps: { session, work: tags.required(current.work) },
      factory: (_ctx, { session, work }) => new Promise<string>((resolve) => {
        const attempt = session.work.active().find((item) => item.record.workId === work.id)!
        if (attempt.signal.aborted) {
          resolve("aborted")
          return
        }
        attempt.signal.addEventListener("abort", () => resolve("aborted"), { once: true })
      }),
    })
    const execute = run({ name: "test.blocking-run", turn: blocking })
    const scope = createScope({ tags: [
      authority(bound),
      record(initial(bound)),
      clock(fixedClock),
      store.commit(commitImpl),
    ] })
    const ctx = scope.createContext()
    const runtime = await ctx.resolve(session)
    const running = ctx.exec({
      flow: execute,
      input: {
        work: { id: "active", branchId: "main", role: "test", policy: "all" },
        input: undefined,
      },
    })
    while (runtime.work.active().length === 0) await Promise.resolve()

    const result = running.catch((error: unknown) => error)
    const [left, right] = await Promise.all([
      ctx.exec({ flow: finish }),
      ctx.exec({ flow: finish }),
    ])
    await expect(result).resolves.toMatchObject({ name: "AbortError" })
    expect(left).toBe(right)
    expect(left).toMatchObject({ status: "finished", version: 1 })
    expect(commits).toBe(1)
    expect(runtime.work.active()).toHaveLength(0)

    await ctx.close()
    await scope.dispose()
  })

  it("composes a parent abort signal into the active attempt", async () => {
    const bound = authorityValue()
    const parent = new AbortController()
    const blocking = flow({
      name: "test.parent-abort-turn",
      deps: { signal: tags.required(abortSignal) },
      factory: (_ctx, { signal }) => new Promise<void>((_resolve, reject) => {
        if (signal.aborted) {
          reject(signal.reason)
          return
        }
        signal.addEventListener("abort", () => reject(signal.reason), { once: true })
      }),
    })
    const execute = run({ name: "test.parent-abort-run", turn: blocking })
    const scope = createScope({ tags: [
      authority(bound),
      record(initial(bound)),
      clock(fixedClock),
      abortSignal(parent.signal),
    ] })
    const ctx = scope.createContext()
    const runtime = await ctx.resolve(session)
    const running = ctx.exec({
      flow: execute,
      input: {
        work: { id: "parent-abort", branchId: "main", role: "test", policy: "all" },
        input: undefined,
      },
    })
    while (runtime.work.active().length === 0) await Promise.resolve()
    parent.abort(new DOMException("parent cancelled", "AbortError"))

    await expect(running).rejects.toMatchObject({ name: "AbortError" })
    expect(runtime.work.active()).toHaveLength(0)
    expect(runtime.record.work.find((value) => value.id === "parent-abort")?.status).toBe("cancelled")

    await ctx.close()
    await scope.dispose()
  })

  it("cancels unfinished siblings and waits for fail-fast settlement", async () => {
    const bound = authorityValue()
    const scope = createScope({ tags: [authority(bound), record(initial(bound)), clock(fixedClock)] })
    const ctx = scope.createContext()
    const runtime = await ctx.resolve(session)
    const failed = runtime.work.admit({ id: "failed", branchId: "main", role: "test", policy: "fail-fast" })
    const sibling = runtime.work.admit({ id: "sibling", branchId: "main", role: "test", policy: "fail-fast" })
    sibling.signal.addEventListener("abort", () => {
      runtime.work.settle("sibling", sibling.record.attempt, { status: "cancelled" })
    }, { once: true })
    runtime.work.settle("failed", failed.record.attempt, { status: "failed" })

    await expect(ctx.exec({
      flow: join,
      input: { workIds: ["failed", "sibling"], policy: "fail-fast" },
    })).resolves.toEqual([{ status: "failed" }, { status: "cancelled" }])
    expect(runtime.work.active()).toHaveLength(0)

    await ctx.close()
    await scope.dispose()
  })

  it("rejects stale cancellation and routes current cancellation to active work", async () => {
    const bound = authorityValue()
    const scope = createScope({ tags: [authority(bound), record(initial(bound)), clock(fixedClock)] })
    const ctx = scope.createContext()
    const runtime = await ctx.resolve(session)
    const active = runtime.work.admit({ id: "controlled", branchId: "main", role: "test", policy: "all" })
    active.signal.addEventListener("abort", () => {
      runtime.work.settle("controlled", active.record.attempt, { status: "cancelled" })
    }, { once: true })

    runtime.controls.enqueue({
      id: "stale",
      workId: "controlled",
      expectedEpoch: active.record.snapshotEpoch + 1,
      sequence: 1,
      mode: "cancel",
      source: "human",
      payload: null,
    })
    expect(active.signal.aborted).toBe(false)
    runtime.controls.enqueue({
      id: "current",
      workId: "controlled",
      attempt: active.record.attempt,
      expectedEpoch: active.record.snapshotEpoch,
      sequence: 2,
      mode: "cancel",
      source: "human",
      payload: null,
    })
    expect(active.signal.aborted).toBe(true)
    await expect(active.settled).resolves.toEqual({ status: "cancelled" })

    await ctx.close()
    await scope.dispose()
  })

  it("enforces narrowed work authority before sandbox execution", async () => {
    const bound = authorityValue(true)
    let writes = 0
    const write = flow({
      name: "test.sandbox.write",
      parse: typed<sandbox.WriteInput>(),
      factory: () => { writes++ },
    })
    const scope = createScope({ tags: [
      authority(bound),
      record(initial(bound)),
      clock(fixedClock),
      sandbox.policy({
        roots: ["/workspace"],
        write: true,
        network: false,
        commands: [],
        timeoutMs: 1_000,
        maxOutputBytes: 1_024,
      }),
      sandbox.impl.write(write),
    ] })
    const ctx = scope.createContext()
    await ctx.resolve(session)

    await expect(ctx.exec({
      flow: run({ name: "test.sandbox-run", turn: sandbox.write }),
      input: {
        work: {
          id: "sandbox-work",
          branchId: "main",
          role: "test",
          policy: "all",
          authority: { sandbox: { write: false } },
        },
        input: { path: "/workspace/result.txt", content: "result" },
      },
    })).rejects.toThrow("write exceeds session authority")
    expect(writes).toBe(0)

    await ctx.close()
    await scope.dispose()
  })

  it("binds memory recall to current work authority and rejects foreign refs", async () => {
    const bound = authorityValue()
    const foreign = createAuthority({
      tenant: "tenant-b",
      roots: ["/workspace"],
      permissions: [],
      tools: [],
      sandbox: { roots: ["/workspace"], commands: [], write: false, network: false },
    })
    let recallEffects = 0
    const recall = flow({
      name: "test.memory-recall",
      parse: typed<{ workId: string; query: string; limit: number }>(),
      deps: {
        work: tags.required(current.work),
        authority: tags.required(current.authority),
      },
      factory: (ctx, deps) => {
        recallEffects++
        return [{
          id: "memory",
          version: 1,
          status: "accepted" as const,
          source: "policy" as const,
          evidence: [],
          authorityFingerprint: ctx.input.query === "foreign" ? foreign.fingerprint : deps.authority.fingerprint,
        }]
      },
    })
    const scope = createScope({ tags: [
      authority(bound),
      record(initial(bound)),
      clock(fixedClock),
      memory.recall(recall),
    ] })
    const ctx = scope.createContext()
    const runtime = await ctx.resolve(session)
    const active = runtime.work.admit({
      id: "recall-work",
      branchId: "main",
      role: "test",
      policy: "all",
      authority: { permissions: [] },
    })

    await expect(ctx.exec({
      flow: recallMemory,
      input: { workId: "recall-work", query: "valid", limit: 1 },
    })).resolves.toMatchObject([{ authorityFingerprint: runtime.record.work[0]?.authority.fingerprint }])
    await expect(ctx.exec({
      flow: recallMemory,
      input: { workId: "recall-work", query: "foreign", limit: 1 },
    })).rejects.toThrow("memory.recall boundary")
    await expect(ctx.exec({
      flow: recallMemory,
      input: { workId: "missing", query: "valid", limit: 1 },
    })).rejects.toThrow("memory.recall boundary")
    await expect(ctx.exec({
      flow: recallMemory,
      input: { workId: "recall-work", query: "valid", limit: 0 },
    })).rejects.toThrow("memory.recall boundary")
    expect(recallEffects).toBe(2)
    runtime.work.settle("recall-work", active.record.attempt, { status: "completed" })

    await ctx.close()
    await scope.dispose()
  })

  it("rejects adapter results that cross artifact or memory boundaries", async () => {
    const bound = authorityValue()
    const foreign = createAuthority({
      tenant: "tenant-b",
      roots: ["/workspace"],
      permissions: [],
      tools: [],
      sandbox: { roots: ["/workspace"], commands: [], write: false, network: false },
    })
    let publishEffects = 0
    let commitEffects = 0
    let acceptEffects = 0
    const publish = flow({
      name: "test.bad-artifact",
      parse: typed<{ workId: string; branchId: string; mediaType: string; content: Uint8Array }>(),
      factory: (ctx) => {
        publishEffects++
        return {
          id: "artifact",
          version: 1,
          digest: "sha256:artifact",
          mediaType: ctx.input.mediaType,
          authorityFingerprint: foreign.fingerprint,
          workId: ctx.input.workId,
          branchId: ctx.input.branchId,
        }
      },
    })
    const commitCandidate = flow({
      name: "test.bad-memory",
      parse: typed<{ workId: string; branchId: string; value: unknown; evidence: readonly [] }>(),
      factory: () => {
        commitEffects++
        return {
          id: "candidate",
          version: 1,
          status: "candidate" as const,
          source: "session" as const,
          evidence: [],
          authorityFingerprint: foreign.fingerprint,
        }
      },
    })
    const acceptCandidate = flow({
      name: "test.bad-memory-accept",
      parse: typed<{ id: string; workId: string; evidence: readonly [] }>(),
      factory: (ctx) => {
        acceptEffects++
        return {
          id: ctx.input.id,
          version: 2,
          status: "accepted" as const,
          source: "human" as const,
          evidence: [],
          authorityFingerprint: foreign.fingerprint,
        }
      },
    })
    const scope = createScope({ tags: [
      authority(bound),
      record(initial(bound)),
      clock(fixedClock),
      artifacts.publish(publish),
      memory.commit(commitCandidate),
      memory.accept(acceptCandidate),
    ] })
    const ctx = scope.createContext()
    const runtime = await ctx.resolve(session)
    const host = runtime.work.admit({ id: "host", branchId: "main", role: "host", policy: "all" })
    runtime.work.settle("host", host.record.attempt, { status: "completed" })
    const narrowed = runtime.work.admit({
      id: "narrowed-host",
      branchId: "main",
      role: "host",
      policy: "all",
      authority: { permissions: [] },
    })
    runtime.work.settle("narrowed-host", narrowed.record.attempt, { status: "completed" })

    await expect(ctx.exec({
      flow: publishArtifact,
      input: { workId: "unknown", branchId: "main", mediaType: "text/plain", content: new Uint8Array() },
    })).rejects.toThrow("artifact.publish boundary")
    await expect(ctx.exec({
      flow: commitMemory,
      input: { workId: "unknown", branchId: "main", value: null, evidence: [] },
    })).rejects.toThrow("memory.commit boundary")
    await expect(ctx.exec({
      flow: acceptMemory,
      input: { id: "missing", workId: "unknown", evidence: [] },
    })).rejects.toThrow("memory.accept boundary")
    await expect(ctx.exec({
      flow: publishArtifact,
      input: { workId: "host", branchId: "missing", mediaType: "text/plain", content: new Uint8Array() },
    })).rejects.toThrow("artifact.publish boundary")
    await expect(ctx.exec({
      flow: commitMemory,
      input: { workId: "host", branchId: "missing", value: null, evidence: [] },
    })).rejects.toThrow("memory.commit boundary")
    expect([publishEffects, commitEffects, acceptEffects]).toEqual([0, 0, 0])
    await expect(ctx.exec({
      flow: publishArtifact,
      input: { workId: "host", branchId: "main", mediaType: "text/plain", content: new Uint8Array() },
    })).rejects.toThrow("artifact.publish boundary")
    await expect(ctx.exec({
      flow: commitMemory,
      input: { workId: "host", branchId: "main", value: null, evidence: [] },
    })).rejects.toThrow("memory.commit boundary")
    runtime.memory.record({
      id: "candidate",
      version: 1,
      status: "candidate",
      source: "session",
      evidence: [],
      authorityFingerprint: bound.fingerprint,
    })
    await expect(ctx.exec({
      flow: acceptMemory,
      input: { id: "candidate", workId: "narrowed-host", evidence: [] },
    })).rejects.toThrow("memory.accept boundary")
    expect(acceptEffects).toBe(0)
    await expect(ctx.exec({
      flow: acceptMemory,
      input: { id: "candidate", workId: "host", evidence: [] },
    })).rejects.toThrow("memory.accept boundary")
    expect([publishEffects, commitEffects, acceptEffects]).toEqual([1, 1, 1])
    expect(runtime.record.artifacts).toEqual([])
    expect(runtime.record.memory).toHaveLength(1)

    await ctx.close()
    await scope.dispose()
  })

  it("settles work when a stream consumer returns and replays recorded events", async () => {
    const bound = authorityValue()
    const yielding = flow({
      name: "test.yielding-turn",
      factory: async function* () {
        yield "value"
        await new Promise(() => {})
      },
    })
    const execute = run({ name: "test.yielding-run", turn: yielding })
    const scope = createScope({ tags: [authority(bound), record(initial(bound)), clock(fixedClock)] })
    const ctx = scope.createContext()
    const runtime = await ctx.resolve(session)
    const stream = ctx.execStream({
      flow: execute,
      input: {
        work: { id: "streamed", branchId: "main", role: "test", policy: "all" },
        input: undefined,
      },
    })
    const iterator = stream[Symbol.asyncIterator]()
    await iterator.next()
    await iterator.return?.()

    expect(runtime.work.active()).toHaveLength(0)
    expect(runtime.record.work.find((value) => value.id === "streamed")?.status).toBe("cancelled")
    const recorded = runtime.eventsFor("streamed")
    expect(new Set(recorded.map((value) => value.sequence)).size).toBe(recorded.length)
    expect(recorded.every((value) => value.observedAt === fixedClock.now())).toBe(true)
    const replayed = []
    for await (const event of ctx.execStream({ flow: events, input: { workId: "streamed" } })) replayed.push(event)
    expect(replayed).toEqual(recorded)

    await ctx.close()
    await scope.dispose()
  })

  it("keeps tools, branches, and steering behind session registries", async () => {
    const bound = authorityValue()
    const inspect = flow({
      name: "test.registry-turn",
      parse: typed<void>(),
      factory: () => undefined,
    })
    const execute = run({ name: "test.registry-run", turn: inspect })
    const scope = createScope({ tags: [
      authority(bound),
      record(initial(bound)),
      clock(fixedClock),
    ] })
    const ctx = scope.createContext()
    const runtime = await ctx.resolve(session)

    await ctx.exec({
      flow: execute,
      input: {
        work: { id: "registry-work", branchId: "main", role: "test", policy: "all" },
        input: undefined,
      },
    })

    const identity = Object.freeze({
      id: "inspect_schema",
      version: "1.0.0",
      schemaDigest: "sha256:schema",
      validationEngine: "zod",
      readiness: "ready",
      flow: "database.inspect-schema",
    })
    const permit = runtime.tools.permit(identity)
    expect(runtime.tools.authorize(identity, permit.epoch, permit.authorityFingerprint)).toBe(permit)
    expect(() => runtime.tools.authorize(
      { ...identity, schemaDigest: "sha256:changed" }, permit.epoch, permit.authorityFingerprint,
    )).toThrow(
      "not authorized",
    )
    runtime.tools.revoke(permit.epoch)
    expect(() => runtime.tools.authorize(identity, permit.epoch, permit.authorityFingerprint)).toThrow("not authorized")

    const child = await ctx.exec({
      flow: fork,
      input: {
        id: "analysis",
        parentId: "main",
        workId: "registry-work",
        authority: { permissions: [] },
      },
    })
    expect(child.authorityFingerprint).not.toBe(bound.fingerprint)
    runtime.branches.record({
      ...child,
      evidence: [{ id: "plan", kind: "query-plan", digest: "sha256:plan" }],
    })
    await ctx.exec({
      flow: execute,
      input: {
        work: { id: "analysis-work", branchId: child.id, role: "test", policy: "all" },
        input: undefined,
      },
    })
    await expect(ctx.exec({
      flow: merge,
      input: { targetId: "main", sourceIds: ["analysis"], workId: "registry-work", expectedTargetVersion: 0 },
    })).resolves.toMatchObject({ version: 1, evidence: [{ id: "plan", kind: "query-plan" }] })
    await expect(ctx.exec({
      flow: merge,
      input: { targetId: "main", sourceIds: ["analysis"], workId: "registry-work", expectedTargetVersion: 0 },
    })).rejects.toThrow("version conflict")

    await ctx.exec({
      flow: steer,
      input: {
        id: "control-1",
        workId: "registry-work",
        expectedEpoch: 1,
        sequence: 2,
        mode: "input",
        source: "human",
        payload: { focus: "index" },
      },
    })
    expect(runtime.controls.drain("registry-work", 1)).toHaveLength(1)
    await ctx.exec({
      flow: steer,
      input: {
        id: "control-stale",
        workId: "registry-work",
        expectedEpoch: 99,
        sequence: 3,
        mode: "input",
        source: "human",
        payload: { focus: "stale" },
      },
    })
    expect(runtime.controls.drain("registry-work", 1)).toHaveLength(1)
    runtime.continuations.set("codex:thread", "thread-1")
    expect(runtime.snapshot("open").providerContinuations).toEqual({ "codex:thread": "thread-1" })
    runtime.continuations.delete("codex:thread")
    expect(runtime.continuations.get("codex:thread")).toBeUndefined()
    runtime.controls.fence("registry-work", 1, 3)
    expect(runtime.controls.accepts("registry-work", 1, 3)).toBe(true)
    expect(runtime.controls.accepts("registry-work", 1, 2)).toBe(false)

    await ctx.close()
    await scope.dispose()
  })
})
