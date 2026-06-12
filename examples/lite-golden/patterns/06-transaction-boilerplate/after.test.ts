import { createScope, preset } from "@pumped-fn/lite"
import { describe, expect, test } from "vitest"
import {
  createLedgerStore,
  runTransfer,
  tx,
  txStore,
  type TxConnection,
  type TxEvent,
  type TxStore,
} from "./after"

function connectionIds(events: readonly TxEvent[]) {
  return events
    .filter((event) => event.type === "begin")
    .map((event) => event.txId)
}

function createFailingLedgerStore(events: TxEvent[]): TxStore {
  let nextId = 0
  return {
    async begin() {
      const txId = `tx-${++nextId}`
      let writeNumber = 0
      events.push({ type: "begin", txId })
      return {
        id: txId,
        async write(entry) {
          writeNumber++
          events.push({ type: "write", txId, account: entry.account, deltaCents: entry.deltaCents })
          if (writeNumber === 2) throw new Error(`ledger write ${writeNumber} failed`)
        },
        async commit() {
          events.push({ type: "commit", txId })
        },
        async rollback() {
          events.push({ type: "rollback", txId })
        },
        async release() {
          events.push({ type: "release", txId })
        },
      }
    },
  }
}

describe("inside-out", () => {
  test("IO1: tx resource unit via preset(tx, fn) injection", async () => {
    const writes: string[] = []
    const fakeTx: TxConnection = {
      id: "preset-tx",
      write: async (entry) => {
        writes.push(`${entry.account}:${entry.deltaCents}`)
      },
      commit: async () => {
        writes.push("commit")
      },
      rollback: async () => {
        writes.push("rollback")
      },
      release: async () => {
        writes.push("release")
      },
    }
    const scope = createScope({
      presets: [preset(tx, () => fakeTx)],
    })

    expect(await runTransfer(scope, { from: "cash", to: "sales", cents: 125 })).toEqual({
      from: "cash",
      to: "sales",
      cents: 125,
      txId: "preset-tx",
    })
    expect(writes).toEqual(["cash:-125", "sales:125", "audit:0"])

    await scope.dispose()
  })

  test("IO2: default tx store opens a transaction resource", async () => {
    const scope = createScope()
    const ctx = scope.createContext()

    expect((await ctx.resolve(tx)).id).toBe("tx-1")

    await ctx.close({ ok: true })
    await scope.dispose()
  })
})

describe("outside-in", () => {
  test("OI1: flow succeeds → committed, not rolled back, connection released", async () => {
    const events: TxEvent[] = []
    const scope = createScope({
      presets: [preset(txStore, createLedgerStore(events))],
    })

    expect(await runTransfer(scope, { from: "cash", to: "sales", cents: 500 })).toEqual({
      from: "cash",
      to: "sales",
      cents: 500,
      txId: "tx-1",
    })
    expect(events.map((event) => event.type)).toEqual([
      "begin",
      "write",
      "write",
      "write",
      "commit",
      "release",
    ])

    await scope.dispose()
  })

  test("OI2: test-file failing store (second write rejects) → rolled back, error propagates to caller, connection released (CloseResult {ok:false})", async () => {
    const events: TxEvent[] = []
    const scope = createScope({
      presets: [preset(txStore, createFailingLedgerStore(events))],
    })

    await expect(runTransfer(scope, {
      from: "cash",
      to: "sales",
      cents: 500,
    })).rejects.toThrow("ledger write 2 failed")
    expect(events.map((event) => event.type)).toEqual([
      "begin",
      "write",
      "write",
      "rollback",
      "release",
    ])

    await scope.dispose()
  })

  test("OI3: nested exec children share ONE tx via seek-up (single BEGIN for the chain) [S7]", async () => {
    const events: TxEvent[] = []
    const scope = createScope({
      presets: [preset(txStore, createLedgerStore(events))],
    })

    expect(await runTransfer(scope, { from: "cash", to: "sales", cents: 275 })).toMatchObject({
      txId: "tx-1",
    })
    expect(connectionIds(events)).toEqual(["tx-1"])
    expect(events.filter((event) => event.type === "write").map((event) => event.account)).toEqual([
      "cash",
      "sales",
      "audit",
    ])

    await scope.dispose()
  })
})

describe("effect-managed", () => {
  test("E1: ctx.release(tx) → owner-local reset; next resolve opens fresh tx", async () => {
    const events: TxEvent[] = []
    const scope = createScope({
      presets: [preset(txStore, createLedgerStore(events))],
    })
    const ctx = scope.createContext()

    const first = await ctx.resolve(tx)
    await ctx.release(tx)
    const second = await ctx.resolve(tx)

    expect(first.id).toBe("tx-1")
    expect(second.id).toBe("tx-2")
    expect(events.map((event) => event.type)).toEqual(["begin", "release", "begin"])

    await ctx.close({ ok: true })
    await scope.dispose()
  })

  test("E2: onClose vs cleanup ordering pinned (LIFO; commit decision before release)", async () => {
    const events: TxEvent[] = []
    const scope = createScope({
      presets: [preset(txStore, createLedgerStore(events))],
    })
    const ctx = scope.createContext()

    await ctx.resolve(tx)
    await ctx.close({ ok: false, error: new Error("expected") })

    expect(events.map((event) => event.type)).toEqual(["begin", "rollback", "release"])

    await scope.dispose()
  })
})
