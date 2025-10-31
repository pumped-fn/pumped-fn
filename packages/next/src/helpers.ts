import {
  isExecutor,
  isLazyExecutor,
  isReactiveExecutor,
  isStaticExecutor,
} from "./executor";
import { Core } from "./types";

/**
 * Resolves multiple executors in parallel from scope.
 * @param scope - Scope to resolve from
 * @param executors - Array or record of executors to resolve
 * @returns Promise of resolved values matching input structure
 * @example resolves(scope, [dbExecutor, cacheExecutor])
 */
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

