import { describe, expect, expectTypeOf, it } from "vitest"
import { atom, createScope, flow, resource, serviceValue, tag, tags, type Lite } from "../src/index"

describe("serviceValue tag deps", () => {
  it("projects branded tag records to member exec handles with live child context", async () => {
    const marker = tag<string>({ label: "service-marker" })
    type Gateway = {
      fetch(ctx: Lite.ExecutionContext, id: string, count: number): { id: string; count: number; marker: string | undefined }
      ping(ctx: Lite.ExecutionContext): string | undefined
    }
    const gatewayTag = tag<Lite.ServiceValue<Gateway>>({ label: "gateway" })
    const calls: string[] = []
    const seen: Array<{ name: string | undefined; marker: string | undefined }> = []
    const record = serviceValue({
      fetch(ctx: Lite.ExecutionContext, id: string, count: number) {
        const prefix = Reflect.get(this, "prefix") as string
        calls.push(`${prefix}:${id}:${count}`)
        return { id, count, marker: ctx.data.seekTag(marker) }
      },
      ping(ctx: Lite.ExecutionContext) {
        return ctx.data.seekTag(marker)
      },
    })
    Object.defineProperty(record, "prefix", { value: "api", enumerable: false })
    const run = flow({
      deps: { gateway: tags.required(gatewayTag) },
      factory: async (_ctx, { gateway }) => {
        expectTypeOf(gateway).toEqualTypeOf<Lite.Serviced<Gateway>>()
        const value = await gateway.fetch.exec({ params: ["inv-1", 2], tags: [marker("call")] })
        const ping = await gateway.ping.exec()
        const pingTagged = await gateway.ping.exec({ tags: [marker("empty")] })
        return { value, ping, pingTagged }
      },
    })
    const scope = createScope({
      extensions: [
        {
          name: "recorder",
          wrapExec: (next, _target, ctx) => {
            seen.push({ name: ctx.name, marker: ctx.data.seekTag(marker) })
            return next()
          },
        },
      ],
      tags: [gatewayTag(record)],
    })
    const ctx = scope.createContext()

    const output = await ctx.exec({ flow: run })

    expect(output.value).toEqual({ id: "inv-1", count: 2, marker: "call" })
    expect(output.ping).toBeUndefined()
    expect(output.pingTagged).toBe("empty")
    expect(calls).toEqual(["api:inv-1:2"])
    expect(seen).toContainEqual({ name: "gateway.fetch", marker: "call" })
    expect(seen).toContainEqual({ name: "gateway.ping", marker: undefined })
    expect(seen).toContainEqual({ name: "gateway.ping", marker: "empty" })
    await ctx.close({ ok: true })
    await scope.dispose()
  })

  it("leaves non-branded record tags unprojected", async () => {
    const rawTag = tag<{
      fetch(ctx: Lite.ExecutionContext, id: string): string
    }>({ label: "raw-gateway" })
    const raw = {
      fetch: (_ctx: Lite.ExecutionContext, id: string) => id,
    }
    const run = flow({
      deps: { raw: tags.required(rawTag) },
      factory: (_ctx, { raw }) => {
        expectTypeOf(raw).toEqualTypeOf<typeof raw>()
        return "exec" in raw.fetch
      },
    })
    const scope = createScope({ tags: [rawTag(raw)] })
    const ctx = scope.createContext()

    await expect(ctx.exec({ flow: run })).resolves.toBe(false)
    await ctx.close({ ok: true })
    await scope.dispose()
  })

  it("projects branded resource records to member exec handles with live child context", async () => {
    const marker = tag<string>({ label: "resource-service-marker" })
    type Gateway = {
      fetch(ctx: Lite.ExecutionContext, id: string): Promise<{ id: string; marker: string | undefined }>
    }
    const gatewayResource = resource({
      factory: () => serviceValue<Gateway>({
        fetch: async (ctx, id) => ({ id, marker: ctx.data.seekTag(marker) }),
      }),
    })
    const seen: Array<{ name: string | undefined; marker: string | undefined }> = []
    const run = flow({
      deps: { gateway: gatewayResource },
      factory: (_ctx, { gateway }) => {
        expectTypeOf(gateway).toEqualTypeOf<Lite.Serviced<Gateway>>()
        return gateway.fetch.exec({ params: ["inv-resource"], tags: [marker("call")] })
      },
    })
    const scope = createScope({
      extensions: [
        {
          name: "recorder",
          wrapExec: (next, _target, ctx) => {
            seen.push({ name: ctx.name, marker: ctx.data.seekTag(marker) })
            return next()
          },
        },
      ],
    })
    const ctx = scope.createContext()

    await expect(ctx.exec({ flow: run })).resolves.toEqual({ id: "inv-resource", marker: "call" })
    expect(seen).toContainEqual({ name: "gateway.fetch", marker: "call" })
    await ctx.close({ ok: true })
    await scope.dispose()
  })

  it("rejects serviceValue tags in atom deps", async () => {
    const gatewayTag = tag<Lite.ServiceValue<{
      ping(ctx: Lite.ExecutionContext): string
    }>>({ label: "gateway" })
    const gateway = serviceValue({
      ping: () => "pong",
    })
    const broken = atom({
      deps: { gateway: tags.required(gatewayTag) },
      factory: () => "never",
    })
    const scope = createScope({ tags: [gatewayTag(gateway)] })

    await expect(scope.resolve(broken)).rejects.toThrow("Service value deps require an ExecutionContext")
    await scope.dispose()
  })

  it("projects service method params without ctx in exec args", () => {
    type Gateway = {
      fetch(ctx: Lite.ExecutionContext, id: string, count: number): Promise<{ id: string }>
      ping(ctx: Lite.ExecutionContext): string
    }

    expectTypeOf<Lite.Serviced<Gateway>["fetch"]>().toEqualTypeOf<{
      exec(...args: Lite.TracedExecArgs<[id: string, count: number]>): Promise<{ id: string }>
    }>()
    expectTypeOf<Lite.Serviced<Gateway>["ping"]>().toEqualTypeOf<{
      exec(...args: Lite.TracedExecArgs<[]>): Promise<string>
    }>()
  })
})
