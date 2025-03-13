import { Executor, executorSymbol, ImmutableExecutor, InferOutput, isExecutor, Scope } from "../types";
import { Factory } from "../types";

let providerId = 0;

const nextProviderId = () => {
  return `immutable:${providerId++}`;
};

export function provide<P>(factory: (scope: Scope) => P): ImmutableExecutor<P>;

export function provide<P, T extends Executor<unknown>>(
  executor: T,
  factory: Factory<P, InferOutput<T>>,
): ImmutableExecutor<P>;

export function provide<P, T extends Array<Executor<unknown>> | Record<string, Executor<unknown>>>(
  executor: { [K in keyof T]: T[K] },
  factory: Factory<P, { [K in keyof T]: InferOutput<T[K]> }>,
): ImmutableExecutor<P>;

export function provide<P, T>(
  pDependencyOrFactory: Executor<T> | { [K in keyof T]: Executor<T[K]> } | ((scope: Scope) => P | Promise<P>),
  factory?: Factory<P, { [K in keyof T]: InferOutput<T[K]> }> | Factory<P, InferOutput<T>>,
): ImmutableExecutor<P> {
  if (typeof pDependencyOrFactory === "function") {
    return {
      [executorSymbol]: { kind: "immutable" },
      factory: (_, scope) => pDependencyOrFactory(scope),
      dependencies: undefined,
      id: nextProviderId(),
    };
  }

  if (factory === undefined) {
    throw new Error("Factory is required");
  }

  if (isExecutor(pDependencyOrFactory)) {
    return {
      [executorSymbol]: { kind: "immutable" },
      factory: (dependencies, scope) => factory(dependencies as any, scope),
      dependencies: pDependencyOrFactory,
      id: nextProviderId(),
    };
  }

  return {
    [executorSymbol]: { kind: "immutable" },
    factory: (dependencies, scope) => factory(dependencies as any, scope),
    dependencies: pDependencyOrFactory,
    id: nextProviderId(),
  };
}
