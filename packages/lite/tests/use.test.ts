import { describe, expect, it } from "vitest"
import {
  atom,
  createScope,
  defineUse,
  flow,
  resource,
  service,
  type Lite,
} from "../src/index"

describe("primitive use", () => {
  it("adds flow ctx fields and creates fresh instances", async () => {
    let created = 0
    const agent = defineUse<{ label: string }, { label: string; instance: number }>({
      label: "agent",
      create: (config) => {
        created++
        const instance = created
        return {
          ext: { label: config.label, instance },
          wrapExec: async (next) => `${await next()}:${instance}`,
        }
      },
    })

    const target = flow({
      name: "agent",
      use: { agent: agent({ label: "first" }) },
      factory: (ctx) => `${ctx.agent.label}:${ctx.agent.instance}`,
    })

    const scope = createScope()
    const ctx = scope.createContext()
    expect(await ctx.exec({ flow: target })).toBe("first:1:1")
    expect(await ctx.exec({ flow: target })).toBe("first:2:2")
    expect(created).toBe(2)
    await ctx.close()
    await scope.dispose()
  })

  it("rejects duplicate uses by glyph", async () => {
    const agent = defineUse<{ label: string }, { label: string }>({
      label: "agent",
      create: (config) => ({ ext: { label: config.label } }),
    })
    expect(() => flow({
      name: "duplicate-agent",
      use: {
        first: agent({ label: "first" }),
        second: agent({ label: "second" }),
      },
      factory: () => "unreachable",
    })).toThrow('Duplicate use "agent" as "first" and "second"')
  })

  it("adds atom and service resolve ctx fields", async () => {
    const tenant = defineUse<string, { id: string }>({
      label: "tenant",
      create: (id) => ({ ext: { id } }),
    })
    const config = atom({
      use: { tenant: tenant("acme") },
      factory: (ctx) => ({ tenantId: ctx.tenant.id }),
    })
    const svc = service({
      use: { tenant: tenant("svc") },
      factory: (ctx) => ({
        call: (execCtx: Lite.ExecutionContext) => `${ctx.tenant.id}:${execCtx.name ?? "root"}`,
      }),
    })

    const scope = createScope()
    expect(await scope.resolve(config)).toEqual({ tenantId: "acme" })
    expect((await scope.resolve(svc)).call(scope.createContext())).toBe("svc:root")
    await scope.dispose()
  })

  it("adds resource ctx fields", async () => {
    const trace = defineUse<string, { id: string }>({
      label: "trace",
      create: (id) => ({ ext: { id } }),
    })
    const good = resource({
      use: { trace: trace("trace-1") },
      factory: (ctx) => ({ traceId: ctx.trace.id }),
    })
    const scope = createScope()
    const ctx = scope.createContext()

    await expect(ctx.resolve(good)).resolves.toEqual({ traceId: "trace-1" })

    await ctx.close()
    await scope.dispose()
  })

  it("keeps resource ctx fields isolated from sibling resources and parent exec ctx", async () => {
    const tenant = defineUse<string, { id: string }>({
      label: "tenant",
      create: (id) => ({ ext: { id } }),
    })
    const left = resource({
      name: "left",
      use: { tenant: tenant("left") },
      factory: (ctx) => ctx.tenant.id,
    })
    const right = resource({
      name: "right",
      use: { tenant: tenant("right") },
      factory: (ctx) => ctx.tenant.id,
    })
    const target = flow({
      name: "resource-isolation",
      factory: async (ctx) => {
        const leftValue = await ctx.resolve(left)
        const rightValue = await ctx.resolve(right)
        const parentTenant = (ctx as Lite.ExecutionContext & { tenant?: { id: string } }).tenant?.id
        return { leftValue, rightValue, parentTenant }
      },
    })

    const scope = createScope()
    const ctx = scope.createContext()
    await expect(ctx.exec({ flow: target })).resolves.toEqual({
      leftValue: "left",
      rightValue: "right",
      parentTenant: undefined,
    })
    await ctx.close()
    await scope.dispose()
  })

  it("exposes use ctx fields to downstream scope extensions", async () => {
    const seen: Array<string | undefined> = []
    const agent = defineUse<string, { runId: string }>({
      label: "agent",
      create: (runId) => ({ ext: { runId } }),
    })
    const observer = {
      name: "observer",
      wrapExec: async (
        next: () => Promise<unknown>,
        _target: Lite.ExecTarget,
        ctx: Lite.ExecutionContext
      ) => {
        seen.push((ctx as Lite.ExecutionContext & { agent?: { runId: string } }).agent?.runId)
        return next()
      },
    } satisfies Lite.Extension
    const target = flow({
      name: "agent-shaped",
      use: { agent: agent("run-1") },
      factory: (ctx) => ctx.agent.runId,
    })

    const scope = createScope({ extensions: [observer] })
    const ctx = scope.createContext()
    expect(await ctx.exec({ flow: target })).toBe("run-1")
    expect(seen).toEqual(["run-1"])
    await ctx.close()
    await scope.dispose()
  })

  it("rejects use context key collisions", async () => {
    const bad = defineUse<void, { value: string }>({
      label: "bad",
      create: () => ({ ext: { value: "nope" } }),
    })
    expect(() => flow({
      // @ts-expect-error use keys cannot overwrite base context keys
      use: { exec: bad() },
      factory: () => "unreachable",
    })).toThrow('Use key "exec" is reserved')
  })
})
