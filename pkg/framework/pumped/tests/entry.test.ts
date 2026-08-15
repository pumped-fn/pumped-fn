import { createScope, flow, isAtom, preset, typed } from "@pumped-fn/lite"
import { describe, expect, it } from "vitest"
import { entry, entryBrandKey, entrySpec, isEntry } from "../src/entry"
import { command, route } from "../src/tags"

const greet = flow({
  name: "greet",
  parse: typed<{ name: string }>(),
  factory: (ctx) => ({ message: `hello ${ctx.input.name}` }),
})

describe("entry", () => {
  it("returns a branded atom whose frozen spec holds the flow by reference", () => {
    const node = entry({ flow: greet, tags: [route({ method: "GET", path: "/greet" })] })

    expect(isAtom(node)).toBe(true)
    expect(isEntry(node)).toBe(true)
    expect(entrySpec(node).flow).toBe(greet)
    expect(Object.isFrozen(entrySpec(node))).toBe(true)
    expect(route.find(node)).toEqual({ method: "GET", path: "/greet" })
  })

  it("keeps the brand readable through the global symbol registry", () => {
    const node = entry({ flow: greet, tags: [command({ name: "greet" })] })
    const foreign = Symbol.for(entryBrandKey)

    expect(foreign in node).toBe(true)
    expect(Object.keys(node)).not.toContain(entryBrandKey)
  })

  it("flattens nested tag input and preserves order for host collection", () => {
    const node = entry({
      flow: greet,
      tags: [[route({ method: "GET", path: "/a" })], route({ method: "POST", path: "/b" })],
    })

    expect(route.collect(entrySpec(node).tags)).toEqual([
      { method: "GET", path: "/a" },
      { method: "POST", path: "/b" },
    ])
  })

  it("lets preset(flow, ...) reach through the entry to the wrapped flow", async () => {
    const node = entry({ flow: greet, tags: [command({ name: "greet" })] })
    const scope = createScope({ presets: [preset(greet, (): { message: string } => ({ message: "preset" }))] })

    const output = await scope.run({ flow: entrySpec(node).flow, rawInput: { name: "ada" } })

    expect(output).toEqual({ message: "preset" })
    await scope.dispose()
  })

  it("lets preset(entry, bundle) replace the whole bundle while the spec survives", async () => {
    const node = entry({ flow: greet, tags: [command({ name: "greet" })] })
    const substitute = flow({
      name: "substitute",
      parse: typed<{ name: string }>(),
      factory: () => ({ message: "sub" }),
    })
    const scope = createScope({ presets: [preset(node, { flow: substitute })] })

    const bundle = await scope.resolve(node)

    expect(bundle.flow).toBe(substitute)
    expect(entrySpec(node).flow).toBe(greet)
    await scope.dispose()
  })
})
