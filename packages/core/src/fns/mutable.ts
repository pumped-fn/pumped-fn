import { Meta } from "../meta";
import { Executor, executorSymbol, Factory, InferOutput, MutableExecutor, Scope } from "../types";
import { anyCreate } from "./_internal";

let mutableId = 0;

const nextMutableId = () => {
  return `mutable:${mutableId++}`;
};

export function isMutable<P>(executor: Executor<unknown>): executor is MutableExecutor<P> {
  return executor[executorSymbol].kind === "mutable";
}

export function mutable<P>(factory: (scope: Scope) => P, ...metas: Meta<unknown>[]): MutableExecutor<P>;

export function mutable<P, T extends Executor<unknown>>(
  executor: T,
  factory: Factory<P, InferOutput<T>>,
  ...metas: Meta<unknown>[]
): MutableExecutor<P>;

export function mutable<P, T extends Array<Executor<unknown>> | Record<string, Executor<unknown>>>(
  executor: { [K in keyof T]: T[K] },
  factory: Factory<P, { [K in keyof T]: InferOutput<T[K]> }>,
  ...metas: Meta<unknown>[]
): MutableExecutor<P>;

export function mutable<P, T>(
  pDependencyOrFactory: Executor<T> | { [K in keyof T]: Executor<T[K]> } | ((scope: Scope) => P | Promise<P>),
  ...params: unknown[]
): MutableExecutor<P> {
  return anyCreate({ kind: "mutable" }, nextMutableId(), pDependencyOrFactory, ...params);
}
