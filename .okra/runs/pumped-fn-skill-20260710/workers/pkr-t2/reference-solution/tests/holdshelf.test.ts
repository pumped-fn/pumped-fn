import { describe, expect, it } from "vitest"
import { createScope } from "@pumped-fn/lite"
import {
  drainPass,
  listHolds,
  printerReport,
  recordReturn,
  recordReturns,
  requestStop,
  runDispatcher,
} from "../src/holdshelf.ts"

const withDaemon = async (
  run: (daemon: ReturnType<ReturnType<typeof createScope>["createContext"]>) => Promise<void>,
) => {
  const scope = createScope()
  const daemon = scope.createContext()
  await run(daemon)
  await daemon.close()
  await scope.dispose()
}

const holds = (daemon: Parameters<Parameters<typeof withDaemon>[0]>[0]) =>
  daemon.exec({ flow: listHolds })
const printer = (daemon: Parameters<Parameters<typeof withDaemon>[0]>[0]) =>
  daemon.exec({ flow: printerReport })

describe("recordReturn", () => {
  it("commits a pending hold and rejects a duplicate while unfulfilled", async () => {
    await withDaemon(async (daemon) => {
      const first = await daemon.exec({
        flow: recordReturn,
        input: { isbn: "111", copyId: "c1" },
      })
      expect(first).toEqual({ holdId: 1 })
      await expect(
        daemon.exec({ flow: recordReturn, input: { isbn: "111", copyId: "c1" } }),
      ).rejects.toThrow(/HOLD_EXISTS/)
      expect(await holds(daemon)).toEqual([
        { holdId: 1, isbn: "111", copyId: "c1", status: "pending" },
      ])
    })
  })

  it("rejects exactly one of two racing duplicates", async () => {
    await withDaemon(async (daemon) => {
      const settled = await Promise.allSettled([
        daemon.exec({ flow: recordReturn, input: { isbn: "111", copyId: "c1" } }),
        daemon.exec({ flow: recordReturn, input: { isbn: "111", copyId: "c1" } }),
      ])
      expect(settled.filter((entry) => entry.status === "fulfilled")).toHaveLength(1)
      expect((await holds(daemon)).filter((hold) => hold.copyId === "c1")).toHaveLength(1)
    })
  })

  it("allows a new hold for the same copy once the previous slip is printed", async () => {
    await withDaemon(async (daemon) => {
      await daemon.exec({ flow: recordReturn, input: { isbn: "111", copyId: "c1" } })
      await daemon.exec({ flow: drainPass })
      const again = await daemon.exec({
        flow: recordReturn,
        input: { isbn: "111", copyId: "c1" },
      })
      expect(again).toEqual({ holdId: 2 })
    })
  })
})

