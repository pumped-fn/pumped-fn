import { createScope, flow } from "@pumped-fn/lite"
import * as session from "@pumped-fn/sdk/session"
import { describe, expect, it } from "vitest"
import { sessionKit } from "../src/index"

describe("load-bearing work identity and policy", () => {
  it("shows default all waiting where explicit fail-fast cancels a sibling", async () => {
    const bundle = sessionKit({ id: "join-policy" })
    const scope = createScope({ tags: bundle.tags })
    const ctx = scope.createContext()
    const runtime = await ctx.resolve(session.session)

    const allParent = runtime.work.admit({ id: "all-parent", role: "parent", policy: "all" })
    runtime.work.settle(allParent.record.workId, allParent.record.attempt, { status: "completed" })
    const allFailed = runtime.work.admit({
      id: "all-failed",
      parentId: "all-parent",
      role: "child",
      policy: "all",
    })
    const allSibling = runtime.work.admit({
      id: "all-sibling",
      parentId: "all-parent",
      role: "child",
      policy: "all",
    })
    runtime.work.settle(allFailed.record.workId, allFailed.record.attempt, { status: "failed" })
    const allPolicy = runtime.record.work.find((value) => value.id === "all-parent")!.policy
    let allDone = false
    const allJoin = ctx.exec({
      flow: session.join,
      input: { workIds: ["all-failed", "all-sibling"], policy: allPolicy },
    }).then((value) => {
      allDone = true
      return value
    })
    await Promise.resolve()

    expect(allDone).toBe(false)
    expect(allSibling.signal.aborted).toBe(false)
    runtime.work.settle(allSibling.record.workId, allSibling.record.attempt, { status: "completed" })
    await expect(allJoin).resolves.toEqual([{ status: "failed" }, { status: "completed" }])

    const fastParent = runtime.work.admit({
      id: "fast-parent",
      branchId: "main",
      role: "parent",
      policy: "fail-fast",
    })
    runtime.work.settle(fastParent.record.workId, fastParent.record.attempt, { status: "completed" })
    const fastFailed = runtime.work.admit({
      id: "fast-failed",
      parentId: "fast-parent",
      branchId: "main",
      role: "child",
      policy: "fail-fast",
    })
    const fastSibling = runtime.work.admit({
      id: "fast-sibling",
      parentId: "fast-parent",
      branchId: "main",
      role: "child",
      policy: "fail-fast",
    })
    fastSibling.signal.addEventListener("abort", () => {
      runtime.work.settle(fastSibling.record.workId, fastSibling.record.attempt, { status: "cancelled" })
    }, { once: true })
    runtime.work.settle(fastFailed.record.workId, fastFailed.record.attempt, { status: "failed" })
    const fastPolicy = runtime.record.work.find((value) => value.id === "fast-parent")!.policy

    await expect(ctx.exec({
      flow: session.join,
      input: { workIds: ["fast-failed", "fast-sibling"], policy: fastPolicy },
    })).resolves.toEqual([{ status: "failed" }, { status: "cancelled" }])
    expect(fastSibling.signal.aborted).toBe(true)

    await ctx.close()
    await scope.dispose()
  })

  it("shows a constant default id collapsing two distinct calls", async () => {
    const turn = flow({ name: "counterexample.id.turn", factory: (ctx) => ctx.input })
    const bundle = sessionKit({ id: "id-default", turn })
    const scope = createScope({ tags: bundle.tags })
    const ctx = scope.createContext()
    const runtime = await ctx.resolve(session.session)
    const defaultId = `${runtime.record.id}:work`

    await expect(ctx.exec({
      flow: session.run,
      input: {
        work: { id: defaultId, branchId: "main", role: "worker", policy: "all" },
        input: { call: 1 },
      },
    })).resolves.toEqual({ call: 1 })
    await expect(ctx.exec({
      flow: session.run,
      input: {
        work: { id: defaultId, branchId: "main", role: "worker", policy: "all" },
        input: { call: 2 },
      },
    })).rejects.toThrow(`Work ${defaultId} already exists`)
    expect(runtime.record.work).toMatchObject([{ id: defaultId, status: "completed" }])

    await ctx.close()
    await scope.dispose()
  })

  it("shows a default role disagreeing with the selected agent role", async () => {
    const bundle = sessionKit({
      id: "role-default",
      role: { name: "reviewer", version: "1", maxRounds: 1 },
      respond: { events: [], result: { content: "reviewed", stop: true } },
    })
    const scope = createScope({ tags: bundle.tags })
    const ctx = scope.createContext()
    const runtime = await ctx.resolve(session.session)

    await expect(ctx.exec({
      flow: session.run,
      input: {
        work: { id: "review", branchId: "main", role: "default-role", policy: "all" },
        input: { prompt: "Review this." },
      },
    })).resolves.toMatchObject({ role: "reviewer", content: "reviewed" })
    expect(runtime.record.work.find((value) => value.id === "review")).toMatchObject({
      role: "default-role",
      status: "completed",
    })
    expect(runtime.eventsFor("review").find((value) => value.type === "agent_role_start")).toMatchObject({
      targetName: "reviewer",
    })

    await ctx.close()
    await scope.dispose()
  })
})
