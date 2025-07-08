import { type Core, derive, provide, createScope } from "@pumped-fn/core-next";

// ================================
// Flow API - Async Generator Based
// ================================

export declare namespace Flow {
  export type StandardSchema<T = any> = {
    parse(input: unknown): T;
    // StandardSchema interface - compatible with Zod and other schema libraries
  };

  export type StepEvent = {
    type: "step.start" | "step.progress" | "step.complete" | "step.error";
    step: string;
    data?: any;
    timestamp?: number;
  };

  export type FlowEvent = {
    type: "flow.start" | "flow.progress" | "flow.complete" | "flow.error";
    flowId: string;
    step?: string;
    data?: any;
    timestamp?: number;
  };

  export type StepHandler<Input, Output> = Core.Executor<
    (input: Input) => AsyncGenerator<StepEvent, Output>
  >;

  export type FlowHandler<Input, Output> = Core.Executor<
    (input: Input, scope: Core.Scope) => AsyncGenerator<FlowEvent, Output>
  >;

  // New type for direct step generators (for use with derive + yield*)
  export type StepGenerator<Input, Output> = Core.Executor<
    AsyncGenerator<StepEvent, Output, Input>
  >;
}

// FlowScope - Parent-first resolution that implements Core.Scope
export class FlowScope implements Core.Scope {
  private readonly scope: Core.Scope;
  private readonly parentScope?: Core.Scope;

  constructor(parentScope?: Core.Scope) {
    this.scope = createScope();
    this.parentScope = parentScope;
  }

  accessor<T>(executor: Core.Executor<T>, eager?: boolean): Core.Accessor<T> {
    return this.scope.accessor(executor, eager);
  }

  async resolve<T>(executor: Core.Executor<T>): Promise<T> {
    // Check if parent scope has it first
    if (this.parentScope) {
      try {
        return await this.parentScope.resolve(executor);
      } catch {
        // Not in parent, resolve in current scope
      }
    }

    // Resolve in current scope
    return await this.scope.resolve(executor);
  }

  async resolveAccessor<T>(
    executor: Core.Executor<T>
  ): Promise<Core.Accessor<T>> {
    // Check if parent scope has it first
    if (this.parentScope) {
      try {
        return await this.parentScope.resolveAccessor(executor);
      } catch {
        // Not in parent, resolve in current scope
      }
    }

    // Resolve in current scope
    return await this.scope.resolveAccessor(executor);
  }

  async update<T>(
    executor: Core.Executor<T>,
    updateFn: T | ((current: T) => T)
  ): Promise<void> {
    return this.scope.update(executor, updateFn);
  }

  async release(executor: Core.Executor<any>, soft?: boolean): Promise<void> {
    return this.scope.release(executor, soft);
  }

  async dispose(): Promise<void> {
    await this.scope.dispose();
    // Don't dispose parent scope
  }

  onUpdate<T>(
    executor: Core.Executor<T>,
    callback: (accessor: Core.Accessor<T>) => void
  ): Core.Cleanup {
    return this.scope.onUpdate(executor, callback);
  }

  onChange(cb: Core.ChangeCallback): Core.Cleanup {
    return this.scope.onChange(cb);
  }

  onRelease(cb: Core.ReleaseCallback): Core.Cleanup {
    return this.scope.onRelease(cb);
  }

  use(middleware: Core.Middleware): Core.Cleanup {
    return this.scope.use(middleware);
  }
}

// Step function - Creates step executors that work seamlessly with yield*
// Automatically adapts Promise-based or AsyncGenerator-based handlers to flow-compatible generators
export function step<Input, Output>(
  input: Flow.StandardSchema<Input>,
  output: Flow.StandardSchema<Output>,
  handler: Core.Executor<
    ((input: Input) => Promise<Output>) | ((input: Input) => AsyncGenerator<Flow.StepEvent, Output>)
  >
): Core.Executor<(input: Input) => AsyncGenerator<Flow.FlowEvent, Output>> {
  return derive({ stepHandler: handler }, ({ stepHandler }) => {
    return async function*(input: Input): AsyncGenerator<Flow.FlowEvent, Output> {
      const result = stepHandler(input);
      
      // Check if it's a Promise or AsyncGenerator and adapt accordingly
      if (result && typeof (result as any).next === 'function') {
        // It's an AsyncGenerator - convert step events to flow events
        const stepGenerator = result as AsyncGenerator<Flow.StepEvent, Output>;
        let stepResult = await stepGenerator.next();
        
        while (!stepResult.done) {
          const stepEvent = stepResult.value;
          // Convert step event to flow event
          const flowEvent: Flow.FlowEvent = {
            type: stepEvent.type.replace('step.', 'flow.') as any,
            flowId: stepEvent.step || 'auto-generated',
            step: stepEvent.step,
            data: stepEvent.data,
            timestamp: stepEvent.timestamp || Date.now()
          };
          yield flowEvent;
          stepResult = await stepGenerator.next();
        }
        
        return stepResult.value;
      } else {
        // It's a Promise - just await it and return (no events to yield)
        return await (result as Promise<Output>);
      }
    };
  });
}


