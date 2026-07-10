import { describe, expect, it } from "vitest"
import { createScope, preset } from "@pumped-fn/lite"
import { renderDepartures, retarget } from "../src/board.ts"
import { boardLink } from "../src/board-link.ts"
import type { BoardLink } from "../src/board-link.ts"

const sailing = [{ vessel: "MV Selkie", at: "08:15" }]

const trackedLink = () => {
  const calls: string[] = []
  const link: BoardLink = {
    open: (address) => {
      calls.push(`open:${address}`)
      return {
        address,
        render: (departures) => {
          calls.push(`render:${address}:${departures.length}`)
        },
        close: () => {
          calls.push(`close:${address}`)
        },
      }
    },
  }
  return { calls, link }
}

const withBoard = async (run: (board: {
  calls: string[]
  ctx: ReturnType<ReturnType<typeof createScope>["createContext"]>
}) => Promise<void>) => {
  const { calls, link } = trackedLink()
  const scope = createScope({ presets: [preset(boardLink, link)] })
  const ctx = scope.createContext()
  await run({ calls, ctx })
  await scope.dispose()
}

describe("departure board", () => {
  it("opens one session lazily and renders to it", async () => {
    await withBoard(async ({ calls, ctx }) => {
      expect(calls).toEqual([])
      const first = await ctx.exec({ flow: renderDepartures, input: { departures: sailing } })
      const second = await ctx.exec({ flow: renderDepartures, input: { departures: sailing } })
      expect(first).toEqual({ rendered: 1 })
      expect(second).toEqual({ rendered: 1 })
      expect(calls).toEqual(["open:harbor-main", "render:harbor-main:1", "render:harbor-main:1"])
      await ctx.close()
    })
  })

  it("retargets through the graph: old session closes before the new one serves a render", async () => {
    await withBoard(async ({ calls, ctx }) => {
      await ctx.exec({ flow: renderDepartures, input: { departures: sailing } })
      const moved = await ctx.exec({ flow: retarget, input: { address: "north-quay" } })
      expect(moved).toEqual({ address: "north-quay" })
      expect(calls).toEqual(["open:harbor-main", "render:harbor-main:1", "close:harbor-main"])
      await ctx.exec({ flow: renderDepartures, input: { departures: sailing } })
      expect(calls).toEqual([
        "open:harbor-main",
        "render:harbor-main:1",
        "close:harbor-main",
        "open:north-quay",
        "render:north-quay:1",
      ])
      await ctx.close()
    })
  })

  it("keeps the session when a retarget names the current address", async () => {
    await withBoard(async ({ calls, ctx }) => {
      await ctx.exec({ flow: renderDepartures, input: { departures: sailing } })
      await ctx.exec({ flow: retarget, input: { address: "harbor-main" } })
      await ctx.exec({ flow: renderDepartures, input: { departures: sailing } })
      expect(calls).toEqual(["open:harbor-main", "render:harbor-main:1", "render:harbor-main:1"])
      await ctx.close()
    })
  })

  it("closes the live session when the context closes", async () => {
    await withBoard(async ({ calls, ctx }) => {
      await ctx.exec({ flow: renderDepartures, input: { departures: sailing } })
      await ctx.close()
      expect(calls).toEqual(["open:harbor-main", "render:harbor-main:1", "close:harbor-main"])
    })
  })

  it("retargeting before any render opens the first session at the new address", async () => {
    await withBoard(async ({ calls, ctx }) => {
      await ctx.exec({ flow: retarget, input: { address: "south-pier" } })
      await ctx.exec({ flow: renderDepartures, input: { departures: sailing } })
      expect(calls).toEqual(["open:south-pier", "render:south-pier:1"])
      await ctx.close()
    })
  })
})
