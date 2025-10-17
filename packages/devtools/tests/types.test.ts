import { describe, it, expect } from "vitest"
import { type Transport } from "../src/types"

describe("Transport Types", () => {
  it("should validate event message structure", () => {
    const msg: Transport.Message = {
      timestamp: Date.now(),
      duration: 123,
      operation: {
        kind: "resolve",
        executor: {} as any,
        scope: {} as any,
        operation: "resolve"
      }
    }

    expect(msg.timestamp).toBeTypeOf("number")
    expect(msg.duration).toBeTypeOf("number")
    expect(msg.operation.kind).toBe("resolve")
  })
})
