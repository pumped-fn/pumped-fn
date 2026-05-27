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
  it("adds flow ctx.ext and creates fresh instances", async () => {
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
      name: "agent",
      use: [agent({ label: "first" })],
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

  it("rejects duplicate uses by glyph", async () => {
    const agent = defineUse<{ label: string }, { agent: { label: string } }>({
      name: "agent",
      create: (config) => ({ ext: { agent: { label: config.label } } }),
    })
    const target = flow({
      name: "duplicate-agent",
      use: [agent({ label: "first" }), agent({ label: "second" })],
      factory: (ctx) => ctx.ext.agent.label,
    })

    const scope = createScope({ extensions: [useRunner()] })
    const ctx = scope.createContext()
    await expect(ctx.exec({ flow: target })).rejects.toThrow('Duplicate use "agent"')
    await ctx.close({ ok: false, error: new Error("expected") })
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

  it("keeps resource ctx.ext isolated from sibling resources and parent exec ctx", async () => {
    const tenant = defineUse<string, { tenant: { id: string } }>({
      name: "tenant",
      create: (id) => ({ ext: { tenant: { id } } }),
    })
    const left = resource({
      name: "left",
      use: [tenant("left")],
      factory: (ctx) => ctx.ext.tenant.id,
    })
    const right = resource({
      name: "right",
      use: [tenant("right")],
      factory: (ctx) => ctx.ext.tenant.id,
    })
    const target = flow({
      name: "resource-isolation",
      factory: async (ctx) => {
        const leftValue = await ctx.resolve(left)
        const rightValue = await ctx.resolve(right)
        const parentTenant = (ctx as Lite.ExecutionContext & { ext?: { tenant?: { id: string } } }).ext?.tenant?.id
        return { leftValue, rightValue, parentTenant }
      },
    })

    const scope = createScope({ extensions: [useRunner()] })
    const ctx = scope.createContext()
    await expect(ctx.exec({ flow: target })).resolves.toEqual({
      leftValue: "left",
      rightValue: "right",
      parentTenant: undefined,
    })
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
