import type { Core, Flow, Meta, StandardSchemaV1 } from "./types";
import { provide as coreProvide, derive as coreDerive } from "./executor";
import { createScope } from "./scope";
import { validate } from "./ssch";

export function provideFlow<Input, Output>(
  config: Flow.Config & Flow.Schema<Input, Output>,
  handler: Flow.NoDependencyFlowFn<Input, Output>,
): Flow.Executor<Input, Output> {
  const executor: Flow.Executor<Input, Output> = coreProvide(() => ({
    execution: handler,
    ...config
  }), ...config.metas || []) as any

  Object.assign(executor, {...config})

  return executor
}

export function deriveFlow<
  D extends
  | ReadonlyArray<Core.BaseExecutor<unknown>>
  | Record<string, Core.BaseExecutor<unknown>>,
  Input,
  Output
>(
  { dependencies, ...config }: {
    dependencies: { [K in keyof D]: D[K] },
  } & Flow.Config & Flow.Schema<Input, Output>,
  handler: Flow.DependentFlowFn<{ [K in keyof D]: Core.InferOutput<D[K]> }, Input, Output>,
): Flow.Executor<Input, Output> {
  const executor: Flow.Executor<Input, Output> = coreDerive(
    dependencies as any,
    ((dependencies: unknown): Flow.Flow<Input, Output> => {
      return {
        execution: (input, controller) => handler(dependencies as any, input, controller),
        input: config.input,
        output: config.output,
        plugins: config.plugins || [],
      }
    }) as any,
    ...config.metas || []
  ) as any;

  Object.assign(executor, {
    ...config
  });

  return executor
}

// Error codes as constants instead of enum
export const FlowErrorCode = {
  VALIDATION: 'validation',
  TIMEOUT: 'timeout',
  EXECUTION: 'execution',
  DEPENDENCY: 'dependency',
  PLUGIN: 'plugin',
  SCOPE: 'scope',
  UNKNOWN: 'unknown'
} as const;

export type FlowErrorType = typeof FlowErrorCode[keyof typeof FlowErrorCode];

// Single error class with type parameter
export class FlowError extends Error {
  type: FlowErrorType;
  details?: any;

  constructor(message: string, type: FlowErrorType, details?: any) {
    super(message);
    this.name = 'FlowError';
    this.type = type;
    this.details = details;
  }

  // Helper functions to create specific error types
  static validation(message: string, details?: any): FlowError {
    return new FlowError(message, FlowErrorCode.VALIDATION, details);
  }

  static timeout(message: string = 'Operation timed out', details?: any): FlowError {
    return new FlowError(message, FlowErrorCode.TIMEOUT, details);
  }

  static execution(message: string, details?: any): FlowError {
    return new FlowError(message, FlowErrorCode.EXECUTION, details);
  }

  static dependency(message: string, details?: any): FlowError {
    return new FlowError(message, FlowErrorCode.DEPENDENCY, details);
  }
}

export async function execute<Input, Output>(
  executor: Flow.Executor<Input, Output>,
  input: Input,
  opt?: Flow.ExecuteOpt
): Promise<Flow.ExecutionResult<Output>> {
  let selfControl = !!opt?.scope
  const scope = opt?.scope || createScope()

  const pod = scope.pod(...opt?.presets || []);

  const flow = await pod.resolve(executor)
    .catch(error => { throw FlowError.dependency(`Failed to resolve executor: ${error.message}`, { cause: error }); });

  const context: Flow.ExecutionContext = {
    data: {}
  }

  const controller: Flow.Controller & { context: Flow.ExecutionContext } = {
    context: context,
    safeExecute: async ({ execution, input, output }, param, opts) => {
      let validatedInput = param

      try {
        validatedInput = validate(input, param);
      } catch (error) {
        const wrappedError = FlowError.validation(`Input validation failed:`, { cause: error });
        return { kind: 'error', error: wrappedError };
      }

      try {
        const result = await execution(validatedInput, controller)
        return { kind: 'success', value: result }
      } catch (error) {
        const wrappedError = FlowError.execution(`Flow execution failed:`, { cause: error });
        return { kind: 'error', error: wrappedError };
      }
    },
    execute: async (context, param, opts) => {
      const result = await controller.safeExecute(context, param, opts);

      if (result.kind === 'error') {
        throw result.error;
      }

      return result.value
    }
  }

  const initialContext = Object.assign({}, flow, { context })

  const executionResult = await controller.safeExecute(initialContext, input, opt)

  if (selfControl) {
    await scope.dispose();
  } else {
    await scope.disposePod(pod)
  }

  return {
    context: initialContext.context,
    result: executionResult,
  }
}