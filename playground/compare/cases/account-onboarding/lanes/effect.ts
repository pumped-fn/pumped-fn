import { Context, Effect, Layer, ManagedRuntime, type Tracer } from "effect"
import type { Database as DatabaseValue, Lane, Outcome, ProvisionInput, RequestFacts } from "../contract"

export class Database extends Context.Tag("comparison/Database")<Database, DatabaseValue>() {}
export class Clock extends Context.Tag("comparison/Clock")<Clock, { now(): string }>() {}
export class Uuid extends Context.Tag("comparison/Uuid")<Uuid, { next(): string }>() {}
export class ActorId extends Context.Tag("comparison/ActorId")<ActorId, string>() {}
export class RequestId extends Context.Tag("comparison/RequestId")<RequestId, string>() {}

export class Accounts extends Effect.Service<Accounts>()("comparison/Accounts", {
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

export function startEffect(fixture: Parameters<Lane["start"]>[0], tracer?: Tracer.Tracer): Awaited<ReturnType<Lane["start"]>> {
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
      const operation = Effect.flatMap(Accounts, (accounts) => accounts.provision(input)).pipe(
        Effect.provideService(ActorId, facts.actorId),
        Effect.provideService(RequestId, facts.requestId),
        Effect.match({
          onFailure: (error) => ({ ok: false as const, error }),
          onSuccess: (user) => ({ ok: true as const, user }),
        }),
      )
      return runtime.runPromise(tracer === undefined ? operation : operation.pipe(Effect.withTracer(tracer)))
    },
    close: () => runtime.dispose(),
  }
}

export const effect = {
  id: "effect",
  start: startEffect,
} satisfies Lane
