import { describe, expect, it } from "vitest"
import { makeFixture } from "../fixture"
import { plain } from "../lanes/plain"

describe("Plain TypeScript substitution", () => {
  it("passes the fixture directly", async () => {
    const fixture = makeFixture()
    const runtime = await plain.start(fixture)

    await expect(runtime.provision(
      { email: "test@example.com" },
      { actorId: "admin-test", requestId: "request-test" },
    )).resolves.toMatchObject({ ok: true })
    await runtime.close()
    expect(fixture.events.at(-1)).toBe("database.release")
  })
})
