import { describe, it, expect } from "vitest"
import { createScope } from "../src/scope"
import { atom, controller } from "../src/atom"
import { preset } from "../src/preset"
import { tag, tags } from "../src/tag"
import { flow, typed } from "../src/flow"
import type { Lite } from "../src/types"

describe("Scope", () => {
  describe("createScope()", () => {
    it("creates a scope", async () => {
      const scope = createScope()
      expect(scope).toBeDefined()
      expect(scope.resolve).toBeTypeOf("function")
      expect(scope.controller).toBeTypeOf("function")
      expect(scope.release).toBeTypeOf("function")
      expect(scope.dispose).toBeTypeOf("function")
      expect(scope.on).toBeTypeOf("function")
    })
  })

  describe("scope.resolve()", () => {
    it("resolves atom without deps", async () => {
      const scope = createScope()
      const myAtom = atom({ factory: () => 42 })

      const result = await scope.resolve(myAtom)
      expect(result).toBe(42)
    })

    it("resolves atom with deps", async () => {
      const scope = createScope()
      const configAtom = atom({ factory: () => ({ port: 3000 }) })
      const serverAtom = atom({
        deps: { cfg: configAtom },
        factory: (ctx, { cfg }) => ({ port: cfg.port }),
      })

      const result = await scope.resolve(serverAtom)
      expect(result).toEqual({ port: 3000 })
    })

    it("caches resolved values", async () => {
      const scope = createScope()
      let callCount = 0
      const myAtom = atom({
        factory: () => {
          callCount++
          return callCount
        },
      })

      const first = await scope.resolve(myAtom)
      const second = await scope.resolve(myAtom)

      expect(first).toBe(1)
      expect(second).toBe(1)
      expect(callCount).toBe(1)
    })

    it("resolves async factories", async () => {
      const scope = createScope()
      const myAtom = atom({
        factory: async () => {
          await new Promise((r) => setTimeout(r, 10))
          return "async result"
        },
      })

      const result = await scope.resolve(myAtom)
      expect(result).toBe("async result")
    })

    it("handles undefined as valid resolved value", async () => {
      const scope = createScope()
      const undefinedAtom = atom({ factory: () => undefined })

      const result = await scope.resolve(undefinedAtom)
      expect(result).toBe(undefined)

      const ctrl = scope.controller(undefinedAtom)
      expect(ctrl.state).toBe("resolved")
      expect(ctrl.get()).toBe(undefined)
    })

    it("uses preset value", async () => {
      const configAtom = atom({ factory: () => ({ port: 3000 }) })
      const scope = createScope({
        presets: [preset(configAtom, { port: 8080 })],
      })

      const result = await scope.resolve(configAtom)
      expect(result).toEqual({ port: 8080 })
    })

    it("uses preset atom", async () => {
      const configAtom = atom({ factory: () => ({ port: 3000 }) })
      const testConfigAtom = atom({ factory: () => ({ port: 9999 }) })
      const scope = createScope({
        presets: [preset(configAtom, testConfigAtom)],
      })

      const result = await scope.resolve(configAtom)
      expect(result).toEqual({ port: 9999 })
    })
  })

  describe("scope.controller()", () => {
    it("returns controller for atom", async () => {
      const scope = createScope()
      const myAtom = atom({ factory: () => 42 })

      const ctrl = scope.controller(myAtom)
      expect(ctrl).toBeDefined()
      expect(ctrl.state).toBe('idle')

      await ctrl.resolve()
      expect(ctrl.state).toBe('resolved')
      expect(ctrl.get()).toBe(42)
    })

    it("controller.get() throws if not resolved", async () => {
      const scope = createScope()
      const myAtom = atom({ factory: () => 42 })

      const ctrl = scope.controller(myAtom)
      expect(() => ctrl.get()).toThrow("not resolved")
    })

    it("controller.get() throws error on failed state", async () => {
      const scope = createScope()
      const myAtom = atom({
        factory: () => {
          throw new Error("factory failed")
        }
      })

      const ctrl = scope.controller(myAtom)
      await expect(ctrl.resolve()).rejects.toThrow("factory failed")
      expect(ctrl.state).toBe('failed')
      expect(() => ctrl.get()).toThrow("factory failed")
    })

    it("controller.get() returns stale value during resolving", async () => {
      const scope = createScope()
      let resolveCount = 0
      const myAtom = atom({
        factory: async () => {
          resolveCount++
          await new Promise(r => setTimeout(r, 50))
          return resolveCount
        }
      })

      const ctrl = scope.controller(myAtom)
      await ctrl.resolve()
      expect(ctrl.get()).toBe(1)

      ctrl.invalidate()
      await Promise.resolve()
      await Promise.resolve()
      expect(ctrl.state).toBe('resolving')
      expect(ctrl.get()).toBe(1)

      await scope.flush()
      expect(ctrl.state).toBe('resolved')
      expect(ctrl.get()).toBe(2)
    })

    it("returns promise with { resolve: true } option", async () => {
      const scope = createScope()
      const myAtom = atom({ factory: () => 42 })

      const result = scope.controller(myAtom, { resolve: true })
      expect(result).toBeInstanceOf(Promise)

      const ctrl = await result
      expect(ctrl.state).toBe('resolved')
      expect(ctrl.get()).toBe(42)
    })

    it("controller from { resolve: true } is same instance as regular controller", async () => {
      const scope = createScope()
      const myAtom = atom({ factory: () => 42 })

      const ctrl1 = scope.controller(myAtom)
      const ctrl2 = await scope.controller(myAtom, { resolve: true })

      // Verify they are the SAME instance
      expect(ctrl1).toBe(ctrl2)
      expect(ctrl1.get()).toBe(42)
      expect(ctrl2.get()).toBe(42)
    })

    it("{ resolve: true } works with async factory", async () => {
      const scope = createScope()
      const myAtom = atom({
        factory: async () => {
          await new Promise(r => setTimeout(r, 10))
          return "async-value"
        }
      })

      const ctrl = await scope.controller(myAtom, { resolve: true })
      expect(ctrl.state).toBe('resolved')
      expect(ctrl.get()).toBe("async-value")
    })

    it("{ resolve: true } propagates factory errors", async () => {
      const scope = createScope()
      const myAtom = atom({
        factory: () => {
          throw new Error("factory error")
        }
      })

      await expect(scope.controller(myAtom, { resolve: true }))
        .rejects.toThrow("factory error")
    })

    it("{ resolve: true } returns already-resolved controller immediately", async () => {
      const scope = createScope()
      const myAtom = atom({ factory: () => 42 })

      // Resolve first
      await scope.resolve(myAtom)

      // Then get controller with resolve: true
      const ctrl = await scope.controller(myAtom, { resolve: true })

      expect(ctrl.state).toBe('resolved')
      expect(ctrl.get()).toBe(42)
    })
  })

  describe("controller deps", () => {
    it("resolves controller dep", async () => {
      const scope = createScope()
      const optionalAtom = atom({ factory: () => "optional" })
      const mainAtom = atom({
        deps: { opt: controller(optionalAtom) },
        factory: async (ctx, { opt }) => {
          await opt.resolve()
          return opt.get()
        },
      })

      const result = await scope.resolve(mainAtom)
      expect(result).toBe("optional")
    })

    it("controller dep has full interface", async () => {
      const scope = createScope()
      const innerAtom = atom({ factory: () => 42 })
      const outerAtom = atom({
        deps: { inner: controller(innerAtom) },
        factory: async (ctx, { inner }) => {
          expect(inner.state).toBe('idle')
          await inner.resolve()
          expect(inner.state).toBe('resolved')
          expect(inner.get()).toBe(42)
          expect(typeof inner.invalidate).toBe('function')
          expect(typeof inner.on).toBe('function')
          return inner.get()
        },
      })

      const result = await scope.resolve(outerAtom)
      expect(result).toBe(42)
    })

    it("auto-resolves controller when { resolve: true }", async () => {
      const scope = createScope()
      const configAtom = atom({ factory: () => ({ port: 3000 }) })

      const dependentAtom = atom({
        deps: { config: controller(configAtom, { resolve: true }) },
        factory: (ctx, { config }) => {
          expect(config.state).toBe('resolved')
          return config.get().port
        }
      })

      const result = await scope.resolve(dependentAtom)
      expect(result).toBe(3000)
    })

    it("controller without options remains idle", async () => {
      const scope = createScope()
      const configAtom = atom({ factory: () => ({ port: 3000 }) })

      const dependentAtom = atom({
        deps: { config: controller(configAtom) },
        factory: async (ctx, { config }) => {
          expect(config.state).toBe('idle')
          await config.resolve()
          return config.get().port
        }
      })

      const result = await scope.resolve(dependentAtom)
      expect(result).toBe(3000)
    })

    it("resolved controller supports on(), invalidate(), set()", async () => {
      const scope = createScope()
      let factoryCallCount = 0
      const configAtom = atom({
        factory: () => {
          factoryCallCount++
          return { port: 3000 }
        }
      })

      let listenerCalls = 0
      const dependentAtom = atom({
        deps: { config: controller(configAtom, { resolve: true }) },
        factory: (ctx, { config }) => {
          config.on('resolved', () => listenerCalls++)
          return config.get().port
        }
      })

      await scope.resolve(dependentAtom)
      expect(factoryCallCount).toBe(1)

      const ctrl = scope.controller(configAtom)
      ctrl.set({ port: 8080 })
      await scope.flush()
      expect(listenerCalls).toBe(1)
      expect(ctrl.get().port).toBe(8080)
    })

    it("propagates errors from auto-resolved controller", async () => {
      const scope = createScope()
      const failingAtom = atom({
        factory: () => { throw new Error("config failed") }
      })

      const dependentAtom = atom({
        deps: { config: controller(failingAtom, { resolve: true }) },
        factory: (ctx, { config }) => config.get()
      })

      await expect(scope.resolve(dependentAtom)).rejects.toThrow("config failed")
    })
  })

  describe("tag deps", () => {
    it("resolves required tag from scope tags", async () => {
      const tenantId = tag<string>({ label: "tenantId" })
      const scope = createScope({
        tags: [tenantId("tenant-123")],
      })

      const myAtom = atom({
        deps: { tenant: tags.required(tenantId) },
        factory: (ctx, { tenant }) => tenant,
      })

      const result = await scope.resolve(myAtom)
      expect(result).toBe("tenant-123")
    })

    it("throws for missing required tag", async () => {
      const tenantId = tag<string>({ label: "tenantId" })
      const scope = createScope()

      const myAtom = atom({
        deps: { tenant: tags.required(tenantId) },
        factory: (ctx, { tenant }) => tenant,
      })

      await expect(scope.resolve(myAtom)).rejects.toThrow()
    })

    it("resolves optional tag as undefined", async () => {
      const tenantId = tag<string>({ label: "tenantId" })
      const scope = createScope()

      const myAtom = atom({
        deps: { tenant: tags.optional(tenantId) },
        factory: (ctx, { tenant }) => tenant,
      })

      const result = await scope.resolve(myAtom)
      expect(result).toBeUndefined()
    })
  })

  describe("cleanup", () => {
    it("runs cleanup on release", async () => {
      const scope = createScope()
      let cleaned = false
      const myAtom = atom({
        factory: (ctx) => {
          ctx.cleanup(() => {
            cleaned = true
          })
          return 42
        },
      })

      await scope.resolve(myAtom)
      expect(cleaned).toBe(false)

      await scope.release(myAtom)
      expect(cleaned).toBe(true)
    })

    it("runs cleanups in LIFO order", async () => {
      const scope = createScope()
      const order: number[] = []
      const myAtom = atom({
        factory: (ctx) => {
          ctx.cleanup(() => { order.push(1) })
          ctx.cleanup(() => { order.push(2) })
          ctx.cleanup(() => { order.push(3) })
          return 42
        },
      })

      await scope.resolve(myAtom)
      await scope.release(myAtom)

      expect(order).toEqual([3, 2, 1])
    })
  })

  describe("dispose", () => {
    it("releases all atoms", async () => {
      const scope = createScope()
      const cleanups: string[] = []

      const a = atom({
        factory: (ctx) => {
          ctx.cleanup(() => { cleanups.push("a") })
          return "a"
        },
      })
      const b = atom({
        factory: (ctx) => {
          ctx.cleanup(() => { cleanups.push("b") })
          return "b"
        },
      })

      await scope.resolve(a)
      await scope.resolve(b)
      await scope.dispose()

      expect(cleanups).toContain("a")
      expect(cleanups).toContain("b")
    })
  })
})

