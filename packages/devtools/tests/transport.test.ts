import { describe, it, expect, vi } from "vitest"
import { createScope } from "@pumped-fn/core-next"
import { transportExecutor } from "../src/transport"
import { type Transport } from "../src/types"

describe("Transport Interface", () => {
  it("should satisfy Transport interface contract", async () => {
    const scope = createScope()
    const transport = await scope.resolve(transportExecutor)

    expect(transport).toHaveProperty("emit")
    expect(transport).toHaveProperty("subscribe")
    expect(typeof transport.emit).toBe("function")
    expect(typeof transport.subscribe).toBe("function")

    await scope.dispose()
  })

  it("should create transport via executor", async () => {
    const scope = createScope()
    const transport = await scope.resolve(transportExecutor)
    const messages: Transport.Message[] = []

    transport.subscribe(msg => messages.push(msg))

    transport.emit({
      timestamp: Date.now(),
      duration: 5,
      operation: { kind: "resolve", executorId: "test" }
    })

    expect(messages).toHaveLength(1)

    await scope.dispose()
  })
})

describe("Transport", () => {
  it("should emit messages to subscribers", async () => {
    const scope = createScope()
    const transport = await scope.resolve(transportExecutor)

    const handler = vi.fn()
    transport.subscribe(handler)

    const msg = {
      timestamp: Date.now(),
      duration: 100,
      operation: { kind: "resolve" as const, executor: {} as any, scope: {} as any, operation: "resolve" as const }
    }

    transport.emit(msg)

    expect(handler).toHaveBeenCalledWith(msg)

    await scope.dispose()
  })

  it("should unsubscribe handlers", async () => {
    const scope = createScope()
    const transport = await scope.resolve(transportExecutor)

    const handler = vi.fn()
    const unsubscribe = transport.subscribe(handler)

    unsubscribe()

    transport.emit({
      timestamp: Date.now(),
      duration: 100,
      operation: { kind: "resolve" as const, executor: {} as any, scope: {} as any, operation: "resolve" as const }
    })

    expect(handler).not.toHaveBeenCalled()

    await scope.dispose()
  })

  it("should emit to multiple subscribers", async () => {
    const scope = createScope()
    const transport = await scope.resolve(transportExecutor)

    const handler1 = vi.fn()
    const handler2 = vi.fn()
    const handler3 = vi.fn()

    transport.subscribe(handler1)
    transport.subscribe(handler2)
    transport.subscribe(handler3)

    const msg = {
      timestamp: Date.now(),
      duration: 100,
      operation: { kind: "resolve" as const, executor: {} as any, scope: {} as any, operation: "resolve" as const }
    }

    transport.emit(msg)

    expect(handler1, "handler1 should receive message").toHaveBeenCalledWith(msg)
    expect(handler2, "handler2 should receive message").toHaveBeenCalledWith(msg)
    expect(handler3, "handler3 should receive message").toHaveBeenCalledWith(msg)

    await scope.dispose()
  })

  it("should isolate handler errors", async () => {
    const scope = createScope()
    const transport = await scope.resolve(transportExecutor)

    const failingHandler = vi.fn(() => { throw new Error("Handler error") })
    const successHandler1 = vi.fn()
    const successHandler2 = vi.fn()

    transport.subscribe(successHandler1)
    transport.subscribe(failingHandler)
    transport.subscribe(successHandler2)

    const msg = {
      timestamp: Date.now(),
      duration: 100,
      operation: { kind: "resolve" as const, executor: {} as any, scope: {} as any, operation: "resolve" as const }
    }

    transport.emit(msg)

    expect(failingHandler, "failing handler should be called").toHaveBeenCalledWith(msg)
    expect(successHandler1, "handler before error should receive message").toHaveBeenCalledWith(msg)
    expect(successHandler2, "handler after error should receive message").toHaveBeenCalledWith(msg)

    await scope.dispose()
  })
})
