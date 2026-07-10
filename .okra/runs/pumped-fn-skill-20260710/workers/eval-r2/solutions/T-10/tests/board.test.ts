import { createScope, preset } from "@pumped-fn/lite"
import { describe, expect, it } from "vitest"
import { boardLink, type BoardLink, type Departure } from "../src/board-link.js"
import { renderDepartures, retarget } from "../src/board.js"

function fakeBoard(log: string[]): BoardLink {
  return {
    open: (address) => {
      log.push(`open:${address}`)
      return {
        address,
        render: (departures) => log.push(`render:${address}:${departures.length}`),
        close: () => log.push(`close:${address}`),
      }
    },
  }
}

const departures: Departure[] = [{ vessel: "Island Star", at: "09:30" }]

describe("departure board", () => {
  it("renders departures through the board session", async () => {
    const log: string[] = []
    const scope = createScope({ presets: [preset(boardLink, fakeBoard(log))] })
    const ctx = scope.createContext()

    await expect(ctx.exec({ flow: renderDepartures, input: { departures } })).resolves.toEqual({ rendered: 1 })
    expect(log).toEqual(["open:harbor-main", "render:harbor-main:1"])

    await ctx.close({ ok: true })
    await scope.dispose()
  })

  it("closes the old session before opening and rendering at a new address", async () => {
    const log: string[] = []
    const scope = createScope({ presets: [preset(boardLink, fakeBoard(log))] })
    const ctx = scope.createContext()

    await ctx.exec({ flow: renderDepartures, input: { departures } })
    await ctx.exec({ flow: retarget, input: { address: "north-quay" } })
    await ctx.exec({ flow: renderDepartures, input: { departures } })
    expect(log).toEqual([
      "open:harbor-main",
      "render:harbor-main:1",
      "close:harbor-main",
      "open:north-quay",
      "render:north-quay:1",
    ])

    await ctx.close({ ok: true })
    await scope.dispose()
  })

  it("keeps the live session when retargeting to its current address", async () => {
    const log: string[] = []
    const scope = createScope({ presets: [preset(boardLink, fakeBoard(log))] })
    const ctx = scope.createContext()

    await ctx.exec({ flow: renderDepartures, input: { departures } })
    await ctx.exec({ flow: retarget, input: { address: "harbor-main" } })
    await ctx.exec({ flow: renderDepartures, input: { departures } })
    expect(log).toEqual([
      "open:harbor-main",
      "render:harbor-main:1",
      "render:harbor-main:1",
    ])

    await ctx.close({ ok: true })
    await scope.dispose()
  })

  it("closes the live session at shutdown", async () => {
    const log: string[] = []
    const scope = createScope({ presets: [preset(boardLink, fakeBoard(log))] })
    const ctx = scope.createContext()

    await ctx.exec({ flow: renderDepartures, input: { departures } })
    await ctx.close({ ok: true })
    expect(log).toEqual(["open:harbor-main", "render:harbor-main:1", "close:harbor-main"])

    await scope.dispose()
  })
})
