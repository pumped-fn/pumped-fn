import { describe, expect, it } from "vitest"
import { makeFixture } from "../fixture"
import { startPlain } from "../lanes/plain"
import { createTrace } from "../trace"

describe("Plain TypeScript operations", () => {
  it("records the explicit application span", async () => {
    const trace = createTrace()
    const runtime = await startPlain(makeFixture(), trace)

    await runtime.provision({ email: "test@example.com" }, { actorId: "admin-test", requestId: "request-test" })
    await runtime.close()
    expect(trace.names).toEqual(["account.provision.plain"])
  })
})
