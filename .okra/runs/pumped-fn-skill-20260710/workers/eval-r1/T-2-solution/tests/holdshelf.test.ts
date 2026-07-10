import { createScope } from "@pumped-fn/lite"
import { describe, expect, it } from "vitest"
import {
  drainPass,
  listHolds,
  printerReport,
  recordReturn,
  recordReturns,
  requestStop,
  runDispatcher,
} from "../src/holdshelf.js"

async function withDaemon(test: (daemon: ReturnType<ReturnType<typeof createScope>["createContext"]>) => Promise<void>): Promise<void> {
  const scope = createScope()
  const daemon = scope.createContext()
  try {
    await test(daemon)
    await daemon.close({ ok: true })
  } catch (error) {
    await daemon.close({ ok: false, error })
    throw error
  } finally {
    await scope.dispose()
  }
}

describe("hold shelf", () => {
  it("records atomically and rejects duplicate copies", async () => {
    await withDaemon(async (daemon) => {
      await expect(daemon.exec({ flow: recordReturn, input: { isbn: "9780140328721", copyId: "a" } }))
        .resolves.toEqual({ holdId: 1 })
      const failed = daemon.exec({
        flow: recordReturns,
        input: { returns: [{ isbn: "9780061120084", copyId: "b" }, { isbn: "x", copyId: "a" }] },
      })
      await expect(failed).rejects.toMatchObject({ fault: { code: "HOLD_EXISTS" } })
      await expect(daemon.exec({ flow: listHolds })).resolves.toEqual([
        { holdId: 1, isbn: "9780140328721", copyId: "a", status: "pending" },
      ])
      const raced = await Promise.allSettled([
        daemon.exec({ flow: recordReturn, input: { isbn: "9780439139601", copyId: "race" } }),
        daemon.exec({ flow: recordReturn, input: { isbn: "9780439139601", copyId: "race" } }),
      ])
      expect(raced.filter((result) => result.status === "fulfilled")).toHaveLength(1)
      expect(raced.filter((result) => result.status === "rejected")).toHaveLength(1)
    })
  })

  it("commits clean sessions and permits a printed copy to return again", async () => {
    await withDaemon(async (daemon) => {
      await daemon.exec({ flow: recordReturns, input: { returns: [
        { isbn: "9780140328721", copyId: "a" },
        { isbn: "9780061120084", copyId: "b" },
      ] } })
      await expect(daemon.exec({ flow: drainPass })).resolves.toEqual({ session: 1, printed: [1, 2] })
      await expect(daemon.exec({ flow: recordReturn, input: { isbn: "9780140328721", copyId: "a" } }))
        .resolves.toEqual({ holdId: 3 })
      await expect(daemon.exec({ flow: printerReport })).resolves.toEqual([
        { session: 1, slips: [{ holdId: 1, copyId: "a" }, { holdId: 2, copyId: "b" }], closed: "clean" },
      ])
      await expect(daemon.exec({ flow: drainPass })).resolves.toEqual({ session: 2, printed: [3] })
      await expect(daemon.exec({ flow: drainPass })).resolves.toEqual({ session: 3, printed: [] })
    })
  })

  it("discards a jammed pass and drains the recovered work before stopping", async () => {
    await withDaemon(async (daemon) => {
      const dispatcher = daemon.exec({ flow: runDispatcher })
      await daemon.exec({ flow: recordReturns, input: { returns: [
        { isbn: "9780140328721", copyId: "a" },
        { isbn: "12345678901234", copyId: "bad" },
        { isbn: "9780061120084", copyId: "b" },
      ] } })
      await daemon.exec({ flow: requestStop })
      await expect(dispatcher).resolves.toEqual({ passes: 2, printed: 2 })
      await expect(daemon.exec({ flow: listHolds })).resolves.toEqual([
        { holdId: 1, isbn: "9780140328721", copyId: "a", status: "printed" },
        { holdId: 2, isbn: "12345678901234", copyId: "bad", status: "rejected" },
        { holdId: 3, isbn: "9780061120084", copyId: "b", status: "printed" },
      ])
      await expect(daemon.exec({ flow: printerReport })).resolves.toEqual([
        { session: 1, slips: [], closed: "dirty" },
        { session: 2, slips: [{ holdId: 1, copyId: "a" }, { holdId: 3, copyId: "b" }], closed: "clean" },
      ])
    })
  })
})
