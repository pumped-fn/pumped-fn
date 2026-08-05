import { createScope, flow, tags, typed } from "@pumped-fn/lite"
import * as session from "@pumped-fn/sdk/session"
import { describe, expect, it } from "vitest"
import { initialRecord, sessionKit, testAuthority } from "../src/index"

function readyRecord(id: string, authority: session.Authority): session.SessionRecord {
  return initialRecord(id, authority, {
    work: [{
      id: "same-work",
      branchId: "main",
      role: "worker",
      status: "ready",
      policy: "all",
      attempt: 1,
      authority,
    }],
  })
}

describe("candidate branch and policy defaults", () => {
  it("rejects resume after the current branch changes instead of rebinding stored work", async () => {
    const authority = testAuthority()
    let runtime!: session.SessionRuntime
    const wake: session.Wake = flow({
      name: "counterexample.resume.wake",
      parse: typed<{ id: string }>(),
      factory: () => {
        const work = runtime.record.work.find((value) => value.id === "resumable")!
        return Object.freeze({ ...work, status: "ready" as const, attempt: work.attempt + 1 })
      },
    })
    const firstBundle = sessionKit({ id: "branch-switch", authority })
    const firstScope = createScope({ tags: [firstBundle.tags, session.scheduler.wake(wake)] })
    const first = firstScope.createContext()
    runtime = await first.resolve(session.session)
    const creator = runtime.work.admit({
      id: "branch-creator",
      branchId: "main",
      role: "creator",
      policy: "all",
    })
    runtime.work.settle(creator.record.workId, creator.record.attempt, { status: "completed" })
    const alternate = await first.exec({
      flow: session.fork,
      input: { id: "alternate", parentId: "main", workId: "branch-creator", authority: {} },
    })
    await first.exec({
      flow: session.wait,
      input: {
        work: { id: "resumable", role: "worker", policy: "all" },
        intent: {
          id: "resume",
          dueAt: "2026-08-05T00:00:00.000Z",
          priority: 1,
          expectedSessionVersion: runtime.record.version,
        },
      },
    })
    await first.exec({ flow: session.wake, input: { id: "resume" } })
    expect(runtime.record.work.find((value) => value.id === "resumable")).toMatchObject({
      branchId: "main",
      policy: "all",
      status: "ready",
    })
    expect(runtime.eventsFor("resumable").find((value) => value.type === "work.admitted")).toMatchObject({
      branchId: "main",
    })
    const switched = Object.freeze({ ...runtime.snapshot("open"), currentBranchId: alternate.id })
    await first.close()
    await firstScope.dispose()

    const resumedBundle = sessionKit({ authority, record: switched })
    const resumedScope = createScope({ tags: resumedBundle.tags })
    const resumed = resumedScope.createContext()
    const resumedRuntime = await resumed.resolve(session.session)

    await expect(resumed.exec({
      flow: session.run,
      input: {
        work: { id: "resumable", role: "worker", policy: "all" },
        input: undefined,
      },
    })).rejects.toThrow("Work resumable resume contract changed")
    expect(resumedRuntime.record.work.find((value) => value.id === "resumable")).toMatchObject({
      branchId: "main",
      policy: "all",
      status: "ready",
    })

    await resumed.close()
    await resumedScope.dispose()
  })

  it("treats defaulted and explicit effective values the same during ready-work dedup", async () => {
    const authority = testAuthority()
    const inspect = flow({
      name: "counterexample.dedup.inspect",
      deps: { work: tags.required(session.current.work) },
      factory: (_ctx, { work }) => ({
        id: work.id,
        branchId: work.branchId,
        role: work.role,
        policy: work.policy,
        attempt: work.attempt,
      }),
    })
    const defaultBundle = sessionKit({ authority, record: readyRecord("default-resume", authority), turn: inspect })
    const defaultScope = createScope({ tags: defaultBundle.tags })
    const defaultCtx = defaultScope.createContext()
    const defaultRuntime = await defaultCtx.resolve(session.session)
    const defaulted = await defaultCtx.exec({
      flow: session.run,
      input: {
        work: { id: "same-work", role: "worker", policy: "all" },
        input: undefined,
      },
    })

    const explicitBundle = sessionKit({ authority, record: readyRecord("explicit-resume", authority), turn: inspect })
    const explicitScope = createScope({ tags: explicitBundle.tags })
    const explicitCtx = explicitScope.createContext()
    await explicitCtx.resolve(session.session)
    const explicit = await explicitCtx.exec({
      flow: session.run,
      input: {
        work: { id: "same-work", branchId: "main", role: "worker", policy: "all" },
        input: undefined,
      },
    })

    expect(defaulted).toEqual(explicit)
    expect(defaulted).toEqual({
      id: "same-work",
      branchId: "main",
      role: "worker",
      policy: "all",
      attempt: 1,
    })

    await defaultCtx.close()
    await defaultScope.dispose()
    await explicitCtx.close()
    await explicitScope.dispose()
  })

  it("keeps defaulted effective values inside the wake boundary", async () => {
    let runtime!: session.SessionRuntime
    const wake: session.Wake = flow({
      name: "counterexample.wake.changed-branch",
      parse: typed<{ id: string }>(),
      factory: () => {
        const work = runtime.record.work.find((value) => value.id === "waiting")!
        return Object.freeze({
          ...work,
          branchId: "changed-by-scheduler",
          status: "ready" as const,
          attempt: work.attempt + 1,
        })
      },
    })
    const bundle = sessionKit({ id: "wake-boundary" })
    const scope = createScope({ tags: [bundle.tags, session.scheduler.wake(wake)] })
    const ctx = scope.createContext()
    runtime = await ctx.resolve(session.session)
    await ctx.exec({
      flow: session.wait,
      input: {
        work: { id: "waiting", role: "worker", policy: "all" },
        intent: {
          id: "wake",
          dueAt: "2026-08-05T00:00:00.000Z",
          priority: 1,
          expectedSessionVersion: runtime.record.version,
        },
      },
    })

    await expect(ctx.exec({ flow: session.wake, input: { id: "wake" } })).rejects.toThrow(
      "scheduler.wake boundary",
    )
    expect(runtime.record.work.find((value) => value.id === "waiting")).toMatchObject({
      branchId: "main",
      policy: "all",
      status: "waiting",
    })

    await ctx.close()
    await scope.dispose()
  })
})
