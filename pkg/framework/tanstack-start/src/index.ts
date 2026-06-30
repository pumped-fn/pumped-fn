import { createMiddleware } from "@tanstack/react-start"
import type { Lite } from "@pumped-fn/lite"

const contextKey = "lite"

type StartContext<Key extends string = typeof contextKey> = Record<Key, Lite.ExecutionContext>

interface StartKeyOptions<Key extends string = typeof contextKey> {
  key?: Key
}

interface StartRequestOptions {
  tags?: (request: Request) => Lite.Tagged<any>[]
  close?: boolean
}

interface StartCallOptions {
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
  call(
    callOptions?: StartCallOptions
  ): import("@tanstack/react-start").FunctionMiddlewareAfterServer<
    {},
    unknown,
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

function adapter<Key extends string = typeof contextKey>(
  options?: StartKeyOptions<Key>
): StartAdapter<Key> {
  const key = (options?.key ?? contextKey) as Key
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

  function call(callOptions?: StartCallOptions) {
    const close = callOptions?.close ?? true

    return createMiddleware({ type: "function" }).server(async (event) => {
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
        input: event.data,
        name: runOptions?.name,
        tags: runOptions?.tags,
      } as Lite.ExecFlowOptions<Output, Input>)
  }

  const extension = {
    name: "@pumped-fn/lite-tanstack-start",
    init(nextScope: Lite.Scope) {
      scope = nextScope
    },
    request,
    call,
    handler,
  }

  return extension
}

export const tanstackStart = { contextKey, adapter } as const

export namespace tanstackStart {
  export type Context<Key extends string = typeof contextKey> = StartContext<Key>
  export type KeyOptions<Key extends string = typeof contextKey> = StartKeyOptions<Key>
  export type RequestOptions = StartRequestOptions
  export type CallOptions = StartCallOptions
  export type HandlerEvent<
    Input,
    Key extends string = typeof contextKey,
  > = StartHandlerEvent<Input, Key>
  export type Adapter<Key extends string = typeof contextKey> = StartAdapter<Key>
}
