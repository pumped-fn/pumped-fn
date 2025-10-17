import { describe, it, expect } from "vitest"
import { createScope, provide, derive, name } from "@pumped-fn/core-next"
import { createDevtoolsExtension } from "../src/extension"

describe("Devtools Extension", () => {
  it("should create extension with isolated scope", async () => {
    const ext = createDevtoolsExtension()

    expect(ext.name).toBe("devtools")
    expect(ext.init).toBeDefined()
    expect(ext.wrap).toBeDefined()
    expect(ext.dispose).toBeDefined()
  })

  it("should capture resolve operations", async () => {
    const messages: any[] = []
    const ext = createDevtoolsExtension({
      onMessage: (msg) => messages.push(msg)
    })

    const testExecutor = provide(() => ({ value: 42 }), name("test"))

    const scope = createScope({ extensions: [ext] })
    await scope.resolve(testExecutor)

    expect(messages.length).toBeGreaterThan(0)
    expect(messages.some(m => m.operation.kind === "resolve")).toBe(true)

    await scope.dispose()
  })

  it("should dispose devtools scope", async () => {
    const ext = createDevtoolsExtension()

    const scope = createScope({ extensions: [ext] })
    await scope.resolve(provide(() => ({})))

    await scope.dispose()
  })
})
