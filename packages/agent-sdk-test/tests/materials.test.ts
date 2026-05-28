import { describe, expect, it } from "vitest"
import { createScope } from "@pumped-fn/lite"
import {
  derivedMaterial,
  material,
  patchMaterial,
  workflowRun,
} from "@pumped-fn/agent-sdk"

describe("materials", () => {
  it("patches JSON materials with revision conflicts", async () => {
    const scope = createScope()
    const ctx = scope.createContext({ tags: [workflowRun({ taskId: "task-d", runId: "run-d" })] })
    const prStatus = material("pr-status", {
      kind: "json",
      initialState: { prs: {} as Record<string, { status: string }> },
    })

    const next = await patchMaterial(ctx, prStatus, [
      { op: "add", path: "/prs/12", value: { status: "ok" } },
    ])
    expect(next).toEqual({
      name: "pr-status",
      kind: "json",
      revision: 1,
      state: { prs: { "12": { status: "ok" } } },
    })
    await expect(
      patchMaterial(ctx, prStatus, [
        { op: "replace", path: "/prs/12/status", value: "stale" },
      ], { expectedRevision: 0 })
    ).rejects.toThrow("Material revision conflict")
    await ctx.close()
  })

  it("serializes concurrent material patches", async () => {
    const scope = createScope()
    const ctx = scope.createContext()
    const queue = material("queue", {
      kind: "json",
      initialState: { items: [] as string[] },
    })

    await Promise.all([
      patchMaterial(ctx, queue, [{ op: "add", path: "/items/-", value: "a" }]),
      patchMaterial(ctx, queue, [{ op: "add", path: "/items/-", value: "b" }]),
    ])

    expect(ctx.scope.controller(queue).get()).toEqual({
      name: "queue",
      kind: "json",
      revision: 2,
      state: { items: ["a", "b"] },
    })
    await ctx.close()
  })

  it("allows ephemeral materials", () => {
    expect(material("ephemeral", {
      kind: "json",
      initialState: {},
      keepAlive: false,
    }).keepAlive).toBe(false)
  })

  it("derives material state from primary material", async () => {
    const source = material("count", {
      kind: "json",
      initialState: { value: 2 },
    })
    const doubled = derivedMaterial("double", source, (state) => state.value * 2, { kind: "json" })
    const scope = createScope()
    expect(await scope.resolve(doubled)).toEqual({
      name: "double",
      kind: "json",
      revision: 0,
      state: 4,
    })
  })
})
