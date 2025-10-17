import { describe, it, expect } from "vitest"
import { createScope, provide, name, flow } from "@pumped-fn/core-next"
import { createDevtoolsExtension } from "../src/extension"
import { type Transport } from "../src/types"

describe("Devtools Extension", () => {
  it("should create extension with isolated scope", async () => {
    const ext = createDevtoolsExtension()

    expect(ext.name).toBe("devtools")
    expect(ext.init).toBeDefined()
    expect(ext.wrap).toBeDefined()
    expect(ext.dispose).toBeDefined()
  })

  it("should capture resolve operations", async () => {
    const messages: Transport.Message[] = []
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

  it("should capture flow execution", async () => {
    const messages: Transport.Message[] = []
    const ext = createDevtoolsExtension({
      onMessage: (msg) => messages.push(msg)
    })

    const testFlow = flow(async (ctx) => {
      await ctx.run("test-operation", () => 42)
      return { result: "test" }
    })

    await flow.execute(testFlow, undefined, { extensions: [ext] })

    expect(messages.length).toBeGreaterThan(0)
    expect(messages.some(m => m.operation.kind === "execute" || m.operation.kind === "journal")).toBe(true)
  })

  it("should dispose devtools scope", async () => {
    const ext = createDevtoolsExtension()

    const scope = createScope({ extensions: [ext] })
    await scope.resolve(provide(() => ({})))

    await scope.dispose()
  })

  it("should support IPC transport via config", async () => {
    const ext = createDevtoolsExtension({
      transport: "ipc",
      transportConfig: {
        socketPath: "/tmp/test-devtools.sock"
      }
    })

    expect(ext.name).toBe("devtools")
  })
})
