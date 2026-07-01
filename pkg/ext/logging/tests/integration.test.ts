import { describe, expect, it } from "vitest"
import { createScope, flow, resource, tag, tags, typed } from "@pumped-fn/lite"
import { observable } from "../../observable/src"
import { logging } from "../src"

function clock(): () => number {
  let value = 0
  return () => value += 1
}

describe("observable and logging integration", () => {
  it("stress-tests runtime tags with explicit graph deps", async () => {
    const tenant = tag<string>({ label: "stress.tenant" })
    const events = observable.memory()
    const records = logging.memory()
    const tx = resource({
      name: "tx",
      ownership: "current",
      deps: { tenant: tags.required(tenant), logger: logging.logger },
      factory: (_ctx, { tenant, logger }) => {
        logger.info("tx.open", { tenant })
        return { tenant }
      },
    })
    const load = flow({
      name: "load",
      parse: typed<{ readonly id: number }>(),
      deps: { tx, logger: logging.logger },
      factory: async (ctx, { tx, logger }) => {
        logger.debug("load.start", {
          id: ctx.input.id,
          tenant: tx.tenant,
          secret: "raw",
        })
        const doubled = await ctx.exec({
          name: "double",
          fn: function double(_ctx, value: number) {
            return value * 2
          },
          params: [ctx.input.id],
        })
        logger.info("load.done", { id: ctx.input.id, doubled, tenant: tx.tenant })
        return { tenant: tx.tenant, doubled }
      },
    })
    const scope = createScope({
      extensions: [observable.extension(), logging.extension()],
    })
    await scope.ready

    expect(tx.deps).toEqual({
      tenant: expect.any(Object),
      logger: logging.logger,
    })
    expect(load.deps).toEqual({
      tx,
      logger: logging.logger,
    })

    const missing = scope.createContext({
      tags: [
        observable.runtime({
          sinks: [events],
          input: true,
          output: true,
          now: clock(),
          id: () => `event-${events.size() + 1}`,
          redact: () => "[redacted]",
        }),
        logging.runtime({
          sinks: [records],
          level: "debug",
          flow: "all",
          now: clock(),
          id: () => `log-${records.size() + 1}`,
        }),
      ],
    })
    await expect(missing.exec({ flow: load, input: { id: 1 } })).rejects.toThrow()
    await missing.close({ ok: false, error: "missing tenant" })
    events.clear()
    records.clear()

    const ctx = scope.createContext({
      tags: [
        tenant("alpha"),
        observable.runtime({
          sinks: [events],
          only: ["flow", "resource", "function"],
          input: true,
          output: true,
          now: clock(),
          id: () => `event-${events.size() + 1}`,
          redact: () => "[redacted]",
        }),
        logging.runtime({
          sinks: [records],
          level: "debug",
          flow: "all",
          fields: { app: "stress" },
          now: clock(),
          id: () => `log-${records.size() + 1}`,
          redact: (fields) => fields && "secret" in fields
            ? { ...fields, secret: "[redacted]" }
            : fields,
        }),
      ],
    })

    for (let id = 1; id <= 16; id += 1) {
      await expect(ctx.exec({ flow: load, input: { id } })).resolves.toEqual({
        tenant: "alpha",
        doubled: id * 2,
      })
    }
    await ctx.close()
    await scope.dispose()

    const emitted = events.events()
    const written = records.records()
    expect(
      emitted.filter((event) => event.kind === "flow" && event.name === "load" && event.phase === "success")
    ).toHaveLength(16)
    expect(
      emitted.filter((event) => event.kind === "function" && event.name === "double" && event.phase === "success")
    ).toHaveLength(16)
    expect(
      emitted.filter((event) => event.phase === "start" && event.kind === "flow")[0]
    ).toMatchObject({ input: "[redacted]" })
    expect(written.filter((record) => record.message === "load.done")).toHaveLength(16)
    expect(written.some((record) => record.message === "flow.error")).toBe(false)
    expect(written.some((record) => record.fields?.["secret"] === "raw")).toBe(false)
    expect(written.some((record) => record.fields?.["secret"] === "[redacted]")).toBe(true)
    expect(written.every((record) => record.fields?.["app"] === "stress")).toBe(true)
  })
})
