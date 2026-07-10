import { describe, expect, it } from "vitest"
import { makeFixture } from "../fixture"
import { startInversify } from "../lanes/inversify"
import { createTrace } from "../trace"

describe("Inversify operations", () => {
  it("records the explicitly bound business span", async () => {
    const trace = createTrace()
    const runtime = startInversify(makeFixture(), trace)

    await runtime.provision({ email: "test@example.com" }, { actorId: "admin-test", requestId: "request-test" })
    await runtime.close()
    expect(trace.names).toEqual(["account.provision.inversify"])
  })
})
