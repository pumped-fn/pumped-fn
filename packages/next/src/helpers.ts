import { resolveShape } from "./internal/dependency-utils";
import { Core } from "./types";

export async function resolves<
  T extends
    | Array<Core.Executor<unknown> | Escapable<unknown>>
    | Record<string, Core.Executor<unknown> | Escapable<unknown>>
>(
  scope: Core.Scope,
  executors: { [K in keyof T]: T[K] }
): Promise<{ [K in keyof T]: Core.InferOutput<T[K]> }> {
  return resolveShape(scope, executors as any) as Promise<{ [K in keyof T]: Core.InferOutput<T[K]> }>;
}

export type Escapable<T> = {
  escape: () => Core.Executor<T>;
};
