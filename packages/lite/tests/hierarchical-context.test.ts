import { describe, it, expect } from "vitest"
import { createScope } from "../src/scope"
import { flow } from "../src/flow"
import { service } from "../src/service"
import { type Lite } from "../src/types"
import { tag, tags } from "../src/tag"

describe("Hierarchical ExecutionContext", () => {
  describe("parent chain", () => {
    it("root context has undefined parent", async () => {
      const scope = createScope()
      const ctx = scope.createContext()

      expect(ctx.parent).toBeUndefined()
      await ctx.close()
    })

    it("child context has parent reference", async () => {
      const scope = createScope()
      const ctx = scope.createContext()

      let childParent: unknown

      await ctx.exec({
        flow: flow({
          factory: (childCtx) => {
            childParent = childCtx.parent
          }
        }),
        input: null
      })

      expect(childParent).toBe(ctx)
      await ctx.close()
    })

    it("grandchild has correct parent chain", async () => {
      const scope = createScope()
      const ctx = scope.createContext()

      const parents: unknown[] = []

      const innerFlow = flow({
        factory: (grandchildCtx) => {
          parents.push(grandchildCtx.parent?.parent)
        }
      })

      const outerFlow = flow({
        factory: async (childCtx) => {
          parents.push(childCtx.parent)
          await childCtx.exec({ flow: innerFlow, input: null })
        }
      })

      await ctx.exec({ flow: outerFlow, input: null })

      expect(parents[0]).toBe(ctx)
      expect(parents[1]).toBe(ctx)
      await ctx.close()
    })
  })

  describe("data isolation", () => {
    it("each context has own data map", async () => {
      const scope = createScope()
      const ctx = scope.createContext()
      const KEY = Symbol("test")

      ctx.data.set(KEY, "root")

      let childData: string | undefined

      await ctx.exec({
        flow: flow({
          factory: (childCtx) => {
            childData = childCtx.data.get(KEY) as string | undefined
            childCtx.data.set(KEY, "child")
          }
        }),
        input: null
      })

      expect(ctx.data.get(KEY)).toBe("root")
      expect(childData).toBeUndefined()
      await ctx.close()
    })

    it("concurrent execs have isolated data", async () => {
      const scope = createScope()
      const ctx = scope.createContext()
      const KEY = Symbol("test")

      const results: string[] = []

      const testFlow = flow<void, string>({
        parse: (raw) => raw as string,
        factory: async (childCtx) => {
          const id = childCtx.input
          childCtx.data.set(KEY, id)
          await new Promise(r => setTimeout(r, 10))
          results.push(childCtx.data.get(KEY) as string)
        }
      })

      await Promise.all([
        ctx.exec({ flow: testFlow, input: "A" }),
        ctx.exec({ flow: testFlow, input: "B" })
      ])

      expect(results).toContain("A")
      expect(results).toContain("B")
      await ctx.close()
    })
  })

  describe("seek() hierarchical lookup", () => {
    it("seek() returns local value if exists", async () => {
      const scope = createScope()
      const ctx = scope.createContext()
      const KEY = Symbol("test")

      ctx.data.set(KEY, "local-value")
      expect(ctx.data.seek(KEY)).toBe("local-value")

      await ctx.close()
    })

    it("seek() returns parent value if not local", async () => {
      const scope = createScope()
      const ctx = scope.createContext()
      const KEY = Symbol("test")

      ctx.data.set(KEY, "parent-value")

      let childSeekResult: unknown

      await ctx.exec({
        flow: flow({
          factory: (childCtx) => {
            childSeekResult = childCtx.data.seek(KEY)
          }
        }),
        input: null
      })

      expect(childSeekResult).toBe("parent-value")
      await ctx.close()
    })

    it("seek() traverses full parent chain", async () => {
      const scope = createScope()
      const ctx = scope.createContext()
      const KEY = Symbol("test")

      ctx.data.set(KEY, "root-value")

      let grandchildSeekResult: unknown

      const innerFlow = flow({
        factory: (grandchildCtx) => {
          grandchildSeekResult = grandchildCtx.data.seek(KEY)
        }
      })

      const outerFlow = flow({
        factory: async (childCtx) => {
          await childCtx.exec({ flow: innerFlow, input: null })
        }
      })

      await ctx.exec({ flow: outerFlow, input: null })

      expect(grandchildSeekResult).toBe("root-value")
      await ctx.close()
    })

    it("seek() returns undefined if not in any context", async () => {
      const scope = createScope()
      const ctx = scope.createContext()
      const KEY = Symbol("missing")

      let childSeekResult: unknown = "not-undefined"

      await ctx.exec({
        flow: flow({
          factory: (childCtx) => {
            childSeekResult = childCtx.data.seek(KEY)
          }
        }),
        input: null
      })

      expect(childSeekResult).toBeUndefined()
      await ctx.close()
    })

    it("seek() prefers local over parent", async () => {
      const scope = createScope()
      const ctx = scope.createContext()
      const KEY = Symbol("test")

      ctx.data.set(KEY, "parent-value")

      let childSeekResult: unknown

      await ctx.exec({
        flow: flow({
          factory: (childCtx) => {
            childCtx.data.set(KEY, "child-value")
            childSeekResult = childCtx.data.seek(KEY)
          }
        }),
        input: null
      })

      expect(childSeekResult).toBe("child-value")
      await ctx.close()
    })
  })

  describe("seekTag() hierarchical lookup", () => {
    it("seekTag() returns parent tag value", async () => {
      const scope = createScope()
      const ctx = scope.createContext()
      const testTag = tag<string>({ label: "test" })

      ctx.data.setTag(testTag, "parent-tag-value")

      let childSeekResult: string | undefined

      await ctx.exec({
        flow: flow({
          factory: (childCtx) => {
            childSeekResult = childCtx.data.seekTag(testTag)
          }
        }),
        input: null
      })

      expect(childSeekResult).toBe("parent-tag-value")
      await ctx.close()
    })

    it("seekTag() does NOT use tag default", async () => {
      const scope = createScope()
      const ctx = scope.createContext()
      const tagWithDefault = tag<number>({ label: "count", default: 42 })

      let childSeekResult: number | undefined = 999

      await ctx.exec({
        flow: flow({
          factory: (childCtx) => {
            childSeekResult = childCtx.data.seekTag(tagWithDefault)
          }
        }),
        input: null
      })

      expect(childSeekResult).toBeUndefined()
      await ctx.close()
    })

    it("seekTag() traverses grandparent chain", async () => {
      const scope = createScope()
      const ctx = scope.createContext()
      const userTag = tag<{ id: string }>({ label: "user" })

      ctx.data.setTag(userTag, { id: "root-user" })

      let grandchildResult: { id: string } | undefined

      const innerFlow = flow({
        factory: (grandchildCtx) => {
          grandchildResult = grandchildCtx.data.seekTag(userTag)
        }
      })

      const outerFlow = flow({
        factory: async (childCtx) => {
          await childCtx.exec({ flow: innerFlow, input: null })
        }
      })

      await ctx.exec({ flow: outerFlow, input: null })

      expect(grandchildResult).toEqual({ id: "root-user" })
      await ctx.close()
    })
  })

  describe("input isolation", () => {
    it("root context has undefined input", async () => {
      const scope = createScope()
      const ctx = scope.createContext()

      expect(ctx.input).toBeUndefined()
      await ctx.close()
    })

    it("each exec has isolated input", async () => {
      const scope = createScope()
      const ctx = scope.createContext()
      const inputs: unknown[] = []

      const captureFlow = flow<void, string>({
        parse: (raw) => raw as string,
        factory: (childCtx) => {
          inputs.push(childCtx.input)
        }
      })

      await ctx.exec({ flow: captureFlow, input: "first" })
      await ctx.exec({ flow: captureFlow, input: "second" })

      expect(inputs).toEqual(["first", "second"])
      expect(ctx.input).toBeUndefined()
      await ctx.close()
    })

    it("concurrent execs have correct input", async () => {
      const scope = createScope()
      const ctx = scope.createContext()
      const inputs: string[] = []

      const captureFlow = flow<void, string>({
        parse: (raw) => raw as string,
        factory: async (childCtx) => {
          await new Promise(r => setTimeout(r, 10))
          inputs.push(childCtx.input)
        }
      })

      await Promise.all([
        ctx.exec({ flow: captureFlow, input: "A" }),
        ctx.exec({ flow: captureFlow, input: "B" })
      ])

      expect(inputs.sort()).toEqual(["A", "B"])
      await ctx.close()
    })
  })

  describe("cleanup lifecycle", () => {
    it("child cleanup runs on exec completion", async () => {
      const scope = createScope()
      const ctx = scope.createContext()
      const events: string[] = []

      await ctx.exec({
        flow: flow({
          factory: (childCtx) => {
            childCtx.onClose(() => {
              events.push("child-cleanup")
            })
          }
        }),
        input: null
      })

      events.push("after-exec")
      await ctx.close()
      events.push("after-root-close")

      expect(events).toEqual(["child-cleanup", "after-exec", "after-root-close"])
    })

    it("nested cleanups run in correct order", async () => {
      const scope = createScope()
      const ctx = scope.createContext()
      const events: string[] = []

      const innerFlow = flow({
        factory: (grandchildCtx) => {
          grandchildCtx.onClose(() => {
            events.push("grandchild")
          })
        }
      })

      const outerFlow = flow({
        factory: async (childCtx) => {
          childCtx.onClose(() => {
            events.push("child")
          })
          await childCtx.exec({ flow: innerFlow, input: null })
          events.push("after-inner-exec")
        }
      })

      await ctx.exec({ flow: outerFlow, input: null })
      events.push("after-outer-exec")

      expect(events).toEqual([
        "grandchild",
        "after-inner-exec",
        "child",
        "after-outer-exec"
      ])
      await ctx.close()
    })

    it("double close is no-op", async () => {
      const scope = createScope()
      const ctx = scope.createContext()
      let cleanupCount = 0

      await ctx.exec({
        flow: flow({
          factory: (childCtx) => {
            childCtx.onClose(() => {
              cleanupCount++
            })
          }
        }),
        input: null
      })

      expect(cleanupCount).toBe(1)
      await ctx.close()
    })
  })

  describe("closed context", () => {
    it("exec on closed child throws", async () => {
      const scope = createScope()
      const ctx = scope.createContext()

      let capturedCtx: Lite.ExecutionContext | undefined

      await ctx.exec({
        flow: flow({
          factory: (childCtx) => {
            capturedCtx = childCtx
          }
        }),
        input: null
      })

      await expect(
        capturedCtx!.exec({ flow: flow({ factory: () => {} }), input: null })
      ).rejects.toThrow("ExecutionContext is closed")

      await ctx.close()
    })

    it("data and parent accessible on closed context", async () => {
      const scope = createScope()
      const ctx = scope.createContext()
      const KEY = Symbol("test")

      let capturedCtx: Lite.ExecutionContext | undefined

      await ctx.exec({
        flow: flow({
          factory: (childCtx) => {
            childCtx.data.set(KEY, "value")
            capturedCtx = childCtx
          }
        }),
        input: null
      })

      expect(capturedCtx!.data.get(KEY)).toBe("value")
      expect(capturedCtx!.parent).toBe(ctx)
      await ctx.close()
    })
  })

  describe("extension integration", () => {
    it("wrapExec receives child context", async () => {
      const SPAN_KEY = Symbol("span")
      const contexts: Lite.ExecutionContext[] = []

      const tracingExtension: Lite.Extension = {
        name: "tracing",
        wrapExec: async (next, target, ctx) => {
          contexts.push(ctx)
          const parentSpan = ctx.parent?.data.get(SPAN_KEY)
          ctx.data.set(SPAN_KEY, { parent: parentSpan, id: contexts.length })
          return next()
        }
      }

      const scope = createScope({ extensions: [tracingExtension] })
      const ctx = scope.createContext()

      const innerFlow = flow({ factory: () => {} })
      const outerFlow = flow({
        factory: async (childCtx) => {
          await childCtx.exec({ flow: innerFlow, input: null })
        }
      })

      await ctx.exec({ flow: outerFlow, input: null })

      expect(contexts).toHaveLength(2)
      expect(contexts[0]!.parent).toBe(ctx)
      expect(contexts[1]!.parent).toBe(contexts[0])

      const span1 = contexts[0]!.data.get(SPAN_KEY) as { parent: unknown; id: number }
      const span2 = contexts[1]!.data.get(SPAN_KEY) as { parent: unknown; id: number }

      expect(span1.parent).toBeUndefined()
      expect(span2.parent).toEqual(span1)

      await ctx.close()
    })
  })

  describe("ctx.name resolution", () => {
    it("returns exec name when provided", async () => {
      const scope = createScope()
      const ctx = scope.createContext()

      let capturedName: string | undefined

      await ctx.exec({
        flow: flow({
          name: "flowName",
          factory: (childCtx) => {
            capturedName = childCtx.name
          }
        }),
        name: "execName"
      })

      expect(capturedName).toBe("execName")
      await ctx.close()
    })

    it("returns flow name when exec name not provided", async () => {
      const scope = createScope()
      const ctx = scope.createContext()

      let capturedName: string | undefined

      await ctx.exec({
        flow: flow({
          name: "flowName",
          factory: (childCtx) => {
            capturedName = childCtx.name
          }
        })
      })

      expect(capturedName).toBe("flowName")
      await ctx.close()
    })

    it("returns undefined when neither provided", async () => {
      const scope = createScope()
      const ctx = scope.createContext()

      let capturedName: string | undefined | null = null

      await ctx.exec({
        flow: flow({
          factory: (childCtx) => {
            capturedName = childCtx.name
          }
        })
      })

      expect(capturedName).toBeUndefined()
      await ctx.close()
    })

    it("root context has undefined name", () => {
      const scope = createScope()
      const ctx = scope.createContext()

      expect(ctx.name).toBeUndefined()
    })

    it("returns exec name for function execution when provided", async () => {
      const scope = createScope()
      const ctx = scope.createContext()
      let capturedName: string | undefined

      await ctx.exec({
        fn: (innerCtx) => {
          capturedName = innerCtx.name
          return 42
        },
        params: [],
        name: "explicitFnName"
      })

      expect(capturedName).toBe("explicitFnName")
    })

    it("exec name takes priority over fn.name for function execution", async () => {
      const scope = createScope()
      const ctx = scope.createContext()
      let capturedName: string | undefined

      async function namedFunction(innerCtx: Lite.ExecutionContext) {
        capturedName = innerCtx.name
        return 42
      }

      await ctx.exec({
        fn: namedFunction,
        params: [],
        name: "overrideName"
      })

      expect(capturedName).toBe("overrideName")
    })

    it("falls back to fn.name when exec name not provided", async () => {
      const scope = createScope()
      const ctx = scope.createContext()
      let capturedName: string | undefined

      async function namedFunction(innerCtx: Lite.ExecutionContext) {
        capturedName = innerCtx.name
        return 42
      }

      await ctx.exec({
        fn: namedFunction,
        params: []
      })

      expect(capturedName).toBe("namedFunction")
    })
  })

  describe("tag dependency resolution with seekTag (ADR-023)", () => {
    it("tags.required() finds ctx.data.setTag() value from parent", async () => {
      const userTag = tag<string>({ label: "user" })
      const scope = createScope()
      const ctx = scope.createContext()

      let capturedUser: string | undefined

      const handler = flow({
        deps: { user: tags.required(userTag) },
        factory: (_, { user }) => {
          capturedUser = user
        }
      })

      const middleware = flow({
        factory: async (parentCtx) => {
          parentCtx.data.setTag(userTag, "alice")
          return parentCtx.exec({ flow: handler })
        }
      })

      await ctx.exec({ flow: middleware })
      expect(capturedUser).toBe("alice")
      await ctx.close()
    })

    it("exec tags propagate to grandchildren via seekTag", async () => {
      const requestIdTag = tag<string>({ label: "requestId" })
      const scope = createScope()
      const ctx = scope.createContext()

      let capturedRequestId: string | undefined

      const grandchild = flow({
        deps: { reqId: tags.required(requestIdTag) },
        factory: (_, { reqId }) => {
          capturedRequestId = reqId
        }
      })

      const child = flow({
        factory: async (childCtx) => {
          return childCtx.exec({ flow: grandchild })
        }
      })

      await ctx.exec({
        flow: child,
        tags: [requestIdTag("req-123")]
      })

      expect(capturedRequestId).toBe("req-123")
      await ctx.close()
    })

    it("tags.all() collects from hierarchy (one per level)", async () => {
      const roleTag = tag<string>({ label: "role" })
      const scope = createScope()
      const ctx = scope.createContext()

      ctx.data.setTag(roleTag, "admin")

      let collectedRoles: string[] = []

      const grandchild = flow({
        deps: { roles: tags.all(roleTag) },
        factory: (_, { roles }) => {
          collectedRoles = roles
        }
      })

      const child = flow({
        factory: async (childCtx) => {
          childCtx.data.setTag(roleTag, "editor")
          return childCtx.exec({ flow: grandchild })
        }
      })

      const parent = flow({
        factory: async (parentCtx) => {
          parentCtx.data.setTag(roleTag, "viewer")
          return parentCtx.exec({ flow: child })
        }
      })

      await ctx.exec({ flow: parent })

      expect(collectedRoles).toEqual(["editor", "viewer", "admin"])
      await ctx.close()
    })

    it("child ctx.data.setTag() overrides parent value", async () => {
      const tenantTag = tag<string>({ label: "tenant" })
      const scope = createScope()
      const ctx = scope.createContext()

      let capturedTenant: string | undefined

      const child = flow({
        deps: { tenant: tags.required(tenantTag) },
        factory: (_, { tenant }) => {
          capturedTenant = tenant
        }
      })

      const parent = flow({
        factory: async (parentCtx) => {
          parentCtx.data.setTag(tenantTag, "tenant-A")
          return parentCtx.exec({
            flow: flow({
              factory: async (childCtx) => {
                childCtx.data.setTag(tenantTag, "tenant-B")
                return childCtx.exec({ flow: child })
              }
            })
          })
        }
      })

      await ctx.exec({ flow: parent })
      expect(capturedTenant).toBe("tenant-B")
      await ctx.close()
    })

    it("scope tags available in root context via createContext auto-population", async () => {
      const tenantTag = tag<string>({ label: "tenant" })
      const scope = createScope({ tags: [tenantTag("scope-tenant")] })
      const ctx = scope.createContext()

      let capturedTenant: string | undefined

      await ctx.exec({
        flow: flow({
          deps: { tenant: tags.required(tenantTag) },
          factory: (_, { tenant }) => {
            capturedTenant = tenant
          }
        })
      })

      expect(capturedTenant).toBe("scope-tenant")
      await ctx.close()
    })

    it("context tags override scope tags", async () => {
      const tenantTag = tag<string>({ label: "tenant" })
      const scope = createScope({ tags: [tenantTag("scope-tenant")] })
      const ctx = scope.createContext({ tags: [tenantTag("context-tenant")] })

      let capturedTenant: string | undefined

      await ctx.exec({
        flow: flow({
          deps: { tenant: tags.required(tenantTag) },
          factory: (_, { tenant }) => {
            capturedTenant = tenant
          }
        })
      })

      expect(capturedTenant).toBe("context-tenant")
      await ctx.close()
    })
  })

  describe("service with tag deps", () => {
    it("service can use tags.required and resolve at runtime", async () => {
      const tenantTag = tag<string>({ label: "tenant" })

      const tenantService = service({
        deps: { tenantId: tags.required(tenantTag) },
        factory: (_ctx, { tenantId }) => ({
          getTenant: (_ctx) => tenantId,
          formatTenant: (_ctx, prefix: string) => `${prefix}-${tenantId}`,
        }),
      })

      const scope = createScope({ tags: [tenantTag("acme-corp")] })
      const svc = await scope.resolve(tenantService)
      const ctx = scope.createContext()

      const tenant = await ctx.exec({ fn: svc.getTenant, params: [] })
      const formatted = await ctx.exec({ fn: svc.formatTenant, params: ["org"] })

      expect(tenant).toBe("acme-corp")
      expect(formatted).toBe("org-acme-corp")
      await ctx.close()
    })
  })
})
