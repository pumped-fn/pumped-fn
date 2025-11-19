import { describe, expect, vi } from "vitest"
import {
  createScope,
  custom,
  derive,
  flow,
  flowMeta,
  multi,
  Promised,
  provide,
  tag,
  tags,
} from "../src"
import { preset } from "../src/executor"
import { isTag, isTagExecutor } from "../src/tag-executors"
import { tagSymbol } from "../src/tag-types"
import {
  createJournalKey,
  checkJournalReplay,
  isErrorEntry,
} from "../src/internal/journal-utils"
import { applyExtensions } from "../src/internal/extension-utils"
import { scenario } from "./scenario"
import { createFlowHarness } from "./harness"
import type { Extension } from "../src/types"

const isExecutionOperation = (
  operation: Extension.Operation,
): operation is Extension.ExecutionOperation => operation.kind === "execution"

describe("extensions behavior", () => {
  const harness = createFlowHarness()

  scenario("extension tracking and real flows", async () => {
    const { ext, records } = harness.createTrackingExtension(
      (kind, op) => kind === "execution" && isExecutionOperation(op) && op.target.type === "fn",
    )
    const mathFlow = flow(async (ctx, input: { x: number; y: number }) => {
      const product = await ctx.exec({
        key: "multiply",
        fn: (a: number, b: number) => a * b,
        params: [input.x, input.y],
      })
      const sum = await ctx.exec({
        key: "add",
        fn: (a: number, b: number) => a + b,
        params: [input.x, input.y],
      })
      const combined = await ctx.exec({ key: "combine", fn: () => product + sum })
      return { product, sum, combined }
    })
    const mathResult = await flow.execute(mathFlow, { x: 5, y: 3 }, { extensions: [ext] })
    expect(mathResult).toEqual({ product: 15, sum: 8, combined: 23 })
    expect(records).toHaveLength(3)
    expect(records[0]).toMatchObject({ key: "multiply", params: [5, 3], output: 15 })
    expect(records[1]).toMatchObject({ key: "add", output: 8 })
    expect(records[2]).toMatchObject({ key: "combine", output: 23 })

    const composeTracker = harness.createTrackingExtension(
      (kind, op) => kind === "execution" && isExecutionOperation(op) && op.target.type === "flow",
    )
    const incrementFlow = flow((_ctx, x: number) => x + 1)
    const doubleFlow = flow((_ctx, x: number) => x * 2)
    const composed = flow(async (ctx, input: { value: number }) => {
      const incremented = await ctx.exec(incrementFlow, input.value)
      const doubled = await ctx.exec(doubleFlow, incremented)
      return { original: input.value, result: doubled }
    })
    const composedResult = await flow.execute(composed, { value: 5 }, {
      extensions: [composeTracker.ext],
    })
    expect(composedResult).toEqual({ original: 5, result: 12 })
    expect(
      composeTracker.records.some(
        (record) => record.kind === "execution" && record.input === 5,
      ),
    ).toBe(true)
    expect(
      composeTracker.records.some(
        (record) => record.kind === "execution" && record.input === 6,
      ),
    ).toBe(true)

    const allTracker = harness.createTrackingExtension()
    const api = provide(() => ({
      multiply: vi.fn((x: number) => x * 2),
      add: vi.fn((x: number) => x + 10),
      fail: vi.fn(() => {
        throw new Error("Intentional failure")
      }),
    }))
    const multiplyFlow = flow({ api }, async ({ api }, ctx, input: number) =>
      ctx.exec({ key: "multiply-op", fn: () => api.multiply(input) }),
    )
    const addFlow = flow({ api }, async ({ api }, ctx, input: number) =>
      ctx.exec({ key: "add-op", fn: () => api.add(input) }),
    )
    const parallelFlow = flow({ api }, async (_deps, ctx, input: number) => {
      const { results } = await ctx.parallel([ctx.exec(multiplyFlow, input), ctx.exec(addFlow, input)])
      const combined = await ctx.exec({ key: "combine", fn: () => results[0] + results[1] })
      return { multiplied: results[0], added: results[1], combined }
    })
    const parallelResult = await flow.execute(parallelFlow, 5, { extensions: [allTracker.ext] })
    expect(parallelResult).toEqual({ multiplied: 10, added: 15, combined: 25 })
    expect(
      allTracker.records.filter(
        (record) => record.kind === "execution" && record.targetType === "parallel",
      ).length,
    ).toBe(1)
    records.length = 0
    const failingFlow = flow({ api }, async ({ api }, ctx) => {
      await ctx.exec({ key: "fail-op", fn: () => api.fail() })
    })
    await expect(flow.execute(failingFlow, 1, { extensions: [allTracker.ext] })).rejects.toThrow(
      "Intentional failure",
    )
    const errored = allTracker.records.find(
      (record) => record.kind === "execution" && record.error,
    )
    expect(errored?.error).toBeInstanceOf(Error)

    type Order = { orderId: string; items: string[]; total: number }
    const services = provide(() => ({
      validateOrder: vi.fn((order: Order) => {
        if (order.items.length === 0) throw new Error("Order has no items")
        return { valid: true, orderId: order.orderId }
      }),
      checkInventory: vi.fn((items: string[]) => {
        const unavailable = items.filter((item) => item === "out-of-stock")
        if (unavailable.length > 0) throw new Error(`Items unavailable: ${unavailable.join(", ")}`)
        return { available: true, items }
      }),
      chargePayment: vi.fn((orderId: string, amount: number) => ({
        transactionId: `txn-${orderId}`,
        charged: amount,
      })),
      reserveInventory: vi.fn((items: string[]) => ({ reserved: true, items })),
      updateOrderStatus: vi.fn((orderId: string, status: string) => ({
        orderId,
        status,
        updatedAt: new Date().toISOString(),
      })),
    }))
    const validateOrderFlow = flow(services, async (deps, ctx, order: Order) =>
      ctx.exec({ key: "validate", fn: () => deps.validateOrder(order) }),
    )
    const checkInventoryFlow = flow(services, async (deps, ctx, items: string[]) =>
      ctx.exec({ key: "check-inventory", fn: () => deps.checkInventory(items) }),
    )
    const chargePaymentFlow = flow(services, async (deps, ctx, payload: { orderId: string; amount: number }) =>
      ctx.exec({ key: "charge", fn: () => deps.chargePayment(payload.orderId, payload.amount) }),
    )
    const reserveInventoryFlow = flow(services, async (deps, ctx, items: string[]) =>
      ctx.exec({ key: "reserve", fn: () => deps.reserveInventory(items) }),
    )
    const processOrder = flow(services, async (deps, ctx, order: Order) => {
      const validation = await ctx.exec(validateOrderFlow, order)
      const inventory = await ctx.exec(checkInventoryFlow, order.items)
      const settled = await ctx.parallelSettled([
        ctx.exec(chargePaymentFlow, { orderId: order.orderId, amount: order.total }),
        ctx.exec(reserveInventoryFlow, order.items),
      ])
      const [paymentResult, inventoryResult] = settled.results
      if (paymentResult.status === "rejected") {
        throw new Error(`Payment failed: ${(paymentResult.reason as Error).message}`)
      }
      if (inventoryResult.status === "rejected") {
        throw new Error(`Inventory failed: ${(inventoryResult.reason as Error).message}`)
      }
      const status = await ctx.exec({
        key: "update-status",
        fn: () => deps.updateOrderStatus(order.orderId, "completed"),
      })
      return {
        orderId: order.orderId,
        validation,
        inventory,
        payment: paymentResult.value,
        inventoryReservation: inventoryResult.value,
        status,
      }
    })
    const success = await flow.execute(processOrder, {
      orderId: "order-123",
      items: ["item1", "item2"],
      total: 100,
    })
    expect(success.orderId).toBe("order-123")
    await expect(
      flow.execute(processOrder, { orderId: "order-456", items: [], total: 50 }),
    ).rejects.toThrow("Order has no items")
    await expect(
      flow.execute(processOrder, {
        orderId: "order-789",
        items: ["item1", "out-of-stock"],
        total: 75,
      }),
    ).rejects.toThrow("Items unavailable")
  })

  scenario("extension wrapping, metadata, and scope lifecycle", async () => {
    const tracker = harness.createTrackingExtension()
    const operations: Array<{ name: string; run: (scope: ReturnType<typeof createScope>) => Promise<unknown> }> = [
      {
        name: "flow execution",
        run: async (scope) => {
          const basic = flow((_ctx) => 1)
          return flow.execute(basic, undefined, { scope })
        },
      },
      {
        name: "journaled subflow",
        run: async (scope) => {
          const child = flow((_ctx, n: number) => n * 2)
          const parent = flow(async (ctx) => ctx.exec({ flow: child, input: 5, key: "key" }))
          return flow.execute(parent, undefined, { scope })
        },
      },
      {
        name: "non-journaled subflow",
        run: async (scope) => {
          const child = flow((_ctx, n: number) => n * 2)
          const parent = flow(async (ctx) => ctx.exec(child, 5))
          return flow.execute(parent, undefined, { scope })
        },
      },
      {
        name: "journaled fn",
        run: async (scope) => {
          const parent = flow(async (ctx) => ctx.exec({ fn: () => 1, key: "fn" }))
          return flow.execute(parent, undefined, { scope })
        },
      },
      {
        name: "non-journaled fn",
        run: async (scope) => {
          const parent = flow(async (ctx) => ctx.exec({ fn: () => 1 }))
          return flow.execute(parent, undefined, { scope })
        },
      },
      {
        name: "parallel",
        run: async (scope) => {
          const child = flow((_ctx, n: number) => n * 2)
          const parent = flow(async (ctx) => ctx.parallel([ctx.exec(child, 1), ctx.exec(child, 2)]))
          return flow.execute(parent, undefined, { scope })
        },
      },
    ]
    for (const op of operations) {
      tracker.records.length = 0
      const scope = createScope({ extensions: [tracker.ext] })
      await op.run(scope)
      expect(tracker.records.some((record) => record.kind === "execution")).toBe(true)
      await scope.dispose()
    }

    const order: string[] = []
    const ext1: Extension.Extension = {
      name: "ext1",
      async wrap(_scope, next, operation) {
        if (operation.kind === "execution") order.push("ext1-before")
        const result = await next()
        if (operation.kind === "execution") order.push("ext1-after")
        return result
      },
    }
    const ext2: Extension.Extension = {
      name: "ext2",
      async wrap(_scope, next, operation) {
        if (operation.kind === "execution") order.push("ext2-before")
        const result = await next()
        if (operation.kind === "execution") order.push("ext2-after")
        return result
      },
    }
    const scopeForOrder = createScope({ extensions: [ext1, ext2] })
    const orderFlow = flow((ctx) => {
      order.push("handler")
      return ctx
    })
    await flow.execute(orderFlow, undefined, { scope: scopeForOrder })
    expect(order).toEqual([
      "ext1-before",
      "ext2-before",
      "handler",
      "ext2-after",
      "ext1-after",
    ])

    const depthRecords: number[] = []
    const depthExt: Extension.Extension = {
      name: "depth",
      wrap(_scope, next, operation) {
        if (operation.kind === "execution" && operation.target.type === "flow") {
          depthRecords.push(operation.context.get(flowMeta.depth) as number)
        }
        return next()
      },
    }
    const depthScope = createScope({ extensions: [depthExt] })
    const child = flow((_ctx, n: number) => n * 2)
    const parent = flow(async (ctx) => ctx.exec(child, 5))
    await flow.execute(parent, undefined, { scope: depthScope })
    expect(depthRecords).toContain(0)
    expect(depthRecords).toContain(1)

    const scopeTag = tag(custom<string>(), { label: "scopeTag" })
    const execTag = tag(custom<string>(), { label: "execTag" })
    const scope = createScope({ tags: [scopeTag("scopeValue")] })
    const tagFlow = flow((ctx) => ({ scopeValue: ctx.get(scopeTag), execValue: ctx.get(execTag) }))
    const tagResult = await flow.execute(tagFlow, undefined, {
      scope,
      executionTags: [execTag("execValue")],
    })
    expect(tagResult).toEqual({ scopeValue: "scopeValue", execValue: "execValue" })
    const inheritedTag = tag(custom<string>(), { label: "parentTag" })
    const parentFlow = flow(async (ctx) => ctx.exec(flow((childCtx) => childCtx.get(inheritedTag)), undefined))
    const inherited = await flow.execute(parentFlow, undefined, {
      executionTags: [inheritedTag("parentValue")],
    })
    expect(inherited).toBe("parentValue")

    let disposeCalled = false
    const lifecycleExt = {
      name: "lifecycle",
      dispose() {
        disposeCalled = true
      },
    }
    const lifecycleFlow = flow((_ctx) => 1)
    await flow.execute(lifecycleFlow, undefined, { extensions: [lifecycleExt] })
    expect(disposeCalled).toBe(true)
    disposeCalled = false
    const providedScope = createScope({ extensions: [lifecycleExt] })
    await flow.execute(lifecycleFlow, undefined, { scope: providedScope })
    expect(disposeCalled).toBe(false)
    await providedScope.dispose()
    expect(disposeCalled).toBe(true)
  })

  scenario("tag creation, extraction, and type guards", async () => {
    const emailTag = tag(custom<string>(), { label: "email" })
    expect(typeof emailTag.key).toBe("symbol")
    expect(emailTag.toString()).toContain("email")
    const taggedEmail = emailTag("test@example.com")
    expect(taggedEmail.value).toBe("test@example.com")
    const anonTag = tag(custom<string>())
    expect(() => (anonTag as any)()).toThrow()
    const portTag = tag(custom<number>(), { label: "port", default: 3000 })
    expect(portTag().value).toBe(3000)
    const [portKey, portValue] = portTag.entry()
    expect(portKey).toBe(portTag.key)
    expect(portValue).toBe(3000)

    const store = new Map<symbol, unknown>()
    emailTag.injectTo(store, "test@example.com")
    expect(emailTag.extractFrom(store)).toBe("test@example.com")
    portTag.injectTo(store, 8080)
    expect(portTag.extractFrom(store)).toBe(8080)
    const validatedNumberTag = tag(
      {
        "~standard": {
          vendor: "test",
          version: 1,
          validate(value: unknown) {
            if (typeof value !== "number") {
              return { success: false, issues: [{ message: "Expected number" }] }
            }
            return { success: true, value }
          },
        },
      },
      { label: "validated-number" },
    )
    const validatedStore = new Map<symbol, unknown>()
    expect(() => validatedNumberTag.injectTo(validatedStore, "invalid" as any)).toThrow()

    const writeToStore = new Map<symbol, unknown>()
    const numberTag = tag(custom<number>(), { label: "number" })
    numberTag.writeToStore(writeToStore, 42)
    expect(numberTag.extractFrom(writeToStore)).toBe(42)

    const writeToContainer = { tags: [] as ReturnType<typeof numberTag>[] }
    const tagged = numberTag.writeToContainer(writeToContainer, 5)
    expect(tagged.value).toBe(5)
    expect(writeToContainer.tags).toHaveLength(1)
    expect(writeToContainer.tags[0].value).toBe(5)

    const writeToTagsArray: ReturnType<typeof numberTag>[] = []
    const taggedFromArray = numberTag.writeToTags(writeToTagsArray, 99)
    expect(taggedFromArray.value).toBe(99)
    expect(writeToTagsArray).toHaveLength(1)
    expect(writeToTagsArray[0].value).toBe(99)

    const cachedContainer = { tags: [numberTag(10), numberTag(20)] }
    const firstRead = numberTag.collectFrom(cachedContainer)
    expect(firstRead).toEqual([10, 20])
    numberTag.writeToContainer(cachedContainer, 30)
    const secondRead = numberTag.collectFrom(cachedContainer)
    expect(secondRead).toEqual([10, 20, 30])

    const cachedTagArray: ReturnType<typeof numberTag>[] = [numberTag(1)]
    const firstArrayRead = numberTag.collectFrom(cachedTagArray)
    expect(firstArrayRead).toEqual([1])
    numberTag.writeToTags(cachedTagArray, 2)
    const secondArrayRead = numberTag.collectFrom(cachedTagArray)
    expect(secondArrayRead).toEqual([1, 2])

    expect(() => numberTag.writeToContainer(null as any, 5)).toThrow("writeToContainer requires Container object")
    expect(() => numberTag.writeToContainer([] as any, 5)).toThrow("writeToContainer requires Container object")
    expect(() => numberTag.writeToContainer({ tags: "invalid" as any }, 5)).toThrow("Container.tags must be array if present")
    expect(() => numberTag.writeToTags(null as any, 5)).toThrow("writeToTags requires Tagged[] array")
    expect(() => numberTag.writeToTags({} as any, 5)).toThrow("writeToTags requires Tagged[] array")

    const mapSource = new Map<symbol, unknown>()
    const defaultNumberTag = tag(custom<number>(), { default: 42 })
    expect(defaultNumberTag.extractFrom(mapSource)).toBe(42)
    mapSource.set(defaultNumberTag.key, 100)
    expect(defaultNumberTag.extractFrom(mapSource)).toBe(100)

    const scopeSource = createScope({ tags: [emailTag("scope@example.com")] })
    expect(emailTag.extractFrom(scopeSource)).toBe("scope@example.com")
    expect(emailTag.readFrom(scopeSource)).toBe("scope@example.com")
    expect(emailTag.collectFrom(scopeSource)).toEqual(["scope@example.com"])

    const tagArray = [emailTag("first"), emailTag("second"), portTag(9090)]
    expect(emailTag.collectFrom(tagArray)).toEqual(["first", "second"])
    expect(emailTag.readFrom(tagArray)).toBe("first")

    const requiredExec = tags.required(emailTag)
    expect(requiredExec[tagSymbol]).toBe("required")
    expect(requiredExec.tag).toBe(emailTag)
    expect(requiredExec.extractionMode).toBe("extract")
    const optionalExec = tags.optional(portTag)
    expect(optionalExec[tagSymbol]).toBe("optional")
    expect(optionalExec.extractionMode).toBe("read")
    const allExec = tags.all(emailTag)
    expect(allExec[tagSymbol]).toBe("all")

    expect(isTag(emailTag)).toBe(true)
    expect(isTagExecutor(requiredExec)).toBe(true)
    expect(isTagExecutor(emailTag)).toBe(false)

    const scope = createScope({ tags: [emailTag("derivation@example.com")] })
    const derived = derive([emailTag], ([value]) => `Hello ${value}`)
    const derivedResult = await scope.resolve(derived)
    expect(derivedResult).toBe("Hello derivation@example.com")

    const container = { tags: [emailTag("container@example.com")] }
    expect(emailTag.extractFrom(container)).toBe("container@example.com")
    const emptyContainer = { tags: undefined as ReturnType<typeof emailTag>[] | undefined }
    expect(emailTag.collectFrom(emptyContainer)).toEqual([])
    const otherTag = tag(custom<string>(), { label: "other" })
    const mixedContainer = { tags: [otherTag("x"), emailTag("y")] }
    expect(emailTag.extractFrom(mixedContainer)).toBe("y")
    expect(() => emailTag.extractFrom({ tags: [] })).toThrow()
  })

  scenario("journal utilities and lazy snapshots", async () => {
    const keyCases = [
      { flow: "myFlow", depth: 2, key: "action", expected: "myFlow:2:action" },
      { flow: "test", depth: 0, key: "init", expected: "test:0:init" },
      { flow: "nested", depth: 5, key: "op", expected: "nested:5:op" },
    ]
    for (const entry of keyCases) {
      expect(createJournalKey(entry.flow, entry.depth, entry.key)).toBe(entry.expected)
    }
    expect(isErrorEntry({ __error: true, error: new Error("e") })).toBe(true)
    expect(isErrorEntry({ value: 42 })).toBe(false)
    const journal = new Map<string, unknown>()
    expect(checkJournalReplay(journal, "key:0:test")).toEqual({ isReplay: false, value: undefined })
    journal.set("key:0:test", 42)
    expect(checkJournalReplay(journal, "key:0:test")).toEqual({ isReplay: true, value: 42 })
    const err = new Error("test error")
    journal.set("key:error", { __error: true, error: err })
    expect(() => checkJournalReplay(journal, "key:error")).toThrow("test error")

    const originalMap = global.Map
    let cloneCount = 0
    class TrackedMap<K, V> extends Map<K, V> {
      constructor(entries?: readonly (readonly [K, V])[] | null) {
        super(entries)
        if (entries && entries instanceof Map) {
          cloneCount += 1
        }
      }
    }
    ;(global as any).Map = TrackedMap
    try {
      const detailsFlow = flow((ctx) => {
        ctx.set(flowMeta.flowName, "test")
        return "result"
      })
      const execution = flow.execute(detailsFlow, undefined, { details: true })
      await execution
      expect(cloneCount).toBe(0)
      const details = await execution
      const snapshot = details.ctx
      expect(cloneCount).toBe(0)
      snapshot.context.get(flowMeta.flowName)
      expect(cloneCount).toBe(1)
      snapshot.context.get(flowMeta.flowName)
      expect(cloneCount).toBe(1)
    } finally {
      ;(global as any).Map = originalMap
    }
  })

  scenario("multi executors pools", async () => {
    const dbPool = multi.provide({ keySchema: custom<string>() }, (db) => ({ connection: `${db}-pool` }))
    const scope = createScope()
    expect(await scope.resolve(dbPool("users"))).toEqual({ connection: "users-pool" })
    expect(await scope.resolve(dbPool("orders"))).toEqual({ connection: "orders-pool" })

    const config = provide(() => ({ baseUrl: "https://api.example.com" }))
    const apiClient = multi.derive(
      { keySchema: custom<string>(), dependencies: { config } },
      ({ config }, service) => ({ endpoint: `${config.baseUrl}/${service}` }),
    )
    expect(await scope.resolve(apiClient("users"))).toEqual({ endpoint: "https://api.example.com/users" })
    expect(await scope.resolve(apiClient("orders"))).toEqual({ endpoint: "https://api.example.com/orders" })

    await scope.resolve(dbPool("release"))
    const entriesBeforeRelease = scope.entries().length
    await dbPool.release(scope)
    await apiClient.release(scope)
    expect(scope.entries().length).toBeLessThan(entriesBeforeRelease)
  })

  scenario("applyExtensions integration", async () => {
    const scope = createScope()
    const base = () => Promised.create(Promise.resolve(10))
    const operation = {
      kind: "resolve" as const,
      executor: provide(() => 1),
      scope,
      operation: "resolve" as const,
    }
    const wrappedWithoutExt = applyExtensions(undefined, base, scope, operation)
    expect(wrappedWithoutExt).toBe(base)

    const ext = {
      name: "adder",
      wrap: (_scope: any, next: () => Promised<number>) =>
        Promised.create(next().then((value) => (value + 5) as any)),
    }
    const wrapped = applyExtensions([ext], base, scope, operation)
    expect(await wrapped()).toBe(15)

    const identityExt = { name: "no-wrap" }
    const identityWrapped = applyExtensions([identityExt], base, scope, operation)
    expect(identityWrapped).toBe(base)

    const promiseExt = {
      name: "promise",
      wrap: (_scope: any, next: () => Promised<number>) => next().then((value) => Promise.resolve(value * 2)),
    }
    const promiseWrapped = applyExtensions([promiseExt], base, scope, operation)
    const promisedResult = promiseWrapped()
    expect(promisedResult).toBeInstanceOf(Promised)
    expect(await promisedResult).toBe(20)
  })
})
