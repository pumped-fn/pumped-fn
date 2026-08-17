import { describe, expect, expectTypeOf, it } from "vitest"
import { atom, createScope, flow, tag, tags, typed, type Lite } from "../src/index"

const respond = flow({
  name: "respond",
  parse: typed<string>(),
  factory: (ctx) => `hello:${ctx.input}`,
})

describe("role-tag flow projection", () => {
  it("required tag: flow projects to a bound FlowHandle", async () => {
    const model = tag<typeof respond>({ label: "model-required" })
    const run = flow({
      deps: { model: tags.required(model) },
      factory: (_ctx, { model }) => {
        expectTypeOf(model).toEqualTypeOf<Lite.FlowHandle<string, string>>()
        return model.exec({ input: "world" })
      },
    })
    const scope = createScope({ tags: [model(respond)] })
    const ctx = scope.createContext()

    await expect(ctx.exec({ flow: run })).resolves.toBe("hello:world")
    await ctx.close({ ok: true })
    await scope.dispose()
  })

  it("optional tag: no binding and no default yields undefined", async () => {
    const model = tag<typeof respond>({ label: "model-optional-absent" })
    const run = flow({
      deps: { model: tags.optional(model) },
      factory: (_ctx, { model }) => {
        expectTypeOf(model).toEqualTypeOf<Lite.FlowHandle<string, string> | undefined>()
        return model
      },
    })
    const scope = createScope()
    const ctx = scope.createContext()

    await expect(ctx.exec({ flow: run })).resolves.toBeUndefined()
    await ctx.close({ ok: true })
    await scope.dispose()
  })

  it("optional tag: bound flow execs through the handle", async () => {
    const model = tag<typeof respond>({ label: "model-optional-bound" })
    const run = flow({
      deps: { model: tags.optional(model) },
      factory: (_ctx, { model }) => model?.exec({ input: "optional" }),
    })
    const scope = createScope({ tags: [model(respond)] })
    const ctx = scope.createContext()

    await expect(ctx.exec({ flow: run })).resolves.toBe("hello:optional")
    await ctx.close({ ok: true })
    await scope.dispose()
  })

  it("required tag: default flow projects to a handle and execs", async () => {
    const model = tag<typeof respond>({ label: "model-default", default: respond })
    const run = flow({
      deps: { model: tags.required(model) },
      factory: (_ctx, { model }) => model.exec({ input: "default" }),
    })
    const scope = createScope()
    const ctx = scope.createContext()

    await expect(ctx.exec({ flow: run })).resolves.toBe("hello:default")
    await ctx.close({ ok: true })
    await scope.dispose()
  })

  it("all tag: bindings across the context chain project to two handles that both exec", async () => {
    const shout = flow({
      parse: typed<string>(),
      factory: (ctx) => `SHOUT:${ctx.input}`,
    })
    const model = tag<typeof respond>({ label: "model-all" })
    const run = flow({
      deps: { models: tags.all(model) },
      factory: async (_ctx, { models }) => {
        expectTypeOf(models).toEqualTypeOf<Lite.FlowHandle<string, string>[]>()
        return Promise.all(models.map((handle) => handle.exec({ input: "all" })))
      },
    })
    const scope = createScope({ tags: [model(respond)] })
    const ctx = scope.createContext()

    await expect(ctx.exec({ flow: run, tags: [model(shout)] })).resolves.toEqual(["SHOUT:all", "hello:all"])
    await ctx.close({ ok: true })
    await scope.dispose()
  })

  it("all tag: preserves multiple bindings at the same scope level", async () => {
    const second = flow({
      parse: typed<string>(),
      factory: (ctx) => `second:${ctx.input}`,
    })
    const model = tag<typeof respond>({ label: "model-all-same-level" })
    const run = flow({
      deps: { models: tags.all(model) },
      factory: (_ctx, { models }) => Promise.all(models.map((handle) => handle.exec({ input: "all" }))),
    })
    const scope = createScope({ tags: [model(respond), model(second)] })
    const ctx = scope.createContext()

    await expect(ctx.exec({ flow: run })).resolves.toEqual(["hello:all", "second:all"])
    await ctx.close({ ok: true })
    await scope.dispose()
  })

  it("all tag: preserves multiple bindings at the same execution level", async () => {
    const second = flow({
      parse: typed<string>(),
      factory: (ctx) => `second:${ctx.input}`,
    })
    const model = tag<typeof respond>({ label: "model-all-same-execution-level" })
    const run = flow({
      deps: { models: tags.all(model) },
      factory: (_ctx, { models }) => Promise.all(models.map((handle) => handle.exec({ input: "all" }))),
    })
    const scope = createScope()
    const ctx = scope.createContext()

    await expect(ctx.exec({
      flow: run,
      tags: [model(respond), model(second)],
    })).resolves.toEqual(["hello:all", "second:all"])
    await ctx.close({ ok: true })
    await scope.dispose()
  })

  it("handle.flow is the bound flow value", async () => {
    const model = tag<typeof respond>({ label: "model-identity" })
    const run = flow({
      deps: { model: tags.required(model) },
      factory: (_ctx, { model }) => model.flow === respond,
    })
    const scope = createScope({ tags: [model(respond)] })
    const ctx = scope.createContext()

    await expect(ctx.exec({ flow: run })).resolves.toBe(true)
    await ctx.close({ ok: true })
    await scope.dispose()
  })

  it("exec-site tags reach the implementor's own invocation", async () => {
    const marker = tag<string>({ label: "marker-layered" })
    const echoMarker = flow({
      parse: typed<string>(),
      deps: { marker: tags.required(marker) },
      factory: (ctx, { marker: value }) => `${ctx.input}:${value}`,
    })
    const model = tag<typeof echoMarker>({ label: "model-layered" })
    const run = flow({
      deps: { model: tags.required(model) },
      factory: (_ctx, { model }) => model.exec({ input: "call", tags: [marker("layered")] }),
    })
    const scope = createScope({ tags: [model(echoMarker), marker("activation")] })
    const ctx = scope.createContext()

    await expect(ctx.exec({ flow: run })).resolves.toBe("call:layered")
    await ctx.close({ ok: true })
    await scope.dispose()
  })

  it("context-chain rebinding: context tags win over scope tags", async () => {
    const implA = flow({ parse: typed<string>(), factory: (ctx) => `A:${ctx.input}` })
    const implB = flow({ parse: typed<string>(), factory: (ctx) => `B:${ctx.input}` })
    const model = tag<typeof implA>({ label: "model-rebind" })
    const run = flow({
      deps: { model: tags.required(model) },
      factory: (_ctx, { model }) => model.exec({ input: "x" }),
    })
    const scope = createScope({ tags: [model(implA)] })
    const ctx = scope.createContext({ tags: [model(implB)] })

    await expect(ctx.exec({ flow: run })).resolves.toBe("B:x")
    await ctx.close({ ok: true })
    await scope.dispose()
  })

  it("non-flow tags in the same deps object are left untouched", async () => {
    const label = tag<string>({ label: "label-passthrough" })
    const run = flow({
      deps: { label: tags.required(label) },
      factory: (_ctx, { label: value }) => {
        expectTypeOf(value).toEqualTypeOf<string>()
        return value
      },
    })
    const scope = createScope({ tags: [label("plain")] })
    const ctx = scope.createContext()

    await expect(ctx.exec({ flow: run })).resolves.toBe("plain")
    await ctx.close({ ok: true })
    await scope.dispose()
  })

  it("execStream through a projected handle drains progress and result", async () => {
    const progressFlow = flow({
      parse: typed<string>(),
      factory: async function* (ctx): AsyncGenerator<number, string, unknown> {
        yield ctx.input.length
        return `done:${ctx.input}`
      },
    })
    const model = tag<typeof progressFlow>({ label: "model-stream" })
    const run = flow({
      deps: { model: tags.required(model) },
      factory: async (_ctx, { model }) => {
        const stream = model.execStream({ input: "abc" })
        const seen: number[] = []
        for await (const value of stream) seen.push(value)
        return { seen, result: await stream.result }
      },
    })
    const scope = createScope({ tags: [model(progressFlow)] })
    const ctx = scope.createContext()

    await expect(ctx.exec({ flow: run })).resolves.toEqual({ seen: [3], result: "done:abc" })
    await ctx.close({ ok: true })
    await scope.dispose()
  })

  it("atom deps: tag-carried flow rejects without an ExecutionContext", async () => {
    const model = tag<typeof respond>({ label: "model-atom" })
    const broken = atom({
      deps: { model: tags.required(model) },
      factory: (_ctx, { model }) => model,
    })
    const scope = createScope({ tags: [model(respond)] })

    await expect(scope.resolve(broken)).rejects.toThrow("Flow deps require an ExecutionContext")
    await scope.dispose()
  })

  it("observability: wrapExec sees the implementor flow as target", async () => {
    const targets: Lite.ExecTarget[] = []
    const model = tag<typeof respond>({ label: "model-observed" })
    const run = flow({
      deps: { model: tags.required(model) },
      factory: (_ctx, { model }) => model.exec({ input: "seen" }),
    })
    const scope = createScope({
      tags: [model(respond)],
      extensions: [
        {
          name: "recorder",
          wrapExec: (next, target) => {
            targets.push(target)
            return next()
          },
        },
      ],
    })
    const ctx = scope.createContext()

    await expect(ctx.exec({ flow: run })).resolves.toBe("hello:seen")
    expect(targets).toContain(respond)
    await ctx.close({ ok: true })
    await scope.dispose()
  })
})
