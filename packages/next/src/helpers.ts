import { Core, type Escapable, type Extension } from "./types";
import { isExecutor, isLazyExecutor, isReactiveExecutor, isStaticExecutor } from "./executor";

export type { Escapable } from "./types";

/**
 * Type helper for defining extensions (no-op at runtime).
 * @param ext - Extension object with init/wrap/onError/dispose hooks
 * @example extension({ name: "logger", wrap: (scope, next, op) => next() })
 */
export function extension<T extends Extension.Extension>(ext: T): T {
  return ext;
}

function unwrapItem(item: unknown): Core.Executor<unknown> {
  if (item && typeof item === "object" && "escape" in item) {
    return (item as Escapable<unknown>).escape();
  }

  if (!isExecutor(item)) {
    throw new Error("Invalid item: expected executor or escapable");
  }

  if (isLazyExecutor(item) || isReactiveExecutor(item) || isStaticExecutor(item)) {
    return item.executor;
  }

  return item as Core.Executor<unknown>;
}

export async function resolves<
  T extends
    | Array<Core.Executor<unknown> | Escapable<unknown>>
    | Record<string, Core.Executor<unknown> | Escapable<unknown>>
>(
  scope: Core.Scope,
  executors: { [K in keyof T]: T[K] }
): Promise<{ [K in keyof T]: Core.InferOutput<T[K]> }> {
  const shape = executors as
    | Core.UExecutor
    | ReadonlyArray<Core.UExecutor>
    | Record<string, Core.UExecutor>
    | undefined;

  if (shape === undefined) {
    return undefined as any;
  }

  if (Array.isArray(shape)) {
    const promises = shape.map((item) => scope.resolve(unwrapItem(item)));
    return (await Promise.all(promises)) as any;
  }

  if (typeof shape === "object") {
    const entries = Object.entries(shape);
    const promises = entries.map(([_, item]) => scope.resolve(unwrapItem(item)));
    const resolvedValues = await Promise.all(promises);

    const results: Record<string, unknown> = {};
    for (let i = 0; i < entries.length; i++) {
      results[entries[i][0]] = resolvedValues[i];
    }
    return results as any;
  }

  return undefined as any;
}
