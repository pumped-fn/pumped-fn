import { describe, expect, it } from "vitest"
import { makeFixture } from "../fixture"
import { startPumped } from "../lanes/pumped"
import { createTrace } from "../trace"

describe("pumped-fn operations", () => {
  it("records named graph execution", async () => {
    const trace = createTrace()
    const runtime = await startPumped(makeFixture(), trace)

    await runtime.provision({ email: "test@example.com" }, { actorId: "admin-test", requestId: "request-test" })
    await runtime.close()
    expect(trace.names).toEqual(expect.arrayContaining([
      "database.open",
      "account.provision.pumped",
      "database.insertUser",
    ]))
  })
})
