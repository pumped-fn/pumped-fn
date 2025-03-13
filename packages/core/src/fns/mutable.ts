import { Executor, executorSymbol, Factory, InferOutput, isExecutor, MutableExecutor, Scope } from "../types";

let mutableId = 0;

const nextMutableId = () => {
  return `mutable:${mutableId++}`;
};

export function mutable<P>(factory: (scope: Scope) => P): MutableExecutor<P>;

export function mutable<P, T extends Executor<unknown>>(
  executor: T,
  factory: Factory<P, InferOutput<T>>,
): MutableExecutor<P>;

export function mutable<P, T extends Array<Executor<unknown>> | Record<string, Executor<unknown>>>(
  executor: { [K in keyof T]: T[K] },
  factory: Factory<P, { [K in keyof T]: InferOutput<T[K]> }>,
): MutableExecutor<P>;

export function mutable<P, T>(
  pDependencyOrFactory: Executor<T> | { [K in keyof T]: Executor<T[K]> } | ((scope: Scope) => P | Promise<P>),
  factory?: Factory<P, { [K in keyof T]: InferOutput<T[K]> }> | Factory<P, InferOutput<T>>,
): MutableExecutor<P> {
  if (typeof pDependencyOrFactory === "function") {
    return {
      [executorSymbol]: { kind: "mutable" },
      factory: (_, scope) => pDependencyOrFactory(scope),
      dependencies: undefined,
      id: nextMutableId(),
    };
  }

  if (factory === undefined) {
    throw new Error("Factory is required");
  }

  if (isExecutor(pDependencyOrFactory)) {
    return {
      [executorSymbol]: { kind: "mutable" },
      factory: (dependencies, scope) => factory(dependencies as any, scope),
      dependencies: pDependencyOrFactory,
      id: nextMutableId(),
    };
  }

  return {
    [executorSymbol]: { kind: "mutable" },
    factory: (dependencies, scope) => factory(dependencies as any, scope),
    dependencies: pDependencyOrFactory,
    id: nextMutableId(),
  };
}
