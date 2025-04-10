import { Meta } from "../meta";
import { Executor, executorSymbol, InferOutput, ResourceExecutor } from "../types";
import { Factory, Cleanup } from "../types";
import { anyCreate } from "./_internal";

let resourceId = 0;

const nextResourceId = () => {
  return `resource:${resourceId++}`;
};

export function isResourceExecutor<P>(executor: Executor<unknown>): executor is ResourceExecutor<P> {
  return executor[executorSymbol].kind === "resource";
}

export function resource<P>(factory: Factory<[P, Cleanup], P>, ...metas: Meta<unknown>[]): ResourceExecutor<P>;

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

export function resource(...params: unknown[]) {
  return anyCreate({ kind: "resource" }, nextResourceId(), ...params);
}
