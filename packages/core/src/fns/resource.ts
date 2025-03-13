import { Executor, executorSymbol, InferOutput, isExecutor, ResourceExecutor } from "../types";
import { Factory, Cleanup } from "../types";

let resourceId = 0;

const nextResourceId = () => {
  return `resource:${resourceId++}`;
};

export function resource<P, T extends Executor<unknown>>(
  executor: T,
  factory: Factory<[P, Cleanup], InferOutput<T>>,
): ResourceExecutor<P>;

export function resource<P, T extends Array<Executor<unknown>> | Record<string, Executor<unknown>>>(
  executor: { [K in keyof T]: T[K] },
  factory: Factory<[P, Cleanup], { [K in keyof T]: InferOutput<T[K]> }>,
): ResourceExecutor<P>;

export function resource<P, T>(
  pDependencyOrFactory: Executor<T> | { [K in keyof T]: Executor<T[K]> },
  factory: Factory<[P, Cleanup], T>,
): ResourceExecutor<P> {
  if (isExecutor(pDependencyOrFactory)) {
    return {
      [executorSymbol]: { kind: "resource" },
      factory: (dependencies, scope) => factory(dependencies as any, scope),
      dependencies: pDependencyOrFactory,
      id: nextResourceId(),
    };
  }

  return {
    [executorSymbol]: { kind: "resource" },
    factory: (dependencies, scope) => factory(dependencies as any, scope),
    dependencies: pDependencyOrFactory,
    id: nextResourceId(),
  };
}
