import { describe, expect, it } from "vitest"
import type { Database } from "../contract"
import { createAccounts } from "../lanes/awilix"
import { silentTrace } from "../trace"

describe("Awilix substitution", () => {
  it("calls the plain factory with object fakes", async () => {
    const emails: string[] = []
    const fakeDatabase: Database = {
      async insertUser(user) {
        emails.push(user.email)
        return "inserted"
      },
      async close() {},
    }
    const accounts = createAccounts({
      database: Promise.resolve(fakeDatabase),
      clock: { now: () => "2026-07-10T00:00:00.000Z" },
      uuid: { next: () => "user-test" },
      actorId: "admin-test",
      requestId: "request-test",
      trace: silentTrace,
    })

    await expect(accounts.provision({ email: "test@example.com" })).resolves.toMatchObject({ ok: true })
    expect(emails).toEqual(["test@example.com"])
  })
})
