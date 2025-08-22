import type { Core, Flow } from "./types";
import { createExecutor } from "./executor";
import { createScope } from "./scope";
import { validate } from "./ssch";

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
      metas: config.metas || [],  // Include metas in the resolved flow
      name: config.name,
      description: config.description
    }),
    undefined,
    config.metas || []
  ) as Flow.Executor<Input, Output>;

  Object.assign(executor, config);
  return executor;
}

export function derive<
  D extends
    | ReadonlyArray<Core.BaseExecutor<unknown>>
    | Record<string, Core.BaseExecutor<unknown>>,
  Input,
  Output
>(
  {
    dependencies,
    ...config
  }: {
    dependencies: { [K in keyof D]: D[K] };
  } & Flow.Config &
    Flow.Schema<Input, Output>,
  handler: Flow.DependentFlowFn<
    { [K in keyof D]: Core.InferOutput<D[K]> },
    Input,
    Output
  >
): Flow.Executor<Input, Output> {
  const executor = createExecutor(
    (deps: unknown): Flow.Flow<Input, Output> => ({
      execution: (input, controller) =>
        handler(deps as any, input, controller),
      input: config.input,
      output: config.output,
      plugins: config.plugins || [],
      metas: config.metas || [],  // Include metas in the resolved flow
      name: config.name,
      description: config.description
    }),
    dependencies as any,
    config.metas || []
  ) as Flow.Executor<Input, Output>;

  Object.assign(executor, config);
  return executor;
}

// Error codes as constants instead of enum
export const FlowErrorCode = {
  VALIDATION: "validation",
  TIMEOUT: "timeout",
  EXECUTION: "execution",
  DEPENDENCY: "dependency",
  PLUGIN: "plugin",
  SCOPE: "scope",
  UNKNOWN: "unknown",
} as const;

export type FlowErrorType = (typeof FlowErrorCode)[keyof typeof FlowErrorCode];

// Single error class with type parameter
export class FlowError extends Error {
  type: FlowErrorType;
  details?: any;

  constructor(message: string, type: FlowErrorType, details?: any) {
    super(message);
    this.name = "FlowError";
    this.type = type;
    this.details = details;
  }

  // Helper functions to create specific error types
  static validation(message: string, details?: any): FlowError {
    return new FlowError(message, FlowErrorCode.VALIDATION, details);
  }

  static timeout(
    message: string = "Operation timed out",
    details?: any
  ): FlowError {
    return new FlowError(message, FlowErrorCode.TIMEOUT, details);
  }

  static execution(message: string, details?: any): FlowError {
    return new FlowError(message, FlowErrorCode.EXECUTION, details);
  }

  static dependency(message: string, details?: any): FlowError {
    return new FlowError(message, FlowErrorCode.DEPENDENCY, details);
  }
}

function createController(
  context: Flow.ExecutionContext
): Flow.Controller & { 
  context: Flow.ExecutionContext & {
    get(key: any): any;
    set(key: any, value: any): void;
    has(key: any): boolean;
  }
} {
  // Add context helper methods
  const contextWithHelpers = Object.assign(context, {
    get(key: any): any {
      return context.data.get(key);
    },
    set(key: any, value: any): void {
      context.data.set(key, value);
    },
    has(key: any): boolean {
      return context.data.has(key);
    }
  });

  const controller: Flow.Controller & { context: typeof contextWithHelpers } = {
    context: contextWithHelpers,
    safeExecute: async (flowDef, param, opts) => {
      try {
        const validatedInput = validate(flowDef.input, param);
        
        // Always create child controller for nested executions
        // Copy parent's data to child (Map doesn't support prototype chain for get/set)
        const childData = new Map(context.data);
        
        const childContext: Flow.ExecutionContext = {
          data: childData,
          parent: context,
          scope: context.scope,
          plugins: [...context.plugins, ...(opts?.plugins || [])],  // Merge plugins from opts
          flow: flowDef  // Store the flow being executed
        };
        const childController = createController(childContext);
        
        // Wrap execution with all plugins (including opts plugins)
        let execution = async () => flowDef.execution(validatedInput, childController);
        
        // Apply plugins in reverse order (last plugin is innermost)
        for (let i = childContext.plugins.length - 1; i >= 0; i--) {
          const plugin = childContext.plugins[i];
          const prevExecution = execution;
          execution = () => plugin.wrap(childContext, prevExecution);
        }
        
        const result = await execution();
        return { kind: "success", value: result };
      } catch (error) {
        if (error instanceof FlowError) {
          return { kind: "error", error };
        }
        
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorType = errorMessage.includes("validation") 
          ? FlowErrorCode.VALIDATION 
          : FlowErrorCode.EXECUTION;
        
        const wrappedError = new FlowError(
          errorType === FlowErrorCode.VALIDATION 
            ? "Input validation failed" 
            : "Flow execution failed",
          errorType,
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
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw FlowError.dependency(`Failed to resolve executor: ${errorMessage}`, {
      cause: error,
    });
  }

  const context: Flow.ExecutionContext = { 
    data: new Map(),
    scope,
    plugins: opt?.plugins || [],
    flow  // Store the flow being executed
  };
  const controller = createController(context);
  const flowWithContext = { ...flow, context };

  // Execute root flow directly with the root controller (no child context)
  let executionResult: Flow.Result<Output>;
  try {
    const validatedInput = validate(flow.input, input);
    
    // Wrap root execution with plugins
    let execution = async () => flow.execution(validatedInput, controller);
    
    // Apply plugins in reverse order (last plugin is innermost)
    for (let i = context.plugins.length - 1; i >= 0; i--) {
      const plugin = context.plugins[i];
      const prevExecution = execution;
      execution = () => plugin.wrap(context, prevExecution);
    }
    
    const result = await execution();
    executionResult = { kind: "success", value: result };
  } catch (error) {
    if (error instanceof FlowError) {
      executionResult = { kind: "error", error };
    } else {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorType = errorMessage.includes("validation") 
        ? FlowErrorCode.VALIDATION 
        : FlowErrorCode.EXECUTION;
      
      const wrappedError = new FlowError(
        errorType === FlowErrorCode.VALIDATION 
          ? "Input validation failed" 
          : "Flow execution failed",
        errorType,
        { cause: error }
      );
      executionResult = { kind: "error", error: wrappedError };
    }
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

