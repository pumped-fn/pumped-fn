import type { Lane, Outcome, ProvisionInput, RequestFacts } from "../contract"

export const plain = {
  id: "plain",
  async start(fixture) {
    const database = await fixture.openDatabase()

    return {
      async provision(input: ProvisionInput, facts: RequestFacts): Promise<Outcome> {
        const user = {
          id: fixture.nextId(),
          email: input.email,
          actorId: facts.actorId,
          requestId: facts.requestId,
          createdAt: fixture.now(),
        }
        if (await database.insertUser(user) === "duplicate") {
          return { ok: false, error: { kind: "duplicate-email", email: input.email } }
        }
        return { ok: true, user }
      },
      close: () => database.close(),
    }
  },
} satisfies Lane
