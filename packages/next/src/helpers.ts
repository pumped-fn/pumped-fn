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

