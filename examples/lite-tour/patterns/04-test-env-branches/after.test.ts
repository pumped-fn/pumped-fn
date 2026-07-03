import { createScope, preset } from "@pumped-fn/lite"
import { readFileSync } from "node:fs"
import { describe, expect, test } from "vitest"
import {
  deliveryStore,
  submitReceipt,
  type ReceiptInput,
  type ReceiptStore,
} from "./after"

function createDeliveryDouble(name: string): ReceiptStore {
  const records: ReceiptInput[] = []

  return {
    name,
    records,
    async submit(receipt) {
      records.push(receipt)
      return `${name}:${receipt.id}:${receipt.amount}`
    },
  }
}

describe("inside-out", () => {
  test("IO1: prod-shaped scope uses the real in-memory implementation", async () => {
    const scope = createScope()

    const result = await scope.createContext().exec({
      flow: submitReceipt,
      input: { id: "receipt-1", amount: 120 },
    })

    expect(result).toEqual({
      id: "receipt-1",
      storedBy: "memory-ledger",
      confirmation: "stored:1:receipt-1:120",
      totalRecords: 1,
    })
    expect((await scope.resolve(deliveryStore)).records).toEqual([{
      id: "receipt-1",
      amount: 120,
    }])
  })

  test("IO2: test-shaped scope presets the edge double", async () => {
    const double = createDeliveryDouble("test-double")
    const scope = createScope({
      presets: [preset(deliveryStore, double)],
    })

    expect(await scope.createContext().exec({
      flow: submitReceipt,
      input: { id: "receipt-2", amount: 75 },
    })).toEqual({
      id: "receipt-2",
      storedBy: "test-double",
      confirmation: "test-double:receipt-2:75",
      totalRecords: 1,
    })
    expect(double.records).toEqual([{ id: "receipt-2", amount: 75 }])
  })

  test("IO3: after.ts source contains no process env branch", () => {
    const source = readFileSync(new URL("./after.ts", import.meta.url), "utf8")

    expect(source).not.toContain("process.env")
  })

  test("IO4: second submission through the prod impl advances the ledger sequence", async () => {
    const scope = createScope()
    const ctx = scope.createContext()

    await ctx.exec({
      flow: submitReceipt,
      input: { id: "receipt-a", amount: 10 },
    })
    const second = await ctx.exec({
      flow: submitReceipt,
      input: { id: "receipt-b", amount: 20 },
    })

    expect(second).toEqual({
      id: "receipt-b",
      storedBy: "memory-ledger",
      confirmation: "stored:2:receipt-b:20",
      totalRecords: 2,
    })
  })
})

describe("outside-in", () => {
  test("OI1: one flow diverges by scope presets only", async () => {
    const prodScope = createScope()
    const testDouble = createDeliveryDouble("stub")
    const testScope = createScope({
      presets: [preset(deliveryStore, testDouble)],
    })
    const input = { id: "receipt-3", amount: 42 }

    const prod = await prodScope.createContext().exec({
      flow: submitReceipt,
      input,
    })
    const test = await testScope.createContext().exec({
      flow: submitReceipt,
      input,
    })

    expect(prod).toEqual({
      id: "receipt-3",
      storedBy: "memory-ledger",
      confirmation: "stored:1:receipt-3:42",
      totalRecords: 1,
    })
    expect(test).toEqual({
      id: "receipt-3",
      storedBy: "stub",
      confirmation: "stub:receipt-3:42",
      totalRecords: 1,
    })
  })
})
