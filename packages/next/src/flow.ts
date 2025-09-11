import type { Core, Flow } from "./types";
import { createExecutor } from "./executor";
import { createScope } from "./scope";
import { validate } from "./ssch";
import type { DataAccessor } from "./data-accessor";
import { ExecutorResolutionError, FactoryExecutionError } from "./types";
import { ErrorCodes } from "./error-codes";

export function createInitialContext<
  T extends Record<string, unknown>
>(initializers: {
  [K in keyof T]: { accessor: DataAccessor<T[K]>; value: T[K] };
}): Flow.ContextData {
  const context = new Map();
  for (const [_, config] of Object.entries(initializers)) {
    const { accessor, value } = config as {
      accessor: DataAccessor<unknown>;
      value: unknown;
    };
    context.set(accessor.key, value);
  }
  return context;
}

export function provide<Input, Output>(
  config: Flow.Config & Flow.Schema<Input, Output>,
  handler: Flow.NoDependencyFlowFn<Input, Output>
): Flow.Executor<Input, Output> {
  const executor = createExecutor(
    (): Flow.Flow<Input, Output> => ({
      execution: handler,
      input: config.input,
      output: config.output,
      plugins: config.plugins || [],
      metas: config.metas || [],
      name: config.name,
      description: config.description,
    }),
    undefined,
    config.metas || []
  ) as Flow.Executor<Input, Output>;

  Object.assign(executor, config);
  return executor;
}

export function derive<D extends Core.DependencyLike, Input, Output>(
  {
    dependencies,
    ...config
  }: {
    dependencies: { [K in keyof D]: D[K] };
  } & Flow.Config &
    Flow.Schema<Input, Output>,
  handler: Flow.DependentFlowFn<Core.InferOutput<D>, Input, Output>
): Flow.Executor<Input, Output> {
  const executor = createExecutor(
    (deps: unknown): Flow.Flow<Input, Output> => ({
      execution: (input, controller) => handler(deps as any, input, controller),
      input: config.input,
      output: config.output,
      plugins: config.plugins || [],
      metas: config.metas || [],
      name: config.name,
      description: config.description,
    }),
    dependencies as any,
    config.metas || []
  ) as Flow.Executor<Input, Output>;

  Object.assign(executor, config);
  return executor;
}

export class FlowError extends Error {
  public readonly code: string;
  public readonly category: "USER_ERROR" | "SYSTEM_ERROR" | "VALIDATION_ERROR";

  constructor(message: string, public details?: any) {
    super(message);
    // Manually set cause if provided (including falsy values like null)
    if (details && "cause" in details) {
      (this as any).cause = details.cause;
    }
    this.name = "FlowError";

    // Extract error information from enhanced errors if available
    if (details?.enhancedError) {
      this.code = details.errorCode || ErrorCodes.FLOW_EXECUTION_FAILED;
      this.category = details.errorCategory || "USER_ERROR";
    } else {
      this.code = ErrorCodes.FLOW_EXECUTION_FAILED;
      this.category = "USER_ERROR";
    }
  }

  /**
   * Get the original enhanced error if available
   */
  getEnhancedError():
    | ExecutorResolutionError
    | FactoryExecutionError
    | undefined {
    return this.details?.enhancedError;
  }

  /**
   * Get the error context from enhanced error if available
   */
  getErrorContext(): unknown {
    return this.details?.errorContext;
  }

  /**
   * Get flow-specific context
   */
  getFlowContext(): { flowName?: string; flowDescription?: string } {
    return {
      flowName: this.details?.flowName as string | undefined,
      flowDescription: this.details?.flowDescription as string | undefined,
    };
  }
}

