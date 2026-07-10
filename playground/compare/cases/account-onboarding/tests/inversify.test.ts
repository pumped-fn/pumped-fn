import "reflect-metadata"
import { Container } from "inversify"
import { describe, expect, it } from "vitest"
import type { Database } from "../contract"
import { Accounts, actorId, clockId, databaseId, requestId, traceId, uuidId } from "../lanes/inversify"
import { silentTrace } from "../trace"

describe("Inversify substitution", () => {
  it("binds fakes in a test container", async () => {
    const emails: string[] = []
    const fakeDatabase: Database = {
      async insertUser(user) {
        emails.push(user.email)
        return "inserted"
      },
      async close() {},
    }
    const container = new Container()
    container.bind(databaseId).toConstantValue(fakeDatabase)
    container.bind(clockId).toConstantValue({ now: () => "2026-07-10T00:00:00.000Z" })
    container.bind(uuidId).toConstantValue({ next: () => "user-test" })
    container.bind(actorId).toConstantValue("admin-test")
    container.bind(requestId).toConstantValue("request-test")
    container.bind(traceId).toConstantValue(silentTrace)
    container.bind(Accounts).toSelf()

    await expect(container.get(Accounts).provision({ email: "test@example.com" })).resolves.toMatchObject({ ok: true })
    expect(emails).toEqual(["test@example.com"])
    await container.unbindAllAsync()
  })
})
