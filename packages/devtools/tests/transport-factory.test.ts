import { describe, it, expect } from "vitest"
import { createTransport } from "../src/transports/in-memory"
import { type Transport } from "../src/types"

describe("Transport Factory", () => {
  it("should create in-memory transport", () => {
    const transport = createTransport()

    expect(transport).toHaveProperty("emit")
    expect(transport).toHaveProperty("subscribe")
  })

  it("should emit and receive messages", () => {
    const transport = createTransport()
    const messages: Transport.Message[] = []

    transport.subscribe(msg => messages.push(msg))

    const testMsg: Transport.Message = {
      timestamp: Date.now(),
      duration: 10,
      operation: { kind: "resolve", executorId: "test" }
    }

    transport.emit(testMsg)

    expect(messages).toHaveLength(1)
    expect(messages[0]).toEqual(testMsg)
  })
})
