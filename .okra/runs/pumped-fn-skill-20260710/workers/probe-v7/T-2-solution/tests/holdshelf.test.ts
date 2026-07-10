import { createScope, isFault } from "@pumped-fn/lite"
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

function isbn(seed: number): string {
  return String(1000000000000 + seed).slice(0, 13)
}

describe("recordReturn", () => {
  it("commits a pending hold and numbers holds consecutively from 1", async () => {
    const scope = createScope()
    const daemon = scope.createContext()
    const first = await daemon.exec({ flow: recordReturn, input: { isbn: isbn(1), copyId: "c1" } })
    const second = await daemon.exec({ flow: recordReturn, input: { isbn: isbn(2), copyId: "c2" } })
    expect(first).toEqual({ holdId: 1 })
    expect(second).toEqual({ holdId: 2 })
    await expect(daemon.exec({ flow: listHolds })).resolves.toEqual([
      { holdId: 1, isbn: isbn(1), copyId: "c1", status: "pending" },
      { holdId: 2, isbn: isbn(2), copyId: "c2", status: "pending" },
    ])
    await daemon.close({ ok: true })
    await scope.dispose()
  })

  it("rejects a second unfulfilled hold on the same copy with HOLD_EXISTS and commits nothing", async () => {
    const scope = createScope()
    const daemon = scope.createContext()
    await daemon.exec({ flow: recordReturn, input: { isbn: isbn(1), copyId: "c1" } })
    const run = daemon.exec({ flow: recordReturn, input: { isbn: isbn(2), copyId: "c1" } })
    await expect(run).rejects.toSatisfy((error: unknown) => isFault(recordReturn, error) && error.fault.code === "HOLD_EXISTS")
    const holds = await daemon.exec({ flow: listHolds })
    expect(holds).toHaveLength(1)
    await daemon.close({ ok: true })
    await scope.dispose()
  })

  it("lets the same copy be held again once its prior hold is printed", async () => {
    const scope = createScope()
    const daemon = scope.createContext()
    await daemon.exec({ flow: recordReturn, input: { isbn: isbn(1), copyId: "c1" } })
    await daemon.exec({ flow: drainPass })
    const second = await daemon.exec({ flow: recordReturn, input: { isbn: isbn(2), copyId: "c1" } })
    expect(second).toEqual({ holdId: 2 })
    await daemon.close({ ok: true })
    await scope.dispose()
  })

  it("races two calls for the same copy and lets exactly one win", async () => {
    const scope = createScope()
    const daemon = scope.createContext()
    const results = await Promise.allSettled([
      daemon.exec({ flow: recordReturn, input: { isbn: isbn(1), copyId: "race" } }),
      daemon.exec({ flow: recordReturn, input: { isbn: isbn(2), copyId: "race" } }),
    ])
    const fulfilled = results.filter((result) => result.status === "fulfilled")
    const rejected = results.filter((result) => result.status === "rejected")
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    const holds = await daemon.exec({ flow: listHolds })
    expect(holds).toHaveLength(1)
    await daemon.close({ ok: true })
    await scope.dispose()
  })
})

describe("recordReturns", () => {
  it("commits every entry atomically", async () => {
    const scope = createScope()
    const daemon = scope.createContext()
    const result = await daemon.exec({
      flow: recordReturns,
      input: { returns: [{ isbn: isbn(1), copyId: "b1" }, { isbn: isbn(2), copyId: "b2" }] },
    })
    expect(result).toEqual({ holdIds: [1, 2] })
    const holds = await daemon.exec({ flow: listHolds })
    expect(holds.map((hold) => hold.status)).toEqual(["pending", "pending"])
    await daemon.close({ ok: true })
    await scope.dispose()
  })

  it("fails the whole batch on a duplicate within the batch and commits nothing", async () => {
    const scope = createScope()
    const daemon = scope.createContext()
    const run = daemon.exec({
      flow: recordReturns,
      input: { returns: [{ isbn: isbn(1), copyId: "dup" }, { isbn: isbn(2), copyId: "dup" }] },
    })
    await expect(run).rejects.toSatisfy((error: unknown) => isFault(recordReturns, error) && error.fault.code === "HOLD_EXISTS")
    await expect(daemon.exec({ flow: listHolds })).resolves.toEqual([])
    await daemon.close({ ok: true })
    await scope.dispose()
  })

  it("fails the whole batch on a duplicate against the shelf and commits nothing", async () => {
    const scope = createScope()
    const daemon = scope.createContext()
    await daemon.exec({ flow: recordReturn, input: { isbn: isbn(1), copyId: "shelved" } })
    const run = daemon.exec({
      flow: recordReturns,
      input: { returns: [{ isbn: isbn(2), copyId: "other" }, { isbn: isbn(3), copyId: "shelved" }] },
    })
    await expect(run).rejects.toSatisfy((error: unknown) => isFault(recordReturns, error) && error.fault.code === "HOLD_EXISTS")
    const holds = await daemon.exec({ flow: listHolds })
    expect(holds).toHaveLength(1)
    await daemon.close({ ok: true })
    await scope.dispose()
  })
})