// Flow function - Creates flow executors
export function flow<Input, Output>(
  input: Flow.StandardSchema<Input>,
  output: Flow.StandardSchema<Output>,
  handler: Core.Executor<
    (input: Input, scope: Core.Scope) => AsyncGenerator<Flow.FlowEvent, Output>
  >
): Core.Executor<
  (input: Input, scope: Core.Scope) => AsyncGenerator<Flow.FlowEvent, Output>
> {
  // Return the handler directly with proper types
  return handler;
}

// Legacy helper - now deprecated since all steps are async generators
// @deprecated All steps are now async generators, use yield* instead
export async function runStepSilent<I, O>(
  stepHandler: ((input: I) => Promise<O>) | ((input: I) => AsyncGenerator<Flow.StepEvent, O>),
  input: I
): Promise<O> {
  const result = stepHandler(input);
  
  // Check if it's a Promise or AsyncGenerator
  if (result && typeof (result as any).next === 'function') {
    // It's an AsyncGenerator
    const generator = result as AsyncGenerator<Flow.StepEvent, O>;
    let stepResult = await generator.next();
    while (!stepResult.done) {
      // Consume step events without yielding them
      stepResult = await generator.next();
    }
    return stepResult.value;
  } else {
    // It's a Promise
    return await (result as Promise<O>);
  }
}

// Helper to run a step within a flow
export async function* runStep<I, O>(
  stepExecutor: Core.Executor<(input: I) => AsyncGenerator<Flow.StepEvent, O>>,
  input: I,
  scope: Core.Scope
): AsyncGenerator<Flow.StepEvent, O> {
  const handler = await scope.resolve(stepExecutor);
  const generator = handler(input);

  let result = await generator.next();
  while (!result.done) {
    yield result.value;
    result = await generator.next();
  }

  return result.value;
}

// Generic helper to collect all events from a generator
export async function collect<Event, Result>(
  generator: AsyncGenerator<Event, Result>
): Promise<{ events: Event[]; result: Result }> {
  const events: Event[] = [];
  let result = await generator.next();

  while (!result.done) {
    events.push(result.value);
    result = await generator.next();
  }

  return { events, result: result.value };
}

// Enhanced execute function with better DX
export async function execute<Input, Output>(
  flowExecutor: Core.Executor<
    (input: Input, scope: Core.Scope) => AsyncGenerator<Flow.FlowEvent, Output>
  >,
  input: Input,
  context?: {
    parentScope?: Core.Scope;
    onEvent?: (event: Flow.FlowEvent) => void;
    onComplete?: (result: Output) => void;
    onError?: (error: Error) => void;
  }
): Promise<{ events: Flow.FlowEvent[]; result: Output }> {
  const flowScope = new FlowScope(context?.parentScope);

  try {
    const handler = await flowScope.resolve(flowExecutor);
    const generator = handler(input, flowScope);

    const events: Flow.FlowEvent[] = [];
    let result = await generator.next();

    while (!result.done) {
      events.push(result.value);
      context?.onEvent?.(result.value);
      result = await generator.next();
    }

    context?.onComplete?.(result.value);
    return { events, result: result.value };
  } catch (error) {
    context?.onError?.(error as Error);
    throw error;
  } finally {
    await flowScope.dispose();
  }
}

// Legacy compatibility - keeping the old executeFlow function
export async function executeFlow<I, O>(
  flowExecutor: Core.Executor<
    (input: I, scope: Core.Scope) => AsyncGenerator<Flow.FlowEvent, O>
  >,
  input: I,
  appScope?: Core.Scope
): Promise<{ events: Flow.FlowEvent[]; result: O }> {
  return execute(flowExecutor, input, { parentScope: appScope });
}

// Legacy compatibility - keeping collectGenerator
export async function collectGenerator<T>(
  generator: AsyncGenerator<any, T>
): Promise<{ events: any[]; result: T }> {
  return collect(generator);
}

// Legacy aliases for backward compatibility (deprecated - use new names)
/** @deprecated Use `flow` instead */
export const flowV2 = flow;

/** @deprecated Use `Flow.StepEvent` instead */
export declare namespace FlowV2 {
  export type StandardSchema<T> = Flow.StandardSchema<T>;
  export type StepEvent = Flow.StepEvent;
  export type FlowEvent = Flow.FlowEvent;
  export type StepHandler<Input, Output> = Flow.StepHandler<Input, Output>;
  export type FlowHandler<Input, Output> = Flow.FlowHandler<Input, Output>;
}
