import { Executor, EffectExecutor, InferOutput, executorSymbol } from "../types";
import { Factory, Cleanup } from "../types";
import type { Meta } from "../meta";
import { anyCreate } from "./_internal";

let effectId = 0;

const nextEffectId = () => {
  return `effect:${effectId++}`;
};

export function isEffectExecutor(value: Executor<unknown>): value is EffectExecutor {
  return value[executorSymbol].kind === "effect";
}

export function effect<T extends Executor<unknown>>(
  executor: T,
  factory: Factory<Cleanup, InferOutput<T>>,
  ...metas: Meta<unknown>[]
): EffectExecutor;

export function effect<T extends Array<Executor<unknown>> | Record<string, Executor<unknown>>>(
  executor: { [K in keyof T]: T[K] },
  factory: Factory<Cleanup, InferOutput<T>>,
  ...metas: Meta<unknown>[]
): EffectExecutor;

export function effect<T>(
  pDependencyOrFactory: Executor<T> | { [K in keyof T]: Executor<T[K]> },
  ...params: unknown[]
): EffectExecutor {
  return anyCreate({ kind: "effect" }, nextEffectId(), pDependencyOrFactory, ...params);
}
