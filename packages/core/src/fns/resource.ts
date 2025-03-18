import { Meta } from "../meta";
import { createExecutor, Executor, executorSymbol, InferOutput, isExecutor, ResourceExecutor } from "../types";
import { Factory, Cleanup } from "../types";

let resourceId = 0;

const nextResourceId = () => {
  return `resource:${resourceId++}`;
};

export function resource<P, T extends Executor<unknown>>(
  executor: T,
  factory: Factory<[P, Cleanup], InferOutput<T>>,
  ...metas: Meta<unknown>[]
): ResourceExecutor<P>;

export function resource<P, T extends Array<Executor<unknown>> | Record<string, Executor<unknown>>>(
  executor: { [K in keyof T]: T[K] },
  factory: Factory<[P, Cleanup], { [K in keyof T]: InferOutput<T[K]> }>,
  ...metas: Meta<unknown>[]
): ResourceExecutor<P>;

export function resource<P, T>(
  pDependencyOrFactory: Executor<T> | { [K in keyof T]: Executor<T[K]> },
  factory: Factory<[P, Cleanup], T>,
  ...metas: Meta<unknown>[]
): ResourceExecutor<P> {
  if (isExecutor(pDependencyOrFactory)) {
    return createExecutor(
      { kind: "resource" },
      factory,
      pDependencyOrFactory,
      nextResourceId(),
      metas,
    ) as ResourceExecutor<P>;
  }

  return createExecutor(
    { kind: "resource" },
    factory,
    pDependencyOrFactory,
    nextResourceId(),
    metas,
  ) as ResourceExecutor<P>;
}
