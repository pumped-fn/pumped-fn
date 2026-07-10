import { describe, expect, it } from "vitest"
import { makeFixture } from "../fixture"
import { startAwilix } from "../lanes/awilix"
import { createTrace } from "../trace"

describe("Awilix operations", () => {
  it("records the injected business span", async () => {
    const trace = createTrace()
    const runtime = startAwilix(makeFixture(), trace)

    await runtime.provision({ email: "test@example.com" }, { actorId: "admin-test", requestId: "request-test" })
    await runtime.close()
    expect(trace.names).toEqual(["account.provision.awilix"])
  })
})
