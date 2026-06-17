import { describe, test, expect } from "vitest"
import { atom, createScope } from "@pumped-fn/lite"

describe("inside-out", () => {
  test("logic tests run in node — no DOM, graph still fully exercisable through the seam", async () => {
    expect(typeof document).toBe("undefined")
    expect(typeof window).toBe("undefined")

    const greeting = atom({ factory: () => "hello from the graph" })
    const scope = createScope()
    expect(await scope.resolve(greeting)).toBe("hello from the graph")
    await scope.dispose()
  })
})
