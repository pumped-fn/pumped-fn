import {
  isExecutor,
  isLazyExecutor,
  isReactiveExecutor,
  isStaticExecutor,
} from "./executor";
import { Core } from "./types";

export async function resolves<
  T extends
    | Array<Core.Executor<unknown> | Escapable<unknown>>
    | Record<string, Core.Executor<unknown> | Escapable<unknown>>
>(
  scope: Core.Scope,
  executors: { [K in keyof T]: T[K] }
): Promise<{ [K in keyof T]: Core.InferOutput<T[K]> }> {
  const objectOutput = {};
  const arrayOutput = [];

  const isArray = Array.isArray(executors);

  for (const [index, executor] of Object.entries(executors)) {
    const target = !isExecutor(executor)
      ? executor.escape()
      : isLazyExecutor(executor) ||
        isReactiveExecutor(executor) ||
        isStaticExecutor(executor)
      ? executor.executor
      : (executor as Core.Executor<unknown>);

    const result = await scope.resolve(target);

    if (isArray) {
      arrayOutput.push(result);
    } else {
      Object.assign(objectOutput, { [index]: result });
    }
  }

  const result = isArray ? arrayOutput : objectOutput;
  return result as { [K in keyof T]: Core.InferOutput<T[K]> };
}

export type Escapable<T> = {
  escape: () => Core.Executor<T>;
};

export type PreparedExecutor<T> = {
  (): Promise<Core.InferOutput<Core.Executor<T>>>;
  escape: () => Core.Executor<T>;
};

class PreparedExecutorImpl<T> {
  private scope: Core.Scope;
  private executor: Core.Executor<T>;

  constructor(scope: Core.Scope, executor: Core.Executor<T>) {
    this.scope = scope;
    this.executor = executor;
  }

  async __call(): Promise<Core.InferOutput<Core.Executor<T>>> {
    return await this.scope.resolve(this.executor);
  }

  escape(): Core.Executor<T> {
    return this.executor;
  }
}

export function prepare<T>(
  scope: Core.Scope,
  executor: Core.Executor<T>
): PreparedExecutor<Core.InferOutput<Core.Executor<T>>> {
  const impl = new PreparedExecutorImpl(scope, executor);
  
  const fn = (async () => impl.__call()) as any;
  fn.escape = () => impl.escape();
  
  return fn;
}

export type AdaptedExecutor<A extends Array<unknown>, T> = {
  (...args: A): Promise<Awaited<T>>;
  escape: () => Core.Executor<(...args: A) => Promise<Awaited<T>>>;
};

class AdaptedExecutorImpl<A extends Array<unknown>, T> {
  private scope: Core.Scope;
  private executor: Core.Executor<(...args: A) => Promise<T> | T>;

  constructor(scope: Core.Scope, executor: Core.Executor<(...args: A) => Promise<T> | T>) {
    this.scope = scope;
    this.executor = executor;
  }

  async __call(...args: A): Promise<Awaited<T>> {
    const fn = await this.scope.resolve(this.executor);
    return await fn(...args);
  }

  escape(): Core.Executor<(...args: A) => Promise<Awaited<T>>> {
    return this.executor as Core.Executor<(...args: A) => Promise<Awaited<T>>>;
  }
}

export function adapt<A extends Array<unknown>, T>(
  scope: Core.Scope,
  executor: Core.Executor<(...args: A) => Promise<T> | T>
): AdaptedExecutor<A, T> {
  const impl = new AdaptedExecutorImpl(scope, executor);
  
  const fn = (async (...args: A) => impl.__call(...args)) as AdaptedExecutor<A, T>;
  fn.escape = () => impl.escape();
  
  return fn;
}
