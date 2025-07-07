import {
  type Core,
  type StandardSchemaV1,
  derive,
  provide,
  resolves,
  preset,
  createScope,
} from "@pumped-fn/core-next";

export declare namespace Flow {
  export type FlowGenerator<R> = Generator<Core.Executor<any>, R, any>;
  export type FlowFn<Input, Output> = (input: Input) => FlowGenerator<Output>;
  
  export interface Context {
    stepIndex: number;
    stepResults: any[];
    error?: Error;
    metadata: Record<string, any>;
  }

  // SPI interface for accessing context within executors
  export interface StepContext {
    readonly flowContext: Context;
    readonly stepIndex: number;
    readonly currentInput: any;
  }
}

// Flow context executor for SPI access
export const FlowContextExecutor = provide(() => null as Flow.StepContext | null);

export const flow = {
  create<Input, Output>(
    flowFn: Flow.FlowFn<Input, Output>
  ): Core.Executor<(input: Input, context?: Flow.Context) => Promise<Output>> {
    return derive([], async (_, controller) => {
      return async (input: Input, context?: Flow.Context) => {
        const generator = flowFn(input);
        const execContext = context || { stepIndex: 0, stepResults: [], metadata: {} };
        
        let result = generator.next();
        
        // Skip to the last executed step if recovering
        for (let i = 0; i < execContext.stepIndex; i++) {
          if (!result.done) {
            result = generator.next(execContext.stepResults[i]);
          }
        }
        
        while (!result.done) {
          try {
            // Create step context for SPI access
            const stepContext: Flow.StepContext = {
              flowContext: execContext,
              stepIndex: execContext.stepIndex,
              currentInput: result.value
            };

            // Temporarily inject the flow context into the current scope
            const originalValue = await controller.scope.resolve(FlowContextExecutor).catch(() => null);
            
            // Update the flow context executor with current step context
            await controller.scope.update(FlowContextExecutor, stepContext);

            try {
              // Resolve within the scope with context access
              const resolved = await resolves(controller.scope, { step: result.value });
              execContext.stepResults[execContext.stepIndex] = resolved.step;
              execContext.stepIndex++;
              
              result = generator.next(resolved.step);
            } finally {
              // Restore original value
              if (originalValue !== null) {
                await controller.scope.update(FlowContextExecutor, originalValue);
              }
            }
          } catch (error) {
            execContext.error = error as Error;
            throw error;
          }
        }
        
        return result.value;
      };
    });
  },

  // Helper to wrap a generator function with proper type inference
  step<Args extends any[], R>(
    fn: (...args: Args) => Generator<any, R, any>
  ): (...args: Args) => Generator<any, R, any> {
    return fn;
  },

  // Helper to create a simple async step
  async<T>(fn: () => Promise<T>): Core.Executor<T> {
    return provide(fn);
  },

  // Helper to create a sync step
  sync<T>(fn: () => T): Core.Executor<T> {
    return provide(async () => fn());
  },

  // Access flow context from within an executor (SPI)
  getContext(): Core.Executor<Flow.StepContext | null> {
    return FlowContextExecutor;
  },

  // Context utilities
  context: {
    create(): Flow.Context {
      return {
        stepIndex: 0,
        stepResults: [],
        metadata: {}
      };
    },

    withMetadata(context: Flow.Context, metadata: Record<string, any>): Flow.Context {
      return {
        ...context,
        metadata: { ...context.metadata, ...metadata }
      };
    },

    reset(context: Flow.Context): Flow.Context {
      return {
        stepIndex: 0,
        stepResults: [],
        metadata: context.metadata
      };
    }
  }
} as const;