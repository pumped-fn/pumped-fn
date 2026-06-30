import { bench, describe } from "vitest"
import { atom, controller, createScope, flow, tag, preset, resource } from "../src/index"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function syncAtom(val: number) {
  return atom({ factory: () => val })
}

function asyncAtom(val: number, delayMs = 1) {
  return atom({
    factory: () => new Promise<number>((r) => setTimeout(() => r(val), delayMs)),
  })
}

// ─── B1: resolve() cache hit (the >90% case) ────────────────────────────────

describe("B1: resolve cache hit", () => {
  const a = atom({ factory: () => 42 })

  bench("resolve cached atom", async () => {
    const scope = createScope()
    await scope.resolve(a)
    for (let i = 0; i < 1000; i++) {
      await scope.resolve(a)
    }
    await scope.dispose()
  })
})

// ─── B2: resolveDeps sequential vs potential parallel ────────────────────────

describe("B2: resolve atom with N independent deps", () => {
  const dep1 = syncAtom(1)
  const dep2 = syncAtom(2)
  const dep3 = syncAtom(3)
  const dep4 = syncAtom(4)
  const dep5 = syncAtom(5)

  const parent = atom({
    deps: { dep1, dep2, dep3, dep4, dep5 },
    factory: (_, d) => d.dep1 + d.dep2 + d.dep3 + d.dep4 + d.dep5,
  })

  bench("resolve atom with 5 sync deps", async () => {
    const scope = createScope()
    await scope.resolve(parent)
    await scope.dispose()
  })

  const aDep1 = asyncAtom(1, 0)
  const aDep2 = asyncAtom(2, 0)
  const aDep3 = asyncAtom(3, 0)

  const asyncParent = atom({
    deps: { aDep1, aDep2, aDep3 },
    factory: (_, d) => d.aDep1 + d.aDep2 + d.aDep3,
  })

  bench("resolve atom with 3 async deps", async () => {
    const scope = createScope()
    await scope.resolve(asyncParent)
    await scope.dispose()
  })
})

// ─── B3: invalidation cascade ────────────────────────────────────────────────

describe("B3: invalidation cascade", () => {
  bench("invalidate root of 3-deep watch chain", async () => {
    const root = atom({ factory: () => ({ count: 0 }) })
    const mid = atom({
      deps: { r: controller(root, { resolve: true, watch: true }) },
      factory: (_, { r }) => ({ derived: r.get().count * 2 }),
    })
    const leaf = atom({
      deps: { m: controller(mid, { resolve: true, watch: true }) },
      factory: (_, { m }) => ({ final: m.get().derived + 1 }),
    })

    const scope = createScope()
    await scope.resolve(leaf)
    const ctrl = scope.controller(root)

    for (let i = 0; i < 100; i++) {
      ctrl.set({ count: i })
      await scope.flush()
    }
    await scope.dispose()
  })

  bench("invalidate root of 5-deep watch chain", async () => {
    const a0 = atom({ factory: () => ({ v: 0 }) })
    const a1 = atom({
      deps: { p: controller(a0, { resolve: true, watch: true }) },
      factory: (_, { p }) => ({ v: p.get().v + 1 }),
    })
    const a2 = atom({
      deps: { p: controller(a1, { resolve: true, watch: true }) },
      factory: (_, { p }) => ({ v: p.get().v + 1 }),
    })
    const a3 = atom({
      deps: { p: controller(a2, { resolve: true, watch: true }) },
      factory: (_, { p }) => ({ v: p.get().v + 1 }),
    })
    const a4 = atom({
      deps: { p: controller(a3, { resolve: true, watch: true }) },
      factory: (_, { p }) => ({ v: p.get().v + 1 }),
    })

    const scope = createScope()
    await scope.resolve(a4)
    const ctrl = scope.controller(a0)

    for (let i = 0; i < 100; i++) {
      ctrl.set({ v: i })
      await scope.flush()
    }
    await scope.dispose()
  })
})

// ─── B4: controller.get() hot path ──────────────────────────────────────────

describe("B4: controller.get() throughput", () => {
  const a = atom({ factory: () => 42 })

  bench("controller.get() x10000", async () => {
    const scope = createScope()
    await scope.resolve(a)
    const ctrl = scope.controller(a)
    let sum = 0
    for (let i = 0; i < 10_000; i++) {
      sum += ctrl.get()
    }
    await scope.dispose()
    void sum
  })
})

// ─── B5: listener dispatch ──────────────────────────────────────────────────

describe("B5: listener dispatch overhead", () => {
  bench("notify 10 listeners on resolved", async () => {
    const a = atom({ factory: () => ({ v: 0 }) })
    const scope = createScope()
    await scope.resolve(a)
    const ctrl = scope.controller(a)

    let notifications = 0
    for (let i = 0; i < 10; i++) {
      ctrl.on("resolved", () => { notifications++ })
    }

    for (let i = 0; i < 100; i++) {
      ctrl.set({ v: i })
      await scope.flush()
    }
    await scope.dispose()
  })
})

// ─── B6: scope creation + full resolve tree ─────────────────────────────────

describe("B6: scope lifecycle", () => {
  const config = atom({ factory: () => ({ port: 3000, host: "localhost" }) })
  const db = atom({
    deps: { config },
    factory: (_, { config }) => ({ connection: `${config.host}:${config.port}` }),
  })
  const cache = atom({ factory: () => ({ store: new Map() }) })
  const auth = atom({
    deps: { db },
    factory: (_, { db }) => ({ validate: (token: string) => !!token }),
  })
  const server = atom({
    deps: { db, cache, auth, config },
    factory: (_, deps) => ({ started: true }),
  })

  bench("create scope + resolve 5-atom tree + dispose", async () => {
    const scope = createScope()
    await scope.resolve(server)
    await scope.dispose()
  })
})