function createController(
  context: Flow.ExecutionContext,
  opt: Flow.ExecuteOpt | undefined
): Flow.Controller & {
  context: Flow.ExecutionContext;
} {
  const controller: Flow.Controller & { context: Flow.ExecutionContext } = {
    context,
    safeExecute: async (flowDef, param, opts) => {
      try {
        let resolvedFlow: Flow.Flow<any, any>;
        if ("execution" in flowDef && typeof flowDef.execution === "function") {
          resolvedFlow = flowDef as Flow.Flow<any, any>;
        } else if (context.scope) {
          resolvedFlow = await context.scope.pod().resolve(flowDef as any);
        } else {
          throw new FlowError("Cannot resolve executor without a scope");
        }

        const validatedInput = validate(resolvedFlow.input, param);

        const childData = new Map(context.data);

        if (opts?.initialContext) {
          for (const [key, value] of opts.initialContext) {
            childData.set(key, value);
          }
        }

        const childContext: Flow.ExecutionContext = {
          data: childData,
          parent: context,
          scope: context.scope,
          plugins: [...context.plugins, ...(opts?.plugins || [])],
          flow: resolvedFlow,
          get(key: unknown): unknown {
            return childData.get(key);
          },
          set(key: unknown, value: unknown): unknown | void {
            return childData.set(key, value);
          },
        };
        const childController = createController(childContext, opt);

        let execution = async () =>
          resolvedFlow.execution(validatedInput, childController);

        for (let i = childContext.plugins.length - 1; i >= 0; i--) {
          const plugin = childContext.plugins[i];
          const prevExecution = execution;
          execution = () => plugin.wrap(childContext, prevExecution);
        }

        const result = await execution();
        return { kind: "success", value: result };
      } catch (error) {
        const wrappedError =
          error instanceof FlowError
            ? error
            : new FlowError(
                error instanceof Error
                  ? error.message
                  : "Flow execution failed",
                { cause: error }
              );
        return { kind: "error", error: wrappedError };
      }
    },
    execute: async (flowDef, param, opts) => {
      const result = await controller.safeExecute(flowDef, param, opts);
      if (result.kind === "error") {
        throw result.error;
      }
      return result.value;
    },
  };

  return controller;
}

export async function execute<Input, Output>(
  executor: Flow.Executor<Input, Output>,
  input: Input,
  opt?: Flow.ExecuteOpt
): Promise<Flow.ExecutionResult<Output>> {
  const isOwnScope = !opt?.scope;
  const scope = opt?.scope || createScope();
  const pod = scope.pod(...(opt?.presets || []));

  let flow: Flow.Flow<Input, Output>;
  try {
    flow = await pod.resolve(executor);
  } catch (error) {
    // Preserve enhanced error context if available
    if (
      error instanceof ExecutorResolutionError ||
      error instanceof FactoryExecutionError
    ) {
      // Re-throw enhanced errors with additional flow context
      throw new FlowError(`Flow execution failed: ${error.message}`, {
        cause: error,
        enhancedError: error,
        errorCode: error.code,
        errorCategory: error.category,
        errorContext: error.context,
        flowName: opt?.name,
        flowDescription: opt?.description,
      });
    } else {
      // Handle non-enhanced errors with basic wrapping
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new FlowError(`Failed to resolve executor: ${errorMessage}`, {
        cause: error,
        flowName: opt?.name,
        flowDescription: opt?.description,
      });
    }
  }

  const contextData = opt?.initialContext || new Map();
  const context: Flow.ExecutionContext = {
    data: contextData,
    parent: undefined,
    scope,
    plugins: opt?.plugins || [],
    flow,
    get(key: unknown): unknown {
      return contextData.get(key);
    },
    set(key: unknown, value: unknown): unknown | void {
      return contextData.set(key, value);
    },
  };
  const controller = createController(context, opt);
  const flowWithContext = { ...flow, context };

  let executionResult: Flow.Result<Output>;
  try {
    const validatedInput = validate(flow.input, input);

    let execution = async () => flow.execution(validatedInput, controller);

    for (let i = context.plugins.length - 1; i >= 0; i--) {
      const plugin = context.plugins[i];
      const prevExecution = execution;
      execution = () => plugin.wrap(context, prevExecution);
    }

    const result = await execution();
    executionResult = { kind: "success", value: result };
  } catch (error) {
    const wrappedError =
      error instanceof FlowError
        ? error
        : new FlowError(
            error instanceof Error ? error.message : "Flow execution failed",
            { cause: error }
          );
    executionResult = { kind: "error", error: wrappedError };
  }

  if (isOwnScope) {
    await scope.dispose();
  } else {
    await scope.disposePod(pod);
  }

  return {
    context: flowWithContext.context,
    result: executionResult,
  };
}
