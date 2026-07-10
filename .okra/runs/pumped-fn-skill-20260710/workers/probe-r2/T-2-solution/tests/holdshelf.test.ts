import { createScope } from "@pumped-fn/lite"
import { describe, expect, it } from "vitest"
import { drainPass, listHolds, printerReport, recordReturn, recordReturns, requestStop, runDispatcher } from "../src/holdshelf.js"

async function withDaemon(run: (daemon: ReturnType<ReturnType<typeof createScope>["createContext"]>) => Promise<void>): Promise<void> {
  const scope = createScope()
  const daemon = scope.createContext()
  try {
    await run(daemon)
    await daemon.close({ ok: true })
  } finally {
    await scope.dispose()
  }
}

describe("library hold shelf", () => {
  it("records a batch atomically and rejects duplicate copies", async () => {
    await withDaemon(async (daemon) => {
      await expect(daemon.exec({
        flow: recordReturns,
        input: { returns: [{ isbn: "a", copyId: "one" }, { isbn: "b", copyId: "two" }] },
      })).resolves.toEqual({ holdIds: [1, 2] })
      await expect(daemon.exec({
        flow: recordReturns,
        input: { returns: [{ isbn: "c", copyId: "two" }, { isbn: "d", copyId: "three" }] },
      })).rejects.toMatchObject({ fault: { code: "HOLD_EXISTS", copyId: "two" } })
      await expect(daemon.exec({ flow: listHolds })).resolves.toEqual([
        { holdId: 1, isbn: "a", copyId: "one", status: "pending" },
        { holdId: 2, isbn: "b", copyId: "two", status: "pending" },
      ])
    })
  })

  it("opens and closes a fresh printer session for every pass", async () => {
    await withDaemon(async (daemon) => {
      await daemon.exec({ flow: recordReturn, input: { isbn: "a", copyId: "one" } })
      await expect(daemon.exec({ flow: drainPass })).resolves.toEqual({ session: 1, printed: 1 })
      await expect(daemon.exec({ flow: drainPass })).resolves.toEqual({ session: 2, printed: 0 })
      await expect(daemon.exec({ flow: printerReport })).resolves.toEqual([
        { session: 1, slips: [{ holdId: 1, copyId: "one" }], closed: "clean" },
        { session: 2, slips: [], closed: "clean" },
      ])
    })
  })

  it("records a dirty empty session and leaves other work pending on a jam", async () => {
    await withDaemon(async (daemon) => {
      await daemon.exec({
        flow: recordReturns,
        input: { returns: [{ isbn: "good", copyId: "one" }, { isbn: "12345678901234", copyId: "two" }] },
      })
      await expect(daemon.exec({ flow: drainPass })).rejects.toMatchObject({ fault: { code: "PRINTER_JAM", holdId: 2 } })
      await expect(daemon.exec({ flow: listHolds })).resolves.toEqual([
        { holdId: 1, isbn: "good", copyId: "one", status: "pending" },
        { holdId: 2, isbn: "12345678901234", copyId: "two", status: "rejected" },
      ])
      await expect(daemon.exec({ flow: drainPass })).resolves.toEqual({ session: 2, printed: 1 })
    })
  })

  it("drains all committed work before a requested stop", async () => {
    await withDaemon(async (daemon) => {
      const dispatcher = daemon.exec({ flow: runDispatcher })
      await daemon.exec({ flow: recordReturn, input: { isbn: "a", copyId: "one" } })
      await daemon.exec({ flow: recordReturn, input: { isbn: "b", copyId: "two" } })
      await daemon.exec({ flow: requestStop })
      await expect(dispatcher).resolves.toEqual({ passes: 1, printed: 2 })
      await expect(daemon.exec({ flow: listHolds })).resolves.toEqual([
        { holdId: 1, isbn: "a", copyId: "one", status: "printed" },
        { holdId: 2, isbn: "b", copyId: "two", status: "printed" },
      ])
    })
  })
})
