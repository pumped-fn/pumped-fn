import type { Lane, Outcome, ProvisionInput, RequestFacts } from "../contract"
import { silentTrace, type Trace } from "../trace"

export async function startPlain(fixture: Parameters<Lane["start"]>[0], trace: Trace = silentTrace): Promise<Awaited<ReturnType<Lane["start"]>>> {
  const database = await fixture.openDatabase()

  return {
    provision: (input: ProvisionInput, facts: RequestFacts): Promise<Outcome> => trace.span("account.provision.plain", async () => {
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
    }),
    close: () => database.close(),
  }
}

export const plain = {
  id: "plain",
  start: startPlain,
} satisfies Lane
