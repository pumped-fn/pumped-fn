import { asFunction, asValue, createContainer, InjectionMode } from "awilix"
import type { Database, Lane, Outcome, ProvisionInput, RequestFacts } from "../contract"
import { silentTrace, type Trace } from "../trace"

type Accounts = {
  provision(input: ProvisionInput): Promise<Outcome>
}

type AccountsDeps = {
  database: Promise<Database>
  clock: { now(): string }
  uuid: { next(): string }
  actorId: string
  requestId: string
  trace: Trace
}

type Cradle = AccountsDeps & {
  accounts: Accounts
}

export const createAccounts = ({ database, clock, uuid, actorId, requestId, trace }: AccountsDeps): Accounts => ({
  provision: (input) => trace.span("account.provision.awilix", async () => {
    const user = {
      id: uuid.next(),
      email: input.email,
      actorId,
      requestId,
      createdAt: clock.now(),
    }
    if (await (await database).insertUser(user) === "duplicate") {
      return { ok: false, error: { kind: "duplicate-email" as const, email: input.email } }
    }
    return { ok: true as const, user }
  }),
})

export function startAwilix(fixture: Parameters<Lane["start"]>[0], trace: Trace = silentTrace): Awaited<ReturnType<Lane["start"]>> {
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
    trace: asValue(trace),
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
}

export const awilix = {
  id: "awilix",
  start: startAwilix,
} satisfies Lane
