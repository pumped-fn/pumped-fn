import { isExecutor, isLazyExecutor, isReactiveExecutor, isStaticExecutor } from "../executor";
import type { Core } from "../types";
import type { Escapable } from "../helpers";
import { isTag, isTagExecutor } from "../tag-executors";
import { type Tag } from "../tag-types";

type ResolveFn = (item: Core.UExecutor | Tag.Tag<any, boolean> | Tag.TagExecutor<any, any> | Escapable<unknown>) => Promise<unknown>;

export async function resolveShape<T extends Core.UExecutor | Tag.Tag<any, boolean> | Tag.TagExecutor<any, any> | ReadonlyArray<Core.UExecutor | Tag.Tag<any, boolean> | Tag.TagExecutor<any, any> | Escapable<unknown>> | Record<string, Core.UExecutor | Tag.Tag<any, boolean> | Tag.TagExecutor<any, any> | Escapable<unknown>> | undefined>(
  scope: Core.Scope,
  shape: T,
  resolveFn?: ResolveFn
): Promise<any> {
  if (shape === undefined) {
    return undefined;
  }

  const unwrapTarget = (item: Core.UExecutor | Tag.Tag<any, boolean> | Tag.TagExecutor<any, any> | Escapable<unknown>): Core.Executor<unknown> | Tag.Tag<any, boolean> | Tag.TagExecutor<any, any> => {
    if (isTagExecutor(item)) {
      return item;
    }

    if (isTag(item)) {
      return item;
    }

    const executor = !isExecutor(item) ? (item as Escapable<unknown>).escape() : item;

    if (isLazyExecutor(executor) || isReactiveExecutor(executor) || isStaticExecutor(executor)) {
      return executor.executor;
    }

    return executor as Core.Executor<unknown>;
  };

  const resolveItem = resolveFn
    ? resolveFn
    : async (item: Core.UExecutor | Tag.Tag<any, boolean> | Tag.TagExecutor<any, any> | Escapable<unknown>) => {
        if (isTagExecutor(item)) {
          return (scope as any).resolveTagExecutor(item);
        }

        if (isTag(item)) {
          return (scope as any).resolveTag(item);
        }

        const target = unwrapTarget(item);
        return await scope.resolve(target as Core.Executor<unknown>);
      };

  if (Array.isArray(shape)) {
    const promises = [];
    for (const item of shape) {
      promises.push(resolveItem(item));
    }
    return await Promise.all(promises);
  }

  if (typeof shape === "object") {
    if ("factory" in shape) {
      return await resolveItem(shape as Core.UExecutor);
    }

    if ("escape" in shape) {
      const unwrapped = (shape as unknown as Escapable<unknown>).escape();
      return await resolveItem(unwrapped);
    }

    const entries = Object.entries(shape);
    const promises = entries.map(([_, item]) => resolveItem(item));
    const resolvedValues = await Promise.all(promises);

    const results: Record<string, unknown> = {};
    for (let i = 0; i < entries.length; i++) {
      results[entries[i][0]] = resolvedValues[i];
    }
    return results;
  }

  return undefined;
}