describe('Dependents Tracking', () => {
  it('tracks dependents when atom depends on another', async () => {
    const scope = createScope() as any
    
    const depAtom = atom({ factory: () => 'dep' })
    const mainAtom = atom({
      deps: { dep: depAtom },
      factory: (ctx, { dep }) => `main-${dep}`
    })
    
    await scope.resolve(mainAtom)
    
    const depEntry = scope.getEntry(depAtom)
    expect(depEntry.dependents.has(mainAtom)).toBe(true)
  })

  it('does not track dependents for atoms without deps', async () => {
    const scope = createScope() as any
    
    const standaloneAtom = atom({ factory: () => 'standalone' })
    await scope.resolve(standaloneAtom)
    
    const entry = scope.getEntry(standaloneAtom)
    expect(entry.dependents.size).toBe(0)
  })

  it('tracks multiple dependents for shared dependency', async () => {
    const scope = createScope() as any
    
    const sharedAtom = atom({ factory: () => 'shared' })
    const consumer1 = atom({
      deps: { shared: sharedAtom },
      factory: (ctx, { shared }) => `1-${shared}`
    })
    const consumer2 = atom({
      deps: { shared: sharedAtom },
      factory: (ctx, { shared }) => `2-${shared}`
    })
    
    await scope.resolve(consumer1)
    await scope.resolve(consumer2)
    
    const sharedEntry = scope.getEntry(sharedAtom)
    expect(sharedEntry.dependents.size).toBe(2)
    expect(sharedEntry.dependents.has(consumer1)).toBe(true)
    expect(sharedEntry.dependents.has(consumer2)).toBe(true)
  })

  it('tracks dependents through controller deps', async () => {
    const scope = createScope() as any
    
    const depAtom = atom({ factory: () => 'dep' })
    const mainAtom = atom({
      deps: { dep: controller(depAtom, { resolve: true }) },
      factory: (ctx, { dep }) => `main-${dep.get()}`
    })
    
    await scope.resolve(mainAtom)
    
    const depEntry = scope.getEntry(depAtom)
    expect(depEntry.dependents.has(mainAtom)).toBe(true)
  })
})

