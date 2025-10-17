import { describe, it, expect, vi } from "vitest"
import { createScope } from "@pumped-fn/core-next"
import { transportExecutor } from "../src/transport"

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
})
