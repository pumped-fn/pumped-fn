import { describe, expect, it } from "vitest"
import createPino from "pino"
import { createScope, flow } from "@pumped-fn/lite"
import { logging } from "@pumped-fn/lite-extension-logging"
import { pino } from "../src"

function logger() {
  const lines: string[] = []
  return {
    lines,
    logger: createPino({ base: undefined, level: "debug", timestamp: false }, {
      write(line) {
        lines.push(line)
      },
    }),
  }
}

function records() {
  return [
    { id: "debug", at: 1, level: "debug" as const, message: "debug", source: "worker", fields: { tenant: "acme" } },
    { id: "info", at: 2, level: "info" as const, message: "info" },
    { id: "warn", at: 3, level: "warn" as const, message: "warn", source: "worker" },
    { id: "error", at: 4, level: "error" as const, message: "error", fields: { failed: true } },
  ]
}

describe("pino sink", () => {
  it("maps logging records to pino levels and fields", () => {
    const target = logger()
    const sink = pino.sink(target.logger)

    for (const record of records()) sink.write(record)

    expect(sink.name).toBe("pino")
    expect(target.lines.map((line) => JSON.parse(line))).toEqual([
      { level: 20, id: "debug", at: 1, source: "worker", fields: { tenant: "acme" }, msg: "debug" },
      { level: 30, id: "info", at: 2, msg: "info" },
      { level: 40, id: "warn", at: 3, source: "worker", msg: "warn" },
      { level: 50, id: "error", at: 4, fields: { failed: true }, msg: "error" },
    ])
  })

  it("supports runtime tag injection, custom mapping, and explicit lifecycle hooks", async () => {
    const target = logger()
    let flushed = 0
    let closed = 0
    const sink = pino.sink(target.logger, {
      name: "jobs",
      map: (record) => ({ logId: record.id, source: record.source ?? "app" }),
      flush: () => {
        flushed += 1
      },
      close: () => {
        closed += 1
      },
    })
    const run = flow({
      name: "run",
      deps: { log: logging.logger },
      factory: (_ctx, { log }) => {
        log.info("accepted", { ignored: true })
      },
    })
    const scope = createScope({
      tags: [logging.runtime({ sinks: [sink], source: "flow", id: () => "record-1", now: () => 10 })],
    })

    const ctx = scope.createContext()
    await ctx.exec({ flow: run })
    await ctx.close()
    await sink.close?.()

    expect(sink.name).toBe("jobs")
    expect(flushed).toBe(1)
    expect(closed).toBe(1)
    expect(target.lines.map((line) => JSON.parse(line))).toEqual([
      { level: 30, logId: "record-1", source: "flow", msg: "accepted" },
    ])
  })
})
