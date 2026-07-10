import { createScope, preset } from "@pumped-fn/lite"
import { describe, expect, it } from "vitest"
import type { Database } from "../contract"
import { makeFixture } from "../fixture"
import { actorId, caseFixture, database, provision, requestId } from "../lanes/pumped"

describe("pumped-fn substitution", () => {
  it("replaces the database at the scope seam", async () => {
    const emails: string[] = []
    const fakeDatabase: Database = {
      async insertUser(user) {
        emails.push(user.email)
        return "inserted"
      },
      async close() {},
    }
    const scope = createScope({
      presets: [preset(database, fakeDatabase)],
      tags: [caseFixture(makeFixture()), actorId("admin-test"), requestId("request-test")],
    })
    const ctx = scope.createContext()

    await expect(ctx.exec({ flow: provision, input: { email: "test@example.com" } })).resolves.toMatchObject({
      email: "test@example.com",
      actorId: "admin-test",
      requestId: "request-test",
    })
    expect(emails).toEqual(["test@example.com"])
    await ctx.close()
    await scope.dispose()
  })
})
