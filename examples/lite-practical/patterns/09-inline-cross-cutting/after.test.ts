import { createScope } from "@pumped-fn/lite"
import { logging } from "@pumped-fn/lite-extension-logging"
import { observable } from "@pumped-fn/lite-extension-observable"
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"
import {
  checkout,
  failingAudit,
  observability,
  quote,
  requestFee,
  runHandlingFee,
  taxRate,
  traceReport,
  type ObservabilityRecord,
} from "./after"

function steppedClock() {
  let current = 0
  return () => {
    current += 5
    return current
  }
}

function execNames(records: readonly ObservabilityRecord[]) {
  return records
    .filter((record) => record.kind === "exec")
    .map((record) => record.name)
}

describe("inside-out", () => {
  test("IO1: wrapExec unit: records flow name + fn-exec name, passes value through unchanged", async () => {
    const records: ObservabilityRecord[] = []
    const scope = createScope({
      extensions: [observability(records, { now: steppedClock() })],
    })
    const ctx = scope.createContext()

    expect(await ctx.exec({ flow: quote, input: { items: [100, 200] } })).toEqual({
      subtotalCents: 300,
      taxBasisPoints: 875,
      feeCents: 30,
      totalCents: 356,
    })
    expect(await ctx.exec({
      fn: runHandlingFee,
      name: "handling-fee",
      params: [356],
    })).toBe(381)
    expect(execNames(records)).toEqual(["quote-total", "handling-fee"])
    expect(records.filter((record) => record.kind === "exec").map((record) => record.ok)).toEqual([true, true])

    await ctx.close()
    await scope.dispose()
  })

  test("IO2: wrapResolve dispatch: sees kind 'atom' and kind 'resource' (both branches)", async () => {
    const records: ObservabilityRecord[] = []
    const scope = createScope({
      extensions: [observability(records, { now: steppedClock() })],
    })
    const ctx = scope.createContext()

    expect(await scope.resolve(taxRate)).toBe(875)
    expect(await ctx.resolve(requestFee)).toEqual({ cents: 30 })
    expect(records.filter((record) => record.kind === "resolve").map((record) => record.targetKind)).toEqual([
      "atom",
      "resource",
    ])

    await ctx.close()
    await scope.dispose()
  })

  test("IO3: wrapExec can transform output (document the power; assert replaced value)", async () => {
    const records: ObservabilityRecord[] = []
    const scope = createScope({
      extensions: [
        observability(records, {
          now: steppedClock(),
          transformExec: (record, value) => ({ observedName: record.name, value }),
        }),
      ],
    })
    const ctx = scope.createContext()

    expect(await ctx.exec({ flow: traceReport, tags: [] })).toEqual({
      observedName: "trace-report",
      value: "trace-missing",
    })

    await ctx.close()
    await scope.dispose()
  })

  test("IO4: wrapExec records failed exec and rethrows", async () => {
    const records: ObservabilityRecord[] = []
    const scope = createScope({
      extensions: [observability(records, { now: steppedClock() })],
    })
    const ctx = scope.createContext()

    await expect(ctx.exec({ flow: failingAudit })).rejects.toThrow("audit sink rejected")
    expect(records.filter((record) => record.kind === "exec").map((record) => record.ok)).toEqual([false])

    await ctx.close({ ok: false, error: new Error("expected") })
    await scope.dispose()
  })
})

describe("outside-in", () => {
  test("OI1: nested exec tree (flow \u2192 named fn \u2192 flow): extension log contains every hop in order; business source has zero logging statements (read file, assert)", async () => {
    const records: ObservabilityRecord[] = []
    const scope = createScope({
      extensions: [observability(records, { now: steppedClock() })],
    })
    const ctx = scope.createContext()

    expect(await ctx.exec({ flow: checkout, input: { items: [125, 75] } })).toEqual({
      itemCount: 2,
      subtotalCents: 200,
      persisted: true,
    })
    expect(execNames(records)).toEqual(["checkout", "price-items", "persist-receipt"])

    const source = await readFile(fileURLToPath(new URL("./after.ts", import.meta.url)), "utf8")
    expect(source).not.toMatch(/console\.|logger|Date\.now|performance\.now/)

    await ctx.close()
    await scope.dispose()
  })

  test("OI2: extension-seeded tag consumed by flow dep", async () => {
    const records: ObservabilityRecord[] = []
    const scope = createScope({
      extensions: [
        observability(records, {
          now: steppedClock(),
          seedTraceId: "trace-9",
        }),
      ],
    })
    const ctx = scope.createContext()

    expect(await ctx.exec({ flow: traceReport })).toBe("trace-9")

    await ctx.close()
    await scope.dispose()
  })

  test("OI3: packaged observable and logging extensions compose with runtime tag sinks", async () => {
    const events = observable.memory()
    const logs = logging.memory()
    const clock = steppedClock()
    let next = 0
    const scope = createScope({
      extensions: [observable.extension(), logging.extension()],
    })
    await scope.ready
    const ctx = scope.createContext({
      tags: [
        observable.runtime({
          sinks: [events],
          only: ["flow", "function"],
          input: true,
          output: true,
          now: clock,
          id: () => `event-${next += 1}`,
        }),
        logging.runtime({
          sinks: [logs],
          level: "debug",
          flow: "all",
          fields: { requestId: "req-1" },
          now: clock,
          id: () => `log-${next += 1}`,
        }),
      ],
    })

    expect(await ctx.exec({ flow: checkout, input: { items: [125, 75] } })).toEqual({
      itemCount: 2,
      subtotalCents: 200,
      persisted: true,
    })
    expect(events.events().map((event) => `${event.kind}:${event.name}:${event.phase}`)).toEqual([
      "flow:checkout:start",
      "function:price-items:start",
      "function:price-items:success",
      "flow:persist-receipt:start",
      "flow:persist-receipt:success",
      "flow:checkout:success",
    ])
    expect(events.events()[0]?.input).toEqual({ items: [125, 75] })
    expect(logs.records().map((record) => record.message)).toEqual([
      "flow.start",
      "flow.start",
      "flow.success",
      "flow.start",
      "flow.success",
      "flow.success",
    ])
    expect(logs.records().every((record) => record.fields?.["requestId"] === "req-1")).toBe(true)

    await ctx.close()
    await scope.dispose()
  })
})

describe("effect-managed", () => {
  test("E1: init throws \u2192 scope.ready rejects; resolve auto-fails (error branch)", async () => {
    const records: ObservabilityRecord[] = []
    const scope = createScope({
      extensions: [
        observability(records, {
          now: steppedClock(),
          failInit: true,
        }),
      ],
    })

    await expect(scope.ready).rejects.toThrow("observability init failed")
    await expect(scope.resolve(taxRate)).rejects.toThrow("observability init failed")
  })

  test("E2: dispose(scope) called on scope.dispose (lifecycle complete)", async () => {
    const records: ObservabilityRecord[] = []
    const scope = createScope({
      extensions: [observability(records, { now: steppedClock() })],
    })

    await scope.ready
    await scope.dispose()

    expect(records.map((record) => record.kind)).toContain("dispose")
  })
})
