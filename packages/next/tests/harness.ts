import { expect, vi } from "vitest"
import { flow } from "../src/flow"
import { custom } from "../src/ssch"
import { createExecutor, provide, derive } from "../src/executor"
import {
  createScope,
  type Extension,
  StandardSchemaV1,
} from "../src"
import type { Flow, Tag } from "../src/types"

export namespace TestTypes {
  export interface User {
    id: string
    name: string
    email?: string
  }

  export interface ErrorResult {
    code: string
    message?: string
  }

  export interface SuccessResult<T = unknown> {
    result: T
  }

  export interface BasicInput {
    message: string
  }

  export interface MathInput {
    a: number
    b: number
  }
}

export const testFlows = {
  basic: (name: string, handler: (ctx: Flow.Context, input: TestTypes.BasicInput) => Promise<TestTypes.SuccessResult<string>> | TestTypes.SuccessResult<string>) =>
    flow({
      name,
      input: custom<TestTypes.BasicInput>(),
      output: custom<TestTypes.SuccessResult<string>>(),
    }, handler),

  math: (name: string, handler: (ctx: Flow.Context, input: TestTypes.MathInput) => Promise<TestTypes.SuccessResult<number>> | TestTypes.SuccessResult<number>) =>
    flow({
      name,
      input: custom<TestTypes.MathInput>(),
      output: custom<TestTypes.SuccessResult<number>>(),
    }, handler),

  user: (name: string, handler: (ctx: Flow.Context, input: { userId: string }) => Promise<{ user: TestTypes.User }> | { user: TestTypes.User }) =>
    flow({
      name,
      input: custom<{ userId: string }>(),
      output: custom<{ user: TestTypes.User }>(),
    }, handler),

  validation: (name: string, handler: (ctx: Flow.Context, input: { email: string }) => Promise<{ valid: boolean }> | { valid: boolean }) =>
    flow({
      name,
      input: custom<{ email: string }>(),
      output: custom<{ valid: boolean }>(),
    }, handler),

  generic: <TInput, TSuccess>(
    name: string,
    input: StandardSchemaV1<TInput>,
    output: StandardSchemaV1<TSuccess>,
    handler: (ctx: Flow.Context, input: TInput) => Promise<TSuccess> | TSuccess
  ) =>
    flow({
      name,
      input,
      output,
    }, handler),
}

export const MockExecutors = {
  database: () =>
    createExecutor(
      () => ({
        users: {
          findById: (id: string) => ({
            id,
            name: `User ${id}`,
            email: `user${id}@example.com`,
          }),
          create: (user: Partial<TestTypes.User>) => ({
            id: `user-${Math.random()}`,
            ...user,
          }),
        },
        orders: {
          create: (order: any) => ({
            id: `order-${Math.random()}`,
            ...order,
          }),
        },
      }),
      undefined,
      undefined,
    ),

  logger: (events: string[] = []) =>
    createExecutor(
      () => ({
        info: (message: string, data?: any) => {
          console.log(message, data)
          events.push(`info:${message}`)
        },
        error: (message: string, data?: any) => {
          console.error(message, data)
          events.push(`error:${message}`)
        },
        warn: (message: string, data?: any) => {
          console.warn(message, data)
          events.push(`warn:${message}`)
        },
        events,
      }),
      undefined,
      undefined,
    ),

  failing: (errorMessage = "Test error") =>
    createExecutor(
      () => {
        throw new Error(errorMessage)
      },
      undefined,
      undefined,
    ),

  async: (delay = 10, result: any = "async-result") =>
    createExecutor(
      async () => {
        await new Promise((resolve) => setTimeout(resolve, delay))
        return result
      },
      undefined,
      undefined,
    ),
}

