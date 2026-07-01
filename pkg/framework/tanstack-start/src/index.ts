import { createMiddleware } from "@tanstack/react-start"
import type { Lite } from "@pumped-fn/lite"

const contextKey = "lite"

type StartMiddleware =
  | import("@tanstack/react-start").AnyRequestMiddleware
  | import("@tanstack/react-start").AnyFunctionMiddleware

type StartContext<Key extends string = typeof contextKey> = Record<Key, Lite.ExecutionContext>

interface StartKeyOptions<Key extends string = string> {
  key: Key
}

interface StartRequestOptions {
  tags?: (request: Request) => Lite.Tagged<any>[]
  close?: boolean
}

interface StartCallOptions<TMiddlewares extends readonly StartMiddleware[] = readonly []> {
  middleware?: TMiddlewares
  tags?: () => Lite.Tagged<any>[]
  close?: boolean
}

type StartHandlerEvent<
  Input,
  Key extends string = typeof contextKey,
> = {
  data: Input
  context: StartContext<Key>
}

interface StartAdapter<Key extends string = typeof contextKey> {
  readonly name: string
  request(
    requestOptions?: StartRequestOptions
  ): import("@tanstack/react-start").RequestMiddlewareAfterServer<{}, undefined, StartContext<Key>>
  call<const TMiddlewares extends readonly StartMiddleware[] = readonly []>(
    callOptions?: StartCallOptions<TMiddlewares>
  ): import("@tanstack/react-start").FunctionMiddlewareAfterServer<
    {},
    TMiddlewares,
    undefined,
    StartContext<Key>,
    undefined,
    undefined,
    undefined
  >
  handler<Output>(
    flow: Lite.Flow<Output, void>,
    runOptions?: Lite.FlowRunOptions
  ): (event: StartHandlerEvent<void, Key>) => Promise<Output>
  handler<Output, Input>(
    flow: Lite.Flow<Output, Input>,
    runOptions?: Lite.FlowRunOptions
  ): (event: StartHandlerEvent<Input, Key>) => Promise<Output>
}

function adapter(): StartAdapter
function adapter<const Key extends string>(options: StartKeyOptions<Key>): StartAdapter<Key>
function adapter<const Key extends string>(options?: StartKeyOptions<Key>) {
  if (options) return bindAdapter(options.key)
  return bindAdapter(contextKey)
}

function bindAdapter<const Key extends string>(key: Key): StartAdapter<Key> & Lite.Extension {
  let scope: Lite.Scope

  function request(requestOptions?: StartRequestOptions) {
    const close = requestOptions?.close ?? true

    return createMiddleware({ type: "request" }).server(async ({ request, next }) => {
      const execution = scope.createContext({ tags: requestOptions?.tags?.(request) })

      const result = await (async () => {
        try {
          return await next({ context: { [key]: execution } as StartContext<Key> })
        } catch (error) {
          if (close) await execution.close({ ok: false, error })
          throw error
        }
      })()

      if (close) await execution.close({ ok: true })
      return result
    })
  }

  function call<const TMiddlewares extends readonly StartMiddleware[] = readonly []>(
    callOptions?: StartCallOptions<TMiddlewares>
  ) {
    const close = callOptions?.close ?? true

    return createMiddleware({ type: "function" })
      .middleware((callOptions?.middleware ?? []) as TMiddlewares)
      .server(async (event) => {
        const parent = (event.context as unknown as StartContext<Key>)[key]
        const execution = parent.scope.createContext({
          parent,
          tags: callOptions?.tags?.(),
        })

        const result = await (async () => {
          try {
            return await event.next({ context: { [key]: execution } as StartContext<Key> })
          } catch (error) {
            if (close) await execution.close({ ok: false, error })
            throw error
          }
        })()

        if (close) await execution.close({ ok: true })
        return result
      })
  }

  function handler<
    Output
  >(
    flow: Lite.Flow<Output, void>,
    runOptions?: Lite.FlowRunOptions
  ): (event: StartHandlerEvent<void, Key>) => Promise<Output>
  function handler<
    Output,
    Input
  >(
    flow: Lite.Flow<Output, Input>,
    runOptions?: Lite.FlowRunOptions
  ): (event: StartHandlerEvent<Input, Key>) => Promise<Output>
  function handler<
    Output,
    Input
  >(
    flow: Lite.Flow<Output, Input>,
    runOptions?: Lite.FlowRunOptions
  ) {
    return (event: StartHandlerEvent<Input, Key>) =>
      event.context[key].exec({
        flow,
        rawInput: event.data,
        name: runOptions?.name,
        tags: runOptions?.tags,
      })
  }

  return {
    name: "@pumped-fn/lite-tanstack-start",
    init(nextScope: Lite.Scope) {
      scope = nextScope
    },
    request,
    call,
    handler,
  }
}

export const tanstackStart = { contextKey, adapter } as const

export namespace tanstackStart {
  export type Context<Key extends string = typeof contextKey> = StartContext<Key>
  export type KeyOptions<Key extends string = string> = StartKeyOptions<Key>
  export type RequestOptions = StartRequestOptions
  export type CallOptions<TMiddlewares extends readonly StartMiddleware[] = readonly []> =
    StartCallOptions<TMiddlewares>
  export type HandlerEvent<
    Input,
    Key extends string = typeof contextKey,
  > = StartHandlerEvent<Input, Key>
  export type Adapter<Key extends string = typeof contextKey> = StartAdapter<Key>
}
