import { describe, expect, it } from "vitest"
import { atom, controller, createScope, flow, resource, tag, tags, type Lite } from "../src"

describe("tag inputs", () => {
  it("normalizes single and nested inputs without changing order or duplicates", () => {
    const marker = tag<string>({ label: "tag-input-normalization" })
    const shared = [marker("two"), [marker("three")]] as const
    const repeated = [marker("repeat")] as const
    const taggedAtom = atom({
      tags: [marker("one"), shared, repeated, repeated],
      factory: () => 1,
    })
    const taggedFlow = flow({
      tags: marker("flow"),
      factory: () => 1,
    })
    const taggedResource = resource({
      tags: [marker("resource"), shared],
      factory: () => 1,
    })

    expect(taggedAtom.tags?.map(({ value }) => value)).toEqual(["one", "two", "three", "repeat", "repeat"])
    expect(taggedFlow.tags?.map(({ value }) => value)).toEqual(["flow"])
    expect(taggedResource.tags?.map(({ value }) => value)).toEqual(["resource", "two", "three"])
    expect(marker.collect([marker("zero"), shared])).toEqual(["zero", "two", "three"])
    expect(marker.find(marker("single"))).toBe("single")
    expect(marker.atoms()).toContain(taggedAtom)
  })

  it("keeps unmarked tagged holder identity on atom, flow, and resource", () => {
    const marker = tag<string>({ label: "tag-input-identity" })
    const atomHolder = marker("atom")
    const flowHolder = marker("flow")
    const resourceHolder = marker("resource")
    const taggedAtom = atom({ tags: atomHolder, factory: () => 1 })
    const taggedFlow = flow({ tags: flowHolder, factory: () => 1 })
    const taggedResource = resource({ tags: resourceHolder, factory: () => 1 })

    expect(taggedAtom.tags?.[0]).toBe(atomHolder)
    expect(taggedFlow.tags?.[0]).toBe(flowHolder)
    expect(taggedResource.tags?.[0]).toBe(resourceHolder)
  })

  it("stores the first snapped serializable value from atom, flow, and resource tags", () => {
    const state = tag<Lite.JsonValue>({ label: "tag-input-serializable-snapshot", serializable: true })
    const valid = { id: "ok" }
    const later = { id: "ok", bad: new Date(0) } as unknown as Lite.JsonValue
    const flip = (tagged: Lite.Tagged<Lite.JsonValue>) => {
      let reads = 0
      return {
        ...tagged,
        get value() {
          return reads++ === 0 ? valid : later
        },
      } as Lite.Tagged<Lite.JsonValue>
    }
    const taggedAtom = atom({ tags: flip(state(valid)), factory: () => 1 })
    const taggedFlow = flow({ tags: flip(state(valid)), factory: () => 1 })
    const taggedResource = resource({ tags: flip(state(valid)), factory: () => 1 })

    expect(taggedAtom.tags?.[0]?.value).toEqual(valid)
    expect(taggedFlow.tags?.[0]?.value).toEqual(valid)
    expect(taggedResource.tags?.[0]?.value).toEqual(valid)
    expect(taggedAtom.tags?.[0]?.value).toEqual(valid)
    expect(taggedFlow.tags?.[0]?.value).toEqual(valid)
    expect(taggedResource.tags?.[0]?.value).toEqual(valid)
  })

  it("exposes scope tags without allowing cross-scope mutation", async () => {
    const marker = tag<string>({ label: "scope-tag-isolation" })
    const empty = createScope()
    const another = createScope()
    const populated = createScope({ tags: marker("kept") })

    expect(Object.isFrozen(empty.tags)).toBe(true)
    expect(Object.isFrozen(populated.tags)).toBe(true)
    expect(() => (empty.tags as Lite.Tagged<any>[]).push(marker("leaked"))).toThrow(TypeError)
    expect(() => (populated.tags as Lite.Tagged<any>[]).pop()).toThrow(TypeError)
    expect(marker.find(another)).toBeUndefined()
    expect(marker.find(populated)).toBe("kept")

    await Promise.all([empty.dispose(), another.dispose(), populated.dispose()])
  })

  it("rejects invalid leaves and cyclic arrays at public boundaries", async () => {
    const marker = tag<string>({ label: "tag-input-invalid" })
    const cyclic: Lite.TagInput[] = []
    cyclic.push(cyclic)

    expect(() => createScope({ tags: cyclic })).toThrow("tags must not contain cyclic arrays")
    expect(() => createScope({ tags: [marker("ok"), "bad"] as never })).toThrow(
      "tags must contain only tagged values and arrays"
    )
    expect(() => flow({ tags: marker as never, factory: () => 1 })).toThrow(
      "tags must contain only tagged values and arrays"
    )

    const scope = createScope()
    const ctx = scope.createContext()
    await expect(ctx.exec({
      name: "invalid-inline-tags",
      fn: () => {},
      params: [],
      tags: [marker("ok"), null] as never,
    })).rejects.toThrow("tags must contain only tagged values and arrays")
    const stream = ctx.execStream({
      flow: flow({ factory: async function* () {} }),
      tags: cyclic,
    })
    expect(() => stream[Symbol.asyncIterator]()).toThrow("tags must not contain cyclic arrays")
    await ctx.close({ ok: true })
    await scope.dispose()
  })

  it("preserves scope, context, flow, and execution precedence", async () => {
    const marker = tag<string>({ label: "tag-input-precedence" })
    const scoped = atom({
      deps: { values: tags.all(marker) },
      factory: (_ctx, { values }) => values,
    })
    const read = flow({
      tags: marker("flow"),
      deps: {
        value: tags.required(marker),
        values: tags.all(marker),
      },
      factory: (_ctx, { value, values }) => ({ value, values }),
    })
    const scope = createScope({
      tags: [marker("scope-one"), [marker("scope-two")]],
    })
    const ctx = scope.createContext({
      tags: [marker("context-one"), [marker("context-two")]],
    })

    expect(marker.find(scope)).toBe("scope-one")
    expect(marker.collect(scope)).toEqual(["scope-one", "scope-two"])
    expect(await scope.resolve(scoped)).toEqual(["scope-one", "scope-two"])
    expect(await ctx.exec({ flow: read })).toEqual({
      value: "flow",
      values: ["flow", "context-one", "context-two"],
    })
    expect(await ctx.exec({
      flow: read,
      tags: [marker("exec-one"), [marker("exec-two")]],
    })).toEqual({
      value: "exec-one",
      values: ["exec-one", "exec-two", "context-one", "context-two"],
    })
    expect(await ctx.exec({
      name: "read-inline-tags",
      deps: { value: tags.required(marker), values: tags.all(marker) },
      params: [],
      tags: marker("inline"),
      fn: ({ value, values }) => ({ value, values }),
    })).toEqual({
      value: "inline",
      values: ["inline", "context-one", "context-two"],
    })
    expect(await scope.run({
      flow: read,
      tags: [marker("run-one"), [marker("run-two")]],
    })).toEqual({
      value: "run-one",
      values: ["run-one", "run-two"],
    })

    await ctx.close({ ok: true })
    await scope.dispose()
  })

  it("normalizes controller defaults, prepared calls, and streams", async () => {
    const marker = tag<string>({ label: "tag-input-boundaries" })
    const child = flow({
      deps: { value: tags.required(marker), values: tags.all(marker) },
      factory: (_ctx, { value, values }) => ({ value, values }),
    })
    const controlled = flow({
      deps: { child: controller(child, { tags: marker("controller") }) },
      factory: (_ctx, { child }) => child.exec(),
    })
    const prepared = flow({
      deps: { child: controller(child) },
      factory: async (_ctx, { child }) => {
        const invocation = child.prepare({
          tags: [marker("prepared-one"), [marker("prepared-two")]],
        })
        await invocation.ready
        return {
          output: await invocation.exec(),
          tags: invocation.options.tags?.map(({ value }) => value),
        }
      },
    })
    const streaming = flow({
      tags: marker("flow"),
      deps: { value: tags.required(marker), values: tags.all(marker) },
      factory: async function* (_ctx, { value, values }) {
        yield value
        return values
      },
    })
    const scope = createScope()
    const ctx = scope.createContext()

    expect(await ctx.exec({ flow: controlled })).toEqual({ value: "controller", values: ["controller"] })
    expect(await ctx.exec({ flow: prepared })).toEqual({
      output: {
        value: "prepared-one",
        values: ["prepared-one", "prepared-two", "prepared-one", "prepared-two"],
      },
      tags: ["prepared-one", "prepared-two"],
    })

    const direct = ctx.execStream({ flow: streaming, tags: marker("exec") })
    const directYields: string[] = []
    for await (const value of direct) directYields.push(value)
    expect(directYields).toEqual(["exec"])
    expect(await direct.result).toEqual(["exec"])

    const root = scope.runStream({
      flow: streaming,
      tags: [marker("run-one"), [marker("run-two")]],
    })
    const rootYields: string[] = []
    for await (const value of root) rootYields.push(value)
    expect(rootYields).toEqual(["run-one"])
    expect(await root.result).toEqual(["run-one", "run-two"])

    await ctx.close({ ok: true })
    await scope.dispose()
  })
})