describe('GC Options', () => {
  it('defaults gc.enabled to true', () => {
    const scope = createScope() as any
    expect(scope.gcOptions.enabled).toBe(true)
  })

  it('defaults gc.graceMs to 3000', () => {
    const scope = createScope() as any
    expect(scope.gcOptions.graceMs).toBe(3000)
  })

  it('respects gc.enabled: false', () => {
    const scope = createScope({ gc: { enabled: false } }) as any
    expect(scope.gcOptions.enabled).toBe(false)
  })

  it('respects custom gc.graceMs', () => {
    const scope = createScope({ gc: { graceMs: 5000 } }) as any
    expect(scope.gcOptions.graceMs).toBe(5000)
  })
})

describe('Automatic GC - Scheduling', () => {
  const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

  it('schedules GC when last subscriber unsubscribes', async () => {
    const scope = createScope({ gc: { graceMs: 100 } })
    const myAtom = atom({ factory: () => 'value' })
    
    const ctrl = scope.controller(myAtom)
    await ctrl.resolve()
    expect(ctrl.state).toBe('resolved')
    
    const unsub = ctrl.on('resolved', () => {})
    unsub()
    
    expect(ctrl.state).toBe('resolved')
    
    await delay(150)
    expect(ctrl.state).toBe('idle')
  })

  it('cancels scheduled GC when resubscribed during grace period', async () => {
    const scope = createScope({ gc: { graceMs: 100 } })
    const myAtom = atom({ factory: () => 'value' })
    
    const ctrl = scope.controller(myAtom)
    await ctrl.resolve()
    
    const unsub1 = ctrl.on('resolved', () => {})
    unsub1()
    
    await delay(50)
    
    const unsub2 = ctrl.on('resolved', () => {})
    
    await delay(100)
    expect(ctrl.state).toBe('resolved')
    
    unsub2()
  })

  it('does not schedule GC when still has other subscribers', async () => {
    const scope = createScope({ gc: { graceMs: 100 } })
    const myAtom = atom({ factory: () => 'value' })
    
    const ctrl = scope.controller(myAtom)
    await ctrl.resolve()
    
    const unsub1 = ctrl.on('resolved', () => {})
    const unsub2 = ctrl.on('resolved', () => {})
    
    unsub1()
    
    await delay(150)
    expect(ctrl.state).toBe('resolved')
    
    unsub2()
  })
})

describe('Automatic GC - keepAlive', () => {
  const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

  it('does not GC atoms with keepAlive: true', async () => {
    const scope = createScope({ gc: { graceMs: 100 } })
    const myAtom = atom({ factory: () => 'persistent', keepAlive: true })
    
    const ctrl = scope.controller(myAtom)
    await ctrl.resolve()
    
    const unsub = ctrl.on('resolved', () => {})
    unsub()
    
    await delay(150)
    expect(ctrl.state).toBe('resolved')
  })

  it('GCs atoms with keepAlive: false (explicit)', async () => {
    const scope = createScope({ gc: { graceMs: 100 } })
    const myAtom = atom({ factory: () => 'temporary', keepAlive: false })
    
    const ctrl = scope.controller(myAtom)
    await ctrl.resolve()
    
    const unsub = ctrl.on('resolved', () => {})
    unsub()
    
    await delay(150)
    expect(ctrl.state).toBe('idle')
  })
})

describe('Automatic GC - Cascading', () => {
  const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

  it('does not GC dependency while dependent is mounted', async () => {
    const scope = createScope({ gc: { graceMs: 100 } })
    
    const depAtom = atom({ factory: () => 'dep' })
    const mainAtom = atom({
      deps: { dep: depAtom },
      factory: (ctx, { dep }) => `main-${dep}`
    })
    
    const depCtrl = scope.controller(depAtom)
    const mainCtrl = scope.controller(mainAtom)
    
    await mainCtrl.resolve()
    
    const mainUnsub = mainCtrl.on('resolved', () => {})
    
    await delay(150)
    expect(depCtrl.state).toBe('resolved')
    
    mainUnsub()
  })

  it('cascades GC to dependencies after dependent is released', async () => {
    const scope = createScope({ gc: { graceMs: 100 } })
    
    const depAtom = atom({ factory: () => 'dep' })
    const mainAtom = atom({
      deps: { dep: depAtom },
      factory: (ctx, { dep }) => `main-${dep}`
    })
    
    const depCtrl = scope.controller(depAtom)
    const mainCtrl = scope.controller(mainAtom)
    
    await mainCtrl.resolve()
    
    const unsub = mainCtrl.on('resolved', () => {})
    unsub()
    
    await delay(150)
    expect(mainCtrl.state).toBe('idle')
    
    await delay(150)
    expect(depCtrl.state).toBe('idle')
  })

  it('does not cascade to keepAlive dependencies', async () => {
    const scope = createScope({ gc: { graceMs: 100 } })
    
    const configAtom = atom({ factory: () => 'config', keepAlive: true })
    const serviceAtom = atom({
      deps: { config: configAtom },
      factory: (ctx, { config }) => `service-${config}`
    })
    
    const configCtrl = scope.controller(configAtom)
    const serviceCtrl = scope.controller(serviceAtom)
    
    await serviceCtrl.resolve()
    
    const unsub = serviceCtrl.on('resolved', () => {})
    unsub()
    
    await delay(150)
    expect(serviceCtrl.state).toBe('idle')
    
    await delay(150)
    expect(configCtrl.state).toBe('resolved')
  })
})

describe('Automatic GC - Disabled', () => {
  const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

  it('does not GC when gc.enabled is false', async () => {
    const scope = createScope({ gc: { enabled: false, graceMs: 100 } })
    const myAtom = atom({ factory: () => 'value' })
    
    const ctrl = scope.controller(myAtom)
    await ctrl.resolve()
    
    const unsub = ctrl.on('resolved', () => {})
    unsub()
    
    await delay(150)
    expect(ctrl.state).toBe('resolved')
  })
})

