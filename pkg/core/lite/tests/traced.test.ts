import { describe, expect, expectTypeOf, it } from "vitest"
import { atom, createScope, flow, tag, traced, type Lite } from "../src/index"

describe("traced capability deps", () => {
  it("routes member exec through the pipeline with names, tags, receiver, and identity", async () => {
    const marker = tag<string>({ label: "traced-marker" })
    const returned = { id: "inv-1", count: 2 }
    const calls: string[] = []
    const seen: Array<{ name: string | undefined; marker: string | undefined }> = []
    type Gateway = {
      fetch(id: string, count: number): typeof returned
      ping(): string
    }
    const gateway = atom({
      factory: (): Gateway => {
        const record = {
          fetch(id: string, count: number) {
            const prefix = Reflect.get(this, "prefix") as string
            calls.push(`${prefix}:${id}:${count}`)
            return returned
          },
          ping() {
            return Reflect.get(this, "prefix") as string
          },
        }
        Object.defineProperty(record, "prefix", { value: "api", enumerable: false })
        return record
      },
    })
    const run = flow({
      deps: { gateway: traced(gateway) },
      factory: async (_ctx, { gateway }) => {
        expectTypeOf(gateway).toEqualTypeOf<Lite.Traced<Gateway>>()
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
    })
    const ctx = scope.createContext()

    const output = await ctx.exec({ flow: run })

    expect(output.value).toBe(returned)
    expect(output.ping).toBe("api")
    expect(output.pingTagged).toBe("api")
    expect(calls).toEqual(["api:inv-1:2"])
    expect(seen).toContainEqual({ name: "gateway.fetch", marker: "call" })
    expect(seen).toContainEqual({ name: "gateway.ping", marker: undefined })
    expect(seen).toContainEqual({ name: "gateway.ping", marker: "empty" })
    await ctx.close({ ok: true })
    await scope.dispose()
  })

  it("rejects non-function enumerable members at resolution", async () => {
    const bad = atom({
      factory: () => ({
        ping: () => "pong",
        status: "idle",
      }),
    })
    const run = flow({
      deps: { bad: traced(bad as unknown as Lite.Atom<{ ping(): string }>) },
      factory: (_ctx, { bad }) => bad.ping.exec(),
    })
    const scope = createScope()
    const ctx = scope.createContext()

    await expect(ctx.exec({ flow: run })).rejects.toThrow("traced() deps must resolve to a record of functions: status")
    await ctx.close({ ok: true })
    await scope.dispose()
  })

  it("rejects a memberless record at resolution", async () => {
    class Port {
      ping(): string {
        return "pong"
      }
    }
    const bare = atom({ factory: () => new Port() })
    const run = flow({
      deps: { bare: traced(bare) },
      factory: (_ctx, { bare }) => bare.ping.exec(),
    })
    const scope = createScope()
    const ctx = scope.createContext()

    await expect(ctx.exec({ flow: run })).rejects.toThrow("traced() deps must resolve to a record of functions")
    await ctx.close({ ok: true })
    await scope.dispose()
  })

  it("rejects traced deps without an ExecutionContext", async () => {
    const gateway = atom({
      factory: () => ({
        ping: () => "pong",
      }),
    })
    const broken = atom({
      deps: { gateway: traced(gateway) } as unknown as Record<string, Lite.AtomDependency>,
      factory: () => "never",
    })
    const scope = createScope()

    await expect(scope.resolve(broken)).rejects.toThrow("Traced deps require an ExecutionContext")
    await scope.dispose()
  })

  it("projects function members to typed exec handles", () => {
    type Gateway = {
      fetch(id: string, count: number): Promise<{ id: string }>
      ping(): string
      status: string
    }

    expectTypeOf<Lite.Traced<Gateway>["fetch"]>().toEqualTypeOf<{
      exec(...args: Lite.TracedExecArgs<[id: string, count: number]>): Promise<{ id: string }>
    }>()
    expectTypeOf<Lite.Traced<Gateway>["ping"]>().toEqualTypeOf<{
      exec(...args: Lite.TracedExecArgs<[]>): Promise<string>
    }>()
    expectTypeOf<Lite.Traced<Gateway>["status"]>().toEqualTypeOf<never>()
  })
})
