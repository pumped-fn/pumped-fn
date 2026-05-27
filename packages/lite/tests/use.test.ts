import { describe, expect, it } from "vitest"
import {
  atom,
  createScope,
  defineUse,
  flow,
  resource,
  serializable,
  service,
  useRunner,
  type Lite,
} from "../src/index"

describe("primitive use", () => {
  it("adds flow ctx.ext, dedupes by glyph, and creates fresh instances", async () => {
    let created = 0
    const agent = defineUse<{ label: string }, { agent: { label: string; instance: number } }>({
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
      use: [agent({ label: "first" }), agent({ label: "second" })],
      factory: (ctx) => `${ctx.ext.agent.label}:${ctx.ext.agent.instance}`,
    })

    const scope = createScope({ extensions: [useRunner()] })
    const ctx = scope.createContext()
    expect(await ctx.exec({ flow: target })).toBe("first:1:1")
    expect(await ctx.exec({ flow: target })).toBe("first:2:2")
    expect(created).toBe(2)
    await ctx.close()
    await scope.dispose()
  })

  it("adds atom and service resolve ctx.ext through one runner", async () => {
    const tenant = defineUse<string, { tenant: { id: string } }>({
      name: "tenant",
      create: (id) => ({ ext: { tenant: { id } } }),
    })
    const config = atom({
      use: [tenant("acme")],
      factory: (ctx) => ({ tenantId: ctx.ext.tenant.id }),
    })
    const svc = service({
      use: [tenant("svc")],
      factory: (ctx) => ({
        call: (execCtx: Lite.ExecutionContext) => `${ctx.ext.tenant.id}:${execCtx.name ?? "root"}`,
      }),
    })

    const scope = createScope({ extensions: [useRunner()] })
    expect(await scope.resolve(config)).toEqual({ tenantId: "acme" })
    expect((await scope.resolve(svc)).call(scope.createContext())).toBe("svc:root")
    await scope.dispose()
  })

  it("adds resource ctx.ext and validates serializable resolve outputs", async () => {
    const trace = defineUse<string, { trace: { id: string } }>({
      name: "trace",
      create: (id) => ({ ext: { trace: { id } } }),
    })
    const good = resource({
      use: [trace("trace-1"), serializable()],
      factory: (ctx) => ({ traceId: ctx.ext.trace.id }),
    })
    const bad = atom({
      use: [serializable()],
      factory: () => new Date() as unknown as Lite.JsonValue,
    })
    const scope = createScope({ extensions: [useRunner()] })
    const ctx = scope.createContext()

    await expect(ctx.resolve(good)).resolves.toEqual({ traceId: "trace-1" })
    await expect(scope.resolve(bad)).rejects.toThrow("Non-plain object at $")

    await ctx.close()
    await scope.dispose()
  })

  it("exposes use ctx.ext to downstream scope extensions", async () => {
    const seen: Array<string | undefined> = []
    const agent = defineUse<string, { agent: { runId: string } }>({
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
      use: [agent("run-1")],
      factory: (ctx) => ctx.ext.agent.runId,
    })

    const scope = createScope({ extensions: [useRunner(), observer] })
    const ctx = scope.createContext()
    expect(await ctx.exec({ flow: target })).toBe("run-1")
    expect(seen).toEqual(["run-1"])
    await ctx.close()
    await scope.dispose()
  })
})