export const ExtensionFactory = {
  contextCapture: (capturedContext: { current?: any } = {}) =>
    ({
      name: "context-capture",
      async wrapExecute(
        context: any,
        next: () => Promise<any>,
        execution: any,
      ) {
        capturedContext.current = context
        return next()
      },
    }) as Extension.Extension,

  executionOrder: (execOrder: string[], extensionName: string) =>
    ({
      name: extensionName,
      async wrapExecute(
        context: any,
        next: () => Promise<any>,
        execution: any,
      ) {
        execOrder.push(`${extensionName}-before`)
        const result = await next()
        execOrder.push(`${extensionName}-after`)
        return result
      },
    }) as Extension.Extension,

  errorHandler: (onError: any, extensionName = "error-extension") =>
    ({
      name: extensionName,
      onError,
    }) as Extension.Extension,
}

export const errorTestHelpers = {
  expectExecutorError: async (
    executor: any,
    errorType: new (...args: any[]) => Error,
    errorCode?: string,
  ) => {
    const scope = createScope()
    const errorCallback = vi.fn()
    scope.onError(errorCallback)

    await expect(scope.resolve(executor)).rejects.toThrow()

    expect(errorCallback).toHaveBeenCalledTimes(1)
    expect(errorCallback).toHaveBeenCalledWith(
      expect.any(errorType),
      executor,
      scope,
    )

    if (errorCode) {
      const [capturedError] = errorCallback.mock.calls[0]
      expect(capturedError.code).toBe(errorCode)
    }
  },

  expectNoErrorCallback: async (executor: any, expectedResult?: any) => {
    const scope = createScope()
    const errorCallback = vi.fn()
    scope.onError(errorCallback)

    const result = await scope.resolve(executor)

    if (expectedResult !== undefined) {
      expect(result).toBe(expectedResult)
    }
    expect(errorCallback).not.toHaveBeenCalled()
  },

  createFailingChain: (errorMessage = "Chain error") => {
    const failingExecutor = provide(() => {
      throw new Error(errorMessage)
    })

    const chainedExecutor = derive(failingExecutor, (dep) => {
      return `Using ${dep}`
    })

    return { failingExecutor, chainedExecutor }
  },
}

export const scenarios = {
  mathOperations: [
    { name: "addition", input: { a: 5, b: 3 }, expected: 8 },
    { name: "subtraction", input: { a: 10, b: 4 }, expected: 6 },
    { name: "multiplication", input: { a: 6, b: 7 }, expected: 42 },
    { name: "division", input: { a: 15, b: 3 }, expected: 5 },
  ],

  validationCases: [
    { email: "test@example.com", valid: true },
    { email: "invalid-email", valid: false },
    { email: "user@domain", valid: false },
    { email: "valid@test.co.uk", valid: true },
  ],

  userIds: [
    { userId: "123", expectedName: "User 123" },
    { userId: "456", expectedName: "User 456" },
    { userId: "789", expectedName: "User 789" },
  ],
}

export const testSetup = {
  scopeWithErrorHandler: () => {
    const scope = createScope()
    const errorCallback = vi.fn()
    scope.onError(errorCallback)
    return { scope, errorCallback }
  },

  scopeWithExtensions: (extensions: Extension.Extension[]) =>
    createScope({ extensions }),

  expectFlowResult: (result: any, data?: any) => {
    if (data !== undefined) {
      expect(result).toEqual(data)
    }
  },
}

export type FlowScenarioOptions<I, O> = {
  input: I
  flowDef?: Flow.Definition<O, I>
  handler?: (ctx: Flow.Context, input: I) => O | Promise<O>
  extensions?: Extension.Extension[]
  scopeTags?: Tag.Tagged[]
  executionTags?: Tag.Tagged[]
}

export async function buildFlowScenario<I, O>(
  options: FlowScenarioOptions<I, O>,
): Promise<O> {
  const { input, handler, flowDef, extensions, scopeTags, executionTags } =
    options

  if (!handler && !flowDef) {
    throw new Error("Either handler or flowDef must be provided")
  }

  const flowInstance =
    flowDef && handler
      ? flow(flowDef, handler)
      : flowDef
        ? flow(
            flowDef,
            (ctx: Flow.Context, input: I) => input as unknown as O,
          )
        : handler
            ? flow(handler)
            : (null as never)

  const result = await flow.execute(flowInstance, input, {
    extensions,
    scopeTags,
    executionTags,
  })

  return result
}

