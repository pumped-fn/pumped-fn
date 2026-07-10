import { atom, createScope, flow, isFault, resource, tag, tags, typed, type Lite } from "@pumped-fn/lite"
import type { Database, DuplicateEmail, Fixture, Lane, Outcome, ProvisionInput, RequestFacts } from "../contract"
import type { Trace } from "../trace"

export const caseFixture = tag<Fixture>({ label: "comparison.fixture" })
export const actorId = tag<string>({ label: "request.actor-id" })
export const requestId = tag<string>({ label: "request.id" })

const clock = atom({
  deps: { caseFixture: tags.required(caseFixture) },
  factory: (_, { caseFixture }) => ({ now: () => caseFixture.now() }),
})

const uuid = atom({
  deps: { caseFixture: tags.required(caseFixture) },
  factory: (_, { caseFixture }) => ({ next: () => caseFixture.nextId() }),
})

export const database = resource({
  name: "comparison.database",
  ownership: "boundary",
  deps: { caseFixture: tags.required(caseFixture) },
  factory: async (ctx, { caseFixture }): Promise<Database> => {
    const connection = await ctx.exec({
      fn: () => caseFixture.openDatabase(),
      params: [],
      name: "database.open",
    })
    ctx.cleanup(() => connection.close())
    return connection
  },
})

export const provision = flow({
  name: "account.provision.pumped",
  parse: typed<ProvisionInput>(),
  faults: typed<DuplicateEmail>(),
  deps: {
    database,
    clock,
    uuid,
    actorId: tags.required(actorId),
    requestId: tags.required(requestId),
  },
  factory: async (ctx, { database, clock, uuid, actorId, requestId }) => {
    const user = {
      id: uuid.next(),
      email: ctx.input.email,
      actorId,
      requestId,
      createdAt: clock.now(),
    }
    const result = await ctx.exec({
      fn: () => database.insertUser(user),
      params: [],
      name: "database.insertUser",
    })
    if (result === "duplicate") ctx.fail({ kind: "duplicate-email", email: ctx.input.email })
    return user
  },
})

export async function startPumped(fixture: Fixture, trace?: Trace): Promise<Awaited<ReturnType<Lane["start"]>>> {
  const extensions: Lite.Extension[] = trace === undefined ? [] : [{
    name: "comparison.trace",
    async wrapExec(next, _target, ctx) {
      trace.record(ctx.name ?? "anonymous")
      return next()
    },
  }]
  const scope = createScope({ extensions, tags: [caseFixture(fixture)] })
  const root = scope.createContext()
  await root.resolve(database)

  return {
    async provision(input: ProvisionInput, facts: RequestFacts): Promise<Outcome> {
      const ctx = scope.createContext({
        parent: root,
        tags: [actorId(facts.actorId), requestId(facts.requestId)],
      })
      try {
        return { ok: true, user: await ctx.exec({ flow: provision, input }) }
      } catch (error) {
        if (isFault(provision, error)) return { ok: false, error: error.fault }
        throw error
      } finally {
        await ctx.close()
      }
    },
    async close() {
      await root.close()
      await scope.dispose()
    },
  }
}

export const pumped = {
  id: "pumped-fn",
  start: startPumped,
} satisfies Lane
