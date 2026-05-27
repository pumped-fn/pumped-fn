import { describe, expect, it } from "vitest"
import { createScope, flow, tag, type Lite } from "../src/index"

type UnionToIntersection<T> = (
  T extends unknown ? (value: T) => void : never
) extends (value: infer I) => void ? I : never

interface FlowMiddlewareInstance<Ext extends object> {
  readonly ext: Ext
  wrap?(
    next: () => Promise<unknown>,
    event: { ctx: Lite.ExecutionContext; target: Lite.ExecTarget }
  ): Promise<unknown>
}

interface FlowMiddlewareUse<Ext extends object> {
  readonly key: symbol
  readonly name: string
  instantiate(ctx: Lite.ExecutionContext): FlowMiddlewareInstance<Ext>
}

interface FlowMiddlewareFactory<Config, Ext extends object> {
  readonly key: symbol
  (config: Config): FlowMiddlewareUse<Ext>
}

type FlowMiddlewareExt<M extends readonly FlowMiddlewareUse<object>[]> =
  UnionToIntersection<M[number] extends FlowMiddlewareUse<infer Ext> ? Ext : never>

const flowMiddlewares = tag<readonly FlowMiddlewareUse<object>[]>({
  label: "flow.middleware",
  default: [],
})

function defineFlowMiddleware<Config, Ext extends object>(
  name: string,
  create: (config: Config, ctx: Lite.ExecutionContext) => FlowMiddlewareInstance<Ext>
): FlowMiddlewareFactory<Config, Ext> {
  const key = Symbol(name)
  const factory = ((config: Config) => ({
    key,
    name,
    instantiate: (ctx: Lite.ExecutionContext) => create(config, ctx),
  })) as FlowMiddlewareFactory<Config, Ext>
  Object.defineProperty(factory, "key", { value: key })
  return factory
}

function flowWith<TOutput, const M extends readonly FlowMiddlewareUse<object>[]>(config: {
  name?: string
  middleware: M
  factory: (ctx: Lite.ExecutionContext & { readonly ext: FlowMiddlewareExt<M> }) => TOutput | Promise<TOutput>
}): Lite.Flow<TOutput, void> {
  return flow({
    name: config.name,
    tags: [flowMiddlewares(config.middleware)],
    factory: config.factory as unknown as (ctx: Lite.ExecutionContext) => TOutput | Promise<TOutput>,
  })
}

function flowMiddlewareRunner(): Lite.Extension {
  return {
    name: "flow-middleware-runner",
    async wrapExec(next, target, ctx) {
      if (typeof target === "function") return next()
      const uses = flowMiddlewares.find(target)
      if (uses.length === 0) return next()

      const seen = new Set<symbol>()
      const instances: FlowMiddlewareInstance<object>[] = []
      const ctxWithExt = ctx as Lite.ExecutionContext & { ext?: object }
      ctxWithExt.ext ??= {}
      for (const use of uses) {
        if (seen.has(use.key)) continue
        seen.add(use.key)
        const instance = use.instantiate(ctx)
        Object.assign(ctxWithExt.ext, instance.ext)
        instances.push(instance)
      }

      let run = next
      for (let i = instances.length - 1; i >= 0; i--) {
        const instance = instances[i]!
        if (!instance.wrap) continue
        const current = run
        run = () => instance.wrap!(current, { ctx, target })
      }
      return run()
    },
  }
}

describe("flow middleware spike", () => {
  it("uses one runner to add multiple ctx shapes before the factory", async () => {
    const tenant = defineFlowMiddleware<string, { tenant: { id: string } }>(
      "tenant",
      (id) => ({ ext: { tenant: { id } } })
    )
    const trace = defineFlowMiddleware<string, { trace: { id: string } }>(
      "trace",
      (id) => ({ ext: { trace: { id } } })
    )

    const target = flowWith({
      name: "multi-shape",
      middleware: [tenant("acme"), trace("trace-1")],
      factory: (ctx) => {
        const tenantId: string = ctx.ext.tenant.id
        const traceId: string = ctx.ext.trace.id
        return `${tenantId}:${traceId}`
      },
    })

    const scope = createScope({ extensions: [flowMiddlewareRunner()] })
    const ctx = scope.createContext()
    expect(await ctx.exec({ flow: target })).toBe("acme:trace-1")
    await ctx.close()
    await scope.dispose()
  })

  it("dedupes by middleware glyph but creates fresh execution instances", async () => {
    let created = 0
    const agent = defineFlowMiddleware<
      { label: string },
      { agent: { label: string; instance: number } }
    >("agent", (config) => {
      created++
      const instance = created
      return {
        ext: { agent: { label: config.label, instance } },
        wrap: async (next) => `${await next()}:${instance}`,
      }
    })

    const target = flowWith({
      name: "dedupe-agent",
      middleware: [agent({ label: "first" }), agent({ label: "second" })],
      factory: (ctx) => `${ctx.ext.agent.label}:${ctx.ext.agent.instance}`,
    })

    const scope = createScope({ extensions: [flowMiddlewareRunner()] })
    const ctx = scope.createContext()
    expect(await ctx.exec({ flow: target })).toBe("first:1:1")
    expect(await ctx.exec({ flow: target })).toBe("first:2:2")
    expect(created).toBe(2)
    await ctx.close()
    await scope.dispose()
  })

  it("exposes flow ctx shape to downstream scope extensions", async () => {
    const seen: Array<string | undefined> = []
    const agent = defineFlowMiddleware<string, { agent: { runId: string } }>(
      "agent",
      (runId) => ({ ext: { agent: { runId } } })
    )
    const observer = {
      name: "observer",
      wrapExec: async (next: () => Promise<unknown>, _target: Lite.ExecTarget, ctx: Lite.ExecutionContext) => {
        seen.push((ctx as Lite.ExecutionContext & { ext?: { agent?: { runId: string } } }).ext?.agent?.runId)
        return next()
      },
    } satisfies Lite.Extension
    const target = flowWith({
      name: "agent-shaped",
      middleware: [agent("run-1")],
      factory: (ctx) => ctx.ext.agent.runId,
    })

    const scope = createScope({ extensions: [flowMiddlewareRunner(), observer] })
    const ctx = scope.createContext()
    expect(await ctx.exec({ flow: target })).toBe("run-1")
    expect(seen).toEqual(["run-1"])
    await ctx.close()
    await scope.dispose()
  })

  it("keeps unextended flow factories on the base ExecutionContext shape", () => {
    const agent = defineFlowMiddleware<string, { agent: { runId: string } }>(
      "agent",
      (runId) => ({ ext: { agent: { runId } } })
    )

    flowWith({
      middleware: [agent("run-1")],
      factory: (ctx) => ctx.ext.agent.runId,
    })

    flow({
      // @ts-expect-error base flow ctx has no agent middleware shape
      factory: (ctx) => ctx.ext.agent.runId,
    })
  })
})