describe('Automatic GC - Edge Cases', () => {
  const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

  it('manual release still works', async () => {
    const scope = createScope({ gc: { graceMs: 100 } })
    const myAtom = atom({ factory: () => 'value' })
    
    const ctrl = scope.controller(myAtom)
    await ctrl.resolve()
    
    await scope.release(myAtom)
    expect(ctrl.state).toBe('idle')
  })

  it('dispose releases all atoms ignoring GC', async () => {
    const scope = createScope({ gc: { graceMs: 5000 } })
    const myAtom = atom({ factory: () => 'value' })
    
    const ctrl = scope.controller(myAtom)
    await ctrl.resolve()
    
    await scope.dispose()
    expect(ctrl.state).toBe('idle')
  })

  it('invalidation does not trigger GC (same subscribers)', async () => {
    const scope = createScope({ gc: { graceMs: 100 } })
    let callCount = 0
    const myAtom = atom({ factory: () => ++callCount })
    
    const ctrl = scope.controller(myAtom)
    await ctrl.resolve()
    expect(ctrl.get()).toBe(1)
    
    const unsub = ctrl.on('resolved', () => {})
    
    ctrl.invalidate()
    await scope.flush()
    
    expect(ctrl.state).toBe('resolved')
    expect(ctrl.get()).toBe(2)
    
    await delay(150)
    expect(ctrl.state).toBe('resolved')
    
    unsub()
  })

  it('clears pending GC timer on manual release', async () => {
    const scope = createScope({ gc: { graceMs: 100 } })
    const myAtom = atom({ factory: () => 'value' })
    
    const ctrl = scope.controller(myAtom)
    await ctrl.resolve()
    
    const unsub = ctrl.on('resolved', () => {})
    unsub()
    
    await scope.release(myAtom)
    expect(ctrl.state).toBe('idle')
    
    await delay(150)
  })

  it('clears GC timers on dispose', async () => {
    const scope = createScope({ gc: { graceMs: 100 } })
    const myAtom = atom({ factory: () => 'value' })
    
    const ctrl = scope.controller(myAtom)
    await ctrl.resolve()
    
    const unsub = ctrl.on('resolved', () => {})
    unsub()
    
    await scope.dispose()
    
    await delay(150)
  })
})

