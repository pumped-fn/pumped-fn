import { asFunction, asValue, createContainer, InjectionMode } from "awilix"
import type { Database, Lane, Outcome, ProvisionInput, RequestFacts } from "../contract"

type Accounts = {
  provision(input: ProvisionInput): Promise<Outcome>
}

type AccountsDeps = {
  database: Promise<Database>
  clock: { now(): string }
  uuid: { next(): string }
  actorId: string
  requestId: string
}

type Cradle = AccountsDeps & {
  accounts: Accounts
}

const createAccounts = ({ database, clock, uuid, actorId, requestId }: AccountsDeps): Accounts => ({
  async provision(input) {
    const user = {
      id: uuid.next(),
      email: input.email,
      actorId,
      requestId,
      createdAt: clock.now(),
    }
    if (await (await database).insertUser(user) === "duplicate") {
      return { ok: false, error: { kind: "duplicate-email", email: input.email } }
    }
    return { ok: true, user }
  },
})

export const awilix = {
  id: "awilix",
  start(fixture) {
    const container = createContainer<Cradle>({
      injectionMode: InjectionMode.PROXY,
      strict: true,
    })
    container.register({
      database: asFunction(() => fixture.openDatabase())
        .singleton()
        .disposer((database) => database.then((connection) => connection.close())),
      clock: asValue({ now: () => fixture.now() }),
      uuid: asValue({ next: () => fixture.nextId() }),
      accounts: asFunction(createAccounts).scoped(),
    })

    return {
      async provision(input: ProvisionInput, facts: RequestFacts): Promise<Outcome> {
        const scope = container.createScope()
        scope.register({
          actorId: asValue(facts.actorId),
          requestId: asValue(facts.requestId),
        })
        try {
          return await scope.resolve("accounts").provision(input)
        } finally {
          await scope.dispose()
        }
      },
      close: () => container.dispose(),
    }
  },
} satisfies Lane
