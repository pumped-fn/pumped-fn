import { vi, expect } from "vitest";
import { flow } from "../src/flow";
import { custom } from "../src/ssch";
import { createExecutor } from "../src/executor";
import {
  createScope,
  provide,
  derive,
  type Extension,
  StandardSchemaV1,
} from "../src";

export namespace TestTypes {
  export interface User {
    id: string;
    name: string;
    email?: string;
  }

  export interface ErrorResult {
    code: string;
    message?: string;
  }

  export interface SuccessResult<T = unknown> {
    result: T;
  }

  export interface BasicInput {
    message: string;
  }

  export interface MathInput {
    a: number;
    b: number;
  }
}

export const testFlows = {
  basic: (name: string) =>
    flow.define({
      name,
      input: custom<TestTypes.BasicInput>(),
      output: custom<TestTypes.SuccessResult<string>>(),
    }),

  math: (name: string) =>
    flow.define({
      name,
      input: custom<TestTypes.MathInput>(),
      output: custom<TestTypes.SuccessResult<number>>(),
    }),

  user: (name: string) =>
    flow.define({
      name,
      input: custom<{ userId: string }>(),
      output: custom<{ user: TestTypes.User }>(),
    }),

  validation: (name: string) =>
    flow.define({
      name,
      input: custom<{ email: string }>(),
      output: custom<{ valid: boolean }>(),
    }),

  generic: <TInput, TSuccess>(
    name: string,
    input: StandardSchemaV1<TInput, unknown>,
    output: StandardSchemaV1<TSuccess, unknown>
  ) =>
    flow.define({
      name,
      input,
      output,
    }),
};

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
      undefined
    ),

  logger: (events: string[] = []) =>
    createExecutor(
      () => ({
        info: (message: string, data?: any) => {
          console.log(message, data);
          events.push(`info:${message}`);
        },
        error: (message: string, data?: any) => {
          console.error(message, data);
          events.push(`error:${message}`);
        },
        warn: (message: string, data?: any) => {
          console.warn(message, data);
          events.push(`warn:${message}`);
        },
        events,
      }),
      undefined,
      undefined
    ),

  failing: (errorMessage = "Test error") =>
    createExecutor(
      () => {
        throw new Error(errorMessage);
      },
      undefined,
      undefined
    ),

  async: (delay = 10, result: any = "async-result") =>
    createExecutor(
      async () => {
        await new Promise((resolve) => setTimeout(resolve, delay));
        return result;
      },
      undefined,
      undefined
    ),
};

export const ExtensionFactory = {
  contextCapture: (capturedContext: { current?: any } = {}) =>
    ({
      name: "context-capture",
      async wrapExecute(
        context: any,
        next: () => Promise<any>,
        execution: any
      ) {
        capturedContext.current = context;
        return next();
      },
    } as Extension.Extension),

  executionOrder: (execOrder: string[], extensionName: string) =>
    ({
      name: extensionName,
      async wrapExecute(
        context: any,
        next: () => Promise<any>,
        execution: any
      ) {
        execOrder.push(`${extensionName}-before`);
        const result = await next();
        execOrder.push(`${extensionName}-after`);
        return result;
      },
    } as Extension.Extension),

  lifecycle: (lifecycleCalls: string[], extensionName: string) =>
    ({
      name: extensionName,
      async initPod(pod: any, context: any) {
        lifecycleCalls.push(`${extensionName}-init`);
      },
      async disposePod(pod: any) {
        lifecycleCalls.push(`${extensionName}-dispose`);
      },
      async wrapExecute(
        context: any,
        next: () => Promise<any>,
        execution: any
      ) {
        lifecycleCalls.push(`${extensionName}-wrap`);
        return next();
      },
    } as Extension.Extension),

  errorHandler: (onError: any, extensionName = "error-extension") =>
    ({
      name: extensionName,
      onError,
    } as Extension.Extension),
};

export const errorTestHelpers = {
  expectExecutorError: async (
    executor: any,
    errorType: new (...args: any[]) => Error,
    errorCode?: string
  ) => {
    const scope = createScope();
    const errorCallback = vi.fn();
    scope.onError(errorCallback);

    await expect(scope.resolve(executor)).rejects.toThrow();

    expect(errorCallback).toHaveBeenCalledTimes(1);
    expect(errorCallback).toHaveBeenCalledWith(
      expect.any(errorType),
      executor,
      scope
    );

    if (errorCode) {
      const [capturedError] = errorCallback.mock.calls[0];
      expect(capturedError.code).toBe(errorCode);
    }
  },

  expectNoErrorCallback: async (executor: any, expectedResult?: any) => {
    const scope = createScope();
    const errorCallback = vi.fn();
    scope.onError(errorCallback);

    const result = await scope.resolve(executor);

    if (expectedResult !== undefined) {
      expect(result).toBe(expectedResult);
    }
    expect(errorCallback).not.toHaveBeenCalled();
  },

  createFailingChain: (errorMessage = "Chain error") => {
    const failingExecutor = provide(() => {
      throw new Error(errorMessage);
    });

    const chainedExecutor = derive(failingExecutor, (dep) => {
      return `Using ${dep}`;
    });

    return { failingExecutor, chainedExecutor };
  },
};

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
};

export const testSetup = {
  scopeWithErrorHandler: () => {
    const scope = createScope();
    const errorCallback = vi.fn();
    scope.onError(errorCallback);
    return { scope, errorCallback };
  },

  scopeWithExtensions: (extensions: Extension.Extension[]) =>
    createScope({ extensions }),

  expectFlowResult: (result: any, data?: any) => {
    if (data !== undefined) {
      expect(result).toEqual(data);
    }
  },
};
