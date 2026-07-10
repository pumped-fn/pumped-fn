import { createScope } from "@pumped-fn/lite"
import { describe, expect, it } from "vitest"
import { drainPass, listHolds, printerReport, recordReturn, recordReturns, requestStop, runDispatcher } from "../src/holdshelf.js"

describe("library hold slips", () => {
  it("records singles and batches atomically", async () => {
    const scope = createScope()
    const ctx = scope.createContext()
    await expect(ctx.exec({ flow: recordReturn, input: { isbn: "9780000000001", copyId: "a" } })).resolves.toEqual({ holdId: 1 })
    await expect(ctx.exec({ flow: recordReturns, input: { returns: [
      { isbn: "9780000000002", copyId: "b" },
      { isbn: "9780000000003", copyId: "c" },
    ] } })).resolves.toEqual({ holdIds: [2, 3] })
    await expect(ctx.exec({ flow: recordReturns, input: { returns: [
      { isbn: "9780000000004", copyId: "d" },
      { isbn: "9780000000005", copyId: "a" },
    ] } })).rejects.toMatchObject({ fault: { code: "HOLD_EXISTS" } })
    await expect(ctx.exec({ flow: listHolds })).resolves.toEqual([
      { holdId: 1, isbn: "9780000000001", copyId: "a", status: "pending" },
      { holdId: 2, isbn: "9780000000002", copyId: "b", status: "pending" },
      { holdId: 3, isbn: "9780000000003", copyId: "c", status: "pending" },
    ])
    await ctx.close({ ok: true })
    await scope.dispose()
  })

  it("claims each hold once and closes fresh clean sessions", async () => {
    const scope = createScope()
    const ctx = scope.createContext()
    await ctx.exec({ flow: recordReturns, input: { returns: [
      { isbn: "9780000000001", copyId: "a" },
      { isbn: "9780000000002", copyId: "b" },
    ] } })
    await expect(ctx.exec({ flow: drainPass })).resolves.toEqual({ session: 1, printed: 2 })
    await expect(ctx.exec({ flow: drainPass })).resolves.toEqual({ session: 2, printed: 0 })
    await expect(ctx.exec({ flow: printerReport })).resolves.toEqual([
      { session: 1, slips: [{ holdId: 1, copyId: "a" }, { holdId: 2, copyId: "b" }], closed: "clean" },
      { session: 2, slips: [], closed: "clean" },
    ])
    await ctx.close({ ok: true })
    await scope.dispose()
  })

  it("allows exactly one concurrent return for the same copy", async () => {
    const scope = createScope()
    const ctx = scope.createContext()
    const first = ctx.exec({ flow: recordReturn, input: { isbn: "9780000000001", copyId: "a" } })
    const second = ctx.exec({ flow: recordReturn, input: { isbn: "9780000000002", copyId: "a" } })
    const results = await Promise.allSettled([first, second])
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1)
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1)
    await expect(ctx.exec({ flow: listHolds })).resolves.toHaveLength(1)
    await ctx.close({ ok: true })
    await scope.dispose()
  })

  it("records jams as dirty and dispatches all remaining work before stopping", async () => {
    const scope = createScope()
    const daemon = scope.createContext()
    const dispatcher = daemon.exec({ flow: runDispatcher })
    const writer = scope.createContext()
    await writer.exec({ flow: recordReturns, input: { returns: [
      { isbn: "9780000000001", copyId: "good" },
      { isbn: "97800000000000", copyId: "bad" },
      { isbn: "9780000000002", copyId: "later" },
    ] } })
    await writer.exec({ flow: requestStop })
    await writer.close({ ok: true })
    await expect(dispatcher).resolves.toEqual({ passes: 2, printed: 2 })
    const reader = scope.createContext()
    await expect(reader.exec({ flow: listHolds })).resolves.toEqual([
      { holdId: 1, isbn: "9780000000001", copyId: "good", status: "printed" },
      { holdId: 2, isbn: "97800000000000", copyId: "bad", status: "rejected" },
      { holdId: 3, isbn: "9780000000002", copyId: "later", status: "printed" },
    ])
    await expect(reader.exec({ flow: printerReport })).resolves.toEqual([
      { session: 1, slips: [], closed: "dirty" },
      { session: 2, slips: [{ holdId: 1, copyId: "good" }, { holdId: 3, copyId: "later" }], closed: "clean" },
    ])
    await reader.close({ ok: true })
    await daemon.close({ ok: true })
    await scope.dispose()
  })
})
