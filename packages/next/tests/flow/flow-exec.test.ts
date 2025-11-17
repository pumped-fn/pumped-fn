import { describe, it, expect, vi } from "vitest"
import { flow } from "../../src/flow"
import { custom } from "../../src/ssch"

describe("FlowContext.exec journaling", () => {
  it("replays journaled flow executions", async () => {
    const innerCalls = vi.fn()
    const inner = flow({
      name: "inner",
      input: custom<{ value: number }>(),
      output: custom<number>(),
    }).handler(async (_ctx, input) => {
      innerCalls()
      return input.value + 1
    })
    const outer = flow({
      name: "outer",
      input: custom<number>(),
      output: custom<number>(),
    }).handler(async (ctx, value) => {
      const first = await ctx.exec({ key: "inner", flow: inner, input: { value } })
      const second = await ctx.exec({ key: "inner", flow: inner, input: { value } })
      return first + second
    })
    const result = await flow.execute(outer, 1)
    expect(result).toBe(4)
    expect(innerCalls).toHaveBeenCalledTimes(1)
  })

  it("replays journaled fn executions", async () => {
    const fn = vi.fn().mockResolvedValue("done")
    const runner = flow({
      name: "fn",
      input: custom<void>(),
      output: custom<string>(),
    }).handler(async (ctx) => {
      const first = await ctx.exec<string>({ key: "fn", fn })
      const second = await ctx.exec<string>({ key: "fn", fn })
      return `${first}-${second}`
    })
    const result = await flow.execute(runner, undefined)
    expect(result).toBe("done-done")
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
