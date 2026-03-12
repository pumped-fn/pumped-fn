import { describe, it, expect } from "vitest"
import { createScope } from "../src/scope"
import { atom, controller } from "../src/atom"
import { service } from "../src/service"
import { preset } from "../src/preset"
import { tag, tags } from "../src/tag"
import { flow, typed } from "../src/flow"
import { resource } from "../src/resource"
import type { Lite } from "../src/types"

describe("Scope", () => {
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

    it("controller.get() throws on idle and failed states", async () => {
      const scope = createScope()

      // Throws "not resolved" when idle
      const idleAtom = atom({ factory: () => 42 })
      const idleCtrl = scope.controller(idleAtom)
      expect(() => idleCtrl.get()).toThrow("not resolved")

      // Throws the factory error when failed
      const failingAtom = atom({
        factory: () => {
          throw new Error("factory failed")
        }
      })
      const failedCtrl = scope.controller(failingAtom)
      await expect(failedCtrl.resolve()).rejects.toThrow("factory failed")
      expect(failedCtrl.state).toBe('failed')
      expect(() => failedCtrl.get()).toThrow("factory failed")
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

    it("{ resolve: true } returns promise, is same instance, and works with async factory", async () => {
      const scope = createScope()

      // Returns a promise
      const syncAtom = atom({ factory: () => 42 })
      const result = scope.controller(syncAtom, { resolve: true })
      expect(result).toBeInstanceOf(Promise)
      const ctrl = await result
      expect(ctrl.state).toBe('resolved')
      expect(ctrl.get()).toBe(42)

      // Same instance as regular controller
      const ctrl1 = scope.controller(syncAtom)
      expect(ctrl1).toBe(ctrl)
      expect(ctrl1.get()).toBe(42)

      // Works with async factory
      const asyncAtom = atom({
        factory: async () => {
          await new Promise(r => setTimeout(r, 10))
          return "async-value"
        }
      })
      const asyncCtrl = await scope.controller(asyncAtom, { resolve: true })
      expect(asyncCtrl.state).toBe('resolved')
      expect(asyncCtrl.get()).toBe("async-value")
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
    it("runs cleanups on release in LIFO order", async () => {
      const scope = createScope()
      let cleaned = false
      const singleCleanupAtom = atom({
        factory: (ctx) => {
          ctx.cleanup(() => {
            cleaned = true
          })
          return 42
        },
      })

      await scope.resolve(singleCleanupAtom)
      expect(cleaned).toBe(false)

      await scope.release(singleCleanupAtom)
      expect(cleaned).toBe(true)

      const order: number[] = []
      const multiCleanupAtom = atom({
        factory: (ctx) => {
          ctx.cleanup(() => { order.push(1) })
          ctx.cleanup(() => { order.push(2) })
          ctx.cleanup(() => { order.push(3) })
          return 42
        },
      })

      await scope.resolve(multiCleanupAtom)
      await scope.release(multiCleanupAtom)

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



describe('Automatic GC - Scheduling', () => {
  const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

  it('schedules GC on last unsub, cancels on resub, and skips when other subscribers remain', async () => {
    // Part 1: schedules GC when last subscriber unsubscribes
    const scope1 = createScope({ gc: { graceMs: 100 } })
    const atom1 = atom({ factory: () => 'value' })
    const ctrl1 = scope1.controller(atom1)
    await ctrl1.resolve()
    expect(ctrl1.state).toBe('resolved')
    const unsub1 = ctrl1.on('resolved', () => {})
    unsub1()
    expect(ctrl1.state).toBe('resolved')
    await delay(150)
    expect(ctrl1.state).toBe('idle')

    // Part 2: cancels scheduled GC when resubscribed during grace period
    const scope2 = createScope({ gc: { graceMs: 100 } })
    const atom2 = atom({ factory: () => 'value' })
    const ctrl2 = scope2.controller(atom2)
    await ctrl2.resolve()
    const unsub2a = ctrl2.on('resolved', () => {})
    unsub2a()
    await delay(50)
    const unsub2b = ctrl2.on('resolved', () => {})
    await delay(100)
    expect(ctrl2.state).toBe('resolved')
    unsub2b()

    // Part 3: does not schedule GC when still has other subscribers
    const scope3 = createScope({ gc: { graceMs: 100 } })
    const atom3 = atom({ factory: () => 'value' })
    const ctrl3 = scope3.controller(atom3)
    await ctrl3.resolve()
    const unsub3a = ctrl3.on('resolved', () => {})
    const unsub3b = ctrl3.on('resolved', () => {})
    unsub3a()
    await delay(150)
    expect(ctrl3.state).toBe('resolved')
    unsub3b()
  })
})

describe('Automatic GC - keepAlive', () => {
  const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

  it('respects keepAlive: true (no GC) and keepAlive: false (GC)', async () => {
    const scope = createScope({ gc: { graceMs: 100 } })

    // keepAlive: true — not GC'd
    const persistentAtom = atom({ factory: () => 'persistent', keepAlive: true })
    const persistCtrl = scope.controller(persistentAtom)
    await persistCtrl.resolve()
    const unsub1 = persistCtrl.on('resolved', () => {})
    unsub1()
    await delay(150)
    expect(persistCtrl.state).toBe('resolved')

    // keepAlive: false — GC'd
    const tempAtom = atom({ factory: () => 'temporary', keepAlive: false })
    const tempCtrl = scope.controller(tempAtom)
    await tempCtrl.resolve()
    const unsub2 = tempCtrl.on('resolved', () => {})
    unsub2()
    await delay(150)
    expect(tempCtrl.state).toBe('idle')
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

  it('manual release and dispose both override GC', async () => {
    // Manual release still works
    const scope1 = createScope({ gc: { graceMs: 100 } })
    const atom1 = atom({ factory: () => 'value' })
    const ctrl1 = scope1.controller(atom1)
    await ctrl1.resolve()
    await scope1.release(atom1)
    expect(ctrl1.state).toBe('idle')

    // Dispose releases all atoms ignoring GC grace period
    const scope2 = createScope({ gc: { graceMs: 5000 } })
    const atom2 = atom({ factory: () => 'value' })
    const ctrl2 = scope2.controller(atom2)
    await ctrl2.resolve()
    await scope2.dispose()
    expect(ctrl2.state).toBe('idle')
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

})

describe("ExecutionContext", () => {

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

    it("exec tags override context tags and flow tags", async () => {
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

      // flow-level tags also do not override exec-level tags
      const priorityTag = tag<string>({ label: "priority" })
      const flowWithTags = flow({
        tags: [priorityTag("flow-level")],
        factory: (ctx) => ctx.data.seekTag(priorityTag),
      })

      const result2 = await ctx.exec({
        flow: flowWithTags,
        tags: [priorityTag("exec-level")],
      })
      expect(result2).toBe("exec-level")

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

    it("does not emit unhandledRejection when background refresh fails", async () => {
      const scope = createScope()
      let shouldFail = false
      const myAtom = atom({
        factory: async () => {
          if (shouldFail) {
            throw new Error("refresh failed")
          }
          return "value"
        }
      })

      await scope.resolve(myAtom)

      const ctrl = scope.controller(myAtom)
      const unhandled: unknown[] = []
      const onUnhandled = (reason: unknown) => {
        unhandled.push(reason)
      }

      process.on("unhandledRejection", onUnhandled)

      try {
        shouldFail = true
        ctrl.invalidate()

        await new Promise(r => setTimeout(r, 10))

        expect(ctrl.state).toBe("failed")
        expect(unhandled).toHaveLength(0)
      } finally {
        process.removeListener("unhandledRejection", onUnhandled)
      }
    })

    it("does not rethrow a stale background invalidate error after a later successful refresh", async () => {
      const scope = createScope()
      let shouldFail = false
      let value = 0
      const myAtom = atom({
        factory: async () => {
          if (shouldFail) {
            throw new Error("refresh failed")
          }
          value++
          return `value-${value}`
        }
      })

      await scope.resolve(myAtom)

      const ctrl = scope.controller(myAtom)

      shouldFail = true
      ctrl.invalidate()
      await new Promise(r => setTimeout(r, 10))

      expect(ctrl.state).toBe("failed")

      shouldFail = false
      ctrl.invalidate()

      await expect(scope.flush()).resolves.toBeUndefined()
      expect(ctrl.state).toBe("resolved")
      expect(ctrl.get()).toBe("value-2")
    })
  })

  describe("controller.set()", () => {
    it("replaces value, notifies listeners, and does not run factory", async () => {
      const scope = createScope()
      let factoryCount = 0
      const myAtom = atom({
        factory: () => {
          factoryCount++
          return { name: "Guest" }
        },
      })
      const ctrl = scope.controller(myAtom)

      await ctrl.resolve()
      expect(factoryCount).toBe(1)

      const notifications: string[] = []
      ctrl.on("resolved", () => notifications.push("resolved"))

      ctrl.set({ name: "Alice" })
      await scope.flush()

      expect(ctrl.get()).toEqual({ name: "Alice" })
      expect(notifications).toEqual(["resolved"])
      expect(factoryCount).toBe(1)
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

  })

  describe("controller.update()", () => {
    it("transforms, chains, and notifies", async () => {
      const scope = createScope()
      const myAtom = atom({ factory: () => 0 })
      const ctrl = scope.controller(myAtom)

      await ctrl.resolve()

      const notifications: string[] = []
      ctrl.on("resolved", () => notifications.push("resolved"))

      ctrl.update((n) => n + 1)
      await scope.flush()

      expect(ctrl.get()).toBe(1)
      expect(notifications).toEqual(["resolved"])

      ctrl.update((n) => n * 2)
      await scope.flush()

      expect(ctrl.get()).toBe(2)
      expect(notifications).toEqual(["resolved", "resolved"])
    })
  })

  describe("controller.on()", () => {
    it("notifies on state change, invalidation, and exactly twice per invalidation cycle", async () => {
      const scope = createScope()

      // Part 1: notifies on state change during initial resolve
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

      // Part 2: notifies on invalidation (resolving -> resolved)
      const invalidationStates: string[] = []
      ctrl.on('*', () => invalidationStates.push(ctrl.state))

      ctrl.invalidate()

      await Promise.resolve()
      await Promise.resolve()
      expect(invalidationStates).toContain('resolving')

      await scope.flush()
      expect(invalidationStates).toContain('resolved')

      // Part 3: notifies exactly twice per invalidation cycle (resolving + resolved)
      const cycleCalls: string[] = []
      const cycleAtom = atom({ factory: () => 'value' })
      const cycleCtl = scope.controller(cycleAtom)
      await cycleCtl.resolve()

      cycleCtl.on('resolving', () => cycleCalls.push('resolving'))
      cycleCtl.on('resolved', () => cycleCalls.push('resolved'))

      cycleCtl.invalidate()
      await scope.flush()

      expect(cycleCalls).toEqual(['resolving', 'resolved'])
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

    it("throws ParseError with correct label: flow name, exec name override, and anonymous fallback", async () => {
      const scope = createScope()
      const ctx = scope.createContext()
      const { ParseError } = await import("../src/errors")

      const makeBadParse = (name?: string) => flow({
        ...(name ? { name } : {}),
        parse: (raw: unknown): string => {
          if (typeof raw !== "string") throw new Error("Must be string")
          return raw
        },
        factory: (ctx) => ctx.input as string,
      })

      // Uses flow name
      try {
        await ctx.exec({ flow: makeBadParse("stringFlow") as unknown as Lite.Flow<string, unknown>, input: 123 })
        expect.fail("Should have thrown")
      } catch (err) {
        expect(err).toBeInstanceOf(ParseError)
        const parseErr = err as InstanceType<typeof ParseError>
        expect(parseErr.phase).toBe("flow-input")
        expect(parseErr.label).toBe("stringFlow")
      }

      // Exec name overrides flow name
      try {
        await ctx.exec({ flow: makeBadParse("flowName") as unknown as Lite.Flow<string, unknown>, input: 123, name: "execName" })
        expect.fail("Should have thrown")
      } catch (err) {
        expect(err).toBeInstanceOf(ParseError)
        const parseErr = err as InstanceType<typeof ParseError>
        expect(parseErr.label).toBe("execName")
      }

      // Falls back to 'anonymous' when no name provided
      try {
        await ctx.exec({ flow: makeBadParse() as unknown as Lite.Flow<string, unknown>, input: 123 })
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
    it("exercises full tag-based Map API", async () => {
      const scope = createScope()

      // stores and retrieves typed values using tags
      const valueTag = tag<string>({ label: "value" })
      const storeAtom = atom({
        factory: (ctx) => {
          ctx.data.setTag(valueTag, "hello")
          return ctx.data.getTag(valueTag)
        },
      })
      expect(await scope.resolve(storeAtom)).toBe("hello")
      await scope.release(storeAtom)

      // returns undefined for missing keys (ignores tag defaults)
      const missingTag = tag<string>({ label: "missing" })
      const tagWithDefault = tag<number>({ label: "count", default: 0 })
      const missingAtom = atom({
        factory: (ctx) => ({
          missing: ctx.data.getTag(missingTag),
          withDefault: ctx.data.getTag(tagWithDefault),
        }),
      })
      const missingResult = await scope.resolve(missingAtom)
      expect(missingResult.missing).toBeUndefined()
      expect(missingResult.withDefault).toBeUndefined()
      await scope.release(missingAtom)

      // returns stored value over default when set
      const countTag = tag<number>({ label: "count2", default: 0 })
      const overrideAtom = atom({
        factory: (ctx) => {
          ctx.data.setTag(countTag, 42)
          return ctx.data.getTag(countTag)
        },
      })
      expect(await scope.resolve(overrideAtom)).toBe(42)
      await scope.release(overrideAtom)

      // supports hasTag()
      const existsTag = tag<string>({ label: "exists" })
      const missingTag2 = tag<string>({ label: "missing2" })
      const hasAtom = atom({
        factory: (ctx) => {
          ctx.data.setTag(existsTag, "value")
          return {
            hasExists: ctx.data.hasTag(existsTag),
            hasMissing: ctx.data.hasTag(missingTag2),
          }
        },
      })
      const hasResult = await scope.resolve(hasAtom)
      expect(hasResult.hasExists).toBe(true)
      expect(hasResult.hasMissing).toBe(false)
      await scope.release(hasAtom)

      // supports deleteTag()
      const delTag = tag<string>({ label: "delValue" })
      const delAtom = atom({
        factory: (ctx) => {
          ctx.data.setTag(delTag, "hello")
          const before = ctx.data.getTag(delTag)
          const deleted = ctx.data.deleteTag(delTag)
          const after = ctx.data.getTag(delTag)
          return { before, deleted, after }
        },
      })
      const delResult = await scope.resolve(delAtom)
      expect(delResult.before).toBe("hello")
      expect(delResult.deleted).toBe(true)
      expect(delResult.after).toBeUndefined()
      await scope.release(delAtom)

      // supports clear()
      const aTag = tag<string>({ label: "a" })
      const bTag = tag<number>({ label: "b" })
      const clearAtom = atom({
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
      const clearResult = await scope.resolve(clearAtom)
      expect(clearResult.a).toBeUndefined()
      expect(clearResult.b).toBeUndefined()
      await scope.release(clearAtom)

      // works with complex types
      const cacheTag = tag<Map<string, number>>({ label: "cache" })
      const complexAtom = atom({
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
      const complexResult = await scope.resolve(complexAtom)
      expect(complexResult).toBeInstanceOf(Map)
      expect(complexResult.get("key")).toBe(123)
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

    it("getOrSetTag covers all branches", async () => {
      const scope = createScope()

      // returns existing value when present
      const valueTag = tag<string>({ label: "gosValue" })
      const existingAtom = atom({
        factory: (ctx) => {
          ctx.data.setTag(valueTag, "existing")
          return ctx.data.getOrSetTag(valueTag, "default")
        },
      })
      expect(await scope.resolve(existingAtom)).toBe("existing")
      await scope.release(existingAtom)

      // stores and returns default when missing (tag without default)
      const noDefaultTag = tag<string>({ label: "gosNoDefault" })
      const defaultAtom = atom({
        factory: (ctx) => {
          const value = ctx.data.getOrSetTag(noDefaultTag, "default")
          const hasIt = ctx.data.hasTag(noDefaultTag)
          return { value, hasIt }
        },
      })
      const defaultResult = await scope.resolve(defaultAtom)
      expect(defaultResult.value).toBe("default")
      expect(defaultResult.hasIt).toBe(true)
      await scope.release(defaultAtom)

      // uses tag default when available (no second arg needed)
      const tagDefaultTag = tag<number>({ label: "gosCount", default: 42 })
      const tagDefaultAtom = atom({
        factory: (ctx) => {
          const value = ctx.data.getOrSetTag(tagDefaultTag)
          const hasIt = ctx.data.hasTag(tagDefaultTag)
          return { value, hasIt }
        },
      })
      const tagDefaultResult = await scope.resolve(tagDefaultAtom)
      expect(tagDefaultResult.value).toBe(42)
      expect(tagDefaultResult.hasIt).toBe(true)
      await scope.release(tagDefaultAtom)

      // materializes value so hasTag() returns true
      const materializeTag = tag<number>({ label: "gosMaterialize", default: 0 })
      const materializeAtom = atom({
        factory: (ctx) => {
          const beforeHas = ctx.data.hasTag(materializeTag)
          ctx.data.getOrSetTag(materializeTag)
          const afterHas = ctx.data.hasTag(materializeTag)
          return { beforeHas, afterHas }
        },
      })
      const materializeResult = await scope.resolve(materializeAtom)
      expect(materializeResult.beforeHas).toBe(false)
      expect(materializeResult.afterHas).toBe(true)
      await scope.release(materializeAtom)

      // deleteTag then getOrSetTag re-initializes value
      const reinitTag = tag<number>({ label: "gosReinit", default: 0 })
      const reinitAtom = atom({
        factory: (ctx) => {
          ctx.data.setTag(reinitTag, 99)
          const before = ctx.data.getTag(reinitTag)
          ctx.data.deleteTag(reinitTag)
          const afterDelete = ctx.data.getOrSetTag(reinitTag)
          return { before, afterDelete }
        },
      })
      const reinitResult = await scope.resolve(reinitAtom)
      expect(reinitResult.before).toBe(99)
      expect(reinitResult.afterDelete).toBe(0)
      await scope.release(reinitAtom)

      // complex types replaces boilerplate pattern
      const cacheTag = tag<Map<string, number>>({ label: "gosCache" })
      const complexAtom = atom({
        factory: (ctx) => {
          const cache = ctx.data.getOrSetTag(cacheTag, new Map())
          cache.set("key", 456)
          return cache
        },
      })
      const complexResult = await scope.resolve(complexAtom)
      expect(complexResult).toBeInstanceOf(Map)
      expect(complexResult.get("key")).toBe(456)
    })
  })
})

describe("Coverage gaps", () => {
  describe("controller.release()", () => {
    it("releases the atom", async () => {
      const scope = createScope()
      let factoryCount = 0
      const myAtom = atom({ factory: () => ++factoryCount })
      const ctrl = await scope.controller(myAtom, { resolve: true })
      expect(ctrl.get()).toBe(1)
      await ctrl.release()
      const val = await scope.resolve(myAtom)
      expect(val).toBe(2)
    })
  })

  describe("set/update guards on idle and failed atoms", () => {
    it("throws on set/update for failed atoms and update for unresolved atoms", async () => {
      const scope = createScope()
      const err = new Error("boom")
      const failingAtom = atom({ factory: (): string => { throw err } })
      try { await scope.resolve(failingAtom) } catch {}
      const failedCtrl = scope.controller(failingAtom)
      expect(() => failedCtrl.set("new")).toThrow(err)
      expect(() => failedCtrl.update(() => "new")).toThrow(err)

      const idleAtom = atom({ factory: () => 42 })
      const idleCtrl = scope.controller(idleAtom)
      expect(() => idleCtrl.update((v) => v + 1)).toThrow("Atom not resolved")
    })
  })

  describe("controller.update() queuing", () => {
    it("queues when atom is resolving", async () => {
      const scope = createScope()
      let resolve!: (v: number) => void
      const myAtom = atom({
        factory: () => new Promise<number>(r => { resolve = r }),
      })

      const resolvePromise = scope.resolve(myAtom)
      await Promise.resolve()
      const ctrl = scope.controller(myAtom)
      ctrl.update((prev) => (prev ?? 0) + 10)
      resolve(5)
      await resolvePromise
      await scope.flush()
      expect(ctrl.get()).toBe(15)
    })
  })

  describe("exec fn error path", () => {
    it("propagates errors and closes context", async () => {
      const scope = createScope()
      const ctx = scope.createContext()
      const err = new Error("fn-error")
      await expect(
        ctx.exec({ fn: () => { throw err }, params: [] })
      ).rejects.toThrow("fn-error")
    })
  })

  describe("pending invalidate after factory error", () => {
    it("preserves pending invalidate flag on failed re-resolution", async () => {
      const scope = createScope()
      let callCount = 0
      const myAtom = atom({
        factory: (ctx: any) => {
          callCount++
          if (callCount === 2) {
            ctx.invalidate()
            throw new Error("fail-then-retry")
          }
          return callCount
        },
      })

      await scope.resolve(myAtom)
      expect(callCount).toBe(1)

      const ctrl = scope.controller(myAtom)
      ctrl.invalidate()
      try { await scope.flush() } catch {}

      expect(callCount).toBe(2)
      expect(ctrl.state).toBe("failed")
    })
  })

  describe("required tag dep with default", () => {
    it("resolves required tag dep using default value", async () => {
      const scope = createScope()
      const myTag = tag<number>({ label: "defaultReq", default: 99 })
      const myAtom = atom({
        deps: { val: tags.required(myTag) },
        factory: (ctx: any, { val }: { val: number }) => val,
      })
      const result = await scope.resolve(myAtom)
      expect(result).toBe(99)
    })
  })

  describe("controller.get() during resolving", () => {
    it("throws on resolving atom without stale value", async () => {
      const scope = createScope()
      let resolveFactory!: () => void
      const myAtom = atom({
        factory: () => new Promise<string>(r => { resolveFactory = () => r("done") }),
      })
      const promise = scope.resolve(myAtom)
      await Promise.resolve()
      const ctrl = scope.controller(myAtom)
      expect(() => ctrl.get()).toThrow("Atom not resolved")
      resolveFactory()
      await promise
    })
  })

  describe("ContextData.delete()", () => {
    it("raw delete removes key", async () => {
      const scope = createScope()
      const myAtom = atom({
        factory: (ctx) => {
          ctx.data.set("k", "v")
          ctx.data.delete("k")
          return ctx.data.has("k")
        },
      })
      expect(await scope.resolve(myAtom)).toBe(false)
    })
  })

  describe("release non-existent atom", () => {
    it("does not throw and scope remains functional", async () => {
      const scope = createScope()
      const myAtom = atom({ factory: () => 42 })
      await scope.release(myAtom)
      expect(await scope.resolve(myAtom)).toBe(42)
    })
  })

  describe("invalidate on idle entry", () => {
    it("does not affect idle atom state", async () => {
      const scope = createScope()
      const myAtom = atom({ factory: () => 42 })
      const ctrl = scope.controller(myAtom)
      ctrl.on("resolved", () => {})
      ctrl.invalidate()
      expect(ctrl.state).toBe("idle")
    })
  })

  describe("flow tags applied", () => {
    it("applies flow tags to child context when no exec tags conflict", async () => {
      const scope = createScope()
      const myTag = tag<string>({ label: "flowApply" })
      const myFlow = flow({
        tags: [myTag("from-flow")],
        factory: (ctx) => ctx.data.getTag(myTag),
      })
      const ctx = scope.createContext()
      const result = await ctx.exec({ flow: myFlow })
      expect(result).toBe("from-flow")
      await ctx.close()
    })
  })

  describe("tag deps via flow context", () => {
    it("required and optional tag deps in flow use defaults when not in ctx", async () => {
      const scope = createScope()

      const reqTag = tag<number>({ label: "ctxReqDef", default: 42 })
      const reqFlow = flow({
        deps: { val: tags.required(reqTag) },
        factory: (_ctx, { val }) => val,
      })
      const ctx1 = scope.createContext()
      const reqResult = await ctx1.exec({ flow: reqFlow })
      expect(reqResult).toBe(42)
      await ctx1.close()

      const optTag = tag<number>({ label: "ctxOptDef", default: 7 })
      const optFlow = flow({
        deps: { val: tags.optional(optTag) },
        factory: (_ctx, { val }) => val,
      })
      const ctx2 = scope.createContext()
      const optResult = await ctx2.exec({ flow: optFlow })
      expect(optResult).toBe(7)
      await ctx2.close()
    })
  })

  describe("resource cache in storeCtx", () => {
    it("second dep on same resource uses cache", async () => {
      let callCount = 0
      const r = resource({ factory: () => ++callCount })
      const myFlow = flow({
        deps: { a: r, b: r },
        factory: (_ctx, { a, b }) => [a, b],
      })
      const scope = createScope()
      const ctx = scope.createContext()
      const result = await ctx.exec({ flow: myFlow })
      expect(result).toEqual([1, 1])
      expect(callCount).toBe(1)
      await ctx.close()
    })
  })

  describe("doInvalidateSequential guards", () => {
    it("invalidation resolves safely when atom released before flush", async () => {
      const scope = createScope()
      let callCount = 0
      const myAtom = atom({ factory: () => ++callCount })
      const ctrl = await scope.controller(myAtom, { resolve: true })
      expect(callCount).toBe(1)
      ctrl.invalidate()
      await scope.release(myAtom)
      await scope.flush()
      expect(ctrl.state).toBe("idle")
    })
  })

  describe("non-Error throw", () => {
    it("wraps non-Error throw in Error", async () => {
      const scope = createScope()
      const myAtom = atom({ factory: () => { throw "string-error" } })
      await expect(scope.resolve(myAtom)).rejects.toThrow("string-error")
    })
  })

  describe("atom-level tags.all dep", () => {
    it("collects from scope tags", async () => {
      const myTag = tag<string>({ label: "atomAll" })
      const scope = createScope({ tags: [myTag("scope-val")] })
      const myAtom = atom({
        deps: { vals: tags.all(myTag) },
        factory: (_ctx, { vals }) => vals,
      })
      const result = await scope.resolve(myAtom)
      expect(result).toEqual(["scope-val"])
    })
  })

  describe("circular resource detection", () => {
    it("throws on circular resource deps", async () => {
      const sym = Symbol.for("@pumped-fn/lite/resource")
      const rA: any = { [sym]: true, factory: () => "a" }
      const rB: any = { [sym]: true, deps: { a: rA }, factory: () => "b" }
      rA.deps = { b: rB }

      const myFlow = flow({
        deps: { a: rA },
        factory: (_ctx, { a }) => a,
      })
      const scope = createScope()
      const ctx = scope.createContext()
      await expect(ctx.exec({ flow: myFlow })).rejects.toThrow("Circular resource dependency detected: anonymous")
      await ctx.close()
    })
  })
})

describe("controller dep with watch: true", () => {
  it("skips parent when dep resolves to same value", async () => {
    let sourceFactoryCount = 0
    let derivedFactoryCount = 0

    const sourceAtom = atom({
      factory: () => {
        sourceFactoryCount++
        return "hello"
      },
    })

    const derivedAtom = atom({
      deps: { source: controller(sourceAtom, { resolve: true, watch: true }) },
      factory: (_ctx: any, { source }: any) => {
        derivedFactoryCount++
        return `derived:${source.get()}`
      },
    })

    const scope = createScope()
    await scope.resolve(derivedAtom)
    expect(sourceFactoryCount).toBe(1)
    expect(derivedFactoryCount).toBe(1)

    scope.controller(sourceAtom).invalidate()
    await scope.flush()

    expect(sourceFactoryCount).toBe(2)
    expect(derivedFactoryCount).toBe(1)
    expect(scope.controller(derivedAtom).get()).toBe("derived:hello")

    await scope.dispose()
  })

  it("custom eq function — skips on same id and prevents false cascades on object literals", async () => {
    let factoryCount = 0

    const sourceAtom = atom({ factory: () => ({ id: 1, name: "alice" }) })

    const derivedAtom = atom({
      deps: {
        source: controller(sourceAtom, {
          resolve: true,
          watch: true,
          eq: (a: { id: number; name: string }, b: { id: number; name: string }) => a.id === b.id,
        }),
      },
      factory: (_ctx: any, { source }: any) => {
        factoryCount++
        return `user:${source.get().name}`
      },
    })

    const scope = createScope()
    await scope.resolve(derivedAtom)
    expect(factoryCount).toBe(1)

    scope.controller(sourceAtom).set({ id: 1, name: "bob" })
    await scope.flush()

    expect(factoryCount).toBe(1)

    scope.controller(sourceAtom).set({ id: 2, name: "carol" })
    await scope.flush()

    expect(factoryCount).toBe(2)
    expect(scope.controller(derivedAtom).get()).toBe("user:carol")

    await scope.dispose()

    // H1: custom eq prevents false cascades on object literals (new object each invalidation)
    let derivedCount2 = 0

    const objSourceAtom = atom({
      factory: () => ({ key: "value", num: 42 }),
    })

    const objDerivedAtom = atom({
      deps: {
        src: controller(objSourceAtom, {
          resolve: true,
          watch: true,
          eq: (a: { key: string; num: number }, b: { key: string; num: number }) =>
            a.key === b.key && a.num === b.num,
        }),
      },
      factory: (_ctx: any, { src }: any) => {
        derivedCount2++
        return `derived:${src.get().key}`
      },
    })

    const scope2 = createScope()
    await scope2.resolve(objDerivedAtom)
    expect(derivedCount2).toBe(1)

    scope2.controller(objSourceAtom).invalidate()
    await scope2.flush()

    expect(derivedCount2).toBe(1)

    await scope2.dispose()
  })

  it("cascade stops when intermediate value unchanged", async () => {
    let bCount = 0
    let cCount = 0

    const aAtom = atom({ factory: () => 1 })

    const bAtom = atom({
      deps: { a: controller(aAtom, { resolve: true, watch: true }) },
      factory: (_ctx: any, { a }: any) => {
        bCount++
        return a.get() > 5 ? "high" : "low"
      },
    })

    const cAtom = atom({
      deps: { b: controller(bAtom, { resolve: true, watch: true }) },
      factory: (_ctx: any, { b }: any) => {
        cCount++
        return `level:${b.get()}`
      },
    })

    const scope = createScope()
    await scope.resolve(cAtom)
    expect(bCount).toBe(1)
    expect(cCount).toBe(1)
    expect(scope.controller(cAtom).get()).toBe("level:low")

    scope.controller(aAtom).set(2)
    await scope.flush()

    expect(bCount).toBe(2)
    expect(cCount).toBe(1)

    scope.controller(aAtom).set(10)
    await scope.flush()

    expect(bCount).toBe(3)
    expect(cCount).toBe(2)
    expect(scope.controller(cAtom).get()).toBe("level:high")

    await scope.dispose()
  })

  it("watch dep auto-subscribes without manual ctx.cleanup wiring", async () => {
    // Sync derived: multiple rounds of set -> derived re-runs
    let factoryCount = 0

    const sourceAtom = atom({ factory: () => "initial" })

    const derivedAtom = atom({
      deps: { source: controller(sourceAtom, { resolve: true, watch: true }) },
      factory: (_ctx: any, { source }: any) => {
        factoryCount++
        return `echo:${source.get()}`
      },
    })

    const scope = createScope()
    await scope.resolve(derivedAtom)
    expect(factoryCount).toBe(1)

    scope.controller(sourceAtom).set("updated")
    await scope.flush()
    expect(factoryCount).toBe(2)
    expect(scope.controller(derivedAtom).get()).toBe("echo:updated")

    scope.controller(sourceAtom).set("again")
    await scope.flush()
    expect(factoryCount).toBe(3)
    expect(scope.controller(derivedAtom).get()).toBe("echo:again")

    // Watch survives set() and subsequent changes (Fix 1: additional rounds)
    scope.controller(sourceAtom).set("after-set-3")
    await scope.flush()
    expect(factoryCount).toBe(4)
    expect(scope.controller(derivedAtom).get()).toBe("echo:after-set-3")

    await scope.dispose()

    // Async derived: sequential source changes — derived re-resolves for each (M4)
    let asyncFactoryCount = 0
    const asyncSourceAtom = atom({ factory: () => "initial" })
    const asyncDerivedAtom = atom({
      deps: { src: controller(asyncSourceAtom, { resolve: true, watch: true }) },
      factory: async (_ctx: any, { src }: any) => {
        asyncFactoryCount++
        const val = src.get()
        await new Promise<void>((r) => setTimeout(r, 5))
        return `derived:${val}`
      },
    })

    const scope2 = createScope()
    await scope2.resolve(asyncDerivedAtom)
    expect(asyncFactoryCount).toBe(1)
    expect(scope2.controller(asyncDerivedAtom).get()).toBe("derived:initial")

    scope2.controller(asyncSourceAtom).set("v2")
    await scope2.flush()
    expect(asyncFactoryCount).toBe(2)
    expect(scope2.controller(asyncDerivedAtom).get()).toBe("derived:v2")

    scope2.controller(asyncSourceAtom).set("v3")
    await scope2.flush()
    expect(asyncFactoryCount).toBe(3)
    expect(scope2.controller(asyncDerivedAtom).get()).toBe("derived:v3")

    await scope2.dispose()
  })

  it("throws when watch: true without resolve: true", async () => {
    const sourceAtom = atom({ factory: () => 1 })

    const derivedAtom = atom({
      deps: { source: controller(sourceAtom, { watch: true } as any) },
      factory: (_ctx: any, { source }: any) => source.get(),
    })

    const scope = createScope()
    await expect(scope.resolve(derivedAtom)).rejects.toThrow("requires resolve: true")
    await scope.dispose()
  })

  it("controller instance from watch dep is same as scope.controller()", async () => {
    let capturedCtrl: any

    const sourceAtom = atom({ factory: () => 42 })

    const derivedAtom = atom({
      deps: { source: controller(sourceAtom, { resolve: true, watch: true }) },
      factory: (_ctx: any, { source }: any) => {
        capturedCtrl = source
        return source.get()
      },
    })

    const scope = createScope()
    await scope.resolve(derivedAtom)

    expect(capturedCtrl).toBe(scope.controller(sourceAtom))

    await scope.dispose()
  })

  it("no invalidations after dispose", async () => {
    let factoryCount = 0

    const sourceAtom = atom({ factory: () => 1 })

    const derivedAtom = atom({
      deps: { source: controller(sourceAtom, { resolve: true, watch: true }) },
      factory: (_ctx: any, { source }: any) => {
        factoryCount++
        return source.get()
      },
    })

    const scope = createScope()
    await scope.resolve(derivedAtom)
    expect(factoryCount).toBe(1)

    scope.controller(sourceAtom).set(99)
    await scope.flush()
    expect(factoryCount).toBe(2)

    await scope.dispose()

    expect(factoryCount).toBe(2)
  })

  it("no listener accumulation across failed-resolve retries", async () => {
    let factoryCount = 0
    let shouldFail = true

    const sourceAtom = atom({ factory: () => 1 })

    const derivedAtom = atom({
      deps: { source: controller(sourceAtom, { resolve: true, watch: true }) },
      factory: (_ctx: any, { source }: any) => {
        factoryCount++
        if (shouldFail) throw new Error("intentional failure")
        return source.get()
      },
    })

    const scope = createScope()
    await expect(scope.resolve(derivedAtom)).rejects.toThrow("intentional failure")
    expect(factoryCount).toBe(1)

    shouldFail = false
    await scope.resolve(derivedAtom)
    expect(factoryCount).toBe(2)

    scope.controller(sourceAtom).set(2)
    await scope.flush()

    expect(factoryCount).toBe(3)

    await scope.dispose()
  })
})

describe("Triage regression tests", () => {
  it("Fix 2: two scopes resolving same resource concurrently — no false circular", async () => {
    let callCount = 0
    const sharedResource = resource({
      factory: async () => {
        callCount++
        await new Promise(r => setTimeout(r, 10))
        return "shared-value"
      },
    })

    const myFlow = flow({
      deps: { res: sharedResource },
      factory: (_ctx: any, { res }: any) => res,
    })

    const scope1 = createScope()
    const scope2 = createScope()
    const ctx1 = scope1.createContext()
    const ctx2 = scope2.createContext()

    const [r1, r2] = await Promise.all([
      ctx1.exec({ flow: myFlow }),
      ctx2.exec({ flow: myFlow }),
    ])

    expect(r1).toBe("shared-value")
    expect(r2).toBe("shared-value")
    expect(callCount).toBe(2)

    await ctx1.close()
    await ctx2.close()
    await scope1.dispose()
    await scope2.dispose()
  })

  it("Fix 3: listener that unsubscribes during notification — sibling fires", async () => {
    const scope = createScope()
    const myAtom = atom({ factory: () => 1 })
    await scope.resolve(myAtom)

    const ctrl = scope.controller(myAtom)
    const events: string[] = []

    let unsub1: (() => void) | undefined
    unsub1 = ctrl.on("resolved", () => {
      events.push("first")
      unsub1!()
    })

    ctrl.on("resolved", () => {
      events.push("second")
    })

    ctrl.set(2)
    await scope.flush()

    expect(events).toContain("first")
    expect(events).toContain("second")

    await scope.dispose()
  })

  it("Fix 4: release cleans stateListeners", async () => {
    const scope = createScope()
    const myAtom = atom({ factory: () => 42 })
    await scope.resolve(myAtom)

    const events: string[] = []
    const unsub = scope.on("resolved", myAtom, () => events.push("resolved"))

    ctrl_set_and_flush: {
      scope.controller(myAtom).set(99)
      await scope.flush()
      expect(events).toEqual(["resolved"])
    }

    await scope.release(myAtom)

    await scope.resolve(myAtom)
    expect(events).toEqual(["resolved"])

    unsub()
    await scope.dispose()
  })

  it("Fix 6: service with tags — tag.atoms() returns the service atom", () => {
    const myTag = tag<string>({ label: "svc-tag" })
    const svcAtom = service({
      tags: [myTag("svc-value")],
      factory: () => ({
        greet: async (_ctx: Lite.ExecutionContext, name: string) => `hello ${name}`,
      }),
    })

    const atoms = myTag.atoms()
    expect(atoms).toContain(svcAtom)
  })

  it("Fix 7: resource returning undefined — grandparent seek finds it", async () => {
    const undefinedResource = resource({
      name: "undef-resource",
      factory: () => undefined,
    })

    const innerFlow = flow({
      deps: { val: undefinedResource },
      factory: (_ctx: any, { val }: any) => ({ found: true, value: val }),
    })

    const outerFlow = flow({
      deps: { val: undefinedResource },
      factory: async (ctx) => {
        const inner = await ctx.exec({ flow: innerFlow })
        return inner
      },
    })

    const scope = createScope()
    const ctx = scope.createContext()
    const result = await ctx.exec({ flow: outerFlow }) as any

    expect(result.found).toBe(true)
    expect(result.value).toBeUndefined()

    await ctx.close()
    await scope.dispose()
  })

  it("H1: watch cascades when source factory returns new object literal (Object.is)", async () => {
    let derivedCount = 0

    const sourceAtom = atom({
      factory: () => ({ key: "value", num: 42 }),
    })

    const derivedAtom = atom({
      deps: { src: controller(sourceAtom, { resolve: true, watch: true }) },
      factory: (_ctx: any, { src }: any) => {
        derivedCount++
        return `derived:${src.get().key}`
      },
    })

    const scope = createScope()
    await scope.resolve(derivedAtom)
    expect(derivedCount).toBe(1)

    scope.controller(sourceAtom).invalidate()
    await scope.flush()

    expect(derivedCount).toBe(2)

    await scope.dispose()
  })

  it("M5: diamond dependency — D depends on B and C which both watch A — D resolves once per change", async () => {
    let bCount = 0
    let cCount = 0
    let dCount = 0

    const aAtom = atom({ factory: () => 1 })

    const bAtom = atom({
      deps: { a: controller(aAtom, { resolve: true, watch: true }) },
      factory: (_ctx: any, { a }: any) => {
        bCount++
        return a.get() * 2
      },
    })

    const cAtom = atom({
      deps: { a: controller(aAtom, { resolve: true, watch: true }) },
      factory: (_ctx: any, { a }: any) => {
        cCount++
        return a.get() * 3
      },
    })

    const dAtom = atom({
      deps: {
        b: controller(bAtom, { resolve: true, watch: true }),
        c: controller(cAtom, { resolve: true, watch: true }),
      },
      factory: (_ctx: any, { b, c }: any) => {
        dCount++
        return b.get() + c.get()
      },
    })

    const scope = createScope()
    await scope.resolve(dAtom)
    expect(bCount).toBe(1)
    expect(cCount).toBe(1)
    expect(dCount).toBe(1)
    expect(scope.controller(dAtom).get()).toBe(5)

    scope.controller(aAtom).set(10)
    await scope.flush()

    expect(bCount).toBe(2)
    expect(cCount).toBe(2)
    expect(dCount).toBe(2)
    expect(scope.controller(dAtom).get()).toBe(50)

    await scope.dispose()
  })
})

describe("release() cleanup", () => {
  it("removes atom from dependency dependents sets on release", async () => {
    let factoryCalls = 0
    const depAtom = atom({ factory: () => { factoryCalls++; return "dep" } })
    const parentAtom = atom({
      deps: { dep: depAtom },
      factory: (_ctx, { dep }) => `parent-${dep}`,
    })

    const scope = createScope({ gc: { enabled: true, graceMs: 10 } })
    await scope.resolve(parentAtom)
    expect(factoryCalls).toBe(1)

    await scope.release(parentAtom)

    await new Promise(r => setTimeout(r, 50))

    await scope.resolve(depAtom)
    expect(factoryCalls).toBe(2)
    await scope.dispose()
  })

  it("controller operations throw after release", async () => {
    const myAtom = atom({ factory: () => 42 })
    const scope = createScope()
    await scope.resolve(myAtom)

    const ctrl = scope.controller(myAtom)
    await scope.release(myAtom)

    expect(() => ctrl.get()).toThrow()
  })
})

describe("pendingSet on failure path", () => {
  it("applies pendingSet even if factory throws during resolve", async () => {
    let callCount = 0
    const myAtom = atom({
      factory: () => {
        callCount++
        if (callCount === 2) throw new Error("factory fail")
        return callCount
      },
    })

    const scope = createScope()
    await scope.resolve(myAtom)

    const ctrl = scope.controller(myAtom)

    ctrl.invalidate()
    ctrl.on("resolving", () => {
      ctrl.set(999)
    })

    await scope.flush()

    expect(ctrl.get()).toBe(999)
    expect(ctrl.state).toBe("resolved")
  })
})

describe("listener notification", () => {
  it("adding a listener during notification does not fire it in the same cycle", async () => {
    const myAtom = atom({ factory: () => 42 })
    const scope = createScope()
    await scope.resolve(myAtom)

    const ctrl = scope.controller(myAtom)
    let innerFired = false

    ctrl.on("resolved", () => {
      ctrl.on("resolved", () => {
        innerFired = true
      })
    })

    ctrl.invalidate()
    await scope.flush()

    expect(innerFired).toBe(false)
  })
})

describe("dispose() behavior", () => {
  it("drains and awaits in-flight invalidation chains before disposing", async () => {
    // Async factory: awaits in-flight invalidation chain before releasing
    let factoryRuns = 0
    const asyncAtom = atom({
      factory: async () => {
        factoryRuns++
        await new Promise(r => setTimeout(r, 10))
        return factoryRuns
      },
    })

    const scope1 = createScope()
    await scope1.resolve(asyncAtom)

    scope1.controller(asyncAtom).invalidate()
    await scope1.dispose()

    expect(factoryRuns).toBeGreaterThanOrEqual(1)

    // Sync factory: drains pending invalidation chain before marking disposed
    let resolveCount = 0
    const syncAtom = atom({
      factory: () => ++resolveCount,
    })

    const scope2 = createScope()
    await scope2.resolve(syncAtom)
    expect(resolveCount).toBe(1)

    scope2.controller(syncAtom).invalidate()
    await scope2.dispose()

    expect(resolveCount).toBe(2)

    // Slow factory: dispose during active invalidation chain — no errors (triage Fix 5)
    let slowFactoryCount = 0
    const slowAtom = atom({
      factory: async () => {
        slowFactoryCount++
        await new Promise(r => setTimeout(r, 50))
        return slowFactoryCount
      },
    })

    const scope3 = createScope()
    await scope3.resolve(slowAtom)
    expect(slowFactoryCount).toBe(1)

    scope3.controller(slowAtom).invalidate()
    await scope3.dispose()

    expect(slowFactoryCount).toBeLessThanOrEqual(2)
  })

  it("throws on resolve() and createContext() after dispose()", async () => {
    const myAtom = atom({ factory: () => 42 })
    const scope = createScope()
    await scope.resolve(myAtom)
    await scope.dispose()

    await expect(scope.resolve(myAtom)).rejects.toThrow()
    expect(() => scope.createContext()).toThrow()
  })
})
