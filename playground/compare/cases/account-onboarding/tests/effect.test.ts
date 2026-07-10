import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { Database as DatabaseValue } from "../contract"
import { Accounts, ActorId, Clock, Database, RequestId, Uuid } from "../lanes/effect"

describe("Effect substitution", () => {
  it("provides test services through Layers", async () => {
    const emails: string[] = []
    const fakeDatabase: DatabaseValue = {
      async insertUser(user) {
        emails.push(user.email)
        return "inserted"
      },
      async close() {},
    }
    const services = Layer.mergeAll(
      Layer.succeed(Database, fakeDatabase),
      Layer.succeed(Clock, { now: () => "2026-07-10T00:00:00.000Z" }),
      Layer.succeed(Uuid, { next: () => "user-test" }),
    )
    const program = Effect.flatMap(Accounts, (accounts) => accounts.provision({ email: "test@example.com" })).pipe(
      Effect.provideService(ActorId, "admin-test"),
      Effect.provideService(RequestId, "request-test"),
      Effect.provide(Accounts.Default.pipe(Layer.provide(services))),
    )

    await expect(Effect.runPromise(program)).resolves.toMatchObject({
      email: "test@example.com",
      actorId: "admin-test",
      requestId: "request-test",
    })
    expect(emails).toEqual(["test@example.com"])
  })
})