describe("drainPass", () => {
  it("opens a fresh numbered session even when nothing is pending", async () => {
    const scope = createScope()
    const daemon = scope.createContext()
    const empty = await daemon.exec({ flow: drainPass })
    expect(empty).toEqual({ session: 1, printed: 0 })
    const second = await daemon.exec({ flow: drainPass })
    expect(second).toEqual({ session: 2, printed: 0 })
    const report = await daemon.exec({ flow: printerReport })
    expect(report).toEqual([
      { session: 1, slips: [], closed: "clean" },
      { session: 2, slips: [], closed: "clean" },
    ])
    await daemon.close({ ok: true })
    await scope.dispose()
  })

  it("prints every taken hold and commits both effects immediately", async () => {
    const scope = createScope()
    const daemon = scope.createContext()
    await daemon.exec({ flow: recordReturn, input: { isbn: isbn(1), copyId: "c1" } })
    await daemon.exec({ flow: recordReturn, input: { isbn: isbn(2), copyId: "c2" } })
    const result = await daemon.exec({ flow: drainPass })
    expect(result).toEqual({ session: 1, printed: 2 })
    const holds = await daemon.exec({ flow: listHolds })
    expect(holds.map((hold) => hold.status)).toEqual(["printed", "printed"])
    const report = await daemon.exec({ flow: printerReport })
    expect(report).toEqual([
      {
        session: 1,
        slips: [
          { holdId: 1, copyId: "c1" },
          { holdId: 2, copyId: "c2" },
        ],
        closed: "clean",
      },
    ])
    await daemon.close({ ok: true })
    await scope.dispose()
  })

  it("partitions concurrent passes so each taken hold is printed exactly once", async () => {
    const scope = createScope()
    const daemon = scope.createContext()
    for (let i = 0; i < 6; i += 1) {
      await daemon.exec({ flow: recordReturn, input: { isbn: isbn(i), copyId: `copy-${i}` } })
    }
    const [first, second] = await Promise.all([
      daemon.exec({ flow: drainPass }),
      daemon.exec({ flow: drainPass }),
    ])
    expect(first.session).not.toEqual(second.session)
    expect(first.printed + second.printed).toBe(6)
    const holds = await daemon.exec({ flow: listHolds })
    expect(holds.every((hold) => hold.status === "printed")).toBe(true)
    const report = await daemon.exec({ flow: printerReport })
    const allSlips = report.flatMap((session) => session.slips)
    expect(allSlips).toHaveLength(6)
    expect(new Set(allSlips.map((slip) => slip.holdId)).size).toBe(6)
    await daemon.close({ ok: true })
    await scope.dispose()
  })

  it("jams on an isbn longer than 13 characters, rejecting the offender and returning the rest to pending", async () => {
    const scope = createScope()
    const daemon = scope.createContext()
    await daemon.exec({ flow: recordReturn, input: { isbn: isbn(1), copyId: "ok-1" } })
    await daemon.exec({ flow: recordReturn, input: { isbn: "12345678901234", copyId: "jam-1" } })
    await daemon.exec({ flow: recordReturn, input: { isbn: isbn(2), copyId: "ok-2" } })

    const run = daemon.exec({ flow: drainPass })
    await expect(run).rejects.toSatisfy((error: unknown) => isFault(drainPass, error) && error.fault.code === "PRINTER_JAM")

    const afterJam = await daemon.exec({ flow: listHolds })
    expect(afterJam).toEqual([
      { holdId: 1, isbn: isbn(1), copyId: "ok-1", status: "pending" },
      { holdId: 2, isbn: "12345678901234", copyId: "jam-1", status: "rejected" },
      { holdId: 3, isbn: isbn(2), copyId: "ok-2", status: "pending" },
    ])
    const reportAfterJam = await daemon.exec({ flow: printerReport })
    expect(reportAfterJam).toEqual([{ session: 1, slips: [], closed: "dirty" }])

    const recovered = await daemon.exec({ flow: drainPass })
    expect(recovered).toEqual({ session: 2, printed: 2 })
    const afterRecovery = await daemon.exec({ flow: listHolds })
    expect(afterRecovery.map((hold) => hold.status)).toEqual(["printed", "rejected", "printed"])

    await daemon.close({ ok: true })
    await scope.dispose()
  })
})

