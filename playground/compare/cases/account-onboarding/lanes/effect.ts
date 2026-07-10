import { Context, Effect, Layer, ManagedRuntime } from "effect"
import type { Database as DatabaseValue, Lane, Outcome, ProvisionInput, RequestFacts } from "../contract"

class Database extends Context.Tag("comparison/Database")<Database, DatabaseValue>() {}
class Clock extends Context.Tag("comparison/Clock")<Clock, { now(): string }>() {}
class Uuid extends Context.Tag("comparison/Uuid")<Uuid, { next(): string }>() {}
class ActorId extends Context.Tag("comparison/ActorId")<ActorId, string>() {}
class RequestId extends Context.Tag("comparison/RequestId")<RequestId, string>() {}

class Accounts extends Effect.Service<Accounts>()("comparison/Accounts", {
  effect: Effect.gen(function*() {
    const database = yield* Database
    const clock = yield* Clock
    const uuid = yield* Uuid

    const provision = (input: ProvisionInput) =>
      Effect.gen(function*() {
        const actorId = yield* ActorId
        const requestId = yield* RequestId
        const user = {
          id: uuid.next(),
          email: input.email,
          actorId,
          requestId,
          createdAt: clock.now(),
        }
        if (yield* Effect.promise(() => database.insertUser(user)).pipe(Effect.map((result) => result === "duplicate"))) {
          return yield* Effect.fail({ kind: "duplicate-email" as const, email: input.email })
        }
        return user
      }).pipe(Effect.withSpan("account.provision.effect"))

    return { provision } as const
  }),
}) {}

export const effect = {
  id: "effect",
  start(fixture) {
    const database = Layer.scoped(
      Database,
      Effect.acquireRelease(
        Effect.promise(() => fixture.openDatabase()),
        (database) => Effect.promise(() => database.close()),
      ),
    )
    const runtime = ManagedRuntime.make(
      Accounts.Default.pipe(
        Layer.provide(
          Layer.mergeAll(
            database,
            Layer.succeed(Clock, { now: () => fixture.now() }),
            Layer.succeed(Uuid, { next: () => fixture.nextId() }),
          ),
        ),
      ),
    )

    return {
      provision(input: ProvisionInput, facts: RequestFacts): Promise<Outcome> {
        return runtime.runPromise(
          Effect.flatMap(Accounts, (accounts) => accounts.provision(input)).pipe(
            Effect.provideService(ActorId, facts.actorId),
            Effect.provideService(RequestId, facts.requestId),
            Effect.match({
              onFailure: (error) => ({ ok: false as const, error }),
              onSuccess: (user) => ({ ok: true as const, user }),
            }),
          ),
        )
      },
      close: () => runtime.dispose(),
    }
  },
} satisfies Lane
