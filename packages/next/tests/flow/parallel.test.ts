import { describe, it, expect } from "vitest"
import { flow } from "../../src/flow"
import { custom } from "../../src/ssch"
import { Promised } from "../../src/promises"

describe("FlowContext parallel helpers", () => {
  it("reports stats for parallel success", async () => {
    const runner = flow({
      name: "parallel",
      input: custom<void>(),
      output: custom<{ total: number; succeeded: number; failed: number }>(),
    }).handler(async (ctx) => {
      const { stats } = await ctx.parallel([
        Promised.create(Promise.resolve(1)),
        Promised.create(Promise.resolve(2)),
        Promised.create(Promise.resolve(3)),
      ])
      return stats
    })
    const stats = await flow.execute(runner, undefined)
    expect(stats).toEqual({ total: 3, succeeded: 3, failed: 0 })
  })

  it("counts rejections in parallelSettled stats", async () => {
    const runner = flow({
      name: "parallel-settled",
      input: custom<void>(),
      output: custom<{ total: number; succeeded: number; failed: number }>(),
    }).handler(async (ctx) => {
      const { stats } = await ctx.parallelSettled([
        Promised.create(Promise.resolve("a")),
        Promised.create(Promise.reject(new Error("x"))),
        Promised.create(Promise.resolve("b")),
      ])
      return stats
    })
    const stats = await flow.execute(runner, undefined)
    expect(stats).toEqual({ total: 3, succeeded: 2, failed: 1 })
  })
})