export function createScopeWithCleanup(): {
  scope: ReturnType<typeof createScope>
  cleanup: () => Promise<void>
} {
  const scope = createScope()
  return {
    scope,
    cleanup: async () => {
      await scope.dispose()
    },
  }
}

export function expectResolved<T>(result: PromiseSettledResult<T>): {
  toBe: (expected: T) => void
  toEqual: (expected: T) => void
} {
  if (result.status !== "fulfilled") {
    throw new Error(`Expected fulfilled promise, got ${result.status}`)
  }

  return {
    toBe: (expected: T) => {
      if (result.value !== expected) {
        throw new Error(`Expected ${expected}, got ${result.value}`)
      }
    },
    toEqual: (expected: T) => {
      const actual = JSON.stringify(result.value)
      const exp = JSON.stringify(expected)
      if (actual !== exp) {
        throw new Error(`Expected ${exp}, got ${actual}`)
      }
    },
  }
}

export function expectRejected(result: PromiseSettledResult<unknown>): {
  withMessage: (message: string) => void
} {
  if (result.status !== "rejected") {
    throw new Error(`Expected rejected promise, got ${result.status}`)
  }

  return {
    withMessage: (message: string) => {
      const errorMessage =
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason)
      if (!errorMessage.includes(message)) {
        throw new Error(
          `Expected error message to include "${message}", got "${errorMessage}"`,
        )
      }
    },
  }
}

export type OperationRecord = {
  kind: string
  targetType?: "flow" | "fn" | "parallel"
  flowName?: string
  key?: string
  input?: unknown
  output?: unknown
  error?: unknown
  params?: readonly unknown[]
  parallelMode?: string
  count?: number
}

export function createTrackingExtension(
  filter?: (kind: string, operation: Extension.Operation) => boolean,
): {
  ext: Extension.Extension
  records: OperationRecord[]
} {
  const records: OperationRecord[] = []

  const ext: Extension.Extension = {
    name: "tracker",
    wrap: (_scope, next, operation) => {
      if (filter && !filter(operation.kind, operation)) {
        return next()
      }

      const record: OperationRecord = { kind: operation.kind }

      if (operation.kind === "execution") {
        record.targetType = operation.target.type
        record.input = operation.input
        record.key = operation.key

        if (operation.target.type === "flow") {
          record.flowName = operation.target.definition.name
        } else if (operation.target.type === "fn") {
          record.params = operation.target.params
        } else if (operation.target.type === "parallel") {
          record.parallelMode = operation.target.mode
          record.count = operation.target.count
        }
      }

      return next()
        .then((result) => {
          record.output = result
          records.push(record)
          return result
        })
        .catch((error) => {
          record.error = error
          records.push(record)
          throw error
        })
    },
  }

  return { ext, records }
}

export function buildExecutionContext(details?: {
  name?: string
  tags?: Array<{ tag: Tag.Tag<any, boolean>; value: unknown }>
}) {
  const scope = createScope()
  const context = scope.createExecution({ name: details?.name || "test" })
  if (details?.tags) {
    for (const tagRef of details.tags) {
      context.set(tagRef.tag, tagRef.value)
    }
  }
  return { scope, context }
}

export type FlowHarness = ReturnType<typeof createFlowHarness>

export function createFlowHarness() {
  return {
    testFlows,
    executors: MockExecutors,
    extensions: ExtensionFactory,
    error: errorTestHelpers,
    scenarios,
    setup: testSetup,
    buildFlowScenario,
    createScopeWithCleanup,
    expectResolved,
    expectRejected,
    createTrackingExtension,
    buildExecutionContext,
  }
}
