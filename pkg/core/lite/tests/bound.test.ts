import { describe, expect, expectTypeOf, it } from "vitest"
import { atom, bound, controller, createScope, flow, preset, resource, tag, tags, typed, type Lite } from "../src/index"

type ModelRequest = {
  prompt: string
}

type ModelResponse = {
  content: string
}

type Model = {
  readonly label: string
  complete(ctx: Lite.ExecutionContext, request: ModelRequest): Promise<ModelResponse>
}

function gate() {
  let release = () => {}
  const wait = new Promise<void>((resolve) => {
    release = resolve
  })
  return { wait, release }
}

describe("bound deps", () => {
  it("binds a single ctx-first function", async () => {
    const greet = atom({
      factory: () => (ctx: Lite.ExecutionContext, suffix: string) => `${ctx.input}:${suffix}`,
    })
    const run = flow({
      parse: typed<string>(),
      deps: { greet: bound(greet) },
      factory: (_ctx, { greet }) => greet("ok"),
    })
    const scope = createScope()
    const ctx = scope.createContext()

    await expect(ctx.exec({ flow: run, input: "left" })).resolves.toBe("left:ok")
    await ctx.close({ ok: true })
    await scope.dispose()
  })

  it("binds object members and preserves non-function members", async () => {
    const model = tag<Model>({ label: "model" })
    const classify = flow({
      parse: typed<string>(),
      deps: { model: bound(tags.required(model)) },
      factory: async (ctx, { model }) => {
        expectTypeOf(model.complete).toEqualTypeOf<(request: ModelRequest) => Promise<ModelResponse>>()
        expectTypeOf(model.label).toEqualTypeOf<string>()
        return `${model.label}:${(await model.complete({ prompt: ctx.input })).content}`
      },
    })
    const scope = createScope({
      tags: [
        model({
          label: "sdk",
          complete: async (ctx, request) => ({ content: `${ctx.input}:${request.prompt}` }),
        }),
      ],
    })
    const ctx = scope.createContext()

    await expect(ctx.exec({ flow: classify, input: "invoice" })).resolves.toBe("sdk:invoice:invoice")
    await ctx.close({ ok: true })
    await scope.dispose()
  })

  it("rebinds against each nested invocation context", async () => {
    const left = gate()
    const right = gate()
    const observe = atom({
      factory: () => async (ctx: Lite.ExecutionContext, wait: Promise<void>) => {
        await wait
        return ctx.input
      },
    })
    const child = flow({
      parse: typed<string>(),
      deps: { observe: bound(observe) },
      factory: (ctx, { observe }) => observe(ctx.input === "left:child" ? left.wait : right.wait),
    })
    const parent = flow({
      parse: typed<string>(),
      deps: { child: controller(child) },
      factory: (_ctx, { child }) => child.exec({ input: `${_ctx.input}:child` }),
    })
    const scope = createScope()
    const ctx = scope.createContext()
    const leftResult = ctx.exec({ flow: parent, input: "left" })
    const rightResult = ctx.exec({ flow: parent, input: "right" })

    right.release()
    left.release()

    await expect(Promise.all([leftResult, rightResult])).resolves.toEqual(["left:child", "right:child"])
    await ctx.close({ ok: true })
    await scope.dispose()
  })

  it("reflects presets of the wrapped dependency", async () => {
    const service = atom({
      factory: () => (_ctx: Lite.ExecutionContext, value: string) => `real:${value}`,
    })
    const run = flow({
      parse: typed<string>(),
      deps: { service: bound(service) },
      factory: (ctx, { service }) => service(ctx.input),
    })
    const scope = createScope({
      presets: [
        preset(service, (_ctx: Lite.ExecutionContext, value: string) => `preset:${value}`),
      ],
    })
    const ctx = scope.createContext()

    await expect(ctx.exec({ flow: run, input: "invoice" })).resolves.toBe("preset:invoice")
    await ctx.close({ ok: true })
    await scope.dispose()
  })

  it("works for tag, atom, and resource dependencies", async () => {
    const source = tag<(ctx: Lite.ExecutionContext, value: string) => string>({ label: "source" })
    const fromAtom = atom({
      factory: () => (ctx: Lite.ExecutionContext, value: string) => `atom:${ctx.input}:${value}`,
    })
    const fromResource = resource({
      factory: () => ({
        readonly: "resource",
        run: (ctx: Lite.ExecutionContext, value: string) => `resource:${ctx.input}:${value}`,
      }),
    })
    const run = flow({
      parse: typed<string>(),
      deps: {
        fromTag: bound(tags.required(source)),
        fromAtom: bound(fromAtom),
        fromResource: bound(fromResource),
      },
      factory: (_ctx, { fromTag, fromAtom, fromResource }) => [
        fromTag("tag"),
        fromAtom("atom"),
        `${fromResource.readonly}:${fromResource.run("resource")}`,
      ],
    })
    const scope = createScope({
      tags: [
        source((ctx, value) => `tag:${ctx.input}:${value}`),
      ],
    })
    const ctx = scope.createContext()

    await expect(ctx.exec({ flow: run, input: "invoice" })).resolves.toEqual([
      "tag:invoice:tag",
      "atom:invoice:atom",
      "resource:resource:invoice:resource",
    ])
    await ctx.close({ ok: true })
    await scope.dispose()
  })
})
