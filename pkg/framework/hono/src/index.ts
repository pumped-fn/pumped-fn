import type { Lite } from "@pumped-fn/lite"
import type { Env as HonoEnv, MiddlewareHandler } from "hono"
import { createMiddleware } from "hono/factory"

type EnvVariables<E extends HonoEnv> = E extends { Variables: infer Variables extends object } ? Variables : {}

const contextKey = "lite"

interface HonoKeyOptions<Key extends string = typeof contextKey> {
  key?: Key
}

type HonoEnvShape<
  E extends HonoEnv = HonoEnv,
  Key extends string = typeof contextKey,
> = E & {
  Variables: EnvVariables<E> & Record<Key, Lite.ExecutionContext>
}

interface HonoOptions<
  E extends HonoEnv = HonoEnv,
> {
  tags?: (request: Request) => Lite.Tagged<any>[]
  close?: boolean
}

interface HonoAdapter<Key extends string = typeof contextKey> {
  readonly name: string
  middleware<E extends HonoEnv = HonoEnv>(
    middlewareOptions?: HonoOptions<E>
  ): MiddlewareHandler<HonoEnvShape<E, Key>>
}

function adapter<Key extends string = typeof contextKey>(
  options?: HonoKeyOptions<Key>
): HonoAdapter<Key> {
  const key = (options?.key ?? contextKey) as Key
  let scope: Lite.Scope

  const extension = {
    name: "@pumped-fn/lite-hono",
    init(nextScope: Lite.Scope) {
      scope = nextScope
    },
    middleware<E extends HonoEnv = HonoEnv>(
      middlewareOptions?: HonoOptions<E>
    ): MiddlewareHandler<HonoEnvShape<E, Key>> {
      const close = middlewareOptions?.close ?? true

      return createMiddleware<HonoEnvShape<E, Key>>(async (context, next) => {
        const execution = scope.createContext({ tags: middlewareOptions?.tags?.(context.req.raw) })
        const set = context.set as unknown as (key: Key, value: Lite.ExecutionContext) => void
        set(key, execution)

        try {
          await next()
        } catch (error) {
          if (close) await execution.close({ ok: false, error })
          throw error
        }

        if (close) await execution.close({ ok: true })
      })
    },
  }

  return extension
}

export const hono = { contextKey, adapter } as const

export namespace hono {
  export type KeyOptions<Key extends string = typeof contextKey> = HonoKeyOptions<Key>
  export type Env<
    E extends HonoEnv = HonoEnv,
    Key extends string = typeof contextKey,
  > = HonoEnvShape<E, Key>
  export type Options<E extends HonoEnv = HonoEnv> = HonoOptions<E>
  export type Adapter<Key extends string = typeof contextKey> = HonoAdapter<Key>
}
