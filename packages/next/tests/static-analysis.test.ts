import { describe, expect } from "vitest"
import { provide, derive, getAnalysis, createScope } from "../src"
import { scenario } from "./scenario"

describe("static analysis", () => {
  scenario("executor without dependencies has 'none' shape", async () => {
    const executor = provide(() => 42)
    const analysis = getAnalysis(executor)

    expect(analysis).toBeDefined()
    expect(analysis!.shape).toBe("none")
    expect(analysis!.dependencyCount).toBe(0)
    expect(analysis!.directDependencies).toEqual([])
    expect(analysis!.circularRisk).toBe(false)
    expect(analysis!.optimizedKeys).toBeUndefined()
  })

  scenario("executor with single dependency has 'single' shape", async () => {
    const dep = provide(() => 1)
    const executor = derive(dep, (val) => val * 2)
    const analysis = getAnalysis(executor)

    expect(analysis).toBeDefined()
    expect(analysis!.shape).toBe("single")
    expect(analysis!.dependencyCount).toBe(1)
    expect(analysis!.directDependencies).toHaveLength(1)
    expect(analysis!.circularRisk).toBe(false)
  })

  scenario("executor with array dependencies has 'array' shape", async () => {
    const dep1 = provide(() => 1)
    const dep2 = provide(() => 2)
    const executor = derive([dep1, dep2], ([a, b]) => a + b)
    const analysis = getAnalysis(executor)

    expect(analysis).toBeDefined()
    expect(analysis!.shape).toBe("array")
    expect(analysis!.dependencyCount).toBe(2)
    expect(analysis!.directDependencies).toHaveLength(2)
    expect(analysis!.circularRisk).toBe(false)
    expect(analysis!.optimizedKeys).toBeUndefined()
  })

  scenario("executor with record dependencies has 'record' shape", async () => {
    const dep1 = provide(() => 1)
    const dep2 = provide(() => 2)
    const executor = derive({ a: dep1, b: dep2 }, ({ a, b }) => a + b)
    const analysis = getAnalysis(executor)

    expect(analysis).toBeDefined()
    expect(analysis!.shape).toBe("record")
    expect(analysis!.dependencyCount).toBe(2)
    expect(analysis!.directDependencies).toHaveLength(2)
    expect(analysis!.circularRisk).toBe(false)
    expect(analysis!.optimizedKeys).toEqual(["a", "b"])
  })

  scenario("computes correct max depth for nested dependencies", async () => {
    const level0 = provide(() => 0)
    const level1 = derive(level0, (val) => val + 1)
    const level2 = derive(level1, (val) => val + 1)
    const level3 = derive(level2, (val) => val + 1)

    const analysis0 = getAnalysis(level0)
    const analysis1 = getAnalysis(level1)
    const analysis2 = getAnalysis(level2)
    const analysis3 = getAnalysis(level3)

    expect(analysis0!.maxDepth).toBe(0)
    expect(analysis1!.maxDepth).toBe(1)
    expect(analysis2!.maxDepth).toBe(2)
    expect(analysis3!.maxDepth).toBe(3)
  })

  scenario("identifies nested dependencies correctly", async () => {
    const base = provide(() => 1)
    const child = derive(base, (val) => val * 2)

    const baseAnalysis = getAnalysis(base)
    const childAnalysis = getAnalysis(child)

    expect(baseAnalysis!.hasNestedDependencies).toBe(false)
    expect(childAnalysis!.hasNestedDependencies).toBe(false)

    const grandchild = derive(child, (val) => val * 2)
    const grandchildAnalysis = getAnalysis(grandchild)
    expect(grandchildAnalysis!.hasNestedDependencies).toBe(true)
  })

  scenario("resolution still works correctly with static analysis", async () => {
    const scope = createScope()

    const base = provide(() => 10)
    const multiplier = provide(() => 2)
    const derived = derive({ base, multiplier }, ({ base, multiplier }) => base * multiplier)

    const result = await scope.resolve(derived)
    expect(result).toBe(20)

    await scope.dispose()
  })

  scenario("array dependencies resolve correctly with optimization", async () => {
    const scope = createScope()

    const a = provide(() => 1)
    const b = provide(() => 2)
    const c = provide(() => 3)
    const executor = derive([a, b, c], ([va, vb, vc]) => va + vb + vc)

    const result = await scope.resolve(executor)
    expect(result).toBe(6)

    await scope.dispose()
  })

  scenario("record dependencies resolve correctly with optimized keys", async () => {
    const scope = createScope()

    const x = provide(() => "x")
    const y = provide(() => "y")
    const z = provide(() => "z")
    const executor = derive({ x, y, z }, ({ x, y, z }) => `${x}${y}${z}`)

    const result = await scope.resolve(executor)
    expect(result).toBe("xyz")

    await scope.dispose()
  })

  scenario("single dependency resolves correctly", async () => {
    const scope = createScope()

    const base = provide(() => "hello")
    const derived = derive(base, (val) => val.toUpperCase())

    const result = await scope.resolve(derived)
    expect(result).toBe("HELLO")

    await scope.dispose()
  })

  scenario("deeply nested dependencies resolve correctly", async () => {
    const scope = createScope()

    const l0 = provide(() => 1)
    const l1 = derive(l0, (v) => v + 1)
    const l2 = derive(l1, (v) => v + 1)
    const l3 = derive(l2, (v) => v + 1)
    const l4 = derive(l3, (v) => v + 1)
    const l5 = derive(l4, (v) => v + 1)

    const result = await scope.resolve(l5)
    expect(result).toBe(6)

    await scope.dispose()
  })

  scenario("mixed dependency shapes resolve correctly", async () => {
    const scope = createScope()

    const config = provide(() => ({ multiplier: 2 }))
    const base = derive(config, (c) => c.multiplier * 5)
    const values = derive([config, base], ([c, b]) => ({ config: c, base: b }))
    const final = derive(values, (v) => v.base + v.config.multiplier)

    const result = await scope.resolve(final)
    expect(result).toBe(12)

    await scope.dispose()
  })

  scenario("async executors work with static analysis", async () => {
    const scope = createScope()

    const asyncBase = provide(async () => {
      await new Promise((r) => setTimeout(r, 5))
      return 100
    })
    const derived = derive(asyncBase, (val) => val / 2)

    const result = await scope.resolve(derived)
    expect(result).toBe(50)

    await scope.dispose()
  })

  scenario("lazy channel works with static analysis optimization", async () => {
    const scope = createScope()

    const base = provide(() => 42)
    const derived = derive(base.lazy, async (accessor) => {
      await accessor.resolve()
      return accessor.get()
    })

    const result = await scope.resolve(derived)
    expect(result).toBe(42)

    await scope.dispose()
  })
})
