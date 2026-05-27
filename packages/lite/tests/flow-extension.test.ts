import { describe, expect, it } from "vitest"
import {
  createScope,
  defineFlowExtension,
  flow,
  flowExtensionRunner,
  serializable,
  type Lite,
} from "../src/index"

describe("flow extensions", () => {
  it("uses one runner to add multiple ctx.ext shapes before the factory", async () => {
    const tenant = defineFlowExtension<string, { tenant: { id: string } }>({
      name: "tenant",
      create: (id) => ({ ext: { tenant: { id } } }),
    })
    const trace = defineFlowExtension<string, { trace: { id: string } }>({
      name: "trace",
      create: (id) => ({ ext: { trace: { id } } }),
    })

    const target = flow({
      name: "multi-shape",
      extensions: [tenant("acme"), trace("trace-1")],
      factory: (ctx) => {
        const tenantId: string = ctx.ext.tenant.id
        const traceId: string = ctx.ext.trace.id
        return `${tenantId}:${traceId}`
      },
    })

    const scope = createScope({ extensions: [flowExtensionRunner()] })
    const ctx = scope.createContext()
    expect(await ctx.exec({ flow: target })).toBe("acme:trace-1")
    await ctx.close()
    await scope.dispose()
  })

  it("dedupes by extension glyph but creates fresh execution instances", async () => {
    let created = 0
    const agent = defineFlowExtension<
      { label: string },
      { agent: { label: string; instance: number } }
    >({
      name: "agent",
      create: (config) => {
        created++
        const instance = created
        return {
          ext: { agent: { label: config.label, instance } },
          wrapExec: async (next) => `${await next()}:${instance}`,
        }
      },
    })

    const target = flow({
      name: "dedupe-agent",
      extensions: [agent({ label: "first" }), agent({ label: "second" })],
      factory: (ctx) => `${ctx.ext.agent.label}:${ctx.ext.agent.instance}`,
    })

    const scope = createScope({ extensions: [flowExtensionRunner()] })
    const ctx = scope.createContext()
    expect(await ctx.exec({ flow: target })).toBe("first:1:1")
    expect(await ctx.exec({ flow: target })).toBe("first:2:2")
    expect(created).toBe(2)
    await ctx.close()
    await scope.dispose()
  })

  it("exposes flow ctx.ext shape to downstream scope extensions", async () => {
    const seen: Array<string | undefined> = []
    const agent = defineFlowExtension<string, { agent: { runId: string } }>({
      name: "agent",
      create: (runId) => ({ ext: { agent: { runId } } }),
    })
    const observer = {
      name: "observer",
      wrapExec: async (
        next: () => Promise<unknown>,
        _target: Lite.ExecTarget,
        ctx: Lite.ExecutionContext
      ) => {
        seen.push((ctx as Lite.ExecutionContext & { ext?: { agent?: { runId: string } } }).ext?.agent?.runId)
        return next()
      },
    } satisfies Lite.Extension
    const target = flow({
      name: "agent-shaped",
      extensions: [agent("run-1")],
      factory: (ctx) => ctx.ext.agent.runId,
    })

    const scope = createScope({ extensions: [flowExtensionRunner(), observer] })
    const ctx = scope.createContext()
    expect(await ctx.exec({ flow: target })).toBe("run-1")
    expect(seen).toEqual(["run-1"])
    await ctx.close()
    await scope.dispose()
  })

  it("validates serializable outputs at runtime", async () => {
    const good = flow({
      extensions: [serializable()],
      factory: () => ({ ok: true, nested: ["x", 1, null] }),
    })
    const bad = flow({
      extensions: [serializable()],
      factory: () => new Date() as unknown as Lite.JsonValue,
    })
    const scope = createScope({ extensions: [flowExtensionRunner()] })
    const ctx = scope.createContext()

    await expect(ctx.exec({ flow: good })).resolves.toEqual({ ok: true, nested: ["x", 1, null] })
    await expect(ctx.exec({ flow: bad })).rejects.toThrow("Non-plain object at $")

    await ctx.close()
    await scope.dispose()
  })
})
