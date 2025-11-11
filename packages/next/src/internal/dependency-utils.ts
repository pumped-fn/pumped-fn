import { isExecutor, isLazyExecutor, isReactiveExecutor, isStaticExecutor } from "../executor";
import type { Core } from "../types";
import type { Escapable } from "../helpers";

type ResolveFn = (item: Core.UExecutor | Escapable<unknown>) => Promise<unknown>;

export async function resolveShape<T extends Core.UExecutor | ReadonlyArray<Core.UExecutor | Escapable<unknown>> | Record<string, Core.UExecutor | Escapable<unknown>> | undefined>(
  scope: Core.Scope,
  shape: T,
  resolveFn?: ResolveFn
): Promise<any> {
  if (shape === undefined) {
    return undefined;
  }

  const unwrapTarget = (item: Core.UExecutor | Escapable<unknown>): Core.Executor<unknown> => {
    const executor = !isExecutor(item) ? (item as Escapable<unknown>).escape() : item;

    if (isLazyExecutor(executor) || isReactiveExecutor(executor) || isStaticExecutor(executor)) {
      return executor.executor;
    }

    return executor as Core.Executor<unknown>;
  };

  const resolveItem = resolveFn
    ? resolveFn
    : async (item: Core.UExecutor | Escapable<unknown>) => {
        const target = unwrapTarget(item);
        return await scope.resolve(target);
      };

  if (Array.isArray(shape)) {
    const results = [];
    for (const item of shape) {
      const result = await resolveItem(item);
      results.push(result);
    }
    return results;
  }

  if (typeof shape === "object") {
    if ("factory" in shape) {
      return await resolveItem(shape as Core.UExecutor);
    }

    if ("escape" in shape) {
      const unwrapped = (shape as unknown as Escapable<unknown>).escape();
      return await resolveItem(unwrapped);
    }

    const results: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(shape)) {
      const result = await resolveItem(item);
      results[key] = result;
    }
    return results;
  }

  return undefined;
}