describe("drainPass", () => {
  it("opens a fresh printer session per sibling pass and flushes on clean close", async () => {
    await withDaemon(async (daemon) => {
      await daemon.exec({ flow: recordReturn, input: { isbn: "111", copyId: "c1" } })
      await daemon.exec({ flow: recordReturn, input: { isbn: "222", copyId: "c2" } })
      const first = await daemon.exec({ flow: drainPass })
      await daemon.exec({ flow: recordReturn, input: { isbn: "333", copyId: "c3" } })
      const second = await daemon.exec({ flow: drainPass })
      expect(first).toEqual({ session: 1, printed: 2 })
      expect(second).toEqual({ session: 2, printed: 1 })
      expect(await printer(daemon)).toEqual([
        {
          session: 1,
          slips: [
            { holdId: 1, copyId: "c1" },
            { holdId: 2, copyId: "c2" },
          ],
          closed: "clean",
        },
        { session: 2, slips: [{ holdId: 3, copyId: "c3" }], closed: "clean" },
      ])
    })
  })

  it("prints each hold exactly once across two concurrent sibling passes", async () => {
    await withDaemon(async (daemon) => {
      for (const copyId of ["c1", "c2", "c3", "c4"]) {
        await daemon.exec({ flow: recordReturn, input: { isbn: "111", copyId } })
      }
      const [left, right] = await Promise.all([
        daemon.exec({ flow: drainPass }),
        daemon.exec({ flow: drainPass }),
      ])
      expect(left.session).not.toBe(right.session)
      expect(left.printed + right.printed).toBe(4)
      const report = await printer(daemon)
      expect(report.map((record) => record.closed)).toEqual(["clean", "clean"])
      const printedHoldIds = report
        .flatMap((record) => record.slips)
        .map((slip) => slip.holdId)
        .sort()
      expect(printedHoldIds).toEqual([1, 2, 3, 4])
      expect((await holds(daemon)).every((hold) => hold.status === "printed")).toBe(true)
    })
  })

  it("closes dirty on a jam: slips discarded, other holds pending again, offender rejected", async () => {
    await withDaemon(async (daemon) => {
      await daemon.exec({ flow: recordReturn, input: { isbn: "111", copyId: "c1" } })
      await daemon.exec({ flow: recordReturn, input: { isbn: "222", copyId: "c2" } })
      await daemon.exec({ flow: recordReturn, input: { isbn: "97801404491366", copyId: "c3" } })
      await expect(daemon.exec({ flow: drainPass })).rejects.toThrow(/PRINTER_JAM/)
      expect(await printer(daemon)).toEqual([{ session: 1, slips: [], closed: "dirty" }])
      expect((await holds(daemon)).map((hold) => hold.status)).toEqual([
        "pending",
        "pending",
        "rejected",
      ])
      const recovery = await daemon.exec({ flow: drainPass })
      expect(recovery).toEqual({ session: 2, printed: 2 })
      expect((await holds(daemon)).map((hold) => hold.status)).toEqual([
        "printed",
        "printed",
        "rejected",
      ])
    })
  })
})

describe("runDispatcher", () => {
  it("wakes on committed returns, drains everything, and stop finishes the drain", async () => {
    await withDaemon(async (daemon) => {
      const dispatcher = daemon.exec({ flow: runDispatcher })
      for (const copyId of ["c1", "c2", "c3"]) {
        await daemon.exec({ flow: recordReturn, input: { isbn: "111", copyId } })
      }
      await daemon.exec({ flow: requestStop })
      const outcome = await dispatcher
      expect(outcome.printed).toBe(3)
      expect((await holds(daemon)).every((hold) => hold.status === "printed")).toBe(true)
      const report = await printer(daemon)
      const printedHoldIds = report.flatMap((record) => record.slips).map((slip) => slip.holdId)
      expect([...printedHoldIds].sort()).toEqual([1, 2, 3])
      expect(report.every((record) => record.closed === "clean")).toBe(true)
    })
  })

  it("never observes a hold from a failing batch, even while awake", async () => {
    await withDaemon(async (daemon) => {
      const dispatcher = daemon.exec({ flow: runDispatcher })
      await daemon.exec({ flow: recordReturn, input: { isbn: "111", copyId: "c1" } })
      await expect(
        daemon.exec({
          flow: recordReturns,
          input: {
            returns: [
              { isbn: "222", copyId: "c2" },
              { isbn: "333", copyId: "c3" },
              { isbn: "444", copyId: "c3" },
            ],
          },
        }),
      ).rejects.toThrow(/HOLD_EXISTS/)
      await daemon.exec({ flow: requestStop })
      const outcome = await dispatcher
      expect(outcome.printed).toBe(1)
      expect((await holds(daemon)).map((hold) => hold.copyId)).toEqual(["c1"])
      const slips = (await printer(daemon)).flatMap((record) => record.slips)
      expect(slips).toEqual([{ holdId: 1, copyId: "c1" }])
    })
  })
})

describe("shelf state", () => {
  it("outlives the daemon context within one scope", async () => {
    const scope = createScope()
    const first = scope.createContext()
    await first.exec({ flow: recordReturn, input: { isbn: "111", copyId: "c1" } })
    await first.close()
    const second = scope.createContext()
    expect(await second.exec({ flow: listHolds })).toEqual([
      { holdId: 1, isbn: "111", copyId: "c1", status: "pending" },
    ])
    await second.close()
    await scope.dispose()
  })
})
