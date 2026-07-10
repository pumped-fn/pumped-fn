import "reflect-metadata"
import { Container, inject, injectable } from "inversify"
import type { Database, Lane, Outcome, ProvisionInput, RequestFacts } from "../contract"

const databaseId = Symbol("comparison.database")
const clockId = Symbol("comparison.clock")
const uuidId = Symbol("comparison.uuid")
const actorId = Symbol("request.actor-id")
const requestId = Symbol("request.id")

@injectable()
class Accounts {
  constructor(
    @inject(databaseId) private readonly database: Database,
    @inject(clockId) private readonly clock: { now(): string },
    @inject(uuidId) private readonly uuid: { next(): string },
    @inject(actorId) private readonly actorId: string,
    @inject(requestId) private readonly requestId: string,
  ) {}

  async provision(input: ProvisionInput): Promise<Outcome> {
    const user = {
      id: this.uuid.next(),
      email: input.email,
      actorId: this.actorId,
      requestId: this.requestId,
      createdAt: this.clock.now(),
    }
    if (await this.database.insertUser(user) === "duplicate") {
      return { ok: false, error: { kind: "duplicate-email", email: input.email } }
    }
    return { ok: true, user }
  }
}

export const inversify = {
  id: "inversify",
  start(fixture) {
    const container = new Container()
    container
      .bind<Database>(databaseId)
      .toDynamicValue(() => fixture.openDatabase())
      .inSingletonScope()
      .onDeactivation((database) => database.close())
    container.bind(clockId).toConstantValue({ now: () => fixture.now() })
    container.bind(uuidId).toConstantValue({ next: () => fixture.nextId() })

    return {
      async provision(input: ProvisionInput, facts: RequestFacts): Promise<Outcome> {
        const request = new Container({ parent: container })
        request.bind(actorId).toConstantValue(facts.actorId)
        request.bind(requestId).toConstantValue(facts.requestId)
        request.bind(Accounts).toSelf()
        try {
          return await (await request.getAsync(Accounts)).provision(input)
        } finally {
          await request.unbindAllAsync()
        }
      },
      close: () => container.unbindAllAsync(),
    }
  },
} satisfies Lane
