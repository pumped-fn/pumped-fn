import { describe, expect, it } from "vitest"
import { createScope, flow, typed } from "@pumped-fn/lite"
import { logging, type Logging } from "../src"

describe("logging extension — typed faults", () => {
  it("includes the fault payload in the logged error record when a FlowFault is thrown", async () => {
    const sink = logging.memory()
    const withFault = flow({
      name: "withFault",
      faults: typed<{ kind: "conflict"; id: string }>(),
      factory: (ctx) => ctx.fail({ kind: "conflict", id: "p1" }),
    })
    const scope = createScope({
      extensions: [logging.extension()],
      tags: [logging.runtime({ sinks: [sink], level: "debug", flow: "errors" })],
    })
    await scope.ready

    const ctx = scope.createContext()
    await expect(ctx.exec({ flow: withFault })).rejects.toMatchObject({ fault: { kind: "conflict", id: "p1" } })

    const errorRecord = sink.records().find((record) => record.level === "error")
    expect(errorRecord?.fields?.error).toMatchObject({ fault: { kind: "conflict", id: "p1" } })
  })
})

function clock(values: readonly number[]): () => number {
  let index = 0
  return () => values[index++] ?? values[values.length - 1]!
}

describe("logging extension", () => {
  it("writes explicit logs through the logger resource and filters by level", async () => {
    const sink = logging.memory()
    let flushed = 0
    const flushable: Logging.Sink = {
      name: "flushable",
      write(record) {
        sink.write(record)
      },
      flush() {
        flushed += 1
      },
    }
    const scope = createScope()
    const ctx = scope.createContext({
      tags: [
        logging.runtime({
          sinks: [flushable],
          level: "warn",
          now: clock([1, 2, 3]),
          id: () => `record-${sink.records().length + 1}`,
          redact: (fields) => fields ? { safe: true } : fields,
        }),
      ],
    })

    const log = await ctx.resolve(logging.logger)
    const child = log.child({ requestId: "r1" })
    log.debug("debug")
    log.info("info")
    child.warn("warn", { secret: "x" })
    log.error("error")
    await ctx.close()

    expect(sink.records()).toEqual([
      {
        id: "record-1",
        at: 1,
        level: "warn",
        message: "warn",
        fields: { safe: true },
      },
      {
        id: "record-2",
        at: 2,
        level: "error",
        message: "error",
      },
    ])
    const snapshot = sink.records()
    expect(flushed).toBe(1)
    sink.clear()
    expect(snapshot).toHaveLength(2)
  })

  it("logs flow start, success, and error from runtime tag policy", async () => {
    const sink = logging.memory()
    const ok = flow({
      name: "ok",
      factory: () => "done",
    })
    const fail = flow({
      name: "fail",
      factory: () => {
        throw new Error("bad")
      },
    })
    const scope = createScope({
      extensions: [logging.extension()],
      tags: [
        logging.runtime({
          sinks: [sink],
          level: "debug",
          flow: "all",
          source: "worker",
          fields: { app: "jobs" },
          now: clock([10, 11, 12]),
          id: () => `flow-${sink.records().length + 1}`,
        }),
      ],
    })
    await scope.ready

    const ctx = scope.createContext()
    await expect(ctx.exec({ flow: ok, name: "custom" })).resolves.toBe("done")
    await expect(ctx.exec({ flow: fail })).rejects.toThrow("bad")
    await ctx.close()

    expect(sink.records().map((record) => [record.level, record.message, record.source, record.fields?.app])).toEqual([
      ["debug", "flow.start", "worker", "jobs"],
      ["debug", "flow.success", "worker", "jobs"],
      ["debug", "flow.start", "worker", "jobs"],
      ["error", "flow.error", "worker", "jobs"],
    ])
    expect(sink.records()[0]?.fields).toEqual({ app: "jobs" })
    expect(sink.records()[0]?.fields).not.toHaveProperty("source")
    expect(sink.records()[1]?.fields).toEqual({ app: "jobs" })
    expect(sink.records()[1]?.fields).not.toHaveProperty("output")
    expect(sink.records()[3]?.fields?.["error"]).toMatchObject({ name: "Error", message: "bad" })
  })

  it("supports error-only flow logging, memory subscribers, and the no-sink path", async () => {
    const sink = logging.memory()
    const observed: Logging.Record[] = []
    const unsubscribe = sink.subscribe((record) => observed.push(record))
    const scope = createScope({
      extensions: [logging.extension()],
      tags: [
        logging.runtime({
          sinks: [sink],
          flow: "errors",
          now: clock([1]),
          id: () => "err",
        }),
      ],
    })
    await scope.ready

    const ctx = scope.createContext()
    await expect(ctx.exec({ flow: flow({ factory: () => { throw "bad" } }) })).rejects.toBe("bad")
    await expect(ctx.exec({ flow: flow({ name: "quiet", factory: () => "ok" }) })).resolves.toBe("ok")
    await ctx.close({ ok: false, error: "bad" })

    expect(sink.records()).toHaveLength(1)
    expect(observed).toHaveLength(1)
    expect(sink.size()).toBe(1)
    unsubscribe()
    expect(sink.size()).toBe(1)
    sink.clear()
    sink.close?.()
    expect(sink.records()).toEqual([])
    expect(sink.size()).toBe(0)

    const empty = createScope({ extensions: [logging.extension()] })
    await empty.ready
    const emptyCtx = empty.createContext()
    await expect(emptyCtx.exec({ flow: flow({ factory: () => "ok" }) })).resolves.toBe("ok")
    await emptyCtx.close()
  })

  it("uses explicit sink failure policy", async () => {
    const captured: unknown[] = []
    const bad: Logging.Sink = {
      name: "bad",
      write() {
        throw new Error("write failed")
      },
      flush() {
        throw new Error("flush failed")
      },
    }
    const scope = createScope()
    const ctx = scope.createContext({
      tags: [
        logging.runtime({
          sinks: [bad],
          onError: (error) => captured.push(error),
        }),
      ],
    })
    const log = await ctx.resolve(logging.logger)
    log.warn("warn")
    await ctx.close()

    expect(captured).toHaveLength(2)

    const strict = createScope()
    const strictCtx = strict.createContext({
      tags: [
        logging.runtime({
          sinks: [bad],
          failure: "throw",
        }),
      ],
    })
    const strictLog = await strictCtx.resolve(logging.logger)
    expect(() => strictLog.error("error")).toThrow("write failed")
  })

  it("reports root logger flush failures without closing root sinks", async () => {
    const captured: unknown[] = []
    const calls: string[] = []
    const bad: Logging.Sink = {
      write() {},
      flush() {
        calls.push("flush")
        throw new Error("flush failed")
      },
      close() {
        calls.push("close")
      },
    }
    const scope = createScope({
      tags: [logging.runtime({ sinks: [bad], onError: (error) => captured.push(error) })],
    })
    const ctx = scope.createContext()
    const log = await ctx.resolve(logging.logger)
    log.warn("warn")
    await ctx.close()

    expect(captured).toHaveLength(1)
    expect(calls).toEqual(["flush"])
  })

  it("allows root logger sinks without flush hooks", async () => {
    const records = logging.memory()
    const sink: Logging.Sink = {
      write(record) {
        records.write(record)
      },
    }
    const scope = createScope({
      tags: [logging.runtime({ sinks: [sink] })],
    })
    const ctx = scope.createContext()
    const log = await ctx.resolve(logging.logger)
    log.warn("warn")
    await ctx.close()

    expect(records.records().map((record) => record.message)).toEqual(["warn"])
  })

  it("reports context sink close failures", async () => {
    const captured: unknown[] = []
    const bad: Logging.Sink = {
      write() {},
      close() {
        throw new Error("close failed")
      },
    }
    const ctx = createScope().createContext({
      tags: [logging.runtime({ sinks: [bad], onError: (error) => captured.push(error) })],
    })
    const log = await ctx.resolve(logging.logger)
    log.warn("warn")
    await ctx.close()

    expect(captured).toHaveLength(1)
  })

  it("keeps default runtime usable", async () => {
    const sink = logging.memory()
    const ctx = createScope().createContext({
      tags: [logging.runtime({ sinks: [sink], level: "debug", fields: { app: "api" } })],
    })
    const log = await ctx.resolve(logging.logger)
    log.write("debug", "debug")
    await ctx.close()

    expect(sink.records()[0]?.id).toMatch(/^log:/)
    expect(sink.records()[0]?.at).toEqual(expect.any(Number))
    expect(sink.records()[0]?.fields).toEqual({ app: "api" })
  })

  it("flushes and closes root flow-log sinks on scope dispose without resolving logger", async () => {
    const sink = logging.memory()
    const calls: string[] = []
    const flushable: Logging.Sink = {
      write(record) {
        sink.write(record)
      },
      flush() {
        calls.push("flush")
      },
      close() {
        calls.push("close")
      },
    }
    const scope = createScope({
      extensions: [logging.extension()],
      tags: [logging.runtime({ sinks: [flushable], flow: "all", level: "debug" })],
    })
    await scope.createContext().exec({ flow: flow({ name: "run", factory: () => "ok" }) })

    expect(calls).toEqual([])
    await scope.dispose()

    expect(sink.records().map((record) => record.message)).toEqual(["flow.start", "flow.success"])
    expect(calls).toEqual(["flush", "close"])
  })

  it("flushes and closes context runtime sinks once when the owner context closes", async () => {
    const sink = logging.memory()
    const calls: string[] = []
    const flushable: Logging.Sink = {
      write(record) {
        sink.write(record)
      },
      flush() {
        calls.push("flush")
      },
      close() {
        calls.push("close")
      },
    }
    const run = flow({
      name: "run",
      deps: { logger: logging.logger },
      factory: (_ctx, { logger }) => {
        logger.info("run")
      },
    })
    const scope = createScope({
      extensions: [logging.extension()],
    })
    await scope.ready
    const ctx = scope.createContext({
      tags: [logging.runtime({ sinks: [flushable], flow: "all", level: "debug" })],
    })

    await ctx.exec({ flow: run })
    expect(calls).toEqual([])
    await ctx.close()

    expect(sink.records().map((record) => record.message)).toEqual(["flow.start", "run", "flow.success"])
    expect(calls).toEqual(["flush", "close"])
  })
})
