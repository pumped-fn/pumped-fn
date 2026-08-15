import { describe, it, expect } from "vitest"
import {
  atom,
  controller,
  createScope,
  flow,
  getAllTags,
  isAtom,
  isControllerDep,
  isFlow,
  isPreset,
  isResource,
  isTag,
  isTagged,
  isTagExecutor,
  ParseError,
  preset,
  resource,
  setControllerReadHook,
  shallowEqual,
  tag,
  tags,
  typed,
} from "../src/index"
import type { AtomState, Lite } from "../src/index"

describe("Scope", () => {
  describe("scope.resolve()", () => {
    it("resolves atoms: no deps, with deps, caching, async, undefined", async () => {
      const scope = createScope()
      expect(await scope.resolve(atom({ factory: () => 42 }))).toBe(42)

      const configAtom = atom({ factory: () => ({ port: 3000 }) })
      const serverAtom = atom({
        deps: { cfg: configAtom },
        factory: (ctx, { cfg }) => ({ port: cfg.port }),
      })
      expect(await scope.resolve(serverAtom)).toEqual({ port: 3000 })

      let callCount = 0
      const cachedAtom = atom({ factory: () => ++callCount })
      expect(await scope.resolve(cachedAtom)).toBe(1)
      expect(await scope.resolve(cachedAtom)).toBe(1)
      expect(callCount).toBe(1)

      const asyncAtom = atom({
        factory: async () => {
          await new Promise((r) => setTimeout(r, 10))
          return "async result"
        },
      })
      expect(await scope.resolve(asyncAtom)).toBe("async result")

      const undefinedAtom = atom({ factory: () => undefined })
      expect(await scope.resolve(undefinedAtom)).toBe(undefined)
      expect(scope.controller(undefinedAtom).state).toBe("resolved")
    })

    it("runs failing cold dependencies once", async () => {
      const scope = createScope()
      let directCalls = 0
      let directCleanups = 0
      const direct = atom({
        factory: (ctx) => {
          directCalls++
          ctx.cleanup(() => { directCleanups++ })
          throw new Error("direct failed")
        },
      })
      const directParent = atom({
        deps: { direct },
        factory: (_, { direct }) => direct,
      })

      await expect(scope.resolve(directParent)).rejects.toThrow("direct failed")
      expect(directCalls).toBe(1)

      let controllerCalls = 0
      let controllerCleanups = 0
      const controlled = atom({
        factory: (ctx) => {
          controllerCalls++
          ctx.cleanup(() => { controllerCleanups++ })
          throw new Error("controller failed")
        },
      })
      const controllerParent = atom({
        deps: { controlled: controller(controlled, { resolve: true }) },
        factory: (_, { controlled }) => controlled.get(),
      })

      await expect(scope.resolve(controllerParent)).rejects.toThrow("controller failed")
      expect(controllerCalls).toBe(1)
      await scope.dispose()
      expect(directCleanups).toBe(1)
      expect(controllerCleanups).toBe(1)
    })

    it("supports immutable atoms without changing their public shape", async () => {
      const normal = atom({ factory: () => 1 })
      const normalKeys = Object.keys(normal)
      const normalScope = createScope()
      await normalScope.resolve(normal)
      normalScope.controller(normal)
      expect(Object.keys(normal)).toEqual(normalKeys)

      const frozen = Object.freeze(atom({ factory: () => 2 }))
      const sealed = Object.seal(atom({ factory: () => 3 }))
      const fixed = Object.preventExtensions(atom({ factory: () => 4 }))
      const scope = createScope()

      await expect(scope.resolve(frozen)).resolves.toBe(2)
      await expect(scope.resolve(sealed)).resolves.toBe(3)
      await expect(scope.resolve(fixed)).resolves.toBe(4)
      expect(scope.controller(frozen).get()).toBe(2)
      expect(scope.controller(sealed).get()).toBe(3)
      expect(scope.controller(fixed).get()).toBe(4)
    })

    it("allows extensions to resolve atoms during init", async () => {
      const configAtom = atom({ factory: () => "config" })
      let initValue: string | undefined

      const scope = createScope({
        extensions: [{
          name: "init-resolve",
          init: async (childScope: Lite.Scope) => {
            initValue = await childScope.resolve(configAtom)
          },
        }],
      })

      await expect(scope.ready).resolves.toBeUndefined()
      expect(initValue).toBe("config")
      expect(await scope.resolve(configAtom)).toBe("config")
    })

    it("uses preset value and preset atom", async () => {
      const configAtom = atom({ factory: () => ({ port: 3000 }) })
      const scope1 = createScope({
        presets: [preset(configAtom, { port: 8080 })],
      })
      expect(await scope1.resolve(configAtom)).toEqual({ port: 8080 })

      const testConfigAtom = atom({ factory: () => ({ port: 9999 }) })
      const scope2 = createScope({
        presets: [preset(configAtom, testConfigAtom)],
      })
      expect(await scope2.resolve(configAtom)).toEqual({ port: 9999 })
    })

    it("uses presets through cold synchronous dependency paths", async () => {
      let calls = 0
      const source = atom({
        factory: () => {
          calls++
          return "real"
        },
      })
      const direct = atom({
        deps: { source },
        factory: (_, { source }) => source,
      })
      const controlled = atom({
        deps: { source: controller(source, { resolve: true }) },
        factory: (_, { source }) => source.get(),
      })
      const middle = atom({
        deps: { source },
        factory: (_, { source }) => `middle:${source}`,
      })
      const transitive = atom({
        deps: { middle },
        factory: (_, { middle }) => `outer:${middle}`,
      })

      await expect(createScope({ presets: [preset(source, "fake")] }).resolve(direct)).resolves.toBe("fake")
      await expect(createScope({ presets: [preset(source, "fake")] }).resolve(controlled)).resolves.toBe("fake")
      await expect(createScope({ presets: [preset(source, "fake")] }).resolve(transitive)).resolves.toBe("outer:middle:fake")

      const replacement = atom({ factory: () => "replacement" })
      await expect(createScope({ presets: [preset(source, replacement)] }).resolve(direct)).resolves.toBe("replacement")
      expect(calls).toBe(0)
    })

    it("waits for dependency release before resolving it again", async () => {
      const events: string[] = []
      const source = atom({
        factory: (ctx) => {
          events.push("acquire")
          ctx.cleanup(() => { events.push("cleanup") })
          return events.length
        },
      })
      const dependent = atom({
        deps: { source },
        factory: (_, { source }) => source,
      })
      const scope = createScope()

      await scope.resolve(source)
      const release = scope.release(source)
      const resolving = scope.resolve(dependent)

      await release
      await resolving
      expect(events).toEqual(["acquire", "cleanup", "acquire"])
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

    it("refreshes value notifications after all listeners unsubscribe", async () => {
      const subject = atom({ factory: () => "v1" })
      const scope = createScope()
      await scope.resolve(subject)
      const ctrl = scope.controller(subject) as Lite.Controller<string> & {
        _(listener: () => void): () => void
      }
      let firstCalls = 0
      const off = ctrl._(() => { firstCalls++ })

      ctrl.set("v2")
      await scope.flush()
      expect(firstCalls).toBe(1)
      off()

      ctrl.set("v3")
      await scope.flush()
      let secondCalls = 0
      ctrl._(() => { secondCalls++ })
      ctrl.set("v2")
      await scope.flush()
      expect(secondCalls).toBe(1)
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
    it("resolves required from scope, throws missing, resolves optional as undefined", async () => {
      const tenantId = tag<string>({ label: "tenantId" })

      const scope1 = createScope({ tags: [tenantId("tenant-123")] })
      const reqAtom = atom({
        deps: { tenant: tags.required(tenantId) },
        factory: (ctx, { tenant }) => tenant,
      })
      expect(await scope1.resolve(reqAtom)).toBe("tenant-123")

      const scope2 = createScope()
      await expect(scope2.resolve(atom({
        deps: { tenant: tags.required(tenantId) },
        factory: (ctx, { tenant }) => tenant,
      }))).rejects.toThrow()

      expect(await scope2.resolve(atom({
        deps: { tenant: tags.optional(tenantId) },
        factory: (ctx, { tenant }) => tenant,
      }))).toBeUndefined()
    })
  })

  describe("cleanup and dispose", () => {
    it("runs cleanups on release in LIFO order and dispose releases all atoms", async () => {
      const scope = createScope()
      let cleaned = false
      const singleCleanupAtom = atom({
        factory: (ctx) => {
          ctx.cleanup(() => { cleaned = true })
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

      const scope2 = createScope()
      const cleanups: string[] = []
      const a = atom({ factory: (ctx) => { ctx.cleanup(() => { cleanups.push("a") }); return "a" } })
      const b = atom({ factory: (ctx) => { ctx.cleanup(() => { cleanups.push("b") }); return "b" } })
      await scope2.resolve(a)
      await scope2.resolve(b)
      await scope2.dispose()
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
  describe("resource presets and metadata", () => {
    it("presets resources with direct values and replacement resources", async () => {
      const targetResource = resource({
        name: "target-resource",
        factory: () => "real",
      })
      const replacementResource = resource({
        name: "replacement-resource",
        factory: () => "replacement",
      })
      const readResourceFlow = flow({
        name: "read-resource",
        deps: { value: targetResource },
        factory: (_ctx, { value }) => value,
      })

      const directScope = createScope({
        presets: [preset(targetResource, "direct")],
      })
      const directCtx = directScope.createContext()
      expect(await directCtx.exec({ flow: readResourceFlow })).toBe("direct")
      await directCtx.close()
      await directScope.dispose()

      const replacementScope = createScope({
        presets: [preset(targetResource, replacementResource)],
      })
      const replacementCtx = replacementScope.createContext()
      expect(await replacementCtx.exec({ flow: readResourceFlow })).toBe("replacement")
      await replacementCtx.close()
      await replacementScope.dispose()
    })

    it("presets resources with replacement functions and exposes resource tags to extensions", async () => {
      const resourceKind = tag<string>({ label: "resourceKind" })
      const events: string[] = []
      const closed: string[] = []

      const targetResource = resource({
        name: "target-resource",
        tags: [resourceKind("target")],
        factory: () => "real",
      })
      const readResourceFlow = flow({
        name: "read-resource",
        deps: { value: targetResource },
        factory: (_ctx, { value }) => value,
      })

      const scope = createScope({
        extensions: [{
          name: "resource-tags",
          wrapResolve: async (next, event) => {
            if (event.kind === "resource") {
              events.push(event.target.tags?.[0]?.value as string)
            }
            return next()
          },
        }],
        presets: [
          preset(targetResource, (ctx) => {
            ctx.onClose(() => { closed.push("target") })
            return "preset"
          }),
        ],
      })
      const ctx = scope.createContext()

      expect(await ctx.exec({ flow: readResourceFlow })).toBe("preset")
      expect(await ctx.exec({ flow: readResourceFlow })).toBe("preset")
      expect(events).toEqual(["target"])

      await ctx.close()
      expect(closed).toEqual(["target"])
      await scope.dispose()
    })
  })

  describe("ctx.resolve() and ctx.release()", () => {
    it("resolves atoms through the owning scope and ignores context tags", async () => {
      const requestTag = tag<string>({ label: "ctx-resolve-request" })
      const taggedAtom = atom({
        deps: { request: tags.required(requestTag) },
        factory: (_ctx, { request }) => request,
      })

      const scope = createScope({
        tags: [requestTag("scope-value")],
      })
      const ctx = scope.createContext({
        tags: [requestTag("context-value")],
      })

      expect(await ctx.resolve(taggedAtom)).toBe("scope-value")

      const contextOnlyScope = createScope()
      const contextOnlyCtx = contextOnlyScope.createContext({
        tags: [requestTag("context-value")],
      })

      await expect(contextOnlyCtx.resolve(taggedAtom)).rejects.toThrow('Tag "ctx-resolve-request" not found')
      expect(() => scope.createContext([requestTag("legacy")] as never)).toThrow("createContext() expects { tags, parent, signal }")
      expect(() => scope.createContext({ tag: [requestTag("typo")] } as never))
        .toThrow('createContext() expects { tags, parent, signal }; received "tag"')
      const singleTagCtx = scope.createContext({ tags: requestTag("single") })
      expect(singleTagCtx.data.seekTag(requestTag)).toBe("single")

      await ctx.close()
      await contextOnlyCtx.close()
      await singleTagCtx.close()
      await scope.dispose()
      await contextOnlyScope.dispose()
    })

    it("creates child contexts that inherit parent data and stay same-scope", async () => {
      const tenant = tag<string>({ label: "ctx-parent-tenant" })
      const role = tag<string>({ label: "ctx-parent-role" })
      const region = tag<string>({ label: "ctx-parent-region" })
      const readRoles = flow({
        name: "read-parented-context-roles",
        deps: { roles: tags.all(role) },
        factory: (_ctx, { roles }) => roles,
      })

      const scope = createScope({
        tags: [tenant("scope"), region("global")],
      })
      const parent = scope.createContext({
        tags: [tenant("workspace"), role("parent")],
      })
      const child = scope.createContext({
        parent,
        tags: [role("child")],
      })
      const otherScope = createScope()
      const otherParent = otherScope.createContext()

      expect(child.parent).toBe(parent)
      expect(child.data.seekTag(tenant)).toBe("workspace")
      expect(child.data.seekTag(region)).toBe("global")
      expect(child.data.seekTag(role)).toBe("child")
      expect(parent.data.seekTag(role)).toBe("parent")
      expect(await child.exec({ flow: readRoles })).toEqual(["child", "parent"])
      expect(() => scope.createContext({ parent: otherParent })).toThrow("same scope")
      expect(() => scope.createContext({ parent: null } as never)).toThrow("ExecutionContext")

      await child.close()
      await parent.close()
      expect(() => scope.createContext({ parent })).toThrow("ExecutionContext is closed")
      await otherParent.close()
      await scope.dispose()
      await otherScope.dispose()
    })

    it("rejects ctx.resolve() on closed contexts before resolving atoms or resources", async () => {
      let atomCalls = 0
      let resourceCalls = 0
      const closedAtom = atom({
        factory: () => {
          atomCalls++
          return "atom"
        },
      })
      const closedResource = resource({
        name: "closed-resource",
        factory: () => {
          resourceCalls++
          return "resource"
        },
      })

      const scope = createScope()
      const ctx = scope.createContext()
      await ctx.close()

      await expect(ctx.resolve(closedAtom)).rejects.toThrow("closed")
      await expect(ctx.resolve(closedResource)).rejects.toThrow("closed")
      expect(atomCalls).toBe(0)
      expect(resourceCalls).toBe(0)

      await scope.dispose()
    })

    it("exposes a resource controller that observes resolve, failure, and release state", async () => {
      let attempt = 0
      let resume!: () => void
      const observedResource = resource({
        name: "controller-observed-resource",
        factory: async () => {
          attempt++
          if (attempt === 2) throw new Error("boom")
          await new Promise<void>((resolve) => {
            resume = resolve
          })
          return `value-${attempt}`
        },
      })

      const scope = createScope()
      const ctx = scope.createContext()
      const ctrl = ctx.controller(observedResource)
      const events: AtomState[] = []
      ctrl.on("*", () => {
        events.push(ctrl.state)
      })

      expect(ctrl.state).toBe("idle")
      const first = ctrl.resolve()
      expect(ctrl.state).toBe("resolving")
      resume()
      await expect(first).resolves.toBe("value-1")
      expect(ctrl.state).toBe("resolved")
      expect(ctrl.get()).toBe("value-1")

      await ctrl.release()
      expect(ctrl.state).toBe("idle")
      expect(() => ctrl.get()).toThrow("Resource not resolved")

      await expect(ctrl.resolve()).rejects.toThrow("boom")
      expect(ctrl.state).toBe("failed")
      expect(() => ctrl.get()).toThrow("boom")

      await ctrl.release()
      expect(ctrl.state).toBe("idle")
      expect(events).toEqual(["resolving", "resolved", "idle", "resolving", "failed", "idle"])

      await ctx.close()
      await scope.dispose()
    })

    it("supports lazy resource controller deps for conditional resource loading", async () => {
      let enabled = false
      let creates = 0
      const dbResource = resource({
        name: "conditional-db",
        factory: () => ({ id: ++creates }),
      })
      const serviceResource = resource({
        name: "conditional-service",
        deps: { db: controller(dbResource) },
        factory: async (_ctx, { db }) => {
          if (!enabled) return "skipped"
          const dbValue = await db.resolve()
          return `db:${dbValue.id}`
        },
      })

      const scope = createScope()
      const ctx = scope.createContext()

      expect(await ctx.resolve(serviceResource)).toBe("skipped")
      expect(creates).toBe(0)

      await ctx.release(serviceResource)
      enabled = true

      expect(await ctx.resolve(serviceResource)).toBe("db:1")
      expect(ctx.controller(dbResource).get()).toEqual({ id: 1 })
      expect(creates).toBe(1)

      await ctx.close()
      await scope.dispose()
    })

    it("supports resource controller deps in flows without resolving until requested", async () => {
      let creates = 0
      const sessionResource = resource({
        name: "conditional-flow-session",
        factory: () => ({ id: ++creates }),
      })
      const readSession = flow({
        name: "read-session-conditionally",
        parse: typed<{ load: boolean }>(),
        deps: { session: controller(sessionResource) },
        factory: async (_ctx, { session }) => {
          if (!_ctx.input.load) return "none"
          return (await session.resolve()).id
        },
      })

      const scope = createScope()
      const ctx = scope.createContext()

      expect(await ctx.exec({ flow: readSession, input: { load: false } })).toBe("none")
      expect(creates).toBe(0)

      expect(await ctx.exec({ flow: readSession, input: { load: true } })).toBe(1)
      expect(ctx.controller(sessionResource).get()).toEqual({ id: 1 })
      expect(creates).toBe(1)

      await ctx.close()
      await scope.dispose()
    })

    it("auto-resolves resource controller deps with resolve: true", async () => {
      let creates = 0
      const configResource = resource({
        name: "auto-config",
        factory: () => ({ version: ++creates }),
      })
      const serviceResource = resource({
        name: "auto-service",
        deps: { config: controller(configResource, { resolve: true }) },
        factory: (_ctx, { config }) => {
          expect(config.state).toBe("resolved")
          return `version:${config.get().version}`
        },
      })

      const scope = createScope()
      const ctx = scope.createContext()

      expect(await ctx.resolve(serviceResource)).toBe("version:1")
      expect(creates).toBe(1)

      await ctx.close()
      await scope.dispose()
    })

    it("watches resource resolved events and releases dependent only when the value changes", async () => {
      const values = [1, 1, 2]
      let sourceCreates = 0
      let dependentCreates = 0
      const sourceResource = resource({
        name: "watched-source",
        factory: () => values[sourceCreates++]!,
      })
      const dependentResource = resource({
        name: "watched-dependent",
        deps: { source: controller(sourceResource, { resolve: true, watch: true }) },
        factory: (_ctx, { source }) => `dependent:${++dependentCreates}:${source.get()}`,
      })

      const scope = createScope()
      const ctx = scope.createContext()

      expect(await ctx.resolve(dependentResource)).toBe("dependent:1:1")
      expect(ctx.controller(dependentResource).state).toBe("resolved")

      await ctx.release(sourceResource)
      expect(ctx.controller(dependentResource).state).toBe("resolved")
      expect(await ctx.resolve(dependentResource)).toBe("dependent:1:1")

      await ctx.resolve(sourceResource)
      expect(ctx.controller(dependentResource).state).toBe("resolved")

      await ctx.release(sourceResource)
      await ctx.resolve(sourceResource)
      expect(ctx.controller(dependentResource).state).toBe("idle")
      expect(await ctx.resolve(dependentResource)).toBe("dependent:2:2")

      await ctx.close()
      await scope.dispose()
    })

    it("uses custom resource watch equality to gate dependent release", async () => {
      const values = [
        { id: 1, name: "alice" },
        { id: 1, name: "ada" },
        { id: 2, name: "grace" },
      ]
      let sourceCreates = 0
      let dependentCreates = 0
      const sourceResource = resource({
        name: "watched-object-source",
        factory: () => values[sourceCreates++]!,
      })
      const dependentResource = resource({
        name: "watched-object-dependent",
        deps: {
          source: controller(sourceResource, {
            resolve: true,
            watch: true,
            eq: (a, b) => a.id === b.id,
          }),
        },
        factory: (_ctx, { source }) => {
          const value = source.get()
          return `dependent:${++dependentCreates}:${value.id}:${value.name}`
        },
      })

      const scope = createScope()
      const ctx = scope.createContext()

      expect(await ctx.resolve(dependentResource)).toBe("dependent:1:1:alice")
      await ctx.release(sourceResource)
      await ctx.resolve(sourceResource)
      expect(ctx.controller(dependentResource).state).toBe("resolved")

      await ctx.release(sourceResource)
      await ctx.resolve(sourceResource)
      expect(ctx.controller(dependentResource).state).toBe("idle")
      expect(await ctx.resolve(dependentResource)).toBe("dependent:2:2:grace")

      await ctx.close()
      await scope.dispose()
    })

    it("rejects resource controller dependency anti-patterns at runtime", async () => {
      let sourceCreates = 0
      const dbResource = resource({
        name: "bad-controller-resource",
        factory: () => {
          sourceCreates++
          return 1
        },
      })
      const badAtom = atom({
        deps: { db: controller(dbResource) as any },
        factory: (_ctx, { db }) => db,
      })

      let flowRuns = 0
      const watchedDep = controller(dbResource, { resolve: true, watch: true } as any)
      const badFlow = flow({
        deps: { db: watchedDep as any },
        factory: () => {
          flowRuns++
          return "bad"
        },
      })

      const scope = createScope()
      await expect(scope.resolve(badAtom)).rejects.toThrow("Resource controller deps require an ExecutionContext")
      const ctx = scope.createContext()
      await expect(ctx.exec({ flow: badFlow })).rejects.toThrow("Resource controller watch")
      expect(sourceCreates).toBe(0)
      expect(flowRuns).toBe(0)
      await ctx.close()
      await scope.dispose()
    })

    it("owns direct resource misses in the context and releases owner-local state", async () => {
      let creates = 0
      let factoryScope: Lite.Scope | undefined
      let factoryParent: Lite.ExecutionContext | undefined
      const cleanups: string[] = []
      const scopedResource = resource({
        name: "context-owned",
        factory: (ctx) => {
          creates++
          factoryScope = ctx.scope
          factoryParent = ctx.parent
          ctx.cleanup(() => {
            cleanups.push(`cleanup:${creates}`)
          })
          return { id: creates }
        },
      })

      const scope = createScope()
      const ctx = scope.createContext()

      const first = await ctx.resolve(scopedResource)
      const second = await ctx.resolve(scopedResource)
      expect(second).toBe(first)
      expect(factoryScope).toBe(scope)
      expect(factoryParent).toBeUndefined()
      expect(creates).toBe(1)

      await ctx.release(scopedResource)
      expect(cleanups).toEqual(["cleanup:1"])

      const third = await ctx.resolve(scopedResource)
      expect(third).not.toBe(first)
      expect(creates).toBe(2)

      await ctx.close()
      expect(cleanups).toEqual(["cleanup:1", "cleanup:2"])
      await scope.dispose()
    })

    it("looks up parent-owned resources upward and makes child release a no-op", async () => {
      let creates = 0
      const sharedResource = resource({
        name: "parent-owned",
        factory: async () => {
          creates++
          await new Promise(r => setTimeout(r, 10))
          return { id: creates }
        },
      })
      const childFlow = flow({
        name: "child-reads-parent-resource",
        factory: (ctx) => ctx.resolve(sharedResource),
      })
      const childReleaseFlow = flow({
        name: "child-release-parent-resource",
        factory: (ctx) => ctx.release(sharedResource),
      })

      const scope = createScope()
      const parentCtx = scope.createContext()

      const parentValuePromise = parentCtx.resolve(sharedResource)
      const childValuePromise = parentCtx.exec({ flow: childFlow })
      const [parentValue, childValue] = await Promise.all([parentValuePromise, childValuePromise])

      expect(childValue).toBe(parentValue)
      expect(creates).toBe(1)

      await parentCtx.exec({ flow: childReleaseFlow })
      expect(await parentCtx.resolve(sharedResource)).toBe(parentValue)

      await parentCtx.release(sharedResource)
      const nextParentValue = await parentCtx.resolve(sharedResource)
      expect(nextParentValue).not.toBe(parentValue)
      expect(creates).toBe(2)

      await parentCtx.close()
      await scope.dispose()
    })

    it("stores flow-child resource misses on the surrounding execution boundary", async () => {
      let creates = 0
      const cleanups: string[] = []
      const localResource = resource({
        name: "boundary-local-resource",
        factory: (ctx) => {
          creates++
          ctx.cleanup(() => {
            cleanups.push(ctx.name ?? "root")
          })
          return { id: creates }
        },
      })
      const childFlow = flow({
        name: "child-local-flow",
        factory: (ctx) => ctx.resolve(localResource),
      })

      const scope = createScope()
      const parentCtx = scope.createContext()

      const childValue = await parentCtx.exec({ flow: childFlow })
      expect(cleanups).toEqual([])

      const parentValue = await parentCtx.resolve(localResource)
      expect(parentValue).toBe(childValue)
      expect(creates).toBe(1)

      await parentCtx.close()
      expect(cleanups).toEqual(["root"])
      await scope.dispose()
    })

    it("isolates boundary-owned resources across explicit contexts regardless of resolution order", async () => {
      let creates = 0
      const sharedResource = resource({
        name: "explicit-boundary-resource",
        factory: () => ({ id: ++creates }),
      })
      const readResource = flow({
        name: "read-explicit-boundary-resource",
        deps: { sharedResource },
        factory: (_ctx, { sharedResource }) => sharedResource,
      })

      const scope = createScope()
      const parent = scope.createContext()
      const child = scope.createContext({ parent })

      const parentValue = await parent.resolve(sharedResource)
      const childValue = await child.resolve(sharedResource)

      expect(childValue).not.toBe(parentValue)
      expect(await child.exec({ flow: readResource })).toBe(childValue)
      expect(await parent.exec({ flow: readResource })).toBe(parentValue)
      expect(creates).toBe(2)

      await child.close()
      await parent.close()
      await scope.dispose()
    })

    it("resolves boundary-owned resource deps from the owner context tags", async () => {
      const requestTag = tag<string>({ label: "boundary-request" })
      const taggedResource = resource({
        name: "boundary-tagged",
        deps: { request: tags.required(requestTag) },
        factory: (_ctx, { request }) => ({ request }),
      })
      const childFlow = flow({
        name: "child-with-own-tag",
        factory: (ctx) => ctx.resolve(taggedResource),
      })

      const scope = createScope()
      const parentCtx = scope.createContext({
        tags: [requestTag("parent")],
      })

      const childValue = await parentCtx.exec({
        flow: childFlow,
        tags: [requestTag("child")],
      })
      const parentValue = await parentCtx.resolve(taggedResource)

      expect(childValue).toEqual({ request: "parent" })
      expect(parentValue).toBe(childValue)

      await parentCtx.close()
      await scope.dispose()
    })

    it("stores current-owned resource misses on the current execution context", async () => {
      let creates = 0
      const cleanups: string[] = []
      const tx = resource({
        name: "current-owned-tx",
        ownership: "current",
        factory: (ctx) => {
          const id = ++creates
          ctx.cleanup(() => {
            cleanups.push(`${ctx.name}:${id}`)
          })
          return { id }
        },
      })
      const readTx = flow({
        name: "read-current-owned-tx",
        factory: (ctx) => ctx.resolve(tx),
      })

      const scope = createScope()
      const parentCtx = scope.createContext()

      expect(await parentCtx.exec({ flow: readTx, name: "first" })).toEqual({ id: 1 })
      expect(cleanups).toEqual(["first:1"])
      expect(parentCtx.controller(tx).state).toBe("idle")

      expect(await parentCtx.exec({ flow: readTx, name: "second" })).toEqual({ id: 2 })
      expect(cleanups).toEqual(["first:1", "second:2"])
      expect(creates).toBe(2)

      await parentCtx.close()
      await scope.dispose()
    })

    it("shares current-owned resources with nested executions only", async () => {
      let creates = 0
      const tx = resource({
        name: "nested-current-owned-tx",
        ownership: "current",
        factory: () => ({ id: ++creates }),
      })
      const inner = flow({
        name: "inner-current-owned-tx",
        deps: { tx },
        factory: (_ctx, { tx }) => tx.id,
      })
      const outer = flow({
        name: "outer-current-owned-tx",
        deps: { tx },
        factory: async (ctx, { tx }) => [tx.id, await ctx.exec({ flow: inner })],
      })

      const scope = createScope()
      const parentCtx = scope.createContext()

      expect(await parentCtx.exec({ flow: outer })).toEqual([1, 1])
      expect(await parentCtx.exec({ flow: outer })).toEqual([2, 2])
      expect(creates).toBe(2)

      await parentCtx.close()
      await scope.dispose()
    })

    it("does not share current-owned resources across explicit context boundaries", async () => {
      let creates = 0
      const tx = resource({
        name: "boundary-local-current-owned-tx",
        ownership: "current",
        factory: () => ({ id: ++creates }),
      })
      const readTx = flow({
        name: "read-boundary-local-current-owned-tx",
        deps: { tx },
        factory: (_ctx, { tx }) => tx.id,
      })

      const scope = createScope()
      const parent = scope.createContext()
      const child = scope.createContext({ parent })

      expect(await parent.resolve(tx)).toEqual({ id: 1 })
      expect(await child.resolve(tx)).toEqual({ id: 2 })
      expect(await child.exec({ flow: readTx })).toBe(2)
      expect(creates).toBe(2)

      await child.close()
      await parent.close()
      await scope.dispose()
    })

    it("rejects boundary-owned resource misses when the parent owner is closed", async () => {
      let creates = 0
      const sharedResource = resource({
        name: "closed-parent-boundary-resource",
        factory: () => {
          creates++
          return "shared"
        },
      })

      const scope = createScope()
      const parent = scope.createContext()
      const child = scope.createContext({ parent })

      await parent.close()

      await expect(child.resolve(sharedResource)).rejects.toThrow("ExecutionContext is closed")
      expect(creates).toBe(0)

      await child.close()
      await scope.dispose()
    })

    it("resolves current-owned resource deps from the current context tags", async () => {
      const requestTag = tag<string>({ label: "current-request" })
      const taggedResource = resource({
        name: "current-tagged",
        ownership: "current",
        deps: { request: tags.required(requestTag) },
        factory: (_ctx, { request }) => ({ request }),
      })
      const childFlow = flow({
        name: "child-with-current-tag",
        factory: (ctx) => ctx.resolve(taggedResource),
      })

      const scope = createScope()
      const parentCtx = scope.createContext({
        tags: [requestTag("parent")],
      })

      const childValue = await parentCtx.exec({
        flow: childFlow,
        tags: [requestTag("child")],
      })
      const parentValue = await parentCtx.resolve(taggedResource)

      expect(childValue).toEqual({ request: "child" })
      expect(parentValue).toEqual({ request: "parent" })
      expect(parentValue).not.toBe(childValue)

      await parentCtx.close()
      await scope.dispose()
    })

    it("caches failed resources until owner release resets them", async () => {
      let attempts = 0
      const cleanups: string[] = []
      const failingResource = resource({
        name: "cached-failure-resource",
        factory: (ctx) => {
          attempts++
          ctx.cleanup(() => {
            cleanups.push(`cleanup:${attempts}`)
          })
          throw new Error("resource exploded")
        },
      })

      const scope = createScope()
      const ctx = scope.createContext()

      await expect(ctx.resolve(failingResource)).rejects.toThrow("resource exploded")
      await expect(ctx.resolve(failingResource)).rejects.toThrow("resource exploded")
      expect(attempts).toBe(1)
      expect(cleanups).toEqual(["cleanup:1"])

      await ctx.release(failingResource)
      await expect(ctx.resolve(failingResource)).rejects.toThrow("resource exploded")
      expect(attempts).toBe(2)
      expect(cleanups).toEqual(["cleanup:1", "cleanup:2"])

      await ctx.close()
      await scope.dispose()
    })

    it("rejects late resource cleanup registration after release during resolution", async () => {
      let continueFactory!: () => void
      let markStarted!: () => void
      let cleanupRegistrationError: unknown
      let cleanupCalls = 0
      const started = new Promise<void>((resolve) => {
        markStarted = resolve
      })
      const lateCleanupResource = resource({
        name: "late-cleanup",
        factory: async (ctx) => {
          markStarted()
          await new Promise<void>((resume) => {
            continueFactory = resume
          })
          try {
            ctx.cleanup(() => {
              cleanupCalls++
            })
          } catch (error) {
            cleanupRegistrationError = error
          }
          return "late"
        },
      })

      const scope = createScope()
      const ctx = scope.createContext()
      const pending = ctx.resolve(lateCleanupResource)

      await started
      await ctx.release(lateCleanupResource)
      continueFactory()

      await expect(pending).rejects.toThrow("released")
      expect(cleanupRegistrationError).toBeInstanceOf(Error)
      expect((cleanupRegistrationError as Error).message).toContain("released")
      expect(cleanupCalls).toBe(0)

      await ctx.close()
      await scope.dispose()
    })

    it("runs execution onClose before resource cleanup when closing a context", async () => {
      const order: string[] = []
      const txResource = resource({
        name: "tx-close-order",
        factory: (ctx) => {
          ctx.onClose((result) => {
            order.push(result.ok ? "commit" : "rollback")
          })
          ctx.cleanup(() => {
            order.push("release")
          })
          return { tx: true }
        },
      })

      const scope = createScope()
      const ctx = scope.createContext()
      await ctx.resolve(txResource)

      await ctx.close({ ok: false, error: new Error("failed") })

      expect(order).toEqual(["rollback", "release"])
      await scope.dispose()
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

    it("lets wrapExec short-circuit flow before deps and factory", async () => {
      let depCalls = 0
      let factoryCalls = 0
      const dep = atom({
        factory: () => {
          depCalls++
          return 1
        },
      })
      const target = flow({
        name: "short-circuit-target",
        deps: { dep },
        factory: () => {
          factoryCalls++
          return "ran"
        },
      })
      const ext = {
        name: "short-circuit",
        wrapExec: async () => "memo",
      } satisfies Lite.Extension
      const scope = createScope({ extensions: [ext] })
      const ctx = scope.createContext()

      expect(await ctx.exec({ flow: target })).toBe("memo")
      expect(depCalls).toBe(0)
      expect(factoryCalls).toBe(0)

      await ctx.close()
      await scope.dispose()
    })

    it("exposes exec and flow tags to wrapExec before deps resolve", async () => {
      const marker = tag<string>({ label: "exec-boundary-marker" })
      let depCalls = 0
      const dep = atom({
        factory: () => {
          depCalls++
          return 1
        },
      })
      const target = flow({
        name: "tagged-boundary-target",
        tags: [marker("flow")],
        deps: { dep },
        factory: () => "ran",
      })
      const ext = {
        name: "tag-reader",
        wrapExec: async (_next, _target, childCtx) => childCtx.data.seekTag(marker),
      } satisfies Lite.Extension
      const scope = createScope({ extensions: [ext] })
      const ctx = scope.createContext({ tags: [marker("ctx")] })

      expect(await ctx.exec({ flow: target, tags: [marker("exec")] })).toBe("exec")
      expect(await ctx.exec({ flow: target })).toBe("flow")
      expect(depCalls).toBe(0)

      await ctx.close()
      await scope.dispose()
    })

    it("wraps dependency errors inside wrapExec", async () => {
      let observed = false
      const dep = atom({
        factory: () => {
          throw new Error("dep failed")
        },
      })
      const target = flow({
        name: "failing-dep-target",
        deps: { dep },
        factory: () => "unreachable",
      })
      const ext = {
        name: "error-observer",
        wrapExec: async (next) => {
          try {
            return await next()
          } catch (error) {
            observed = error instanceof Error && error.message === "dep failed"
            throw error
          }
        },
      } satisfies Lite.Extension
      const scope = createScope({ extensions: [ext] })
      const ctx = scope.createContext()

      await expect(ctx.exec({ flow: target })).rejects.toThrow("dep failed")
      expect(observed).toBe(true)

      await ctx.close({ ok: false, error: new Error("expected") })
      await scope.dispose()
    })
  })

  describe("context lifecycle extensions", () => {
    it("notifies creation and close of scope-created contexts with seeded tags", async () => {
      const marker = tag<string>({ label: "lifecycle-marker" })
      const events: string[] = []
      let created: Lite.ExecutionContext | undefined
      let outcome: Lite.CloseResult | undefined
      const ext = {
        name: "context-observer",
        initContext: (ctx) => {
          created = ctx
          events.push(`init:${ctx.data.seekTag(marker)}`)
        },
        disposeContext: (ctx, result) => {
          outcome = result
          events.push(`dispose:${ctx.data.seekTag(marker)}`)
        },
      } satisfies Lite.Extension
      const scope = createScope({ extensions: [ext] })
      const ctx = scope.createContext({ tags: [marker("root")] })

      expect(created).toBe(ctx)
      expect(events).toEqual(["init:root"])

      await ctx.close()
      expect(events).toEqual(["init:root", "dispose:root"])
      expect(outcome).toEqual({ ok: true })
      await scope.dispose()
    })

    it("notifies per-exec child contexts and nests dispose order across extensions", async () => {
      const events: string[] = []
      const observer = (name: string): Lite.Extension => ({
        name,
        initContext: (ctx) => {
          events.push(`${name}:init:${ctx.name ?? "root"}`)
        },
        disposeContext: (ctx) => {
          events.push(`${name}:dispose:${ctx.name ?? "root"}`)
        },
      })
      const child = flow({ name: "child", factory: () => "done" })
      const scope = createScope({ extensions: [observer("a"), observer("b")] })

      expect(await scope.run({ flow: child })).toBe("done")
      expect(events).toEqual([
        "a:init:root",
        "b:init:root",
        "a:init:child",
        "b:init:child",
        "b:dispose:child",
        "a:dispose:child",
        "b:dispose:root",
        "a:dispose:root",
      ])
      await scope.dispose()
    })

    it("passes failure outcomes to disposeContext without requiring initContext", async () => {
      const outcomes: Lite.CloseResult[] = []
      const ext = {
        name: "failure-observer",
        disposeContext: (_ctx, result) => {
          outcomes.push(result)
        },
      } satisfies Lite.Extension
      const failing = flow({
        name: "failing",
        factory: () => {
          throw new Error("exec failed")
        },
      })
      const scope = createScope({ extensions: [ext] })
      const ctx = scope.createContext()

      await expect(ctx.exec({ flow: failing })).rejects.toThrow("exec failed")
      expect(outcomes).toHaveLength(1)
      expect(outcomes[0]).toMatchObject({ ok: false, error: new Error("exec failed") })

      await ctx.close()
      expect(outcomes[1]).toEqual({ ok: true })
      await scope.dispose()
    })

    it("awaits async disposeContext after user onClose cleanups", async () => {
      const events: string[] = []
      const ext = {
        name: "async-dispose",
        disposeContext: async () => {
          await Promise.resolve()
          events.push("extension")
        },
      } satisfies Lite.Extension
      const scope = createScope({ extensions: [ext] })
      const ctx = scope.createContext()
      ctx.onClose(() => {
        events.push("user")
      })

      await ctx.close()
      expect(events).toEqual(["user", "extension"])
      await scope.dispose()
    })

    it("closes the context and notifies attached extensions when initContext throws", async () => {
      const events: string[] = []
      const observer = {
        name: "first",
        initContext: () => {
          events.push("first:init")
        },
        disposeContext: (_ctx, result) => {
          events.push(`first:dispose:${result.ok}`)
        },
      } satisfies Lite.Extension
      const failing = {
        name: "second",
        initContext: () => {
          throw new Error("init failed")
        },
        disposeContext: () => {
          events.push("second:dispose")
        },
      } satisfies Lite.Extension
      const scope = createScope({ extensions: [observer, failing] })

      expect(() => scope.createContext()).toThrow("init failed")
      await Promise.resolve()
      expect(events).toEqual(["first:init", "first:dispose:false"])
      await scope.dispose()
    })

    it("closes exec child contexts when initContext throws mid-chain", async () => {
      const events: string[] = []
      const observer = {
        name: "observer",
        initContext: (ctx) => {
          events.push(`init:${ctx.parent ? "child" : "root"}`)
        },
        disposeContext: (ctx) => {
          events.push(`dispose:${ctx.parent ? "child" : "root"}`)
        },
      } satisfies Lite.Extension
      const failing = {
        name: "failing",
        initContext: (ctx) => {
          if (ctx.parent) throw new Error("child init failed")
        },
      } satisfies Lite.Extension
      const child = flow({ name: "child", factory: () => "unreachable" })
      const scope = createScope({ extensions: [observer, failing] })

      await expect(scope.run({ flow: child })).rejects.toThrow("child init failed")
      expect(events).toEqual(["init:root", "init:child", "dispose:child", "dispose:root"])
      await scope.dispose()
    })

    it("joins async rollback disposal into the parent close before exec rejection settles", async () => {
      const events: string[] = []
      const slow = {
        name: "slow",
        initContext: (ctx) => {
          events.push(`init:${ctx.parent ? "child" : "root"}`)
        },
        disposeContext: async (ctx) => {
          const label = ctx.parent ? "child" : "root"
          events.push(`dispose:${label}:start`)
          await new Promise((resolve) => setTimeout(resolve, 5))
          events.push(`dispose:${label}:end`)
        },
      } satisfies Lite.Extension
      const failing = {
        name: "failing",
        initContext: (ctx) => {
          if (ctx.parent) throw new Error("child init failed")
        },
      } satisfies Lite.Extension
      const child = flow({ name: "child", factory: () => "unreachable" })
      const scope = createScope({ extensions: [slow, failing] })

      await expect(scope.run({ flow: child })).rejects.toThrow("child init failed")
      expect(events).toEqual([
        "init:root",
        "init:child",
        "dispose:child:start",
        "dispose:child:end",
        "dispose:root:start",
        "dispose:root:end",
      ])
      await scope.dispose()
    })

    it("joins root rollback disposal into scope disposal before extension dispose", async () => {
      const events: string[] = []
      const slow = {
        name: "slow",
        disposeContext: async () => {
          events.push("context:start")
          await new Promise((resolve) => setTimeout(resolve, 5))
          events.push("context:end")
        },
        dispose: () => {
          events.push("scope")
        },
      } satisfies Lite.Extension
      const failing = {
        name: "failing",
        initContext: () => {
          throw new Error("root init failed")
        },
      } satisfies Lite.Extension
      const scope = createScope({ extensions: [slow, failing] })

      expect(() => scope.createContext()).toThrow("root init failed")
      await scope.dispose()
      expect(events).toEqual(["context:start", "context:end", "scope"])
    })

    it("rolls back a failed prepared context with exactly one disposal", async () => {
      const marker = tag<string>({ label: "prepared-marker" })
      let disposals = 0
      const observer = {
        name: "observer",
        disposeContext: (ctx) => {
          if (ctx.data.getTag(marker) === "prepared") disposals++
        },
      } satisfies Lite.Extension
      const failing = {
        name: "failing",
        initContext: (ctx) => {
          if (ctx.data.getTag(marker) === "prepared") throw new Error("prepared init failed")
        },
      } satisfies Lite.Extension
      const step = flow({ name: "step", factory: () => "ran" })
      const submit = flow({
        name: "submit",
        deps: { step: controller(step, { tags: [marker("prepared")] }) },
        factory: (_ctx, { step }) => {
          expect(() => step.prepare()).toThrow("prepared init failed")
          return "handled"
        },
      })
      const scope = createScope({ extensions: [observer, failing] })
      const ctx = scope.createContext()

      expect(await ctx.exec({ flow: submit })).toBe("handled")
      await ctx.close()
      expect(disposals).toBe(1)
      await scope.dispose()
    })

    it("rejects asynchronous initContext and swallows its late rejection", async () => {
      const ext = {
        name: "async-init",
        async initContext() {
          throw new Error("late rejection")
        },
      } satisfies Lite.Extension
      const scope = createScope({ extensions: [ext] })

      expect(() => scope.createContext()).toThrow('Extension "async-init" initContext must be synchronous')
      await new Promise((resolve) => setTimeout(resolve, 0))
      await scope.dispose()
    })

    it("settles a re-entrant scope disposal only after rollback disposal finishes", async () => {
      const events: string[] = []
      let disposal: Promise<void> | undefined
      const slow = {
        name: "slow",
        disposeContext: async () => {
          events.push("context:start")
          await new Promise((resolve) => setTimeout(resolve, 5))
          events.push("context:end")
        },
      } satisfies Lite.Extension
      const sabotage = {
        name: "sabotage",
        initContext: (ctx) => {
          disposal = ctx.scope.dispose()
          throw new Error("init failed")
        },
      } satisfies Lite.Extension
      const scope = createScope({ extensions: [slow, sabotage] })

      expect(() => scope.createContext()).toThrow("init failed")
      await disposal
      expect(events).toEqual(["context:start", "context:end"])
    })

    it("drains rollback disposal before a rejected scope disposal settles", async () => {
      const events: string[] = []
      let disposal: Promise<void> | undefined
      const slow = {
        name: "slow",
        disposeContext: async () => {
          events.push("context:start")
          await new Promise((resolve) => setTimeout(resolve, 5))
          events.push("context:end")
        },
        dispose: () => {
          throw new Error("scope dispose failed")
        },
      } satisfies Lite.Extension
      const sabotage = {
        name: "sabotage",
        initContext: (ctx) => {
          disposal = ctx.scope.dispose()
          throw new Error("init failed")
        },
      } satisfies Lite.Extension
      const scope = createScope({ extensions: [slow, sabotage] })

      expect(() => scope.createContext()).toThrow("init failed")
      await expect(disposal).rejects.toThrow("scope dispose failed")
      expect(events).toEqual(["context:start", "context:end"])
    })

    it("fires disposeContext exactly once across repeated close calls", async () => {
      let count = 0
      const ext = {
        name: "once",
        disposeContext: () => {
          count++
        },
      } satisfies Lite.Extension
      const scope = createScope({ extensions: [ext] })
      const ctx = scope.createContext()

      await Promise.all([ctx.close(), ctx.close()])
      await ctx.close()
      expect(count).toBe(1)
      await scope.dispose()
    })

    it("runs disposeContext before context-owned resource teardown", async () => {
      const events: string[] = []
      const tracked = resource({
        factory: (ctx) => {
          ctx.cleanup(() => {
            events.push("resource")
          })
          return "ready"
        },
      })
      const ext = {
        name: "order",
        disposeContext: () => {
          events.push("dispose")
        },
      } satisfies Lite.Extension
      const scope = createScope({ extensions: [ext] })
      const ctx = scope.createContext()

      expect(await ctx.resolve(tracked)).toBe("ready")
      await ctx.close()
      expect(events).toEqual(["dispose", "resource"])
      await scope.dispose()
    })

    it("notifies inline function child contexts", async () => {
      const events: string[] = []
      const ext = {
        name: "inline-observer",
        initContext: (ctx) => {
          events.push(`init:${ctx.name ?? "root"}`)
        },
        disposeContext: (ctx) => {
          events.push(`dispose:${ctx.name ?? "root"}`)
        },
      } satisfies Lite.Extension
      const scope = createScope({ extensions: [ext] })
      const ctx = scope.createContext()

      expect(await ctx.exec({ name: "inline-step", params: [2], fn: (value: number) => value * 2 })).toBe(4)
      await ctx.close()
      expect(events).toEqual(["init:root", "init:inline-step", "dispose:inline-step", "dispose:root"])
      await scope.dispose()
    })

    it("passes aborted outcomes to disposeContext when a stream is abandoned", async () => {
      const outcomes: Lite.CloseResult[] = []
      const ext = {
        name: "abort-observer",
        disposeContext: (_ctx, result) => {
          outcomes.push(result)
        },
      } satisfies Lite.Extension
      const ticker = flow({
        name: "ticker",
        factory: async function* () {
          yield 1
          yield 2
          return "done"
        },
      })
      const scope = createScope({ extensions: [ext] })

      for await (const value of scope.runStream({ flow: ticker })) {
        expect(value).toBe(1)
        break
      }
      expect(outcomes.length).toBeGreaterThan(0)
      expect(outcomes.every((outcome) => outcome.ok === false)).toBe(true)
      expect(outcomes.some((outcome) => !outcome.ok && outcome.aborted === true)).toBe(true)
      await scope.dispose()
    })

    it("notifies prepared flow contexts through their isolated lifetime", async () => {
      const events: string[] = []
      const ext = {
        name: "prepared-observer",
        initContext: (ctx) => {
          events.push(`init:${ctx.name ?? "anon"}`)
        },
        disposeContext: (ctx) => {
          events.push(`dispose:${ctx.name ?? "anon"}`)
        },
      } satisfies Lite.Extension
      const step = flow({ name: "step", factory: () => "ran" })
      const submit = flow({
        name: "submit",
        deps: { step: controller(step, { name: "step-run" }) },
        factory: async (_ctx, { step }) => {
          const prepared = step.prepare()
          await prepared.ready
          return prepared.exec()
        },
      })
      const scope = createScope({ extensions: [ext] })
      const ctx = scope.createContext()

      expect(await ctx.exec({ flow: submit, name: "submit-step" })).toBe("ran")
      expect(events).toEqual([
        "init:anon",
        "init:submit-step",
        "init:submit-step",
        "init:step-run",
        "dispose:step-run",
        "dispose:submit-step",
        "dispose:submit-step",
      ])

      await ctx.close()
      expect(events).toContain("dispose:anon")
      await scope.dispose()
    })
  })

  describe("ctx.exec() inline operations", () => {
    it("executes an inline operation with explicit params and no dependency map", async () => {
      const scope = createScope()
      const ctx = scope.createContext()

      const result = await ctx.exec({
        name: "add",
        fn: (a: number, b: number) => a + b,
        params: [1, 2],
      })

      expect(result).toBe(3)
      await ctx.close()
    })

    it("resolves exec tags through declared deps", async () => {
      const marker = tag<string>({ label: "fn-exec-marker" })
      const scope = createScope()
      const ctx = scope.createContext()

      const result = await ctx.exec({
        name: "read-marker",
        deps: { marker: tags.required(marker) },
        fn: ({ marker }) => marker,
        params: [],
        tags: [marker("fn")],
      })

      expect(result).toBe("fn")
      await ctx.close()
    })
  })

  describe("ctx.onClose()", () => {
    it("runs cleanup on close in LIFO order", async () => {
      const scope = createScope()
      const ctx = scope.createContext()
      let cleaned = false
      ctx.onClose(() => { cleaned = true })
      expect(cleaned).toBe(false)
      await ctx.close()
      expect(cleaned).toBe(true)

      const ctx2 = scope.createContext()
      const order: number[] = []
      ctx2.onClose(() => { order.push(1) })
      ctx2.onClose(() => { order.push(2) })
      ctx2.onClose(() => { order.push(3) })
      await ctx2.close()
      expect(order).toEqual([3, 2, 1])
    })

    it("can unregister close callbacks before close", async () => {
      const scope = createScope()
      const ctx = scope.createContext()
      const closed: string[] = []

      const offFirst = ctx.onClose(() => {
        closed.push("first")
      })
      ctx.onClose(() => {
        closed.push("second")
      })

      offFirst()
      await ctx.close()

      expect(closed).toEqual(["second"])
      await scope.dispose()
    })

    it("passes inferred close dependencies", async () => {
      const scope = createScope()
      const ctx = scope.createContext()
      const events: string[] = []

      ctx.onClose((result, target, value) => {
        expect(result).toEqual({ ok: true })
        target.push(value)
      }, events, "closed")

      await ctx.close()
      expect(events).toEqual(["closed"])
      await scope.dispose()
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

      let sawResolving = false
      ctrl.on('resolving', () => { sawResolving = true })

      shouldFail = false
      ctrl.invalidate()
      await scope.flush()
      expect(sawResolving).toBe(true)
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
    it("replaces value without factory, throws when idle, queues when resolving", async () => {
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

      const idleAtom = atom({ factory: () => ({ name: "Guest" }) })
      expect(() => scope.controller(idleAtom).set({ name: "Alice" })).toThrow("Atom not resolved")

      let resolveFactory: () => void
      const queueAtom = atom({
        factory: () => new Promise<{ name: string }>((r) => { resolveFactory = () => r({ name: "Guest" }) }),
      })
      const qCtrl = scope.controller(queueAtom)
      const resolvePromise = qCtrl.resolve()
      await Promise.resolve()
      qCtrl.set({ name: "Alice" })
      resolveFactory!()
      await resolvePromise
      await scope.flush()
      expect(qCtrl.get()).toEqual({ name: "Alice" })
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
    it("infers declared listener parameters", async () => {
      const scope = createScope()
      const value = atom({ factory: () => 1 })
      const ctrl = scope.controller(value)
      const events: string[] = []

      ctrl.on("resolved", (target, event) => target.push(event), events, "resolved")
      await ctrl.resolve()

      expect(events).toEqual(["resolved"])
      await scope.dispose()
    })

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

    it("unsubscribe, state filters, and failed notifications", async () => {
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

      const calls: string[] = []
      const filterAtom = atom({ factory: () => 'value' })
      const ctl = scope.controller(filterAtom)
      ctl.on('resolving', () => calls.push('resolving'))
      ctl.on('resolved', () => calls.push('resolved'))
      ctl.on('*', () => calls.push('*'))
      await ctl.resolve()
      expect(calls).toEqual(['resolving', '*', 'resolved', '*'])

      const failCalls: string[] = []
      const failingAtom = atom({ factory: () => { throw new Error("intentional failure") } })
      const fCtl = scope.controller(failingAtom)
      fCtl.on('resolving', () => failCalls.push('resolving'))
      fCtl.on('resolved', () => failCalls.push('resolved'))
      fCtl.on('*', () => failCalls.push('*'))
      await expect(fCtl.resolve()).rejects.toThrow("intentional failure")
      expect(failCalls).toEqual(['resolving', '*', '*'])
    })
  })

  describe("scope.on()", () => {
    it("infers declared listener parameters", async () => {
      const scope = createScope()
      const value = atom({ factory: () => 1 })
      const events: string[] = []

      scope.on("resolved", value, (target, event) => target.push(event), events, "resolved")
      await scope.resolve(value)

      expect(events).toEqual(["resolved"])
      await scope.dispose()
    })

    it("fires state transitions, failed events, and supports unsubscribe", async () => {
      const scope = createScope()
      const events: string[] = []
      const asyncAtom = atom({
        factory: async () => {
          await new Promise(r => setTimeout(r, 10))
          return 42
        }
      })
      scope.on('resolving', asyncAtom, () => events.push('resolving'))
      scope.on('resolved', asyncAtom, () => events.push('resolved'))
      await scope.resolve(asyncAtom)
      expect(events).toEqual(['resolving', 'resolved'])

      let failedCalled = false
      const failAtom = atom({ factory: () => { throw new Error("oops") } })
      scope.on('failed', failAtom, () => { failedCalled = true })
      await expect(scope.resolve(failAtom)).rejects.toThrow("oops")
      expect(failedCalled).toBe(true)

      let count = 0
      const countAtom = atom({ factory: () => count++ })
      const unsub = scope.on('resolved', countAtom, () => count += 10)
      await scope.resolve(countAtom)
      expect(count).toBe(11)
      unsub()
      await scope.release(countAtom)
      await scope.resolve(countAtom)
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
    it("parses input, throws ParseError with labels, and supports async parse", async () => {
      const scope = createScope()
      const ctx = scope.createContext()
      const { ParseError } = await import("../src/types")

      const parseOrder: string[] = []
      const syncFlow = flow({
        parse: (raw: unknown): string => {
          parseOrder.push("parse")
          if (typeof raw !== "string") throw new Error("Must be string")
          return raw.toUpperCase()
        },
        factory: (ctx) => { parseOrder.push("factory"); return ctx.input as string },
      })
      expect(await ctx.exec({ flow: syncFlow as unknown as Lite.Flow<string, unknown>, input: "hello" })).toBe("HELLO")
      expect(parseOrder).toEqual(["parse", "factory"])

      const makeBadParse = (name?: string) => flow({
        ...(name ? { name } : {}),
        parse: (raw: unknown): string => {
          if (typeof raw !== "string") throw new Error("Must be string")
          return raw
        },
        factory: (ctx) => ctx.input as string,
      })
      try { await ctx.exec({ flow: makeBadParse("stringFlow") as unknown as Lite.Flow<string, unknown>, input: 123 }); expect.fail("Should have thrown") } catch (err) { expect(err).toBeInstanceOf(ParseError); expect((err as InstanceType<typeof ParseError>).label).toBe("stringFlow") }
      try { await ctx.exec({ flow: makeBadParse("flowName") as unknown as Lite.Flow<string, unknown>, input: 123, name: "execName" }); expect.fail("Should have thrown") } catch (err) { expect((err as InstanceType<typeof ParseError>).label).toBe("execName") }
      try { await ctx.exec({ flow: makeBadParse() as unknown as Lite.Flow<string, unknown>, input: 123 }); expect.fail("Should have thrown") } catch (err) { expect((err as InstanceType<typeof ParseError>).label).toBe("anonymous") }

      const asyncFlow = flow({
        parse: async (raw: unknown): Promise<string> => {
          await new Promise((r) => setTimeout(r, 1))
          if (typeof raw !== "string") throw new Error("Must be string")
          return raw.toUpperCase()
        },
        factory: (ctx) => ctx.input as string,
      })
      expect(await ctx.exec({ flow: asyncFlow as unknown as Lite.Flow<string, unknown>, input: "hello" })).toBe("HELLO")
      await ctx.close()
    })

    it("rawInput: passes to parse, works without parse, and throws ParseError on failure", async () => {
      const scope = createScope()
      const ctx = scope.createContext()
      const { ParseError } = await import("../src/types")

      const rawParseFlow = flow({
        name: "parseFlow",
        parse: (raw: unknown): { name: string } => {
          const obj = raw as Record<string, unknown>
          if (typeof obj["name"] !== "string") throw new Error("name required")
          return { name: obj["name"] }
        },
        factory: (ctx) => ctx.input.name.toUpperCase(),
      })
      expect(await ctx.exec({ flow: rawParseFlow as unknown as Lite.Flow<string, unknown>, rawInput: { name: "alice" } })).toBe("ALICE")

      const passThrough = flow({ factory: (ctx) => ctx.input })
      expect(await ctx.exec({ flow: passThrough as unknown as Lite.Flow<unknown, unknown>, rawInput: { data: 123 } })).toEqual({ data: 123 })

      const strictFlow = flow({
        name: "strictFlow",
        parse: (raw: unknown): string => { if (typeof raw !== "string") throw new Error("Must be string"); return raw },
        factory: (ctx) => ctx.input,
      })
      try { await ctx.exec({ flow: strictFlow as unknown as Lite.Flow<string, unknown>, rawInput: 123 }); expect.fail("Should have thrown") } catch (err) { expect(err).toBeInstanceOf(ParseError); expect((err as InstanceType<typeof ParseError>).label).toBe("strictFlow") }
      await ctx.close()
    })

    it("composes flows through execution deps", async () => {
      const requestId = tag<string>({ label: "request-id" })
      const calls: string[] = []

      const writeAuditEntry = flow({
        name: "write-audit-entry",
        parse: typed<{ txId: string }>(),
        deps: { requestId: tags.required(requestId) },
        factory: (ctx, { requestId }) => {
          calls.push(`${ctx.name}:${requestId}:${ctx.input.txId}`)
          return `${requestId}:${ctx.input.txId}`
        },
      })

      const replacement = flow({
        name: "replacement-audit-entry",
        parse: typed<{ txId: string }>(),
        deps: { requestId: tags.required(requestId) },
        factory: (ctx, { requestId }) => {
          calls.push(`${ctx.name}:${requestId}:${ctx.input.txId}:replacement`)
          return `${requestId}:${ctx.input.txId}:replacement`
        },
      })

      const transferFunds = flow({
        name: "transfer-funds",
        parse: typed<{ txId: string }>(),
        deps: {
          writeAuditEntry: controller(writeAuditEntry, { name: "audit-step" }),
        },
        factory: async (ctx, { writeAuditEntry }) => {
          const result = await writeAuditEntry.exec({
            input: { txId: ctx.input.txId },
          })
          return `transfer:${result}`
        },
      })

      const scope = createScope({
        presets: [preset(writeAuditEntry, replacement)],
      })
      const ctx = scope.createContext({
        tags: [requestId("req-1")],
      })

      await expect(ctx.exec({ flow: transferFunds, input: { txId: "tx-1" } })).resolves.toBe("transfer:req-1:tx-1:replacement")
      expect(calls).toEqual(["audit-step:req-1:tx-1:replacement"])

      await ctx.close()
    })

    it("supports prepared raw and tagged flow handles without making extensions special-case them", async () => {
      const marker = tag<string>({ label: "marker" })
      const events: string[] = []
      const ext = {
        name: "flow-handle-ext",
        wrapExec: async (next: () => Promise<unknown>, _target: Lite.ExecTarget, ctx: Lite.ExecutionContext) => {
          events.push(`${ctx.parent?.name ?? "root"}>${ctx.name}:${ctx.data.seekTag(marker)}`)
          return next()
        },
      } satisfies Lite.Extension

      const normalize = flow({
        name: "normalize",
        parse: (raw: unknown): { name: string } => {
          const record = raw as Record<string, unknown>
          if (typeof record["name"] !== "string") throw new Error("name required")
          return { name: record["name"].toUpperCase() }
        },
        factory: (ctx) => ctx.input.name,
      })

      const submit = flow({
        name: "submit",
        deps: {
          normalize: controller(normalize, {
            key: "normalize:ada",
            name: "normalize-step",
            tags: [marker("child")],
          }),
        },
        factory: async (_ctx, { normalize }) => {
          const step = normalize.prepare({
            rawInput: { name: "ada" },
          })
          const beforeReady = [...events]
          await step.ready
          const afterReady = [...events]
          const result = await step.exec()
          return { afterReady, beforeReady, key: step.key, result }
        },
      })

      const scope = createScope({ extensions: [ext] })
      const ctx = scope.createContext({ tags: [marker("root")] })

      await expect(ctx.exec({ flow: submit, name: "submit-step" })).resolves.toEqual({
        afterReady: ["root>submit-step:root"],
        beforeReady: ["root>submit-step:root"],
        key: "normalize:ada",
        result: "ADA",
      })
      expect(events).toEqual(["root>submit-step:root", "submit-step>normalize-step:child"])

      await ctx.close()
      await scope.dispose()
    })

    it("keeps an abandoned failing prepare from leaking an unhandled rejection", async () => {
      const bad = atom({
        factory: () => {
          throw new Error("dep boom")
        },
      })
      const step = flow({ name: "step", deps: { bad }, factory: () => "ran" })
      const submit = flow({
        name: "submit",
        deps: { step: controller(step) },
        factory: (_ctx, { step }) => {
          step.prepare()
          return "abandoned"
        },
      })
      const scope = createScope()
      const ctx = scope.createContext()

      expect(await ctx.exec({ flow: submit })).toBe("abandoned")
      await new Promise((resolve) => setTimeout(resolve, 0))
      await ctx.close()
      await scope.dispose()
    })
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

describe("Coverage: edge cases and error paths", () => {
  it("controller.release(), set/update guards, update queuing, fn error, pending invalidate on error", async () => {
    const scope = createScope()

    let factoryCount = 0
    const relAtom = atom({ factory: () => ++factoryCount })
    const ctrl0 = await scope.controller(relAtom, { resolve: true })
    expect(ctrl0.get()).toBe(1)
    await ctrl0.release()
    expect(await scope.resolve(relAtom)).toBe(2)

    const err = new Error("boom")
    const failingAtom = atom({ factory: (): string => { throw err } })
    try { await scope.resolve(failingAtom) } catch {}
    const failedCtrl = scope.controller(failingAtom)
    expect(() => failedCtrl.set("new")).toThrow(err)
    expect(() => failedCtrl.update(() => "new")).toThrow(err)

    const idleAtom = atom({ factory: () => 42 })
    const idleCtrl = scope.controller(idleAtom)
    expect(() => idleCtrl.update((v) => v + 1)).toThrow("Atom not resolved")

    let resolve!: (v: number) => void
    const queueAtom = atom({
      factory: () => new Promise<number>(r => { resolve = r }),
    })
    const resolvePromise = scope.resolve(queueAtom)
    await Promise.resolve()
    const qCtrl = scope.controller(queueAtom)
    qCtrl.update((prev) => (prev ?? 0) + 10)
    resolve(5)
    await resolvePromise
    await scope.flush()
    expect(qCtrl.get()).toBe(15)

    const ctx = scope.createContext()
    await expect(
      ctx.exec({ name: "fail", fn: () => { throw new Error("fn-error") }, params: [] })
    ).rejects.toThrow("fn-error")

    let callCount = 0
    const pendAtom = atom({
      factory: (ctx: any) => {
        callCount++
        if (callCount === 2) {
          ctx.invalidate()
          throw new Error("fail-then-retry")
        }
        return callCount
      },
    })
    await scope.resolve(pendAtom)
    scope.controller(pendAtom).invalidate()
    try { await scope.flush() } catch {}
    expect(scope.controller(pendAtom).state).toBe("failed")
  })

  it("tag defaults, resolving get() throws, ContextData.delete, release non-existent, idle invalidate", async () => {
    const scope = createScope()

    const myTag = tag<number>({ label: "defaultReq", default: 99 })
    const tagAtom = atom({
      deps: { val: tags.required(myTag) },
      factory: (ctx: any, { val }: { val: number }) => val,
    })
    expect(await scope.resolve(tagAtom)).toBe(99)

    let resolveFactory!: () => void
    const asyncAtom = atom({
      factory: () => new Promise<string>(r => { resolveFactory = () => r("done") }),
    })
    const promise = scope.resolve(asyncAtom)
    await Promise.resolve()
    expect(() => scope.controller(asyncAtom).get()).toThrow("Atom not resolved")
    resolveFactory()
    await promise

    const delAtom = atom({
      factory: (ctx) => {
        ctx.data.set("k", "v")
        ctx.data.delete("k")
        return ctx.data.has("k")
      },
    })
    expect(await scope.resolve(delAtom)).toBe(false)

    const nonExistent = atom({ factory: () => 42 })
    await scope.release(nonExistent)
    expect(await scope.resolve(nonExistent)).toBe(42)

    const idleAtom2 = atom({ factory: () => 42 })
    const idleCtrl2 = scope.controller(idleAtom2)
    idleCtrl2.on("resolved", () => {})
    idleCtrl2.invalidate()
    expect(idleCtrl2.state).toBe("idle")
  })

  it("flow tags, tag deps in flow context, resource cache, invalidation-then-release, non-Error throw, tags.all, circular resource", async () => {
    const scope = createScope()

    const flowTag = tag<string>({ label: "flowApply" })
    const tagFlow = flow({
      tags: [flowTag("from-flow")],
      factory: (ctx) => ctx.data.getTag(flowTag),
    })
    const ctx1 = scope.createContext()
    expect(await ctx1.exec({ flow: tagFlow })).toBe("from-flow")
    await ctx1.close()

    const reqTag = tag<number>({ label: "ctxReqDef", default: 42 })
    const reqFlow = flow({
      deps: { val: tags.required(reqTag) },
      factory: (_ctx, { val }) => val,
    })
    const ctx2 = scope.createContext()
    expect(await ctx2.exec({ flow: reqFlow })).toBe(42)
    await ctx2.close()

    const optTag = tag<number>({ label: "ctxOptDef", default: 7 })
    const optFlow = flow({
      deps: { val: tags.optional(optTag) },
      factory: (_ctx, { val }) => val,
    })
    const ctx3 = scope.createContext()
    expect(await ctx3.exec({ flow: optFlow })).toBe(7)
    await ctx3.close()

    let rCount = 0
    const r = resource({ factory: () => ++rCount })
    const cacheFlow = flow({
      deps: { a: r, b: r },
      factory: (_ctx, { a, b }) => [a, b],
    })
    const ctx4 = scope.createContext()
    expect(await ctx4.exec({ flow: cacheFlow })).toEqual([1, 1])
    expect(rCount).toBe(1)
    await ctx4.close()

    let relCount = 0
    const relAtom = atom({ factory: () => ++relCount })
    const relCtrl = await scope.controller(relAtom, { resolve: true })
    relCtrl.invalidate()
    await scope.release(relAtom)
    await scope.flush()
    expect(relCtrl.state).toBe("idle")

    const strAtom = atom({ factory: () => { throw "string-error" } })
    await expect(scope.resolve(strAtom)).rejects.toThrow("string-error")

    const allTag = tag<string>({ label: "atomAll" })
    const scope2 = createScope({ tags: [allTag("scope-val")] })
    const allAtom = atom({
      deps: { vals: tags.all(allTag) },
      factory: (_ctx, { vals }) => vals,
    })
    expect(await scope2.resolve(allAtom)).toEqual(["scope-val"])

    const sym = Symbol.for("@pumped-fn/lite/resource")
    const rA: any = { [sym]: true, factory: () => "a" }
    const rB: any = { [sym]: true, deps: { a: rA }, factory: () => "b" }
    rA.deps = { b: rB }
    const circFlow = flow({
      deps: { a: rA },
      factory: (_ctx, { a }) => a,
    })
    const ctx5 = scope.createContext()
    await expect(ctx5.exec({ flow: circFlow })).rejects.toThrow("Circular resource dependency detected: anonymous")
    await ctx5.close()
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

  it("Fix 6: atom with tags — tag.atoms() returns the atom", () => {
    const myTag = tag<string>({ label: "svc-tag" })
    const svcAtom = atom({
      tags: [myTag("svc-value")],
      factory: () => ({
        greet: async (name: string) => `hello ${name}`,
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

describe("scope.select()", () => {
  describe("basic functionality", () => {
    it("returns SelectHandle with get()", async () => {
      const scope = createScope()
      const todosAtom = atom({
        factory: () => [
          { id: "1", text: "Learn TypeScript" },
          { id: "2", text: "Build app" },
        ],
      })

      await scope.resolve(todosAtom)

      const handle = scope.select(
        todosAtom,
        (todos) => todos.find(t => t.id === "1")
      )

      expect(handle).toBeDefined()
      expect(handle.get).toBeTypeOf("function")
      expect(handle.subscribe).toBeTypeOf("function")
      expect(handle.get()).toEqual({ id: "1", text: "Learn TypeScript" })
    })

    it("throws if atom not resolved", async () => {
      const scope = createScope()
      const todosAtom = atom({ factory: () => [{ id: "1", text: "Test" }] })

      expect(() => {
        scope.select(todosAtom, (todos) => todos[0])
      }).toThrow("Cannot select from unresolved atom")
    })

    it("infers declared subscriber parameters", async () => {
      const scope = createScope()
      const value = atom({ factory: () => 1 })
      await scope.resolve(value)
      const handle = scope.select(value, (current) => current)
      const events: string[] = []

      handle.subscribe((target, event) => target.push(event), events, "changed")
      scope.controller(value).set(2)

      expect(events).toEqual(["changed"])
      await scope.dispose()
    })
  })

  describe("equality", () => {
    it("uses reference equality by default", async () => {
      const scope = createScope()
      const obj1 = { id: "1" }
      const obj2 = { id: "1" }
      let resolveCount = 0
      const dataAtom = atom({
        factory: () => {
          resolveCount++
          return resolveCount === 1 ? obj1 : obj2
        },
      })

      await scope.resolve(dataAtom)
      const handle = scope.select(dataAtom, (data) => data)

      let notifyCount = 0
      handle.subscribe(() => notifyCount++)

      const ctrl = scope.controller(dataAtom)
      ctrl.invalidate()
      await new Promise(r => setTimeout(r, 50))

      expect(notifyCount).toBe(1)
    })

    it("does not notify when reference is same", async () => {
      const scope = createScope()
      const sharedObj = { id: "1" }
      const dataAtom = atom({ factory: () => sharedObj })

      await scope.resolve(dataAtom)
      const handle = scope.select(dataAtom, (data) => data)

      let notifyCount = 0
      handle.subscribe(() => notifyCount++)

      const ctrl = scope.controller(dataAtom)
      ctrl.invalidate()
      await new Promise(r => setTimeout(r, 50))

      expect(notifyCount).toBe(0)
    })

    it("uses custom eq function", async () => {
      const scope = createScope()
      let version = 1
      const dataAtom = atom({
        factory: () => ({ id: "1", version: version++ }),
      })

      await scope.resolve(dataAtom)
      const handle = scope.select(
        dataAtom,
        (data) => data,
        { eq: (a, b) => a.id === b.id }
      )

      let notifyCount = 0
      handle.subscribe(() => notifyCount++)

      const ctrl = scope.controller(dataAtom)
      ctrl.invalidate()
      await new Promise(r => setTimeout(r, 50))

      expect(notifyCount).toBe(0)
    })

    it("notifies when custom eq returns false", async () => {
      const scope = createScope()
      let id = 1
      const dataAtom = atom({
        factory: () => ({ id: String(id++) }),
      })

      await scope.resolve(dataAtom)
      const handle = scope.select(
        dataAtom,
        (data) => data,
        { eq: (a, b) => a.id === b.id }
      )

      let notifyCount = 0
      handle.subscribe(() => notifyCount++)

      const ctrl = scope.controller(dataAtom)
      ctrl.invalidate()
      await new Promise(r => setTimeout(r, 50))

      expect(notifyCount).toBe(1)
      expect(handle.get().id).toBe("2")
    })
  })

  describe("subscription", () => {
    it("supports multiple subscribers", async () => {
      const scope = createScope()
      let value = 1
      const numAtom = atom({ factory: () => value++ })

      await scope.resolve(numAtom)
      const handle = scope.select(numAtom, (n) => n)

      let count1 = 0
      let count2 = 0
      handle.subscribe(() => count1++)
      handle.subscribe(() => count2++)

      scope.controller(numAtom).invalidate()
      await new Promise(r => setTimeout(r, 50))

      expect(count1).toBe(1)
      expect(count2).toBe(1)
    })

    it("unsubscribe removes specific listener", async () => {
      const scope = createScope()
      let value = 1
      const numAtom = atom({ factory: () => value++ })

      await scope.resolve(numAtom)
      const handle = scope.select(numAtom, (n) => n)

      let count1 = 0
      let count2 = 0
      const unsub1 = handle.subscribe(() => count1++)
      handle.subscribe(() => count2++)

      unsub1()

      scope.controller(numAtom).invalidate()
      await new Promise(r => setTimeout(r, 50))

      expect(count1).toBe(0)
      expect(count2).toBe(1)
    })

    it("auto-cleans when last subscriber unsubscribes", async () => {
      const scope = createScope()
      let value = 1
      const numAtom = atom({ factory: () => value++ })

      await scope.resolve(numAtom)
      const handle = scope.select(numAtom, (n) => n)

      const unsub1 = handle.subscribe(() => {})
      const unsub2 = handle.subscribe(() => {})

      unsub1()
      unsub2()

      scope.controller(numAtom).invalidate()
      await new Promise(r => setTimeout(r, 50))

      expect(handle.get()).toBe(1)
    })
  })

  describe("selector execution", () => {
    it("only runs selector when atom is resolved", async () => {
      const scope = createScope()
      let selectorCalls = 0
      const asyncAtom = atom({
        factory: async () => {
          await new Promise(r => setTimeout(r, 30))
          return 42
        },
      })

      await scope.resolve(asyncAtom)
      const handle = scope.select(asyncAtom, (n) => {
        selectorCalls++
        return n * 2
      })

      expect(selectorCalls).toBe(1)
      expect(handle.get()).toBe(84)

      handle.subscribe(() => {})

      scope.controller(asyncAtom).invalidate()

      await new Promise(r => setTimeout(r, 10))
      const callsDuringResolving = selectorCalls

      await new Promise(r => setTimeout(r, 50))
      const callsAfterResolved = selectorCalls

      expect(callsDuringResolving).toBe(1)
      expect(callsAfterResolved).toBe(2)
    })
  })

  describe("multiple selects", () => {
    it("multiple selects on same atom work independently", async () => {
      const scope = createScope()
      let count = 0
      const dataAtom = atom({
        factory: () => ({ a: count++, b: count++ }),
      })

      await scope.resolve(dataAtom)

      const handleA = scope.select(dataAtom, (d) => d.a)
      const handleB = scope.select(dataAtom, (d) => d.b)

      expect(handleA.get()).toBe(0)
      expect(handleB.get()).toBe(1)

      let notifyA = 0
      let notifyB = 0
      handleA.subscribe(() => notifyA++)
      handleB.subscribe(() => notifyB++)

      scope.controller(dataAtom).invalidate()
      await new Promise(r => setTimeout(r, 50))

      expect(notifyA).toBe(1)
      expect(notifyB).toBe(1)
      expect(handleA.get()).toBe(2)
      expect(handleB.get()).toBe(3)
    })
  })

  describe("TodoItem use case", () => {
    it("only notifies when specific todo changes", async () => {
      interface Todo {
        id: string
        text: string
        updatedAt: number
      }

      const scope = createScope()
      let todos: Todo[] = [
        { id: "1", text: "Learn", updatedAt: 100 },
        { id: "2", text: "Build", updatedAt: 200 },
        { id: "3", text: "Ship", updatedAt: 300 },
      ]

      const todosAtom = atom({ factory: () => [...todos] })
      await scope.resolve(todosAtom)

      const handle1 = scope.select(
        todosAtom,
        (t) => t.find(x => x.id === "1"),
        { eq: (a, b) => a?.updatedAt === b?.updatedAt }
      )

      const handle2 = scope.select(
        todosAtom,
        (t) => t.find(x => x.id === "2"),
        { eq: (a, b) => a?.updatedAt === b?.updatedAt }
      )

      let notify1 = 0
      let notify2 = 0
      handle1.subscribe(() => notify1++)
      handle2.subscribe(() => notify2++)

      todos = [
        { id: "1", text: "Learn", updatedAt: 100 },
        { id: "2", text: "Build MORE", updatedAt: 201 },
        { id: "3", text: "Ship", updatedAt: 300 },
      ]

      scope.controller(todosAtom).invalidate()
      await new Promise(r => setTimeout(r, 50))

      expect(notify1).toBe(0)
      expect(notify2).toBe(1)
      expect(handle2.get()?.text).toBe("Build MORE")
    })
  })

  describe("SelectHandle tracks changes without subscribers", () => {
    it("get() returns fresh value even without active subscribers", async () => {
      let value = 1
      const myAtom = atom({ factory: () => value })
      const scope = createScope()
      await scope.resolve(myAtom)

      const handle = scope.select(myAtom, (n) => n * 10)
      expect(handle.get()).toBe(10)

      value = 2
      scope.controller(myAtom).invalidate()
      await scope.flush()

      expect(handle.get()).toBe(20)
    })

    it("refreshes value on re-subscribe after auto-cleanup", async () => {
      let value = 1
      const myAtom = atom({ factory: () => value })
      const scope = createScope()
      await scope.resolve(myAtom)

      const handle = scope.select(myAtom, (n) => n * 10)
      const unsub = handle.subscribe(() => {})
      unsub()

      value = 2
      scope.controller(myAtom).invalidate()
      await scope.flush()

      const unsub2 = handle.subscribe(() => {})
      expect(handle.get()).toBe(20)
      unsub2()
    })

    it("does not notify on re-subscribe when the selected value stays equal", async () => {
      let value = { selected: 1, ignored: 0 }
      const myAtom = atom({ factory: () => value })
      const scope = createScope()
      await scope.resolve(myAtom)

      const handle = scope.select(myAtom, (state) => state.selected)
      const unsub = handle.subscribe(() => {})
      unsub()

      let notifyCount = 0
      const unsub2 = handle.subscribe(() => notifyCount++)
      value = { selected: 1, ignored: 1 }
      scope.controller(myAtom).invalidate()
      await scope.flush()

      expect(handle.get()).toBe(1)
      expect(notifyCount).toBe(0)
      unsub2()
    })

    it("notifies again after re-subscribing from a cleaned-up handle", async () => {
      let value = 1
      const myAtom = atom({ factory: () => value })
      const scope = createScope()
      await scope.resolve(myAtom)

      const handle = scope.select(myAtom, (n) => n)
      const unsub = handle.subscribe(() => {})
      unsub()

      let notifyCount = 0
      handle.subscribe(() => notifyCount++)

      value = 2
      scope.controller(myAtom).invalidate()
      await scope.flush()

      expect(handle.get()).toBe(2)
      expect(notifyCount).toBe(1)
    })
  })

  describe("SelectHandle dispose", () => {
    it("exposes a dispose method", async () => {
      const scope = createScope()
      const myAtom = atom({ factory: () => 42 })
      await scope.resolve(myAtom)

      const handle = scope.select(myAtom, (n) => n)
      expect(handle.dispose).toBeTypeOf("function")
    })

    it("dispose() cleans up internal subscription", async () => {
      let factoryCalls = 0
      const myAtom = atom({ factory: () => ++factoryCalls })
      const scope = createScope({ gc: { enabled: true, graceMs: 10 } })
      await scope.resolve(myAtom)

      const handle = scope.select(myAtom, (n) => n)
      handle.dispose()

      scope.controller(myAtom).invalidate()
      await scope.flush()

      expect(handle.get()).toBe(1)
    })
  })
})

describe("public helper coverage", () => {
  it("covers guards, presets, tag helpers, shallow equality, and controller read hooks", async () => {
    const parsedTag = tag<number>({
      label: "parsed-tag",
      parse: (raw: unknown) => {
        if (typeof raw !== "number") throw new Error("expected number")
        return raw * 2
      },
    })
    const defaultTag = tag<string>({ label: "default-tag", default: "fallback" })
    const registryTag = tag<string>({ label: "registry-tag" })
    const otherTag = tag<number>({ label: "other-tag" })
    const sampleResource = resource({ factory: () => 1 })
    const taggedAtom = atom({
      tags: [registryTag("core")],
      factory: () => ({ ok: true }),
    })
    const taggedAtom2 = atom({
      tags: [registryTag("extra")],
      factory: () => ({ ok: false }),
    })
    const taggedValue = parsedTag(2)
    const otherTagged = otherTag(7)
    const requiredExecutor = tags.required(parsedTag)

    expect(isTag(parsedTag)).toBe(true)
    expect(isTagged(taggedValue)).toBe(true)
    expect(isTagExecutor(requiredExecutor)).toBe(true)
    expect(isAtom(taggedAtom)).toBe(true)
    expect(isControllerDep(controller(taggedAtom))).toBe(true)
    expect(isResource(sampleResource)).toBe(true)
    expect(isResource({})).toBe(false)

    const typedFlow = flow({
      parse: typed<{ value: number }>(),
      factory: (ctx) => ctx.input.value,
    })
    expect(isFlow(typedFlow)).toBe(true)

    const atomPreset = preset(taggedAtom, { ok: false })
    expect(isPreset(atomPreset)).toBe(true)
    expect(() => preset({} as never, 1)).toThrow("preset target must be Atom, Flow, or Resource")
    expect(() => preset(taggedAtom, taggedAtom)).toThrow("preset cannot reference itself")

    expect(parsedTag.get([taggedValue])).toBe(4)
    expect(parsedTag.find([taggedValue])).toBe(4)
    expect(parsedTag.collect([taggedValue, parsedTag(3)])).toEqual([4, 6])
    expect(parsedTag.get({ tags: [otherTagged, taggedValue] } as never)).toBe(4)
    expect(parsedTag.get({ tags: [taggedValue] })).toBe(4)
    expect(parsedTag.find({ tags: [taggedValue] })).toBe(4)
    expect(parsedTag.find({ tags: [otherTagged] } as never)).toBeUndefined()
    expect(parsedTag.collect({ tags: [taggedValue, parsedTag(3)] })).toEqual([4, 6])
    expect(parsedTag.collect({ tags: [otherTagged, taggedValue] } as never)).toEqual([4])
    expect(defaultTag.get([])).toBe("fallback")
    expect(defaultTag.get({} as never)).toBe("fallback")
    expect(defaultTag.find([])).toBe("fallback")
    expect(defaultTag.find({})).toBe("fallback")
    expect(parsedTag.eq(4, 4)).toBe(true)
    expect(parsedTag.same(parsedTag(2), parsedTag(2))).toBe(true)
    expect(parsedTag.collect({})).toEqual([])
    expect(() => parsedTag.get([])).toThrow('Tag "parsed-tag" not found and has no default')
    expect(() => parsedTag("oops" as never)).toThrow(ParseError)
    expect(registryTag.atoms()).toEqual(expect.arrayContaining([taggedAtom, taggedAtom2]))
    expect(getAllTags()).toEqual(expect.arrayContaining([parsedTag, defaultTag, registryTag]))

    const identityTag = tag<{ id: string; version: number }>({
      label: "identity-tag",
      eq: (a, b) => a.id === b.id,
    })
    expect(identityTag.eq({ id: "a", version: 1 }, { id: "a", version: 2 })).toBe(true)
    expect(identityTag.same(
      identityTag({ id: "a", version: 1 }),
      identityTag({ id: "a", version: 2 })
    )).toBe(true)
    expect(identityTag.same(
      identityTag({ id: "a", version: 1 }),
      identityTag({ id: "b", version: 1 })
    )).toBe(false)
    expect(identityTag.same(identityTag({ id: "a", version: 1 }), taggedValue)).toBe(false)

    const referenceTag = tag<{ id: string }>({ label: "reference-tag" })
    expect(referenceTag.eq({ id: "a" }, { id: "a" })).toBe(false)
    expect(referenceTag.same(referenceTag({ id: "a" }), referenceTag({ id: "a" }))).toBe(false)

    expect(shallowEqual({ a: 1 }, { a: 1 })).toBe(true)
    expect(shallowEqual({ a: 1 }, { a: 2 })).toBe(false)
    expect(shallowEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false)
    expect(shallowEqual({ a: 1 }, { b: 1 } as { a?: number; b?: number })).toBe(false)
    expect(shallowEqual(Object.create(null, { a: { value: 1, enumerable: true } }), Object.create(null, { a: { value: 1, enumerable: true } }))).toBe(true)
    expect(shallowEqual(new Date(0), new Date(0))).toBe(false)
    expect(shallowEqual(null, {})).toBe(false)
    expect(shallowEqual("x", "x")).toBe(true)
    expect(tag<string>({ label: "unused-tag" }).atoms()).toEqual([])

    const scope = createScope()
    await scope.resolve(taggedAtom)
    const ctrl = scope.controller(taggedAtom)
    let readHookCtrl: unknown
    setControllerReadHook((value) => {
      readHookCtrl = value
    })
    try {
      expect(ctrl.get()).toEqual({ ok: true })
      expect(readHookCtrl).toBe(ctrl)
    } finally {
      setControllerReadHook(null)
    }

    expect(registryTag.atoms()).toEqual(expect.arrayContaining([taggedAtom, taggedAtom2]))
  })

  it("stacks controller read hooks and restores the previous hook", async () => {
    const trackedAtom = atom({ factory: () => 1 })
    const scope = createScope()
    await scope.resolve(trackedAtom)
    const ctrl = scope.controller(trackedAtom)
    const seen: string[] = []

    setControllerReadHook(() => {
      seen.push("base")
    })
    setControllerReadHook(() => {
      seen.push("nested")
    })

    try {
      expect(ctrl.get()).toBe(1)
      expect(seen).toEqual(["nested", "base"])

      seen.length = 0
      setControllerReadHook(null)

      expect(ctrl.get()).toBe(1)
      expect(seen).toEqual(["base"])
    } finally {
      setControllerReadHook(null)
    }
  })

  it("covers atom without tags and extension-driven scope execution branches", async () => {
    const plainService = atom({
      factory: () => ({
        greet: async (name: string) => `hi ${name}`,
      }),
    })
    expect(isAtom(plainService)).toBe(true)

    let initScope: Lite.Scope | undefined
    let releaseInit!: () => void
    const extensionEvents: string[] = []
    const ext = {
      name: "coverage-ext",
      init: async (scope: Lite.Scope) => {
        initScope = scope
        extensionEvents.push("init:start")
        await new Promise<void>((resolve) => {
          releaseInit = () => {
            extensionEvents.push("init:end")
            resolve()
          }
        })
      },
      dispose: async () => {
        extensionEvents.push("dispose")
      },
      wrapResolve: async (next: () => Promise<unknown>, event: Lite.ResolveEvent) => {
        extensionEvents.push(`resolve:${event.kind}`)
        return next()
      },
      wrapExec: async (
        next: () => Promise<unknown>,
        _target: Lite.ExecTarget,
        ctx: Lite.ExecutionContext
      ) => {
        extensionEvents.push(`exec:${ctx.name ?? "anonymous"}`)
        return next()
      },
    } satisfies Lite.Extension

    const depAtom = atom({ factory: () => 1 })
    const targetAtom = atom({
      deps: { dep: depAtom },
      factory: (_ctx, { dep }) => dep + 1,
    })
    const scope = createScope({ extensions: [ext] })
    const pendingResolve = scope.resolve(targetAtom)
    releaseInit()
    expect(await pendingResolve).toBe(2)
    expect(initScope).toBe(scope)
    expect(extensionEvents).toContain("resolve:atom")

    const cachedDepAtom = atom({
      deps: { dep: depAtom },
      factory: (_ctx, { dep }) => dep,
    })
    expect(await scope.resolve(cachedDepAtom)).toBe(1)

    const ctx = scope.createContext()
    const namedFlow = flow({
      name: "named-flow",
      deps: { dep: depAtom },
      factory: (childCtx, { dep }) => `${childCtx.name}:${dep}`,
    })
    expect(await ctx.exec({ flow: namedFlow })).toBe("named-flow:1")
    expect(await ctx.exec({
      name: "inline-exec",
      fn: (value: number) => value,
      params: [7],
    })).toBe(7)

    const replacementFlow = flow({
      name: "replacement-flow",
      factory: (childCtx) => childCtx.name,
    })
    const presetTargetFlow = flow({
      name: "target-flow",
      factory: () => "target",
    })
    const presetScope = createScope({
      extensions: [ext],
      presets: [preset(presetTargetFlow, replacementFlow)],
    })
    releaseInit()
    const presetCtx = presetScope.createContext()
    expect(await presetCtx.exec({ flow: presetTargetFlow })).toBe("replacement-flow")

    const presetFnScope = createScope({
      presets: [preset(presetTargetFlow, (childCtx) => childCtx.name)],
    })
    const presetFnCtx = presetFnScope.createContext()
    expect(await presetFnCtx.exec({ flow: presetTargetFlow, name: "preset-fn-exec" })).toBe("preset-fn-exec")
    await presetFnCtx.close()
    await presetFnCtx.close()
    await presetScope.dispose()

    const hierarchyTag = tag<string>({ label: "hierarchy-tag" })
    const nestedFlow = flow({
      deps: { values: tags.all(hierarchyTag) },
      factory: (_ctx, { values }) => values,
    })
    const outerFlow = flow({
      factory: async (outerCtx) => {
        outerCtx.data.setTag(hierarchyTag, "outer-data")
        return outerCtx.exec({ flow: nestedFlow, tags: [hierarchyTag("inner-exec")] })
      },
    })
    const hierarchyScope = createScope()
    const hierarchyCtx = hierarchyScope.createContext({
      tags: [hierarchyTag("root-context")],
    })
    expect(await hierarchyCtx.exec({ flow: outerFlow })).toEqual([
      "inner-exec",
      "outer-data",
      "root-context",
    ])

    const badResourceAtom = atom({
      deps: { value: resource({ factory: () => 1 }) as unknown as Lite.AtomDependency },
      factory: (_ctx, { value }) => value,
    })
    await expect(createScope().resolve(badResourceAtom)).rejects.toThrow("Resource deps require an ExecutionContext")

    const watchedFlow = flow({
      deps: {
        source: controller(depAtom, { resolve: true, watch: true }) as never,
      },
      factory: () => "never",
    })
    await expect(ctx.exec({ flow: watchedFlow })).rejects.toThrow("only supported in atom dependencies")

    await ctx.close()
    await hierarchyCtx.close()
    await hierarchyScope.dispose()
    await scope.dispose()
    expect(extensionEvents).toContain("dispose")
    expect(() => scope.controller(depAtom)).toThrow("Scope is disposed")
  })

  it("covers GC timer cleanup, resource inflight sharing, and resource/preset extension branches", async () => {
    const idleGcScope = createScope({ gc: { graceMs: 10 } })
    const idleGcAtom = atom({ factory: () => 1 })
    const idleUnsub = idleGcScope.controller(idleGcAtom).on("resolved", () => {})
    idleUnsub()
    await new Promise(r => setTimeout(r, 20))
    expect(idleGcScope.controller(idleGcAtom).state).toBe("idle")

    const releaseGcScope = createScope({ gc: { graceMs: 20 } })
    const releaseGcAtom = atom({ factory: () => 1 })
    const releaseCtrl = await releaseGcScope.controller(releaseGcAtom, { resolve: true })
    const releaseSub = releaseCtrl.on("resolved", () => {})
    releaseSub()
    await Promise.resolve()
    await releaseGcScope.release(releaseGcAtom)
    await new Promise(r => setTimeout(r, 30))
    expect(releaseCtrl.state).toBe("idle")

    const dependentGcScope = createScope({ gc: { graceMs: 20 } })
    const depAtom = atom({ factory: () => 2 })
    const dependentCtrl = await dependentGcScope.controller(depAtom, { resolve: true })
    const depSub = dependentCtrl.on("resolved", () => {})
    depSub()
    await Promise.resolve()
    const holdingAtom = atom({
      deps: { dep: depAtom },
      factory: (_ctx, { dep }) => dep,
    })
    expect(await dependentGcScope.resolve(holdingAtom)).toBe(2)
    await new Promise(r => setTimeout(r, 30))
    expect(dependentCtrl.state).toBe("resolved")

    const gcTag = tag<string>({ label: "gc-tag" })
    const tagDepScope = createScope({ gc: { graceMs: 20 }, tags: [gcTag("value")] })
    const tagDepAtom = atom({
      deps: { value: tags.required(gcTag) },
      factory: (_ctx, { value }) => value,
    })
    const tagDepCtrl = await tagDepScope.controller(tagDepAtom, { resolve: true })
    const tagDepSub = tagDepCtrl.on("resolved", () => {})
    tagDepSub()
    await Promise.resolve()
    await tagDepScope.release(tagDepAtom)
    await new Promise(r => setTimeout(r, 30))
    expect(tagDepCtrl.state).toBe("idle")

    const disposeGcScope = createScope({ gc: { graceMs: 20 } })
    const disposeGcAtom = atom({ factory: () => 3 })
    const disposeCtrl = await disposeGcScope.controller(disposeGcAtom, { resolve: true })
    const disposeSub = disposeCtrl.on("resolved", () => {})
    disposeSub()
    await Promise.resolve()
    await disposeGcScope.dispose()
    await new Promise(r => setTimeout(r, 30))
    expect(disposeCtrl.state).toBe("idle")

    const resourceEvents: string[] = []
    const resourceExt = {
      name: "resource-ext",
      wrapResolve: async (next: () => Promise<unknown>, event: Lite.ResolveEvent) => {
        resourceEvents.push(`resolve:${event.kind}`)
        return next()
      },
      wrapExec: async (
        next: () => Promise<unknown>,
        _target: Lite.ExecTarget,
        ctx: Lite.ExecutionContext
      ) => {
        resourceEvents.push(`exec:${ctx.name ?? "anonymous"}`)
        return next()
      },
    } satisfies Lite.Extension

    let sharedResourceCount = 0
    const sharedResource = resource({
      name: "shared-resource",
      factory: async () => {
        sharedResourceCount++
        await new Promise(r => setTimeout(r, 10))
        return sharedResourceCount
      },
    })
    const sharedFlow = flow({
      name: "shared-flow",
      deps: { value: sharedResource },
      factory: (_ctx, { value }) => value,
    })
    const resourceScope = createScope({ extensions: [resourceExt] })
    const rootCtx = resourceScope.createContext()
    const [firstResource, secondResource] = await Promise.all([
      rootCtx.exec({ flow: sharedFlow }),
      rootCtx.exec({ flow: sharedFlow }),
    ])
    expect(firstResource).toBe(1)
    expect(secondResource).toBe(1)
    expect(sharedResourceCount).toBe(1)
    expect(resourceEvents).toEqual(expect.arrayContaining(["resolve:resource", "exec:shared-flow"]))

    const presetFlow = flow({
      name: "preset-target",
      factory: () => "target",
    })
    const presetScope = createScope({
      extensions: [resourceExt],
      presets: [preset(presetFlow, (ctx) => `preset:${ctx.name}`)],
    })
    const presetCtx = presetScope.createContext()
    expect(await presetCtx.exec({ flow: presetFlow, name: "preset-run" })).toBe("preset:preset-run")

    await presetCtx.close()
    await rootCtx.close()
    await resourceScope.dispose()
    await presetScope.dispose()
    await idleGcScope.dispose()
    await releaseGcScope.dispose()
    await dependentGcScope.dispose()
    await tagDepScope.dispose()
  })

  it("detects infinite invalidation loops", async () => {
    let aAtom!: Lite.Atom<number>
    let bAtom!: Lite.Atom<number>
    const anonymousFactoryA: (ctx: Lite.ResolveContext) => number = (ctx) => {
      ctx.cleanup(ctx.scope.on("resolved", bAtom, () => ctx.invalidate()))
      return 1
    }
    const anonymousFactoryB: (ctx: Lite.ResolveContext) => number = (ctx) => {
      ctx.cleanup(ctx.scope.on("resolved", aAtom, () => ctx.invalidate()))
      return 2
    }
    Object.defineProperty(anonymousFactoryA, "name", { value: "" })
    Object.defineProperty(anonymousFactoryB, "name", { value: "" })

    aAtom = atom({
      factory: anonymousFactoryA,
    })
    bAtom = atom({
      factory: anonymousFactoryB,
    })

    const scope = createScope()
    await scope.resolve(aAtom)
    await scope.resolve(bAtom)

    scope.controller(aAtom).invalidate()
    await expect(scope.flush()).rejects.toThrow("<anonymous>")
  })

  it("covers execution controller deps, preset cache reuse, and GC on tagged atoms", async () => {
    const sourceAtom = atom({ factory: () => 5 })
    const scope = createScope()
    await scope.resolve(sourceAtom)

    const resolvedCtrlFlow = flow({
      deps: { source: controller(sourceAtom, { resolve: true }) },
      factory: (_ctx, { source }: { source: Lite.Controller<number> }) => source.get(),
    })
    const lazyCtrlFlow = flow({
      deps: { source: controller(sourceAtom) },
      factory: async (_ctx, { source }: { source: Lite.Controller<number> }) => {
        await source.resolve()
        return source.get()
      },
    })
    const resolvedCtrlResource = resource({
      deps: { source: controller(sourceAtom, { resolve: true }) },
      factory: (_ctx: Lite.ExecutionContext, { source }: { source: Lite.Controller<number> }) => source.get(),
    })
    const resourceFlow = flow({
      deps: { value: resolvedCtrlResource },
      factory: (_ctx, { value }) => value,
    })
    const ctx = scope.createContext()
    expect(await ctx.exec({ flow: resolvedCtrlFlow })).toBe(5)
    expect(await ctx.exec({ flow: lazyCtrlFlow })).toBe(5)
    expect(await ctx.exec({ flow: resourceFlow })).toBe(5)

    const anonymousFn = (() => "anon") as (...args: unknown[]) => string
    Object.defineProperty(anonymousFn, "name", { value: "" })
    expect(await ctx.exec({ name: "anonymous", fn: anonymousFn, params: [] })).toBe("anon")

    const presetAtom = atom({ factory: () => 1 })
    const presetScope = createScope({
      presets: [preset(presetAtom, 2)],
    })
    expect(await presetScope.resolve(presetAtom)).toBe(2)
    expect(await presetScope.resolve(presetAtom)).toBe(2)

    const gcTag = tag<string>({ label: "auto-gc-tag" })
    const autoGcScope = createScope({
      gc: { graceMs: 20 },
      tags: [gcTag("value")],
    })
    const taggedGcAtom = atom({
      deps: { value: tags.required(gcTag) },
      factory: (_ctx, { value }) => value,
    })
    const taggedGcCtrl = await autoGcScope.controller(taggedGcAtom, { resolve: true })
    const taggedGcUnsub = taggedGcCtrl.on("resolved", () => {})
    taggedGcUnsub()
    await new Promise(r => setTimeout(r, 30))
    expect(taggedGcCtrl.state).toBe("idle")

    const noTagScope = createScope()
    const noTagCtx = noTagScope.createContext()
    await noTagCtx.close()

    await ctx.close()
    await presetScope.dispose()
    await autoGcScope.dispose()
  })

  it("covers context tag overrides, released invalidators, cached watch deps, and root resource resolution", async () => {
    const hierarchyTag = tag<string>({ label: "override-tag" })
    const hierarchyScope = createScope({
      tags: [hierarchyTag("scope-default")],
    })
    const hierarchyCtx = hierarchyScope.createContext({
      tags: [hierarchyTag("ctx-override")],
    })
    expect(hierarchyCtx.data.getTag(hierarchyTag)).toBe("ctx-override")

    const inheritedFlow = flow({
      deps: { values: tags.all(hierarchyTag) },
      factory: (_ctx, { values }) => values,
    })
    expect(await hierarchyCtx.exec({ flow: inheritedFlow })).toEqual(["ctx-override"])

    let invalidate!: () => void
    const invalidateAtom = atom({
      factory: (ctx) => {
        invalidate = ctx.invalidate
        return 1
      },
    })
    await hierarchyScope.resolve(invalidateAtom)
    await hierarchyScope.release(invalidateAtom)
    expect(() => invalidate()).not.toThrow()
    await expect(hierarchyScope.flush()).resolves.toBeUndefined()

    let sourceValue = 1
    let derivedRuns = 0
    const sourceAtom = atom({ factory: () => sourceValue })
    const derivedAtom = atom({
      deps: { source: controller(sourceAtom, { resolve: true, watch: true }) },
      factory: (_ctx, { source }: { source: Lite.Controller<number> }) => {
        derivedRuns++
        return source.get()
      },
    })
    await hierarchyScope.resolve(sourceAtom)
    await hierarchyScope.resolve(derivedAtom)
    hierarchyScope.controller(sourceAtom).invalidate()
    await hierarchyScope.flush()
    expect(derivedRuns).toBe(1)

    const unresolvedSourceAtom = atom({ factory: () => 5 })
    const unresolvedFlow = flow({
      deps: { source: controller(unresolvedSourceAtom, { resolve: true }) },
      factory: (_ctx, { source }: { source: Lite.Controller<number> }) => source.get(),
    })
    expect(await hierarchyCtx.exec({ flow: unresolvedFlow })).toBe(5)

    const resourceEvents: string[] = []
    const resourceExt = {
      name: "dep-aware-resource-ext",
      wrapResolve: async (next: () => Promise<unknown>, event: Lite.ResolveEvent) => {
        resourceEvents.push(`resolve:${event.kind}`)
        return next()
      },
    } satisfies Lite.Extension
    const resourceBaseAtom = atom({ factory: () => 2 })
    const depAwareResource = resource({
      name: "dep-aware-resource",
      deps: { value: resourceBaseAtom },
      factory: (_ctx, { value }) => value + 1,
    })
    const resourceScope = createScope({ extensions: [resourceExt] })
    const rootCtx = resourceScope.createContext()
    const resolvedDeps = await (resourceScope as any).resolveDeps({ value: depAwareResource }, rootCtx)
    expect(resolvedDeps).toEqual({ value: 3 })
    expect(resourceEvents).toContain("resolve:resource")

    await rootCtx.close()
    await resourceScope.dispose()
    await hierarchyCtx.close()
    await hierarchyScope.dispose()
  })

  it("covers GC cleanup for controller deps", async () => {
    const sourceAtom = atom({ factory: () => 1 })
    const dependentAtom = atom({
      deps: { source: controller(sourceAtom, { resolve: true, watch: true }) },
      factory: (_ctx, { source }: { source: Lite.Controller<number> }) => source.get(),
    })
    const scope = createScope({ gc: { graceMs: 10 } })
    const dependentCtrl = await scope.controller(dependentAtom, { resolve: true })
    const unsub = dependentCtrl.on("resolved", () => {})
    unsub()
    await new Promise(r => setTimeout(r, 30))
    expect(dependentCtrl.state).toBe("idle")
    expect(scope.controller(sourceAtom).state).toBe("idle")
    await scope.dispose()
  })
})

describe("release() cleanup", () => {
  it("waits for a pending generation and drains cleanup registered after release starts", async () => {
    let factoryStarted!: () => void
    let finishFactory!: () => void
    const started = new Promise<void>(resolve => { factoryStarted = resolve })
    const finish = new Promise<void>(resolve => { finishFactory = resolve })
    const cleaned: number[] = []
    let factoryCalls = 0
    const scope = createScope()
    const subject = atom({
      factory: async (ctx) => {
        const generation = ++factoryCalls
        if (generation === 1) {
          factoryStarted()
          await finish
        }
        ctx.cleanup(() => { cleaned.push(generation) })
        return generation
      },
    })

    const first = scope.resolve(subject)
    await started
    let released = false
    const release = scope.release(subject).then(() => { released = true })
    let replacementSettled = false
    const replacement = scope.resolve(subject).then(value => {
      replacementSettled = true
      return value
    })

    await Promise.resolve()
    expect(released).toBe(false)
    expect(replacementSettled).toBe(false)
    finishFactory()

    expect(await first).toBe(1)
    await release
    expect(await replacement).toBe(2)
    expect(factoryCalls).toBe(2)
    expect(cleaned).toEqual([1])

    await scope.release(subject)
    expect(cleaned).toEqual([1, 2])
    await scope.dispose()
  })

  it("detaches invalidation cleanups before a cleanup awaits its release capability", async () => {
    const cleaned: number[] = []
    const releases: Array<() => Promise<void>> = []
    let factoryCalls = 0
    const scope = createScope()
    const subject = atom({
      factory: (ctx) => {
        const generation = ++factoryCalls
        releases.push(ctx.release)
        ctx.cleanup(async () => {
          cleaned.push(generation)
          await ctx.release()
        })
        return generation
      },
    })

    expect(await scope.resolve(subject)).toBe(1)
    const ctrl = scope.controller(subject)
    ctrl.invalidate()
    await scope.flush()

    expect(ctrl.state).toBe("resolved")
    expect(ctrl.get()).toBe(2)
    expect(cleaned).toEqual([1])

    await releases[0]!()
    expect(ctrl.state).toBe("resolved")
    expect(ctrl.get()).toBe(2)
    await releases[1]!()
    expect(cleaned).toEqual([1, 2])
    await scope.dispose()
  })

  it("keeps outside callers waiting while cleanup awaits its release capability", async () => {
    let cleanupStarted!: () => void
    let enterReentrantRelease!: () => void
    let reentrantReleaseFinished!: () => void
    let finishCleanup!: () => void
    const started = new Promise<void>(resolve => { cleanupStarted = resolve })
    const enterReentrant = new Promise<void>(resolve => { enterReentrantRelease = resolve })
    const reentrantFinished = new Promise<void>(resolve => { reentrantReleaseFinished = resolve })
    const finish = new Promise<void>(resolve => { finishCleanup = resolve })
    let cleanupCalls = 0
    const scope = createScope()
    const subject = atom({
      factory: (ctx) => {
        ctx.cleanup(async () => {
          cleanupCalls++
          cleanupStarted()
          await enterReentrant
          await ctx.release()
          reentrantReleaseFinished()
          await finish
        })
        return "value"
      },
    })
    await scope.resolve(subject)
    const ctrl = scope.controller(subject)

    const first = scope.release(subject)
    await started
    let outsideReleased = false
    const second = scope.release(subject).then(() => { outsideReleased = true })
    let resolutionSettled = false
    let resolutionError: unknown
    const resolving = scope.resolve(subject).then(
      () => { resolutionSettled = true },
      (error: unknown) => {
        resolutionSettled = true
        resolutionError = error
      },
    )
    let disposed = false
    const disposing = scope.dispose().then(() => { disposed = true })

    expect(cleanupCalls).toBe(1)
    expect(outsideReleased).toBe(false)
    expect(resolutionSettled).toBe(false)
    expect(disposed).toBe(false)
    enterReentrantRelease()
    await reentrantFinished
    expect(cleanupCalls).toBe(1)
    expect(outsideReleased).toBe(false)
    expect(resolutionSettled).toBe(false)
    expect(disposed).toBe(false)
    finishCleanup()
    await Promise.all([first, second, resolving, disposing])
    expect(cleanupCalls).toBe(1)
    expect(outsideReleased).toBe(true)
    expect(resolutionSettled).toBe(true)
    expect(resolutionError).toEqual(new Error("Scope is disposed"))
    expect(disposed).toBe(true)
    expect(ctrl.state).toBe("idle")
  })

  it("does not let a stale release capability release a replacement generation", async () => {
    const releases: Array<() => Promise<void>> = []
    let cleanupCalls = 0
    const scope = createScope()
    const subject = atom({
      factory: (ctx) => {
        const generation = releases.length
        releases.push(ctx.release)
        ctx.cleanup(() => { cleanupCalls++ })
        return generation
      },
    })

    expect(await scope.resolve(subject)).toBe(0)
    await scope.release(subject)
    expect(cleanupCalls).toBe(1)

    expect(await scope.resolve(subject)).toBe(1)
    const ctrl = scope.controller(subject)
    await releases[0]!()
    expect(ctrl.state).toBe("resolved")
    expect(ctrl.get()).toBe(1)
    expect(cleanupCalls).toBe(1)

    await releases[1]!()
    expect(ctrl.state).toBe("idle")
    expect(cleanupCalls).toBe(2)
    await scope.dispose()
  })

  it("removes dependents on release and controller ops throw after release", async () => {
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

    const myAtom = atom({ factory: () => 42 })
    const scope2 = createScope()
    await scope2.resolve(myAtom)
    const ctrl = scope2.controller(myAtom)
    await scope2.release(myAtom)
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
  it("finishes invalidation after a listener throws and surfaces the failure from flush", async () => {
    let factoryCalls = 0
    let siblingCalls = 0
    const scope = createScope()
    const subject = atom({ factory: () => ++factoryCalls })
    await scope.resolve(subject)
    const ctrl = scope.controller(subject)

    ctrl.on("resolving", () => { throw new Error("listener failed") })
    ctrl.on("resolving", () => { siblingCalls++ })
    ctrl.invalidate()

    await expect(scope.flush()).rejects.toThrow("listener failed")
    expect(siblingCalls).toBe(1)
    expect(factoryCalls).toBe(2)
    expect(ctrl.state).toBe("resolved")
    expect(ctrl.get()).toBe(2)
    await scope.dispose()
  })

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
  it("drains in-flight chains and throws after dispose", async () => {
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

    let resolveCount = 0
    const syncAtom = atom({ factory: () => ++resolveCount })
    const scope2 = createScope()
    await scope2.resolve(syncAtom)
    scope2.controller(syncAtom).invalidate()
    await scope2.dispose()
    expect(resolveCount).toBe(2)

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
    scope3.controller(slowAtom).invalidate()
    await scope3.dispose()
    expect(slowFactoryCount).toBeLessThanOrEqual(2)

    const myAtom = atom({ factory: () => 42 })
    const scope4 = createScope()
    await scope4.resolve(myAtom)
    await scope4.dispose()
    await expect(scope4.resolve(myAtom)).rejects.toThrow()
    expect(() => scope4.createContext()).toThrow()
  })
})

describe("listener replacement between dispatches", () => {
  it("notifies fresh ctrl.on listeners after equal-count unsubscribe/resubscribe", async () => {
    const scope = createScope()
    const a = atom({ factory: () => 0 })
    await scope.resolve(a)
    const ctrl = scope.controller(a)

    const log: string[] = []
    const u1 = ctrl.on("resolved", () => log.push("old1"))
    const u2 = ctrl.on("resolved", () => log.push("old2"))
    ctrl.set(1)
    expect(log).toEqual(["old1", "old2"])

    u1()
    u2()
    ctrl.on("resolved", () => log.push("new1"))
    ctrl.on("resolved", () => log.push("new2"))
    log.length = 0
    ctrl.set(2)
    expect(log).toEqual(["new1", "new2"])
    await scope.dispose()
  })

  it("notifies fresh select handles after equal-count handle churn", async () => {
    const scope = createScope()
    const a = atom({ factory: () => 0 })
    await scope.resolve(a)
    const ctrl = scope.controller(a)

    const fired: number[] = []
    const makeHandles = (n: number) =>
      Array.from({ length: n }, (_, i) => {
        const h = scope.select(a, (v) => v)
        h.subscribe(() => fired.push(i))
        return h
      })

    const gen1 = makeHandles(2)
    ctrl.set(1)
    expect(fired).toEqual([0, 1])

    const gen2 = makeHandles(2)
    for (const h of gen1) h.dispose()
    fired.length = 0
    ctrl.set(2)
    expect(fired).toEqual([0, 1])
    for (const h of gen2) h.dispose()
    await scope.dispose()
  })
})

describe("pending update composition", () => {
  it("composes same-tick updates while a watch chain is active", async () => {
    const trigger = atom({ keepAlive: true, factory: (): number => 0 })
    const counter = atom({ keepAlive: true, factory: (): number => 0 })
    const idle = atom({
      deps: {
        trigger: controller(trigger, { resolve: true, watch: true }),
        counter: controller(counter, { resolve: true, watch: true }),
      },
      factory: (_ctx, { trigger, counter }) => trigger.get() > 0 && counter.get() === 0,
    })
    const applied: string[] = []
    const loop = flow({
      deps: { count: controller(counter, { resolve: true }) },
      factory: async (ctx, { count }): Promise<void> => {
        for await (const value of ctx.changes(trigger)) {
          if (value === 0) continue
          count.update((current) => {
            applied.push(`inc:${current}`)
            return current + 1
          })
          count.update((current) => {
            applied.push(`dec:${current}`)
            return current - 1
          })
          if (value >= 3) return
        }
      },
    })
    const scope = createScope()
    const watcher = (async () => {
      for await (const _ of scope.changes(idle)) void _
    })()
    const ctx = scope.createContext()
    const running = ctx.exec({ flow: loop })
    const ctrl = scope.controller(trigger)
    await ctrl.resolve()
    for (const round of [1, 2, 3]) {
      ctrl.update(() => round)
      await new Promise((resolve) => setTimeout(resolve))
    }
    await running

    expect(await scope.resolve(counter)).toBe(0)
    expect(applied).toEqual(["inc:0", "dec:1", "inc:0", "dec:1", "inc:0", "dec:1"])
    await ctx.close({ ok: true })
    await scope.dispose()
    await Promise.allSettled([watcher])
  })

  it("applies an update on top of a same-tick set while a watch chain is active", async () => {
    const trigger = atom({ keepAlive: true, factory: (): number => 0 })
    const counter = atom({ keepAlive: true, factory: (): number => 0 })
    const idle = atom({
      deps: {
        trigger: controller(trigger, { resolve: true, watch: true }),
        counter: controller(counter, { resolve: true, watch: true }),
      },
      factory: (_ctx, { trigger, counter }) => trigger.get() > 0 && counter.get() === 0,
    })
    const loop = flow({
      deps: { count: controller(counter, { resolve: true }) },
      factory: async (ctx, { count }): Promise<void> => {
        for await (const value of ctx.changes(trigger)) {
          if (value === 0) continue
          count.set(10)
          count.update((current) => current + 1)
          return
        }
      },
    })
    const scope = createScope()
    const watcher = (async () => {
      for await (const _ of scope.changes(idle)) void _
    })()
    const ctx = scope.createContext()
    const running = ctx.exec({ flow: loop })
    const ctrl = scope.controller(trigger)
    await ctrl.resolve()
    ctrl.update(() => 1)
    await running

    expect(await scope.resolve(counter)).toBe(11)
    await ctx.close({ ok: true })
    await scope.dispose()
    await Promise.allSettled([watcher])
  })
})

describe("close settlement", () => {
  it("ok-close rejects when a settlement callback throws", async () => {
    const scope = createScope()
    const ctx = scope.createContext()
    ctx.onClose(() => {
      throw new Error("commit failed")
    })

    await expect(ctx.close({ ok: true })).rejects.toThrow("commit failed")
    await expect(ctx.close({ ok: true })).resolves.toBeUndefined()
    await scope.dispose()
  })

  it("aggregates multiple settlement failures", async () => {
    const scope = createScope()
    const ctx = scope.createContext()
    ctx.onClose(() => {
      throw new Error("first")
    })
    ctx.onClose(() => {
      throw new Error("second")
    })

    await expect(ctx.close({ ok: true })).rejects.toThrow("close settlement failed")
    await scope.dispose()
  })

  it("failed close never masks the primary error", async () => {
    const scope = createScope()
    const ctx = scope.createContext()
    ctx.onClose(() => {
      throw new Error("secondary")
    })

    await expect(ctx.close({ ok: false, error: new Error("primary") })).resolves.toBeUndefined()
    await scope.dispose()
  })

  it("exec rejects when the child ok-close settlement fails", async () => {
    const settling = resource({
      ownership: "current",
      factory: (ctx) => {
        ctx.onClose((result) => {
          if (result.ok) throw new Error("settlement failed")
        })
        return "value"
      },
    })
    const run = flow({
      deps: { settling },
      factory: (_ctx, { settling }) => settling,
    })
    const scope = createScope()
    const ctx = scope.createContext()

    await expect(ctx.exec({ flow: run })).rejects.toThrow("settlement failed")
    await ctx.close({ ok: true })
    await scope.dispose()
  })
})

describe("diamond invalidation convergence", () => {
  const watched = <T,>(a: Lite.Atom<T>) => controller(a, { resolve: true, watch: true })

  it("converges diamonds regardless of deps key order", async () => {
    for (const aFirst of [true, false]) {
      const a = atom({ factory: () => 1 })
      const x = atom({ deps: { a: watched(a) }, factory: (_, d) => d.a.get() + 1 })
      let runs = 0
      const y = atom({
        deps: aFirst ? { a: watched(a), x: watched(x) } : { x: watched(x), a: watched(a) },
        factory: (_, d) => {
          runs++
          return d.a.get() + d.x.get()
        },
      })
      const scope = createScope()
      expect(await scope.resolve(y)).toBe(3)

      scope.controller(a).set(2)
      await scope.flush()

      expect(scope.controller(y).get()).toBe(5)
      expect(runs).toBe(aFirst ? 3 : 2)
      await scope.dispose()
    }
  })

  it("converges deep and wide diamonds without spurious loop errors", async () => {
    const a = atom({ factory: () => 1 })
    const x1 = atom({ deps: { a: watched(a) }, factory: (_, d) => d.a.get() * 10 })
    const x2 = atom({ deps: { x1: watched(x1) }, factory: (_, d) => d.x1.get() + 1 })
    let deepRuns = 0
    const deep = atom({
      deps: { a: watched(a), x2: watched(x2) },
      factory: (_, d) => {
        deepRuns++
        return d.a.get() + d.x2.get()
      },
    })
    let wideRuns = 0
    const wide = atom({
      deps: { a: watched(a), x1: watched(x1), x2: watched(x2) },
      factory: (_, d) => {
        wideRuns++
        return d.a.get() + d.x1.get() + d.x2.get()
      },
    })
    const scope = createScope()
    expect(await scope.resolve(deep)).toBe(12)
    expect(await scope.resolve(wide)).toBe(22)

    scope.controller(a).set(2)
    await scope.flush()

    expect(scope.controller(deep).get()).toBe(23)
    expect(scope.controller(wide).get()).toBe(43)
    expect(deepRuns).toBe(3)
    expect(wideRuns).toBe(3)
    await scope.dispose()
  })

  it("converges diamonds with an async middle branch", async () => {
    const a = atom({ factory: () => 1 })
    const x = atom({
      deps: { a: watched(a) },
      factory: async (_, d) => {
        await new Promise((resolve) => setTimeout(resolve, 1))
        return d.a.get() + 1
      },
    })
    let runs = 0
    const y = atom({
      deps: { a: watched(a), x: watched(x) },
      factory: (_, d) => {
        runs++
        return d.a.get() + d.x.get()
      },
    })
    const scope = createScope()
    expect(await scope.resolve(y)).toBe(3)

    scope.controller(a).set(2)
    await scope.flush()

    expect(scope.controller(y).get()).toBe(5)
    expect(runs).toBe(3)
    await scope.dispose()
  })

  it("keeps eq suppression on one branch from double-running the join", async () => {
    const a = atom({ factory: () => ({ n: 1, tag: "same" }) })
    let xRuns = 0
    const x = atom({
      deps: { a: controller(a, { resolve: true, watch: true, eq: (p, q) => p.tag === q.tag }) },
      factory: (_, d) => {
        xRuns++
        return d.a.get().tag
      },
    })
    let yRuns = 0
    const y = atom({
      deps: { a: watched(a), x: watched(x) },
      factory: (_, d) => {
        yRuns++
        return `${d.a.get().n}:${d.x.get()}`
      },
    })
    const scope = createScope()
    expect(await scope.resolve(y)).toBe("1:same")

    scope.controller(a).set({ n: 2, tag: "same" })
    await scope.flush()

    expect(scope.controller(y).get()).toBe("2:same")
    expect(xRuns).toBe(1)
    expect(yRuns).toBe(2)
    await scope.dispose()
  })
})

describe("invalidation drain order", () => {
  it("retries a stale sibling once after its dependency recomputes", async () => {
    const order: string[] = []
    const watched = <T,>(a: Lite.Atom<T>) => controller(a, { resolve: true, watch: true })
    const x = atom({ factory: () => 1 })
    const s = atom({
      deps: { x: watched(x) },
      factory: (_, d) => {
        order.push("s")
        return d.x.get() * 10
      },
    })
    const child1 = atom({
      deps: { x: watched(x), s: watched(s) },
      factory: (_, d) => {
        order.push("child1")
        return d.x.get() + d.s.get()
      },
    })
    const child2 = atom({
      deps: { x: watched(x), s: watched(s) },
      factory: (_, d) => {
        order.push("child2")
        return d.x.get() + d.s.get()
      },
    })
    const scope = createScope()
    await scope.resolve(child1)
    await scope.resolve(child2)
    order.length = 0

    scope.controller(x).set(2)
    await scope.flush()

    expect(order).toEqual(["child1", "s", "child2", "child1"])
    expect(scope.controller(child1).get()).toBe(22)
    expect(scope.controller(child2).get()).toBe(22)
    await scope.dispose()
  })

  it("retries a shared corridor join after its sources settle", async () => {
    const order: string[] = []
    const watched = <T,>(a: Lite.Atom<T>) => controller(a, { resolve: true, watch: true })
    const x = atom({ factory: () => 1 })
    const p = atom({
      deps: { x: watched(x) },
      factory: (_, d) => {
        order.push("p")
        return d.x.get() * 2
      },
    })
    const q = atom({
      deps: { x: watched(x) },
      factory: (_, d) => {
        order.push("q")
        return d.x.get() * 3
      },
    })
    const c = atom({
      deps: { p: watched(p), q: watched(q) },
      factory: (_, d) => {
        order.push("c")
        return d.p.get() + d.q.get()
      },
    })
    const y = atom({
      deps: { x: watched(x), c: watched(c) },
      factory: (_, d) => {
        order.push("y")
        return d.x.get() + d.c.get()
      },
    })
    const scope = createScope()
    await scope.resolve(y)
    order.length = 0

    scope.controller(x).set(2)
    await scope.flush()

    expect(order).toEqual(["y", "p", "q", "c", "y"])
    expect(scope.controller(y).get()).toBe(12)
    await scope.dispose()
  })

  it("retries the join after dependencies settle when key order opposes queue order", async () => {
    const order: string[] = []
    const watched = <T,>(at: Lite.Atom<T>) => controller(at, { resolve: true, watch: true })
    const x = atom({ factory: () => 1 })
    const a = atom({
      deps: { x: watched(x) },
      factory: (_, d) => {
        order.push("a")
        return d.x.get() * 2
      },
    })
    const b = atom({
      deps: { x: watched(x) },
      factory: (_, d) => {
        order.push("b")
        return d.x.get() * 3
      },
    })
    const m = atom({
      deps: { b: watched(b), a: watched(a) },
      factory: (_, d) => {
        order.push("m")
        return d.b.get() + d.a.get()
      },
    })
    const join = atom({
      deps: { x: watched(x), m: watched(m) },
      factory: (_, d) => {
        order.push("join")
        return d.x.get() + d.m.get()
      },
    })
    const scope = createScope()
    await scope.resolve(a)
    await scope.resolve(b)
    await scope.resolve(join)
    order.length = 0

    scope.controller(x).set(2)
    await scope.flush()

    expect(order).toEqual(["a", "b", "join", "m", "join"])
    expect(scope.controller(join).get()).toBe(12)
    await scope.dispose()
  })

  it("converges the deep diamond in the opposite key order", async () => {
    const watched = <T,>(at: Lite.Atom<T>) => controller(at, { resolve: true, watch: true })
    const a = atom({ factory: () => 1 })
    const x1 = atom({ deps: { a: watched(a) }, factory: (_, d) => d.a.get() * 10 })
    const x2 = atom({ deps: { x1: watched(x1) }, factory: (_, d) => d.x1.get() + 1 })
    let runs = 0
    const y = atom({
      deps: { x2: watched(x2), a: watched(a) },
      factory: (_, d) => {
        runs++
        return d.a.get() + d.x2.get()
      },
    })
    const scope = createScope()
    expect(await scope.resolve(y)).toBe(12)

    scope.controller(a).set(2)
    await scope.flush()

    expect(scope.controller(y).get()).toBe(23)
    expect(runs).toBe(3)
    await scope.dispose()
  })

  it("converges when a source dependency completes late", async () => {
    let open!: (value: number) => void
    const x = atom({ factory: () => new Promise<number>((resolve) => { open = resolve }) })
    let failRuns = 0
    const fail = atom({
      factory: async () => {
        if (++failRuns === 1) throw new Error("fail once")
        return 0
      },
    })
    const a = atom({
      deps: { fail, x: controller(x, { resolve: true, watch: true }) },
      factory: (_, d) => d.x.get(),
    })
    const b = atom({
      deps: { a: controller(a, { resolve: true, watch: true }) },
      factory: (_, d) => d.a.get() + 1,
    })
    const scope = createScope({ gc: { enabled: false } })
    const first = scope.resolve(a)
    scope.controller(a).set(100)
    await first.catch(() => {})
    await scope.flush()
    await scope.resolve(b)
    open(1)
    await scope.controller(x).resolve()
    await Promise.resolve()
    await Promise.resolve()

    scope.controller(b).invalidate()
    scope.controller(a).invalidate()
    await scope.flush()

    expect(scope.controller(a).get()).toBe(1)
    expect(scope.controller(b).get()).toBe(2)
    await scope.dispose()
  })
})

describe("mid-recompute peer writes", () => {
  const watched = <T,>(a: Lite.Atom<T>) => controller(a, { resolve: true, watch: true })

  const build = () => {
    const armed = { current: false }
    const s = atom({ factory: () => 1000 })
    const b = atom({ factory: () => 100 })
    const d0 = atom({ factory: () => 1 })
    const d1 = atom({ deps: { d: watched(d0) }, factory: (_, d) => d.d.get() + 1 })
    const hi = atom({
      deps: { s: watched(s), d: watched(d1), b: controller(b, { resolve: true }) },
      factory: (_, d) => {
        if (armed.current) d.b.set(200)
        return d.s.get() + d.d.get()
      },
    })
    const lo = atom({
      deps: { s: watched(s), b: watched(b) },
      factory: (_, d) => d.s.get() + d.b.get(),
    })
    const z = atom({ deps: { hi: watched(hi) }, factory: (_, d) => d.hi.get() })
    return { armed, s, hi, lo, z }
  }

  it("settles when the writer resolved first, matching the previous release", async () => {
    const { armed, s, hi, lo, z } = build()
    const scope = createScope()
    await scope.resolve(hi)
    await scope.resolve(lo)
    await scope.resolve(z)
    await scope.flush()

    armed.current = true
    scope.controller(s).set(2000)
    await scope.flush()

    expect(scope.controller(lo).get()).toBe(2200)
    expect(scope.controller(z).get()).toBe(2002)
    await scope.dispose()
  })

  it("rejects when the reader resolved first, matching the previous release", async () => {
    const { armed, s, hi, lo, z } = build()
    const scope = createScope()
    await scope.resolve(lo)
    await scope.resolve(hi)
    await scope.resolve(z)
    await scope.flush()

    armed.current = true
    scope.controller(s).set(2000)
    await expect(scope.flush()).rejects.toThrow("Infinite invalidation loop detected")
    await scope.dispose()
  })
})

describe("loop detection under sanctioned re-entry", () => {
  it("settles finite factory self-invalidation past any fixed boundary", async () => {
    for (const passes of [101, 1000]) {
      let runs = 0
      const subject = atom({
        factory: (ctx) => {
          runs++
          if (runs <= passes) ctx.invalidate()
          return runs
        },
      })
      const scope = createScope()
      await scope.resolve(subject)
      await scope.flush()

      expect(runs).toBe(passes + 1)
      expect(scope.controller(subject).get()).toBe(passes + 1)
      await scope.dispose()
    }
  })

  it("rejects flush for cycles that invalidate mid-recompute instead of hanging", async () => {
    const b = atom({ factory: () => 0 })
    const a = atom({
      deps: { b: controller(b, { resolve: true, watch: true }) },
      factory: (_, d) => d.b.get(),
    })
    const scope = createScope()
    await scope.resolve(a)
    const ca = scope.controller(a)
    const cb = scope.controller(b)

    let bumps = 0
    ca.on("resolved", () => cb.set(++bumps + 1000))
    let resolving = 0
    scope.on("resolving", a, () => {
      resolving++
      if (resolving % 2 === 1) ca.invalidate()
    })

    cb.set(++bumps + 1000)
    await expect(scope.flush()).rejects.toThrow("Infinite invalidation loop detected")
    await scope.dispose()
  })
})

describe("in-recompute writer feedback", () => {
  const watched = <T,>(at: Lite.Atom<T>) => controller(at, { resolve: true, watch: true })

  const build = (mode: "finite" | "infinite") => {
    const armed = { current: false }
    const order: string[] = []
    const s = atom({ factory: () => 1 })
    const mid = atom({
      deps: { s: watched(s) },
      factory: (_, d) => {
        order.push("mid")
        return d.s.get() + 1
      },
    })
    const writer = atom({
      deps: { s: watched(s), mid: watched(mid), sc: controller(s, { resolve: true }) },
      factory: (_, d) => {
        order.push("writer")
        if (armed.current) {
          if (mode === "finite") {
            armed.current = false
            d.sc.set(3)
          } else {
            d.sc.set(d.s.get() + 1)
          }
        }
        return d.s.get() + d.mid.get()
      },
    })
    return { armed, order, s, mid, writer }
  }

  it("settles a finite armed write exactly as the previous release", async () => {
    const { armed, order, s, mid, writer } = build("finite")
    const scope = createScope()
    await scope.resolve(writer)
    order.length = 0

    armed.current = true
    scope.controller(s).set(2)
    await scope.flush()

    expect(order).toEqual(["writer", "mid", "writer"])
    expect(scope.controller(s).get()).toBe(3)
    expect(scope.controller(mid).get()).toBe(4)
    expect(scope.controller(writer).get()).toBe(7)
    await scope.dispose()
  })

  it("rejects an unbounded writer instead of hanging", async () => {
    const { armed, s, writer } = build("infinite")
    const scope = createScope()
    await scope.resolve(writer)

    armed.current = true
    scope.controller(s).set(2)
    await expect(scope.flush()).rejects.toThrow("Infinite invalidation loop detected")
    await scope.dispose()
  })
})


describe("cascade retry provenance", () => {
  const watched = <T,>(at: Lite.Atom<T>) => controller(at, { resolve: true, watch: true })

  it("rejects a mid-recompute self-set diamond like the previous release", async () => {
    let armed = false
    let sRef!: Lite.Atom<number>
    const x = atom({ factory: () => 1 })
    const s = atom({
      deps: { x: watched(x) },
      factory: (ctx, d) => {
        if (armed) {
          armed = false
          ctx.scope.controller(sRef).set(30)
        }
        return d.x.get() * 10
      },
    })
    sRef = s
    const y = atom({
      deps: { x: watched(x), s: watched(s) },
      factory: (_, d) => d.x.get() + d.s.get(),
    })
    const scope = createScope({ gc: { enabled: false } })
    await scope.resolve(y)

    armed = true
    scope.controller(x).set(2)
    await expect(scope.flush()).rejects.toThrow("Infinite invalidation loop detected")
    expect(scope.controller(s).get()).toBe(30)
    expect(scope.controller(y).get()).toBe(22)
    await scope.dispose()
  })

  it("does not sanction a concurrent cold completion outside the drain", async () => {
    let sFail = false
    let sValue = 1
    const s = atom({
      factory: async () => {
        if (sFail) throw new Error("s fail")
        return sValue
      },
    })
    let tRuns = 0
    let releaseCleanup!: () => void
    let cleanupBlocked!: () => void
    let blockNext = false
    const t = atom({
      deps: { s: watched(s) },
      factory: (ctx, d) => {
        tRuns++
        ctx.cleanup(() => {
          if (!blockNext) return
          blockNext = false
          return new Promise<void>((resolve) => {
            releaseCleanup = resolve
            cleanupBlocked()
          })
        })
        return d.s.get()
      },
    })
    const scope = createScope({ gc: { enabled: false } })
    await scope.resolve(t)

    sFail = true
    scope.controller(s).invalidate()
    await scope.flush().catch(() => {})

    sFail = false
    sValue = 2
    blockNext = true
    const blocked = new Promise<void>((resolve) => {
      cleanupBlocked = resolve
    })
    scope.controller(t).invalidate()
    const flush = scope.flush()
    await blocked

    expect(await scope.resolve(s)).toBe(2)
    await Promise.resolve()
    releaseCleanup()

    await expect(flush).rejects.toThrow("Infinite invalidation loop detected")
    expect(tRuns).toBe(2)
    expect(scope.controller(t).get()).toBe(2)
    await scope.dispose()
  })
})

describe("cascade retry termination", () => {
  const watched = <T,>(at: Lite.Atom<T>) => controller(at, { resolve: true, watch: true })

  it("rejects a pending-set cycle instead of hanging", async () => {
    let armed = false
    let sourceRuns = 0
    let sourceRef!: Lite.Controller<number>
    const source = atom({
      factory: () => {
        sourceRuns++
        if (armed) sourceRef.set(100 + sourceRuns)
        return sourceRuns
      },
    })
    const writer = atom({
      deps: { source: watched(source) },
      factory: (_, d) => {
        if (armed) sourceRef.invalidate()
        return d.source.get()
      },
    })
    const scope = createScope({ gc: { enabled: false } })
    sourceRef = scope.controller(source)
    await scope.resolve(writer)

    armed = true
    sourceRef.invalidate()
    await expect(scope.flush()).rejects.toThrow("Infinite invalidation loop detected")
    await scope.dispose()
  })

  it("retries a watcher re-dirtied by a clean recompute after a direct invalidate", async () => {
    let armed = false
    let sRuns = 0
    const events: string[] = []
    const s = atom({
      factory: () => {
        if (armed) events.push("s")
        return ++sRuns
      },
    })
    let t!: Lite.Atom<number>
    const u = atom({
      factory: (ctx) => {
        if (armed) {
          events.push("u")
          ctx.scope.controller(t).invalidate()
        }
        return 0
      },
    })
    t = atom({
      deps: { s: watched(s) },
      factory: (_, d) => {
        if (armed) events.push("t")
        return d.s.get()
      },
    })
    const scope = createScope({ gc: { enabled: false } })
    await scope.resolve(t)
    await scope.resolve(u)
    await scope.flush()

    armed = true
    scope.controller(t).invalidate()
    scope.controller(u).invalidate()
    scope.controller(s).invalidate()
    await scope.flush()

    expect(events).toEqual(["t", "u", "s", "t"])
    expect(scope.controller(t).get()).toBe(2)
    await scope.dispose()
  })
})

describe("pure watch convergence", () => {
  const watched = <T,>(at: Lite.Atom<T>) => controller(at, { resolve: true, watch: true })

  it("converges a repeated-source overlapping diamond", async () => {
    const x = atom({ factory: () => 1 })
    const p = atom({ deps: { x: watched(x) }, factory: (_, d) => d.x.get() * 10 })
    const s = atom({ deps: { x: watched(x), p: watched(p) }, factory: (_, d) => d.x.get() + d.p.get() })
    const y = atom({ deps: { x: watched(x), s: watched(s) }, factory: (_, d) => d.x.get() + d.s.get() })
    const scope = createScope({ gc: { enabled: false } })
    await scope.resolve(y)

    scope.controller(x).set(2)
    await scope.flush()

    expect(scope.controller(p).get()).toBe(20)
    expect(scope.controller(s).get()).toBe(22)
    expect(scope.controller(y).get()).toBe(24)
    await scope.dispose()
  })

  it("converges a multi-branch join whose causes merge while queued", async () => {
    const r = atom({ factory: () => 1 })
    const p = atom({ deps: { r: watched(r) }, factory: (_, d) => d.r.get() * 10 })
    const a = atom({ deps: { r: watched(r), p: watched(p) }, factory: (_, d) => d.r.get() + d.p.get() })
    const q = atom({ deps: { r: watched(r) }, factory: (_, d) => d.r.get() * 100 })
    const b = atom({ deps: { q: watched(q) }, factory: (_, d) => d.q.get() + 1 })
    const y = atom({
      deps: { r: watched(r), a: watched(a), b: watched(b) },
      factory: (_, d) => d.r.get() + d.a.get() + d.b.get(),
    })
    const scope = createScope({ gc: { enabled: false } })
    await scope.resolve(y)

    scope.controller(r).set(2)
    await scope.flush()

    expect(scope.controller(a).get()).toBe(22)
    expect(scope.controller(b).get()).toBe(201)
    expect(scope.controller(y).get()).toBe(225)
    await scope.dispose()
  })

  it("converges nested diamonds in the adverse outer-first order", async () => {
    const x = atom({ factory: () => 1 })
    let stage = atom({ deps: { x: watched(x) }, factory: (_, d) => d.x.get() * 10 })
    for (let i = 1; i <= 3; i++) {
      const previous = stage
      stage = atom({
        deps: { x: watched(x), previous: watched(previous) },
        factory: (_, d) => d.x.get() + d.previous.get(),
      })
    }
    const scope = createScope({ gc: { enabled: false } })
    await scope.resolve(stage)

    scope.controller(x).set(2)
    await scope.flush()

    expect(scope.controller(stage).get()).toBe(26)
    await scope.dispose()
  })
})

describe("tainted recompute provenance", () => {
  const watched = <T,>(at: Lite.Atom<T>) => controller(at, { resolve: true, watch: true })

  it("rejects self-re-entry writer feedback instead of hanging", async () => {
    let armed = false
    let sourceRuns = 0
    let sourceRef!: Lite.Controller<number>
    const source = atom({
      factory: (ctx) => {
        sourceRuns++
        if (armed) ctx.invalidate()
        return sourceRuns
      },
    })
    const writer = atom({
      deps: { source: watched(source) },
      factory: (_, d) => {
        if (armed) sourceRef.invalidate()
        return d.source.get()
      },
    })
    const scope = createScope({ gc: { enabled: false } })
    sourceRef = scope.controller(source)
    await scope.resolve(writer)

    armed = true
    sourceRef.invalidate()
    await expect(scope.flush()).rejects.toThrow("Infinite invalidation loop detected")
    await scope.dispose()
  })

  it("rejects listener-driven re-entry writer feedback instead of hanging", async () => {
    let armed = false
    let sourceRuns = 0
    const source = atom({ factory: () => ++sourceRuns })
    let sourceRef!: Lite.Controller<number>
    const writer = atom({
      deps: { source: watched(source) },
      factory: (_, d) => {
        if (armed) sourceRef.invalidate()
        return d.source.get()
      },
    })
    const scope = createScope({ gc: { enabled: false } })
    sourceRef = scope.controller(source)
    scope.on("resolving", source, () => {
      if (armed) sourceRef.invalidate()
    })
    await scope.resolve(writer)

    armed = true
    sourceRef.invalidate()
    await expect(scope.flush()).rejects.toThrow("Infinite invalidation loop detected")
    await scope.dispose()
  })
})

describe("mutations during an unrelated in-flight recompute", () => {
  const watched = <T,>(at: Lite.Atom<T>) => controller(at, { resolve: true, watch: true })

  it("converges without overlap and conservatively rejects with overlap", async () => {
    for (const overlap of [false, true]) {
      let armed = false
      let open!: () => void
      let startedResolve!: () => void
      const started = new Promise<void>((resolve) => { startedResolve = resolve })
      const gate = new Promise<void>((resolve) => { open = resolve })
      const blocker = atom({
        factory: async () => {
          if (armed) {
            startedResolve()
            await gate
          }
          return 0
        },
      })
      const b = atom({ factory: () => 1 })
      const x = atom({ deps: { b: watched(b) }, factory: (_, d) => d.b.get() * 10 })
      let runs = 0
      const y = atom({
        deps: { b: watched(b), x: watched(x) },
        factory: (_, d) => {
          runs++
          return d.b.get() + d.x.get()
        },
      })
      const scope = createScope({ gc: { enabled: false } })
      await scope.resolve(blocker)
      await scope.resolve(b)
      await scope.resolve(y)

      let flushing: Promise<void> | undefined
      if (overlap) {
        armed = true
        scope.controller(blocker).invalidate()
        flushing = scope.flush()
        await started
      }
      scope.controller(b).set(2)
      if (overlap) open()

      if (overlap) {
        await expect(flushing!).rejects.toThrow("Infinite invalidation loop detected")
        expect(scope.controller(y).get()).toBe(12)
      } else {
        await scope.flush()
        expect(runs).toBe(3)
        expect(scope.controller(y).get()).toBe(22)
      }
      expect(scope.controller(x).get()).toBe(20)
      await scope.dispose()
    }
  })
})

describe("same-turn batched mutations", () => {
  it("converges two independent adverse-order diamonds set in one turn", async () => {
    const watched = <T,>(at: Lite.Atom<T>) => controller(at, { resolve: true, watch: true })
    const make = () => {
      const root = atom({ factory: () => 1 })
      const mid = atom({ deps: { root: watched(root) }, factory: (_, d) => d.root.get() * 10 })
      let runs = 0
      const join = atom({
        deps: { root: watched(root), mid: watched(mid) },
        factory: (_, d) => {
          runs++
          return d.root.get() + d.mid.get()
        },
      })
      return { root, join, getRuns: () => runs }
    }
    const first = make()
    const second = make()
    const scope = createScope({ gc: { enabled: false } })
    await scope.resolve(first.join)
    await scope.resolve(second.join)

    scope.controller(first.root).set(2)
    scope.controller(second.root).set(2)
    await scope.flush()

    expect(scope.controller(first.join).get()).toBe(22)
    expect(scope.controller(second.join).get()).toBe(22)
    expect(first.getRuns()).toBe(3)
    expect(second.getRuns()).toBe(3)
    await scope.dispose()
  })
})
