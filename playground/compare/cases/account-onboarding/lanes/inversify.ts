import "reflect-metadata"
import { Container, inject, injectable } from "inversify"
import type { Database, Lane, Outcome, ProvisionInput, RequestFacts } from "../contract"
import { silentTrace, type Trace } from "../trace"

export const databaseId = Symbol("comparison.database")
export const clockId = Symbol("comparison.clock")
export const uuidId = Symbol("comparison.uuid")
export const actorId = Symbol("request.actor-id")
export const requestId = Symbol("request.id")
export const traceId = Symbol("comparison.trace")

@injectable()
export class Accounts {
  constructor(
    @inject(databaseId) private readonly database: Database,
    @inject(clockId) private readonly clock: { now(): string },
    @inject(uuidId) private readonly uuid: { next(): string },
    @inject(actorId) private readonly actorId: string,
    @inject(requestId) private readonly requestId: string,
    @inject(traceId) private readonly trace: Trace,
  ) {}

  async provision(input: ProvisionInput): Promise<Outcome> {
    return this.trace.span("account.provision.inversify", async () => {
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
    })
  }
}

export function startInversify(fixture: Parameters<Lane["start"]>[0], trace: Trace = silentTrace): Awaited<ReturnType<Lane["start"]>> {
  const container = new Container()
  container
    .bind<Database>(databaseId)
    .toDynamicValue(() => fixture.openDatabase())
    .inSingletonScope()
    .onDeactivation((database) => database.close())
  container.bind(clockId).toConstantValue({ now: () => fixture.now() })
  container.bind(uuidId).toConstantValue({ next: () => fixture.nextId() })
  container.bind(traceId).toConstantValue(trace)

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
}

export const inversify = {
  id: "inversify",
  start: startInversify,
} satisfies Lane
