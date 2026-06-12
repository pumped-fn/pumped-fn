import { createScope } from "@pumped-fn/lite"
import { describe, expect, test } from "vitest"
import {
  boundary,
  leaf,
  metadata,
  parentSeek,
  requestId,
} from "./after"

describe("inside-out", () => {
  test("IO1: leaf flow resolves tag from exec tags directly", async () => {
    const scope = createScope()
    const ctx = scope.createContext()

    await expect(ctx.exec({
      flow: leaf,
      tags: [requestId("req-direct")],
    })).resolves.toBe("req-direct")
  })

  test("IO2: missing required tag -> exec rejects (error branch)", async () => {
    const scope = createScope()
    const ctx = scope.createContext()

    await expect(ctx.exec({ flow: leaf })).rejects.toThrow("request.id")
  })

  test("IO3: tags.optional absent -> undefined branch; tag default -> default branch", async () => {
    const scope = createScope()
    const ctx = scope.createContext()

    await expect(ctx.exec({ flow: metadata })).resolves.toEqual({
      channel: undefined,
      priority: "normal",
    })
  })
})

describe("outside-in", () => {
  test("OI1: boundary flow -> 2 nested exec levels -> leaf reads requestId; zero intermediate signatures carry it", async () => {
    const scope = createScope()
    const ctx = scope.createContext({ tags: [requestId("req-chain")] })

    await expect(ctx.exec({ flow: boundary })).resolves.toBe("req-chain")
  })

  test("OI2: exec-level tag shadows context-level tag", async () => {
    const scope = createScope()
    const ctx = scope.createContext({ tags: [requestId("req-context")] })

    await expect(ctx.exec({
      flow: leaf,
      tags: [requestId("req-exec")],
    })).resolves.toBe("req-exec")
  })

  test("OI3: ctx.data.seekTag finds parent-context tag from child", async () => {
    const scope = createScope()
    const ctx = scope.createContext({ tags: [requestId("req-parent")] })

    await expect(ctx.exec({ flow: parentSeek })).resolves.toBe("req-parent")
  })
})
