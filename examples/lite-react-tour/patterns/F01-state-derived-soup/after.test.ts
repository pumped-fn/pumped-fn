import { describe, test, expect } from "vitest"
import { createScope, preset } from "@pumped-fn/lite"
import { products, query, sortBy, visibleProducts, type Product } from "./after"

const sample: Product[] = [
  { id: "a", name: "Banana", price: 3 },
  { id: "b", name: "apple", price: 5 },
  { id: "c", name: "Cherry", price: 1 },
]

describe("inside-out", () => {
  test("IO1: default query empty, sorted by name (case-insensitive)", async () => {
    const scope = createScope({ presets: [preset(products, sample)] })
    const visible = await scope.resolve(visibleProducts)
    expect(visible.map((p) => p.id)).toEqual(["b", "a", "c"])
    await scope.dispose()
  })

  test("IO2: setting query re-derives the filtered slice", async () => {
    const scope = createScope({ presets: [preset(products, sample)] })
    await scope.resolve(visibleProducts)
    const control = scope.controller(query)
    await control.resolve()
    control.set("an")
    await scope.flush()
    const visible = await scope.resolve(visibleProducts)
    expect(visible.map((p) => p.id)).toEqual(["a"])
    await scope.dispose()
  })

  test("IO3: setting sortBy to price re-derives the ordering", async () => {
    const scope = createScope({ presets: [preset(products, sample)] })
    await scope.resolve(visibleProducts)
    const control = scope.controller(sortBy)
    await control.resolve()
    control.set("price")
    await scope.flush()
    const visible = await scope.resolve(visibleProducts)
    expect(visible.map((p) => p.id)).toEqual(["c", "a", "b"])
    await scope.dispose()
  })

  test("IO4: a query with no match derives an empty slice", async () => {
    const scope = createScope({ presets: [preset(products, sample)] })
    const control = scope.controller(query)
    await control.resolve()
    control.set("zzz")
    await scope.flush()
    const visible = await scope.resolve(visibleProducts)
    expect(visible).toEqual([])
    await scope.dispose()
  })

  test("IO5: the source defaults to empty before any data is loaded", async () => {
    const scope = createScope()
    expect(await scope.resolve(products)).toEqual([])
    expect(await scope.resolve(visibleProducts)).toEqual([])
    await scope.dispose()
  })
})
