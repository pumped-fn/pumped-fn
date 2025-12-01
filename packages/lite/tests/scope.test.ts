import { describe, it, expect } from "vitest"
import { createScope } from "../src/scope"
import { atom, controller } from "../src/atom"
import { preset } from "../src/preset"
import { tag, tags } from "../src/tag"
import { flow } from "../src/flow"

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
      await new Promise(r => setTimeout(r, 5))
      expect(ctrl.state).toBe('resolving')
      expect(ctrl.get()).toBe(1)

      await new Promise(r => setTimeout(r, 100))
      expect(ctrl.state).toBe('resolved')
      expect(ctrl.get()).toBe(2)
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
    it("executes plain function", async () => {
      const scope = createScope()
      const ctx = scope.createContext()

      const result = await ctx.exec({
        fn: (a: number, b: number) => a + b,
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

  describe("controller edge cases", () => {
    it("throws when get called before resolve", async () => {
      const scope = createScope()
      const myAtom = atom({ factory: () => 42 })

      const ctrl = scope.controller(myAtom)
      expect(() => ctrl.get()).toThrow("not resolved")
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

      await new Promise(r => setTimeout(r, 50))
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
          ctx.invalidate()
          events.push(`${thisExecution}:after-invalidate`)
          await new Promise(r => setTimeout(r, 10))
          events.push(`${thisExecution}:end`)
          return thisExecution
        }
      })

      const result = await scope.resolve(myAtom)
      expect(result).toBe(1)

      await new Promise(r => setTimeout(r, 50))

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
    it("runs cleanups in LIFO order", async () => {
      const scope = createScope()
      const order: number[] = []
      const myAtom = atom({
        factory: (ctx) => {
          ctx.cleanup(() => { order.push(1) })
          ctx.cleanup(() => { order.push(2) })
          ctx.cleanup(() => { order.push(3) })
          return 42
        }
      })

      await scope.resolve(myAtom)
      const ctrl = scope.controller(myAtom)
      ctrl.invalidate()

      await new Promise(r => setTimeout(r, 10))
      expect(order).toEqual([3, 2, 1])
    })

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

    it("sets state to resolving immediately after invalidate", async () => {
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

      await new Promise(r => setTimeout(r, 100))
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
      expect(ctrl.state).toBe('resolving')

      await new Promise(r => setTimeout(r, 10))
      expect(ctrl.state).toBe('resolved')
      expect(ctrl.get()).toBe("success")
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

      expect(states).toContain('resolving')

      await new Promise(r => setTimeout(r, 50))
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
      await new Promise(r => setTimeout(r, 50))

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

  describe("ctx.data", () => {
    it("provides a Map for storing data", async () => {
      const scope = createScope()
      let capturedData: Map<string, unknown> | undefined

      const myAtom = atom({
        factory: (ctx) => {
          capturedData = ctx.data
          ctx.data.set("key", "value")
          return ctx.data.get("key")
        },
      })

      const result = await scope.resolve(myAtom)

      expect(result).toBe("value")
      expect(capturedData).toBeInstanceOf(Map)
      expect(capturedData?.get("key")).toBe("value")
    })

    it("persists data across invalidations", async () => {
      const scope = createScope()
      let resolveCount = 0

      const myAtom = atom({
        factory: (ctx) => {
          resolveCount++
          const prev = ctx.data.get("count") as number | undefined
          ctx.data.set("count", (prev ?? 0) + 1)
          return ctx.data.get("count")
        },
      })

      const first = await scope.resolve(myAtom)
      expect(first).toBe(1)

      const ctrl = scope.controller(myAtom)
      ctrl.invalidate()
      await ctrl.resolve()

      const second = ctrl.get()
      expect(second).toBe(2)
      expect(resolveCount).toBe(2)
    })

    it("clears data when atom is released", async () => {
      const scope = createScope()

      const myAtom = atom({
        factory: (ctx) => {
          const prev = ctx.data.get("count") as number | undefined
          ctx.data.set("count", (prev ?? 0) + 1)
          return ctx.data.get("count")
        },
      })

      const first = await scope.resolve(myAtom)
      expect(first).toBe(1)

      await scope.release(myAtom)

      const second = await scope.resolve(myAtom)
      expect(second).toBe(1)
    })

    it("creates data Map lazily on first access", async () => {
      const scope = createScope()
      let dataAccessed = false

      const noDataAtom = atom({
        factory: () => {
          return "no data access"
        },
      })

      const withDataAtom = atom({
        factory: (ctx) => {
          dataAccessed = true
          ctx.data.set("key", "value")
          return "data accessed"
        },
      })

      await scope.resolve(noDataAtom)
      await scope.resolve(withDataAtom)

      expect(dataAccessed).toBe(true)
    })

    it("has independent data per atom", async () => {
      const scope = createScope()

      const atomA = atom({
        factory: (ctx) => {
          ctx.data.set("name", "A")
          return ctx.data.get("name")
        },
      })

      const atomB = atom({
        factory: (ctx) => {
          ctx.data.set("name", "B")
          return ctx.data.get("name")
        },
      })

      const resultA = await scope.resolve(atomA)
      const resultB = await scope.resolve(atomB)

      expect(resultA).toBe("A")
      expect(resultB).toBe("B")
    })
  })
})