describe("runDispatcher / requestStop", () => {
  it("drains holds committed before it starts and resolves totals once stopped", async () => {
    const scope = createScope()
    const daemon = scope.createContext()
    await daemon.exec({ flow: recordReturn, input: { isbn: isbn(1), copyId: "c1" } })
    await daemon.exec({ flow: recordReturn, input: { isbn: isbn(2), copyId: "c2" } })

    const dispatching = daemon.exec({ flow: runDispatcher })
    await daemon.exec({ flow: requestStop })
    const totals = await dispatching

    expect(totals.printed).toBe(2)
    const holds = await daemon.exec({ flow: listHolds })
    expect(holds.every((hold) => hold.status === "printed")).toBe(true)

    await daemon.close({ ok: true })
    await scope.dispose()
  })

  it("wakes on new commits without polling and drains them before stopping", async () => {
    const scope = createScope()
    const daemon = scope.createContext()
    const dispatching = daemon.exec({ flow: runDispatcher })

    await daemon.exec({ flow: recordReturn, input: { isbn: isbn(1), copyId: "c1" } })
    await daemon.exec({ flow: recordReturn, input: { isbn: isbn(2), copyId: "c2" } })
    await daemon.exec({ flow: requestStop })
    const totals = await dispatching

    expect(totals.printed).toBe(2)
    expect(totals.passes).toBeGreaterThan(0)
    const holds = await daemon.exec({ flow: listHolds })
    expect(holds.every((hold) => hold.status === "printed")).toBe(true)

    await daemon.close({ ok: true })
    await scope.dispose()
  })

  it("drains holds committed exactly at stop time before resolving, leaving none lost", async () => {
    const scope = createScope()
    const daemon = scope.createContext()
    const dispatching = daemon.exec({ flow: runDispatcher })

    await daemon.exec({ flow: recordReturn, input: { isbn: isbn(1), copyId: "c1" } })
    const stopExec = daemon.exec({ flow: requestStop })
    const lastRecord = daemon.exec({ flow: recordReturn, input: { isbn: isbn(2), copyId: "c2" } })
    await Promise.all([stopExec, lastRecord])
    await dispatching

    const holds = await daemon.exec({ flow: listHolds })
    expect(holds).toHaveLength(2)
    expect(holds.every((hold) => hold.status === "printed" || hold.status === "rejected")).toBe(true)

    await daemon.close({ ok: true })
    await scope.dispose()
  })

  it("never lets a failed batch be observed by an already-running dispatcher", async () => {
    const scope = createScope()
    const daemon = scope.createContext()
    await daemon.exec({ flow: recordReturn, input: { isbn: isbn(1), copyId: "shelved" } })

    const dispatching = daemon.exec({ flow: runDispatcher })
    const run = daemon.exec({
      flow: recordReturns,
      input: { returns: [{ isbn: isbn(2), copyId: "fresh" }, { isbn: isbn(3), copyId: "shelved" }] },
    })
    await expect(run).rejects.toSatisfy((error: unknown) => isFault(recordReturns, error) && error.fault.code === "HOLD_EXISTS")

    await daemon.exec({ flow: requestStop })
    await dispatching

    const holds = await daemon.exec({ flow: listHolds })
    expect(holds).toHaveLength(1)
    expect(holds[0]).toMatchObject({ copyId: "shelved", status: "printed" })
    const report = await daemon.exec({ flow: printerReport })
    const allSlips = report.flatMap((session) => session.slips)
    expect(allSlips.map((slip) => slip.copyId)).toEqual(["shelved"])

    await daemon.close({ ok: true })
    await scope.dispose()
  })
})

describe("read model", () => {
  it("shares the shelf record across daemon contexts within the same scope", async () => {
    const scope = createScope()
    const daemonA = scope.createContext()
    const daemonB = scope.createContext()

    await daemonA.exec({ flow: recordReturn, input: { isbn: isbn(1), copyId: "c1" } })
    const drained = await daemonB.exec({ flow: drainPass })
    expect(drained.printed).toBe(1)

    await expect(daemonA.exec({ flow: listHolds })).resolves.toEqual([
      { holdId: 1, isbn: isbn(1), copyId: "c1", status: "printed" },
    ])

    await daemonA.close({ ok: true })
    await daemonB.close({ ok: true })
    await scope.dispose()
  })
})
