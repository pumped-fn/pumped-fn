import type { Event, Lane, Outcome } from "./contract"
import { makeFixture } from "./fixture"

export type ScenarioResult = {
  lane: Lane["id"]
  success: Outcome
  duplicate: Outcome
  secondSuccess: Outcome
  events: Event[]
}

const expected = {
  success: {
    ok: true,
    user: {
      id: "user-1",
      email: "ada@example.com",
      actorId: "admin-1",
      requestId: "request-1",
      createdAt: "2026-07-10T00:00:00.000Z",
    },
  },
  duplicate: {
    ok: false,
    error: { kind: "duplicate-email", email: "ada@example.com" },
  },
  secondSuccess: {
    ok: true,
    user: {
      id: "user-3",
      email: "grace@example.com",
      actorId: "admin-3",
      requestId: "request-3",
      createdAt: "2026-07-10T00:00:00.000Z",
    },
  },
  events: [
    "database.acquire",
    "uuid.next",
    "clock.now",
    "database.transaction.begin",
    "database.users.insert",
    "database.transaction.commit",
    "uuid.next",
    "clock.now",
    "database.transaction.begin",
    "database.users.duplicate",
    "database.transaction.rollback",
    "uuid.next",
    "clock.now",
    "database.transaction.begin",
    "database.users.insert",
    "database.transaction.commit",
    "database.release",
  ],
} satisfies Omit<ScenarioResult, "lane">

const comparable = ({ success, duplicate, secondSuccess, events }: ScenarioResult) => ({
  success,
  duplicate,
  secondSuccess,
  events,
})

export async function runScenario(lane: Lane): Promise<ScenarioResult> {
  const fixture = makeFixture()
  const runtime = await lane.start(fixture)
  const outcomes = await (async () => {
    try {
      return {
        success: await runtime.provision(
          { email: "ada@example.com" },
          { actorId: "admin-1", requestId: "request-1" },
        ),
        duplicate: await runtime.provision(
          { email: "ada@example.com" },
          { actorId: "admin-2", requestId: "request-2" },
        ),
        secondSuccess: await runtime.provision(
          { email: "grace@example.com" },
          { actorId: "admin-3", requestId: "request-3" },
        ),
      }
    } finally {
      await runtime.close()
    }
  })()
  const result = { lane: lane.id, ...outcomes, events: [...fixture.events] }
  if (JSON.stringify(comparable(result)) !== JSON.stringify(expected)) {
    throw new Error(`${lane.id} violated the account-onboarding contract: ${JSON.stringify(result)}`)
  }
  return result
}
