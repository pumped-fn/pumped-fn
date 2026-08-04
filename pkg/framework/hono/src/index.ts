import type { Lite } from "@pumped-fn/lite"
import type { MiddlewareHandler } from "hono"
import { createMiddleware } from "hono/factory"

type BaseEnv = import("hono").Env
type TagInput = Lite.Tagged<any> | readonly TagInput[]
type EnvVariables<E extends BaseEnv> = E extends { Variables: infer Variables extends object } ? Variables : {}

const contextKey = "lite"

interface HonoKeyOptions<Key extends string = string> {
  key: Key
}

type HonoEnvShape<
  E extends BaseEnv = BaseEnv,
  Key extends string = typeof contextKey,
> = E & {
  Variables: EnvVariables<E> & Record<Key, Lite.ExecutionContext>
}

interface HonoOptions<
  E extends BaseEnv = BaseEnv,
> {
  tags?: (request: Request) => TagInput
  close?: boolean
}

interface HonoAdapter<Key extends string = typeof contextKey> {
  readonly name: string
  middleware<E extends BaseEnv = BaseEnv>(
    middlewareOptions?: HonoOptions<E>
  ): MiddlewareHandler<HonoEnvShape<E, Key>>
}

function adapter(): HonoAdapter
function adapter<const Key extends string>(options: HonoKeyOptions<Key>): HonoAdapter<Key>
function adapter<const Key extends string>(options?: HonoKeyOptions<Key>) {
  if (options) return bindAdapter(options.key)
  return bindAdapter(contextKey)
}

function bindAdapter<const Key extends string>(key: Key): HonoAdapter<Key> & Lite.Extension {
  let scope: Lite.Scope

  return {
    name: "@pumped-fn/lite-hono",
    init(nextScope: Lite.Scope) {
      scope = nextScope
    },
    middleware<E extends BaseEnv = BaseEnv>(
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

        if (close) {
          await execution.close(context.error === undefined
            ? { ok: true }
            : { ok: false, error: context.error })
        }
      })
    },
  }
}

export const hono = { contextKey, adapter } as const

export namespace hono {
  export type KeyOptions<Key extends string = string> = HonoKeyOptions<Key>
  export type Env<
    E extends BaseEnv = BaseEnv,
    Key extends string = typeof contextKey,
  > = HonoEnvShape<E, Key>
  export type Options<E extends BaseEnv = BaseEnv> = HonoOptions<E>
  export type Adapter<Key extends string = typeof contextKey> = HonoAdapter<Key>
}