// ─── B7: flow execution ────────────────────────────────────────────────────

describe("B7: flow execution", () => {
  const configAtom = atom({ factory: () => ({ baseUrl: "http://test" }) })

  const processFlow = flow({
    deps: { config: configAtom },
    factory: (ctx, { config }) => ({ url: config.baseUrl, processed: true }),
  })

  bench("exec flow 100 times", async () => {
    const scope = createScope()
    const ctx = scope.createContext()
    for (let i = 0; i < 100; i++) {
      await ctx.exec({ flow: processFlow })
    }
    await ctx.close()
    await scope.dispose()
  })
})

// ─── B8: tag resolution ────────────────────────────────────────────────────

describe("B8: tag resolution in deps", () => {
  const envTag = tag<string>({ label: `bench-env-${Date.now()}` })
  const regionTag = tag<string>({ label: `bench-region-${Date.now()}` })
  const tenantTag = tag<string>({ label: `bench-tenant-${Date.now()}` })

  const configAtom = atom({ factory: () => "base-config" })

  const taggedFlow = flow({
    deps: { config: configAtom },
    factory: (ctx, { config }) => ({ config }),
  })

  bench("create context with 3 tags + exec flow", async () => {
    const scope = createScope({
      tags: [envTag("prod"), regionTag("us-east"), tenantTag("acme")],
    })
    const ctx = scope.createContext()
    for (let i = 0; i < 100; i++) {
      await ctx.exec({ flow: taggedFlow })
    }
    await ctx.close()
    await scope.dispose()
  })
})

// ─── B9: GC scheduling overhead ────────────────────────────────────────────

describe("B9: subscribe/unsubscribe churn (GC scheduling)", () => {
  const a = atom({ factory: () => 42 })

  bench("subscribe + unsubscribe x1000", async () => {
    const scope = createScope()
    await scope.resolve(a)
    const ctrl = scope.controller(a)

    for (let i = 0; i < 1000; i++) {
      const unsub = ctrl.on("resolved", () => {})
      unsub()
    }
    await scope.dispose()
  })
})

// ─── B10: select handle ────────────────────────────────────────────────────

describe("B10: select handle throughput", () => {
  const a = atom({ factory: () => ({ x: 0, y: "hello" }) })

  bench("select .x from 100 updates", async () => {
    const scope = createScope()
    await scope.resolve(a)
    const handle = scope.select(a, (v) => v.x)

    let reads = 0
    handle.subscribe(() => { reads++ })

    const ctrl = scope.controller(a)
    for (let i = 0; i < 100; i++) {
      ctrl.set({ x: i, y: "hello" })
      await scope.flush()
    }
    await scope.dispose()
  })
})

// ─── B11: wide dependency fan-out ──────────────────────────────────────────

describe("B11: wide dep fan-out (20 deps)", () => {
  const deps: Record<string, ReturnType<typeof syncAtom>> = {}
  for (let i = 0; i < 20; i++) {
    deps[`d${i}`] = syncAtom(i)
  }

  const wide = atom({
    deps,
    factory: (_, d: Record<string, number>) => {
      let sum = 0
      for (const k in d) sum += d[k]!
      return sum
    },
  })

  bench("resolve atom with 20 sync deps", async () => {
    const scope = createScope()
    await scope.resolve(wide)
    await scope.dispose()
  })
})

// ─── B12: extension middleware overhead ─────────────────────────────────────

describe("B12: extension middleware", () => {
  const noopExt = {
    name: "noop",
    wrapResolve: async (next: () => Promise<unknown>) => next(),
    wrapExec: async (next: () => Promise<unknown>) => next(),
  }

  const a = atom({ factory: () => 42 })
  const f = flow({ factory: () => "result" })

  bench("resolve with 3 noop extensions", async () => {
    const scope = createScope({ extensions: [noopExt, noopExt, noopExt] })
    await scope.resolve(a)
    await scope.dispose()
  })

  bench("exec flow with 3 noop extensions x100", async () => {
    const scope = createScope({ extensions: [noopExt, noopExt, noopExt] })
    const ctx = scope.createContext()
    for (let i = 0; i < 100; i++) {
      await ctx.exec({ flow: f })
    }
    await ctx.close()
    await scope.dispose()
  })
})

// ─── B13: resource resolution ──────────────────────────────────────────────

describe("B13: resource resolution", () => {
  const logger = resource({
    name: "logger",
    factory: (ctx) => ({ log: (msg: string) => {} }),
  })

  const handler = flow({
    deps: { logger },
    factory: (ctx, { logger }) => {
      logger.log("handled")
      return "ok"
    },
  })

  bench("exec flow with resource dep x100", async () => {
    const scope = createScope()
    const ctx = scope.createContext()
    for (let i = 0; i < 100; i++) {
      await ctx.exec({ flow: handler })
    }
    await ctx.close()
    await scope.dispose()
  })
})

// ─── B14: preset resolution ────────────────────────────────────────────────

describe("B14: preset resolution", () => {
  const original = atom({ factory: () => "original" })

  bench("resolve preset atom x100", async () => {
    const scope = createScope({ presets: [preset(original, "mocked")] })
    for (let i = 0; i < 100; i++) {
      await scope.resolve(original)
    }
    await scope.dispose()
  })
})