describe("ExecutionContext", () => {
  describe("createContext()", () => {
    it("creates execution context", async () => {
      const scope = createScope()
      const ctx = scope.createContext()

      expect(ctx).toBeDefined()
      expect(ctx.exec).toBeTypeOf("function")
      expect(ctx.close).toBeTypeOf("function")
    })

  })

  describe("ctx.exec() with flow", () => {
    it("executes flow without deps", async () => {
      const scope = createScope()
      const ctx = scope.createContext()

      const myFlow = flow({
        parse: typed<string>(),
        factory: (ctx) => `input: ${ctx.input}`,
      })

      const result = await ctx.exec({
        flow: myFlow,
        input: "hello",
      })

      expect(result).toBe("input: hello")
      await ctx.close()
    })

    it("executes flow with deps", async () => {
      const dbAtom = atom({ factory: () => ({ query: () => "data" }) })
      const scope = createScope()
      const ctx = scope.createContext()

      const myFlow = flow({
        deps: { db: dbAtom },
        factory: (ctx, { db }) => db.query(),
      })

      const result = await ctx.exec({
        flow: myFlow,
        input: null,
      })

      expect(result).toBe("data")
      await ctx.close()
    })

    it("resolves tag deps from merged sources", async () => {
      const requestId = tag<string>({ label: "requestId" })
      const tenantId = tag<string>({ label: "tenantId" })

      const scope = createScope({
        tags: [tenantId("tenant-1")],
      })

      const ctx = scope.createContext({
        tags: [requestId("req-123")],
      })

      const myFlow = flow({
        deps: {
          reqId: tags.required(requestId),
          tenant: tags.required(tenantId),
        },
        factory: (ctx, { reqId, tenant }) => ({ reqId, tenant }),
      })

      const result = await ctx.exec({
        flow: myFlow,
        input: null,
      })

      expect(result).toEqual({
        reqId: "req-123",
        tenant: "tenant-1",
      })

      await ctx.close()
    })

    it("exec tags override context tags", async () => {
      const requestId = tag<string>({ label: "requestId" })

      const scope = createScope()
      const ctx = scope.createContext({
        tags: [requestId("ctx-id")],
      })

      const myFlow = flow({
        deps: { reqId: tags.required(requestId) },
        factory: (ctx, { reqId }) => reqId,
      })

      const result = await ctx.exec({
        flow: myFlow,
        input: null,
        tags: [requestId("exec-id")],
      })

      expect(result).toBe("exec-id")
      await ctx.close()
    })
  })

  describe("ctx.exec() with fn", () => {
    it("executes plain function with auto-injected ctx", async () => {
      const scope = createScope()
      const ctx = scope.createContext()

      const result = await ctx.exec({
        fn: (_ctx: Lite.ExecutionContext, a: number, b: number) => a + b,
        params: [1, 2],
      })

      expect(result).toBe(3)
      await ctx.close()
    })
  })

  describe("ctx.onClose()", () => {
    it("runs cleanup on close", async () => {
      const scope = createScope()
      const ctx = scope.createContext()

      let cleaned = false
      ctx.onClose(() => {
        cleaned = true
      })

      expect(cleaned).toBe(false)
      await ctx.close()
      expect(cleaned).toBe(true)
    })

    it("runs cleanups in LIFO order", async () => {
      const scope = createScope()
      const ctx = scope.createContext()

      const order: number[] = []
      ctx.onClose(() => { order.push(1) })
      ctx.onClose(() => { order.push(2) })
      ctx.onClose(() => { order.push(3) })

      await ctx.close()
      expect(order).toEqual([3, 2, 1])
    })
  })

  describe("closed context", () => {
    it("throws when executing on closed context", async () => {
      const scope = createScope()
      const ctx = scope.createContext()
      await ctx.close()

      const myFlow = flow({ factory: () => 42 })

      await expect(
        ctx.exec({ flow: myFlow, input: null })
      ).rejects.toThrow("closed")
    })
  })

  describe("circular dependency", () => {
    it("throws on circular dependency", async () => {
      const scope = createScope()

      const atomA: ReturnType<typeof atom<string>> = atom({
        deps: { b: undefined as unknown as ReturnType<typeof atom<string>> },
        factory: (_, { b }) => `a:${b}`,
      })

      const atomB = atom({
        deps: { a: atomA },
        factory: (_, { a }) => `b:${a}`,
      })

      Object.assign(atomA.deps!, { b: atomB })

      await expect(scope.resolve(atomA)).rejects.toThrow("Circular")
    })
  })

  describe("concurrent resolution", () => {
    it("handles concurrent resolution of same atom", async () => {
      const scope = createScope()
      let resolveCount = 0

      const slowAtom = atom({
        factory: async () => {
          resolveCount++
          await new Promise((r) => setTimeout(r, 20))
          return resolveCount
        },
      })

      const [a, b] = await Promise.all([
        scope.resolve(slowAtom),
        scope.resolve(slowAtom),
      ])

      expect(a).toBe(1)
      expect(b).toBe(1)
      expect(resolveCount).toBe(1)
    })
  })

  describe("ctx.invalidate()", () => {
    it("schedules re-resolution after factory completes", async () => {
      const scope = createScope()
      let resolveCount = 0
      const myAtom = atom({
        factory: (ctx) => {
          resolveCount++
          if (resolveCount === 1) {
            ctx.invalidate()
          }
          return resolveCount
        }
      })

      const result = await scope.resolve(myAtom)
      expect(result).toBe(1)

      await scope.flush()
      const ctrl = scope.controller(myAtom)
      expect(ctrl.get()).toBe(2)
    })

    it("does not interrupt current factory execution", async () => {
      const scope = createScope()
      const events: string[] = []
      let executionCount = 0

      const myAtom = atom({
        factory: async (ctx) => {
          const thisExecution = ++executionCount
          events.push(`${thisExecution}:start`)
          if (thisExecution < 2) ctx.invalidate()
          events.push(`${thisExecution}:after-invalidate`)
          await new Promise(r => setTimeout(r, 10))
          events.push(`${thisExecution}:end`)
          return thisExecution
        }
      })

      const result = await scope.resolve(myAtom)
      expect(result).toBe(1)

      await scope.flush()

      const firstExecEvents = events.filter(e => e.startsWith("1:"))
      expect(firstExecEvents).toEqual(["1:start", "1:after-invalidate", "1:end"])

      const secondExecEvents = events.filter(e => e.startsWith("2:"))
      expect(secondExecEvents).toEqual(["2:start", "2:after-invalidate", "2:end"])

      const firstEndIndex = events.indexOf("1:end")
      const secondStartIndex = events.indexOf("2:start")
      expect(firstEndIndex).toBeLessThan(secondStartIndex)
    })
  })

  describe("controller.invalidate()", () => {
    it("triggers re-resolution", async () => {
      const scope = createScope()
      let resolveCount = 0
      const myAtom = atom({
        factory: () => {
          resolveCount++
          return resolveCount
        }
      })

      await scope.resolve(myAtom)
      expect(resolveCount).toBe(1)

      const ctrl = scope.controller(myAtom)
      ctrl.invalidate()

      await new Promise(r => setTimeout(r, 10))
      expect(resolveCount).toBe(2)
      expect(ctrl.get()).toBe(2)
    })

    it("sets state to resolving after invalidate microtask", async () => {
      const scope = createScope()
      const myAtom = atom({
        factory: async () => {
          await new Promise(r => setTimeout(r, 50))
          return "value"
        }
      })

      const ctrl = scope.controller(myAtom)
      await ctrl.resolve()
      expect(ctrl.state).toBe('resolved')
      expect(ctrl.get()).toBe("value")

      ctrl.invalidate()
      await Promise.resolve()
      await Promise.resolve()
      expect(ctrl.state).toBe('resolving')
      expect(ctrl.get()).toBe("value")
    })

    it("queues invalidation if called during resolving", async () => {
      const scope = createScope()
      let resolveCount = 0
      const myAtom = atom({
        factory: async () => {
          resolveCount++
          await new Promise(r => setTimeout(r, 50))
          return resolveCount
        }
      })

      const ctrl = scope.controller(myAtom)
      const resolvePromise = ctrl.resolve()
      expect(ctrl.state).toBe('resolving')

      ctrl.invalidate()

      const firstResult = await resolvePromise
      expect(firstResult).toBe(1)

      await scope.flush()
      expect(resolveCount).toBe(2)
      expect(ctrl.get()).toBe(2)
    })

    it("no-ops when invalidate called on idle atom", async () => {
      const scope = createScope()
      let factoryCallCount = 0
      const myAtom = atom({
        factory: () => {
          factoryCallCount++
          return "value"
        }
      })

      const ctrl = scope.controller(myAtom)
      expect(ctrl.state).toBe('idle')

      ctrl.invalidate()
      expect(ctrl.state).toBe('idle')

      await new Promise(r => setTimeout(r, 10))
      expect(factoryCallCount).toBe(0)
    })

    it("transitions failed state to resolving on invalidate", async () => {
      const scope = createScope()
      let shouldFail = true
      const myAtom = atom({
        factory: () => {
          if (shouldFail) throw new Error("test error")
          return "success"
        }
      })

      const ctrl = scope.controller(myAtom)
      await expect(ctrl.resolve()).rejects.toThrow("test error")
      expect(ctrl.state).toBe('failed')

      shouldFail = false
      ctrl.invalidate()
      await Promise.resolve()
      await Promise.resolve()
      expect(ctrl.state).toBe('resolving')

      await new Promise(r => setTimeout(r, 10))
      expect(ctrl.state).toBe('resolved')
      expect(ctrl.get()).toBe("success")
    })
  })

  describe("controller.set()", () => {
    it("replaces value and notifies listeners", async () => {
      const scope = createScope()
      const myAtom = atom({ factory: () => ({ name: "Guest" }) })
      const ctrl = scope.controller(myAtom)

      await ctrl.resolve()

      const notifications: string[] = []
      ctrl.on("resolved", () => notifications.push("resolved"))

      ctrl.set({ name: "Alice" })
      await scope.flush()

      expect(ctrl.get()).toEqual({ name: "Alice" })
      expect(notifications).toEqual(["resolved"])
    })

    it("runs cleanups before setting", async () => {
      const scope = createScope()
      const cleanups: string[] = []
      const myAtom = atom({
        factory: (ctx) => {
          ctx.cleanup(() => { cleanups.push("cleanup") })
          return { name: "Guest" }
        },
      })

      const ctrl = scope.controller(myAtom)
      await ctrl.resolve()

      ctrl.set({ name: "Alice" })
      await scope.flush()

      expect(cleanups).toEqual(["cleanup"])
    })

    it("throws when atom not resolved", () => {
      const scope = createScope()
      const myAtom = atom({ factory: () => ({ name: "Guest" }) })
      const ctrl = scope.controller(myAtom)

      expect(() => ctrl.set({ name: "Alice" })).toThrow("Atom not resolved")
    })

    it("queues when atom is resolving", async () => {
      const scope = createScope()
      let resolveFactory: () => void
      const myAtom = atom({
        factory: () =>
          new Promise<{ name: string }>((r) => {
            resolveFactory = () => r({ name: "Guest" })
          }),
      })

      const ctrl = scope.controller(myAtom)
      const resolvePromise = ctrl.resolve()

      await Promise.resolve()

      ctrl.set({ name: "Alice" })

      resolveFactory!()
      await resolvePromise
      await scope.flush()

      expect(ctrl.get()).toEqual({ name: "Alice" })
    })

    it("does not run factory", async () => {
      const scope = createScope()
      let factoryCount = 0
      const myAtom = atom({
        factory: () => {
          factoryCount++
          return factoryCount
        },
      })

      const ctrl = scope.controller(myAtom)
      await ctrl.resolve()
      expect(factoryCount).toBe(1)

      ctrl.set(100)
      await scope.flush()

      expect(ctrl.get()).toBe(100)
      expect(factoryCount).toBe(1)
    })
  })

  describe("controller.update()", () => {
    it("transforms value using function", async () => {
      const scope = createScope()
      const myAtom = atom({ factory: () => 0 })
      const ctrl = scope.controller(myAtom)

      await ctrl.resolve()

      ctrl.update((n) => n + 1)
      await scope.flush()

      expect(ctrl.get()).toBe(1)
    })

    it("chains multiple updates", async () => {
      const scope = createScope()
      const myAtom = atom({ factory: () => 0 })
      const ctrl = scope.controller(myAtom)

      await ctrl.resolve()

      ctrl.update((n) => n + 1)
      await scope.flush()
      ctrl.update((n) => n * 2)
      await scope.flush()

      expect(ctrl.get()).toBe(2)
    })

    it("notifies listeners", async () => {
      const scope = createScope()
      const myAtom = atom({ factory: () => 0 })
      const ctrl = scope.controller(myAtom)

      await ctrl.resolve()

      const notifications: string[] = []
      ctrl.on("resolved", () => notifications.push("resolved"))

      ctrl.update((n) => n + 1)
      await scope.flush()

      expect(notifications).toEqual(["resolved"])
    })
  })

  describe("controller.on()", () => {
    it("notifies on state change", async () => {
      const scope = createScope()
      const states: string[] = []
      const myAtom = atom({
        factory: async () => {
          await new Promise(r => setTimeout(r, 10))
          return 42
        }
      })

      const ctrl = scope.controller(myAtom)
      ctrl.on('*', () => states.push(ctrl.state))

      await ctrl.resolve()

      expect(states).toContain('resolving')
      expect(states).toContain('resolved')
    })

    it("returns unsubscribe function", async () => {
      const scope = createScope()
      let notifyCount = 0
      const myAtom = atom({ factory: () => 42 })

      const ctrl = scope.controller(myAtom)
      const unsub = ctrl.on('*', () => notifyCount++)

      await ctrl.resolve()
      const countAfterResolve = notifyCount

      unsub()
      ctrl.invalidate()
      await new Promise(r => setTimeout(r, 10))

      expect(notifyCount).toBe(countAfterResolve)
    })

    it("notifies on invalidation", async () => {
      const scope = createScope()
      const states: string[] = []
      const myAtom = atom({
        factory: async () => {
          await new Promise(r => setTimeout(r, 10))
          return 42
        }
      })

      const ctrl = scope.controller(myAtom)
      await ctrl.resolve()
      expect(ctrl.state).toBe('resolved')

      ctrl.on('*', () => states.push(ctrl.state))
      ctrl.invalidate()

      await Promise.resolve()
      await Promise.resolve()
      expect(states).toContain('resolving')

      await scope.flush()
      expect(states).toContain('resolved')
    })

    it("filters by state - only notifies resolved listeners on resolved", async () => {
      const scope = createScope()
      const calls: string[] = []

      const myAtom = atom({ factory: () => 'value' })
      const ctl = scope.controller(myAtom)

      ctl.on('resolving', () => calls.push('resolving'))
      ctl.on('resolved', () => calls.push('resolved'))
      ctl.on('*', () => calls.push('*'))

      await ctl.resolve()

      expect(calls).toEqual(['resolving', '*', 'resolved', '*'])
    })

    it("notifies exactly twice per invalidation cycle", async () => {
      const scope = createScope()
      const calls: string[] = []

      const myAtom = atom({ factory: () => 'value' })
      const ctl = scope.controller(myAtom)
      await ctl.resolve()

      ctl.on('resolving', () => calls.push('resolving'))
      ctl.on('resolved', () => calls.push('resolved'))

      ctl.invalidate()
      await scope.flush()

      expect(calls).toEqual(['resolving', 'resolved'])
    })

    it("only notifies '*' listeners on failed state, not 'resolved'", async () => {
      const scope = createScope()
      const calls: string[] = []

      const failingAtom = atom({
        factory: () => {
          throw new Error("intentional failure")
        }
      })

      const ctl = scope.controller(failingAtom)

      ctl.on('resolving', () => calls.push('resolving'))
      ctl.on('resolved', () => calls.push('resolved'))
      ctl.on('*', () => calls.push('*'))

      await expect(ctl.resolve()).rejects.toThrow("intentional failure")

      expect(calls).toEqual(['resolving', '*', '*'])
    })
  })

  describe("scope.on()", () => {
    it("fires for specific state transitions", async () => {
      const scope = createScope()
      const events: string[] = []
      const myAtom = atom({
        factory: async () => {
          await new Promise(r => setTimeout(r, 10))
          return 42
        }
      })

      scope.on('resolving', myAtom, () => events.push('resolving'))
      scope.on('resolved', myAtom, () => events.push('resolved'))

      await scope.resolve(myAtom)

      expect(events).toEqual(['resolving', 'resolved'])
    })

    it("fires failed event on error", async () => {
      const scope = createScope()
      let failedCalled = false
      const myAtom = atom({
        factory: () => {
          throw new Error("oops")
        }
      })

      scope.on('failed', myAtom, () => { failedCalled = true })

      await expect(scope.resolve(myAtom)).rejects.toThrow("oops")
      expect(failedCalled).toBe(true)
    })

    it("returns unsubscribe function", async () => {
      const scope = createScope()
      let count = 0
      const myAtom = atom({ factory: () => count++ })

      const unsub = scope.on('resolved', myAtom, () => count += 10)

      await scope.resolve(myAtom)
      expect(count).toBe(11)

      unsub()
      await scope.release(myAtom)
      await scope.resolve(myAtom)
      expect(count).toBe(12)
    })
  })

  describe("self-invalidating atom", () => {
    it("supports polling pattern", async () => {
      const scope = createScope()
      let pollCount = 0
      const myAtom = atom({
        factory: (ctx) => {
          pollCount++
          if (pollCount < 3) {
            const timeout = setTimeout(() => ctx.invalidate(), 20)
            ctx.cleanup(() => clearTimeout(timeout))
          }
          return pollCount
        }
      })

      await scope.resolve(myAtom)
      expect(pollCount).toBe(1)

      await new Promise(r => setTimeout(r, 100))
      expect(pollCount).toBe(3)
    })
  })

  describe("downstream subscribes to upstream", () => {
    it("invalidates when upstream changes", async () => {
      const scope = createScope()
      let configValue = "initial"
      let serverCreateCount = 0

      const configAtom = atom({
        factory: () => configValue
      })

      const serverAtom = atom({
        deps: { config: controller(configAtom) },
        factory: async (ctx, { config }) => {
          serverCreateCount++
          await config.resolve()
          const unsub = ctx.scope.on('resolved', configAtom, () => ctx.invalidate())
          ctx.cleanup(unsub)
          return `server:${config.get()}`
        }
      })

      await scope.resolve(serverAtom)
      expect(serverCreateCount).toBe(1)

      configValue = "updated"
      const configCtrl = scope.controller(configAtom)
      configCtrl.invalidate()

      await new Promise(r => setTimeout(r, 200))
      const serverCtrl = scope.controller(serverAtom)
      expect(serverCtrl.get()).toBe("server:updated")
      expect(serverCreateCount).toBe(2)
    })
  })

  describe("flow parse", () => {
    it("parses input before factory execution", async () => {
      const scope = createScope()
      const ctx = scope.createContext()

      const parseOrder: string[] = []

      const myFlow = flow({
        parse: (raw: unknown): string => {
          parseOrder.push("parse")
          if (typeof raw !== "string") throw new Error("Must be string")
          return raw.toUpperCase()
        },
        factory: (ctx) => {
          parseOrder.push("factory")
          return ctx.input as string
        },
      })

      const result = await ctx.exec({ flow: myFlow as unknown as Lite.Flow<string, unknown>, input: "hello" })

      expect(result).toBe("HELLO")
      expect(parseOrder).toEqual(["parse", "factory"])
      await ctx.close()
    })

    it("throws ParseError when flow parse fails", async () => {
      const scope = createScope()
      const ctx = scope.createContext()
      const { ParseError } = await import("../src/errors")

      const myFlow = flow({
        name: "stringFlow",
        parse: (raw: unknown): string => {
          if (typeof raw !== "string") throw new Error("Must be string")
          return raw
        },
        factory: (ctx) => ctx.input as string,
      })

      try {
        await ctx.exec({ flow: myFlow as unknown as Lite.Flow<string, unknown>, input: 123 })
        expect.fail("Should have thrown")
      } catch (err) {
        expect(err).toBeInstanceOf(ParseError)
        const parseErr = err as InstanceType<typeof ParseError>
        expect(parseErr.phase).toBe("flow-input")
        expect(parseErr.label).toBe("stringFlow")
      }

      await ctx.close()
    })

    it("uses exec name over flow name in ParseError", async () => {
      const scope = createScope()
      const ctx = scope.createContext()
      const { ParseError } = await import("../src/errors")

      const myFlow = flow({
        name: "flowName",
        parse: (raw: unknown): string => {
          if (typeof raw !== "string") throw new Error("Must be string")
          return raw
        },
        factory: (ctx) => ctx.input as string,
      })

      try {
        await ctx.exec({ flow: myFlow as unknown as Lite.Flow<string, unknown>, input: 123, name: "execName" })
        expect.fail("Should have thrown")
      } catch (err) {
        expect(err).toBeInstanceOf(ParseError)
        const parseErr = err as InstanceType<typeof ParseError>
        expect(parseErr.label).toBe("execName")
      }

      await ctx.close()
    })

    it("uses 'anonymous' when no name provided", async () => {
      const scope = createScope()
      const ctx = scope.createContext()
      const { ParseError } = await import("../src/errors")

      const myFlow = flow({
        parse: (raw: unknown): string => {
          if (typeof raw !== "string") throw new Error("Must be string")
          return raw
        },
        factory: (ctx) => ctx.input as string,
      })

      try {
        await ctx.exec({ flow: myFlow as unknown as Lite.Flow<string, unknown>, input: 123 })
        expect.fail("Should have thrown")
      } catch (err) {
        expect(err).toBeInstanceOf(ParseError)
        const parseErr = err as InstanceType<typeof ParseError>
        expect(parseErr.label).toBe("anonymous")
      }

      await ctx.close()
    })

    it("supports async parse", async () => {
      const scope = createScope()
      const ctx = scope.createContext()

      const myFlow = flow({
        parse: async (raw: unknown): Promise<string> => {
          await new Promise((r) => setTimeout(r, 1))
          if (typeof raw !== "string") throw new Error("Must be string")
          return raw.toUpperCase()
        },
        factory: (ctx) => ctx.input as string,
      })

      const result = await ctx.exec({ flow: myFlow as unknown as Lite.Flow<string, unknown>, input: "hello" })
      expect(result).toBe("HELLO")
      await ctx.close()
    })

    it("accepts rawInput and passes to parse", async () => {
      const scope = createScope();
      const ctx = scope.createContext();
      const parseOrder: string[] = [];

      const myFlow = flow({
        name: "parseFlow",
        parse: (raw: unknown): { name: string } => {
          parseOrder.push("parse");
          const obj = raw as Record<string, unknown>;
          if (typeof obj["name"] !== "string") throw new Error("name required");
          return { name: obj["name"] };
        },
        factory: (ctx) => {
          parseOrder.push("factory");
          return ctx.input.name.toUpperCase();
        },
      });

      const body: unknown = { name: "alice" };
      const result = await ctx.exec({
        flow: myFlow as unknown as Lite.Flow<string, unknown>,
        rawInput: body,
      });

      expect(result).toBe("ALICE");
      expect(parseOrder).toEqual(["parse", "factory"]);
      await ctx.close();
    });

    it("rawInput works without parse (passes through as-is)", async () => {
      const scope = createScope();
      const ctx = scope.createContext();

      const myFlow = flow({
        factory: (ctx) => ctx.input,
      });

      const body: unknown = { data: 123 };
      const result = await ctx.exec({
        flow: myFlow as unknown as Lite.Flow<unknown, unknown>,
        rawInput: body,
      });

      expect(result).toEqual({ data: 123 });
      await ctx.close();
    });

    it("throws ParseError when rawInput fails parse", async () => {
      const scope = createScope();
      const ctx = scope.createContext();
      const { ParseError } = await import("../src/errors");

      const myFlow = flow({
        name: "strictFlow",
        parse: (raw: unknown): string => {
          if (typeof raw !== "string") throw new Error("Must be string");
          return raw;
        },
        factory: (ctx) => ctx.input,
      });

      try {
        await ctx.exec({
          flow: myFlow as unknown as Lite.Flow<string, unknown>,
          rawInput: 123,
        });
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(ParseError);
        const parseErr = err as InstanceType<typeof ParseError>;
        expect(parseErr.phase).toBe("flow-input");
        expect(parseErr.label).toBe("strictFlow");
      }

      await ctx.close();
    });
  })

  describe("ctx.data (ContextData with Tag support)", () => {
    it("stores and retrieves typed values using tags", async () => {
      const scope = createScope()
      const valueTag = tag<string>({ label: "value" })

      const myAtom = atom({
        factory: (ctx) => {
          ctx.data.setTag(valueTag, "hello")
          return ctx.data.getTag(valueTag)
        },
      })

      const result = await scope.resolve(myAtom)

      expect(result).toBe("hello")
    })

    it("returns undefined for missing keys (ignores tag defaults)", async () => {
      const scope = createScope()
      const missingTag = tag<string>({ label: "missing" })
      const tagWithDefault = tag<number>({ label: "count", default: 0 })

      const myAtom = atom({
        factory: (ctx) => ({
          missing: ctx.data.getTag(missingTag),
          withDefault: ctx.data.getTag(tagWithDefault),
        }),
      })

      const result = await scope.resolve(myAtom)

      expect(result.missing).toBeUndefined()
      expect(result.withDefault).toBeUndefined()
    })

    it("returns stored value over default when set", async () => {
      const scope = createScope()
      const countTag = tag<number>({ label: "count", default: 0 })

      const myAtom = atom({
        factory: (ctx) => {
          ctx.data.setTag(countTag, 42)
          return ctx.data.getTag(countTag)
        },
      })

      const result = await scope.resolve(myAtom)

      expect(result).toBe(42)
    })

    it("persists data across invalidations", async () => {
      const scope = createScope()
      const countTag = tag<number>({ label: "count", default: 0 })
      let resolveCount = 0

      const myAtom = atom({
        factory: (ctx) => {
          resolveCount++
          const prev = ctx.data.getOrSetTag(countTag)
          ctx.data.setTag(countTag, prev + 1)
          return ctx.data.getTag(countTag)
        },
      })

      const first = await scope.resolve(myAtom)
      expect(first).toBe(1)

      const ctrl = scope.controller(myAtom)
      ctrl.invalidate()
      await Promise.resolve()
      await Promise.resolve()
      await ctrl.resolve()

      const second = ctrl.get()
      expect(second).toBe(2)
      expect(resolveCount).toBe(2)
    })

    it("clears data when atom is released", async () => {
      const scope = createScope()
      const countTag = tag<number>({ label: "count", default: 0 })

      const myAtom = atom({
        factory: (ctx) => {
          const prev = ctx.data.getOrSetTag(countTag)
          ctx.data.setTag(countTag, prev + 1)
          return ctx.data.getTag(countTag)
        },
      })

      const first = await scope.resolve(myAtom)
      expect(first).toBe(1)

      await scope.release(myAtom)

      const second = await scope.resolve(myAtom)
      expect(second).toBe(1)
    })

    it("creates ContextData lazily on first access", async () => {
      const scope = createScope()
      const keyTag = tag<string>({ label: "key" })
      let dataAccessed = false

      const noDataAtom = atom({
        factory: () => {
          return "no data access"
        },
      })

      const withDataAtom = atom({
        factory: (ctx) => {
          dataAccessed = true
          ctx.data.setTag(keyTag, "value")
          return "data accessed"
        },
      })

      await scope.resolve(noDataAtom)
      await scope.resolve(withDataAtom)

      expect(dataAccessed).toBe(true)
    })

    it("has independent data per atom even with same tag", async () => {
      const scope = createScope()
      const nameTag = tag<string>({ label: "name" })

      const atomA = atom({
        factory: (ctx) => {
          ctx.data.setTag(nameTag, "A")
          return ctx.data.getTag(nameTag)
        },
      })

      const atomB = atom({
        factory: (ctx) => {
          ctx.data.setTag(nameTag, "B")
          return ctx.data.getTag(nameTag)
        },
      })

      const resultA = await scope.resolve(atomA)
      const resultB = await scope.resolve(atomB)

      expect(resultA).toBe("A")
      expect(resultB).toBe("B")
    })

    it("supports hasTag() to check if key exists", async () => {
      const scope = createScope()
      const existsTag = tag<string>({ label: "exists" })
      const missingTag = tag<string>({ label: "missing" })

      const myAtom = atom({
        factory: (ctx) => {
          ctx.data.setTag(existsTag, "value")
          return {
            hasExists: ctx.data.hasTag(existsTag),
            hasMissing: ctx.data.hasTag(missingTag),
          }
        },
      })

      const result = await scope.resolve(myAtom)

      expect(result.hasExists).toBe(true)
      expect(result.hasMissing).toBe(false)
    })

    it("supports deleteTag() to remove key", async () => {
      const scope = createScope()
      const valueTag = tag<string>({ label: "value" })

      const myAtom = atom({
        factory: (ctx) => {
          ctx.data.setTag(valueTag, "hello")
          const before = ctx.data.getTag(valueTag)
          const deleted = ctx.data.deleteTag(valueTag)
          const after = ctx.data.getTag(valueTag)
          return { before, deleted, after }
        },
      })

      const result = await scope.resolve(myAtom)

      expect(result.before).toBe("hello")
      expect(result.deleted).toBe(true)
      expect(result.after).toBeUndefined()
    })

    it("deleteTag() returns undefined after deletion (Map-like semantics)", async () => {
      const scope = createScope()
      const countTag = tag<number>({ label: "count", default: 0 })

      const myAtom = atom({
        factory: (ctx) => {
          ctx.data.setTag(countTag, 5)
          const before = ctx.data.getTag(countTag)
          ctx.data.deleteTag(countTag)
          const after = ctx.data.getTag(countTag)
          return { before, after }
        },
      })

      const result = await scope.resolve(myAtom)

      expect(result.before).toBe(5)
      expect(result.after).toBe(undefined)
    })

    it("supports clear() to remove all keys", async () => {
      const scope = createScope()
      const aTag = tag<string>({ label: "a" })
      const bTag = tag<number>({ label: "b" })

      const myAtom = atom({
        factory: (ctx) => {
          ctx.data.setTag(aTag, "hello")
          ctx.data.setTag(bTag, 42)
          ctx.data.clear()
          return {
            a: ctx.data.getTag(aTag),
            b: ctx.data.getTag(bTag),
          }
        },
      })

      const result = await scope.resolve(myAtom)

      expect(result.a).toBeUndefined()
      expect(result.b).toBeUndefined()
    })

    it("works with complex types", async () => {
      const scope = createScope()
      const cacheTag = tag<Map<string, number>>({ label: "cache" })

      const myAtom = atom({
        factory: (ctx) => {
          let cache = ctx.data.getTag(cacheTag)
          if (!cache) {
            cache = new Map()
            ctx.data.setTag(cacheTag, cache)
          }
          cache.set("key", 123)
          return cache
        },
      })

      const result = await scope.resolve(myAtom)

      expect(result).toBeInstanceOf(Map)
      expect(result.get("key")).toBe(123)
    })

    it("getOrSetTag returns existing value when present", async () => {
      const scope = createScope()
      const valueTag = tag<string>({ label: "value" })

      const myAtom = atom({
        factory: (ctx) => {
          ctx.data.setTag(valueTag, "existing")
          return ctx.data.getOrSetTag(valueTag, "default")
        },
      })

      const result = await scope.resolve(myAtom)

      expect(result).toBe("existing")
    })

    it("getOrSetTag stores and returns default when missing (tag without default)", async () => {
      const scope = createScope()
      const valueTag = tag<string>({ label: "value" })

      const myAtom = atom({
        factory: (ctx) => {
          const value = ctx.data.getOrSetTag(valueTag, "default")
          const hasIt = ctx.data.hasTag(valueTag)
          return { value, hasIt }
        },
      })

      const result = await scope.resolve(myAtom)

      expect(result.value).toBe("default")
      expect(result.hasIt).toBe(true)
    })

    it("getOrSetTag uses tag default when available (no second arg needed)", async () => {
      const scope = createScope()
      const countTag = tag<number>({ label: "count", default: 42 })

      const myAtom = atom({
        factory: (ctx) => {
          const value = ctx.data.getOrSetTag(countTag)
          const hasIt = ctx.data.hasTag(countTag)
          return { value, hasIt }
        },
      })

      const result = await scope.resolve(myAtom)

      expect(result.value).toBe(42)
      expect(result.hasIt).toBe(true)
    })

    it("getOrSetTag materializes value so hasTag() returns true", async () => {
      const scope = createScope()
      const countTag = tag<number>({ label: "count", default: 0 })

      const myAtom = atom({
        factory: (ctx) => {
          const beforeHas = ctx.data.hasTag(countTag)
          ctx.data.getOrSetTag(countTag)
          const afterHas = ctx.data.hasTag(countTag)
          return { beforeHas, afterHas }
        },
      })

      const result = await scope.resolve(myAtom)

      expect(result.beforeHas).toBe(false)
      expect(result.afterHas).toBe(true)
    })

    it("deleteTag then getOrSetTag re-initializes value", async () => {
      const scope = createScope()
      const countTag = tag<number>({ label: "count", default: 0 })

      const myAtom = atom({
        factory: (ctx) => {
          ctx.data.setTag(countTag, 99)
          const before = ctx.data.getTag(countTag)
          ctx.data.deleteTag(countTag)
          const afterDelete = ctx.data.getOrSetTag(countTag)
          return { before, afterDelete }
        },
      })

      const result = await scope.resolve(myAtom)

      expect(result.before).toBe(99)
      expect(result.afterDelete).toBe(0)
    })

    it("getOrSetTag with complex types replaces boilerplate pattern", async () => {
      const scope = createScope()
      const cacheTag = tag<Map<string, number>>({ label: "cache" })

      const myAtom = atom({
        factory: (ctx) => {
          const cache = ctx.data.getOrSetTag(cacheTag, new Map())
          cache.set("key", 456)
          return cache
        },
      })

      const result = await scope.resolve(myAtom)

      expect(result).toBeInstanceOf(Map)
      expect(result.get("key")).toBe(456)
    })
  })
})
