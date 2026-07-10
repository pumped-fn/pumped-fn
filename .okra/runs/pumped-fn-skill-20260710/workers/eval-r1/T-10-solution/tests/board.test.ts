import { createScope, preset } from "@pumped-fn/lite"
import { describe, expect, it } from "vitest"
import { retarget, renderDepartures } from "../src/board.js"
import { boardLink, type BoardLink, type Departure } from "../src/board-link.js"

function fakeLink(calls: string[]): BoardLink {
  return {
    open(address) {
      calls.push(`open:${address}`)
      return {
        address,
        render(departures) {
          calls.push(`render:${address}:${departures.length}`)
        },
        close() {
          calls.push(`close:${address}`)
        },
      }
    },
  }
}

describe("departure board", () => {
  it("renders departures through the wired board session", async () => {
    const calls: string[] = []
    const scope = createScope({ presets: [preset(boardLink, fakeLink(calls))] })
    const ctx = scope.createContext()
    const departures: Departure[] = [{ vessel: "Sea Glass", at: "10:20" }]

    await expect(ctx.exec({ flow: renderDepartures, input: { departures } })).resolves.toEqual({ rendered: 1 })
    expect(calls).toEqual(["open:harbor-main", "render:harbor-main:1"])

    await ctx.close({ ok: true })
    await scope.dispose()
  })

  it("closes before opening a session for a new address", async () => {
    const calls: string[] = []
    const scope = createScope({ presets: [preset(boardLink, fakeLink(calls))] })
    const ctx = scope.createContext()

    await ctx.exec({ flow: renderDepartures, input: { departures: [] } })
    await ctx.exec({ flow: retarget, input: { address: "north-quay" } })
    await ctx.exec({ flow: renderDepartures, input: { departures: [] } })
    expect(calls).toEqual([
      "open:harbor-main",
      "render:harbor-main:0",
      "close:harbor-main",
      "open:north-quay",
      "render:north-quay:0",
    ])

    await ctx.close({ ok: true })
    await scope.dispose()
  })

  it("keeps the live session for an unchanged address", async () => {
    const calls: string[] = []
    const scope = createScope({ presets: [preset(boardLink, fakeLink(calls))] })
    const ctx = scope.createContext()

    await ctx.exec({ flow: renderDepartures, input: { departures: [] } })
    await ctx.exec({ flow: retarget, input: { address: "harbor-main" } })
    await ctx.exec({ flow: renderDepartures, input: { departures: [] } })
    expect(calls).toEqual([
      "open:harbor-main",
      "render:harbor-main:0",
      "render:harbor-main:0",
    ])

    await ctx.close({ ok: true })
    await scope.dispose()
  })

  it("closes the live session during shutdown", async () => {
    const calls: string[] = []
    const scope = createScope({ presets: [preset(boardLink, fakeLink(calls))] })
    const ctx = scope.createContext()

    await ctx.exec({ flow: renderDepartures, input: { departures: [] } })
    await ctx.close({ ok: true })
    expect(calls).toEqual(["open:harbor-main", "render:harbor-main:0", "close:harbor-main"])

    await scope.dispose()
  })

  it("does not open a session when shutdown follows a retarget", async () => {
    const calls: string[] = []
    const scope = createScope({ presets: [preset(boardLink, fakeLink(calls))] })
    const ctx = scope.createContext()

    await ctx.exec({ flow: retarget, input: { address: "north-quay" } })
    await ctx.close({ ok: true })
    expect(calls).toEqual([])

    await scope.dispose()
  })

  it("starts each independently wired board at the default address", async () => {
    const firstCalls: string[] = []
    const firstScope = createScope({ presets: [preset(boardLink, fakeLink(firstCalls))] })
    const firstContext = firstScope.createContext()

    await firstContext.exec({ flow: retarget, input: { address: "north-quay" } })
    await firstContext.close({ ok: true })
    await firstScope.dispose()

    const secondCalls: string[] = []
    const secondScope = createScope({ presets: [preset(boardLink, fakeLink(secondCalls))] })
    const secondContext = secondScope.createContext()

    await secondContext.exec({ flow: renderDepartures, input: { departures: [] } })
    expect(secondCalls).toEqual(["open:harbor-main", "render:harbor-main:0"])

    await secondContext.close({ ok: true })
    await secondScope.dispose()
  })
})
