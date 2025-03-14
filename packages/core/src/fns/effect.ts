import { Executor, executorSymbol, isExecutor, EffectExecutor, InferOutput } from "../types";
import { Factory, Cleanup } from "../types";

let effectId = 0;

const nextEffectId = () => {
  return `effect:${effectId++}`;
};

export function effect<T extends Executor<unknown>>(
  executor: T,
  factory: Factory<Cleanup, InferOutput<T>>,
): EffectExecutor;

export function effect<T extends Array<Executor<unknown>> | Record<string, Executor<unknown>>>(
  executor: { [K in keyof T]: T[K] },
  factory: Factory<Cleanup, InferOutput<T>>,
): EffectExecutor;

export function effect<T>(
  pDependencyOrFactory: Executor<T> | { [K in keyof T]: Executor<T[K]> },
  factory: Factory<Cleanup, T>,
): EffectExecutor {
  if (isExecutor(pDependencyOrFactory)) {
    return {
      [executorSymbol]: { kind: "effect" },
      factory: (dependencies, scope) => factory(dependencies as any, scope),
      dependencies: pDependencyOrFactory,
      id: nextEffectId(),
    };
  }

  return {
    [executorSymbol]: { kind: "effect" },
    factory: (dependencies, scope) => factory(dependencies as any, scope),
    dependencies: pDependencyOrFactory,
    id: nextEffectId(),
  };
}
