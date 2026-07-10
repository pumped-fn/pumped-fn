import type { Database, Event, Fixture } from "./contract"

export const makeFixture = (): Fixture => {
  const events: Event[] = []
  let sequence = 0

  return {
    events,
    async openDatabase(): Promise<Database> {
      events.push("database.acquire")
      const users = new Map<string, string>()

      return {
        async insertUser(user) {
          events.push("database.transaction.begin")
          if (users.has(user.email)) {
            events.push("database.users.duplicate")
            events.push("database.transaction.rollback")
            return "duplicate"
          }
          users.set(user.email, user.id)
          events.push("database.users.insert")
          events.push("database.transaction.commit")
          return "inserted"
        },
        async close() {
          events.push("database.release")
        },
      }
    },
    now() {
      events.push("clock.now")
      return "2026-07-10T00:00:00.000Z"
    },
    nextId() {
      events.push("uuid.next")
      sequence += 1
      return `user-${sequence}`
    },
  }
}
