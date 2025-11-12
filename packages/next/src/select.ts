import { derive } from "./executor";
import { type Core } from "./types";

type SelectOptions<T> = {
  equals?: (a: T, b: T) => boolean;
};

class SelectPool<T extends object> {
  private cache = new Map<PropertyKey, WeakRef<Core.Executor<any>>>();
  private registry = new FinalizationRegistry<PropertyKey>((key) => {
    this.cache.delete(key);
  });

  select<K extends keyof T>(
    parent: Core.Executor<T>,
    key: K,
    options?: SelectOptions<T[K]>
  ): Core.Executor<T[K]> {
    const cached = this.cache.get(key)?.deref();
    if (cached) {
      return cached as Core.Executor<T[K]>;
    }

    const equals = options?.equals || Object.is;

    const state = derive(parent, (parentValue, ctl) => {
      const initialValue = parentValue[key];

      const updater = derive(parent.reactive, (reactiveValue) => {
        const currentValue = ctl.scope.accessor(state).get();
        const nextValue = reactiveValue[key];

        if (!equals(currentValue, nextValue)) {
          // Type assertion needed: nextValue is Awaited<T>[K], but scope.update expects T[K]
          // Safe because executor resolution automatically handles Promise unwrapping
          ctl.scope.update(state, nextValue as any);
        }
      });

      ctl.scope.resolve(updater);
      ctl.cleanup(() => ctl.scope.release(updater));

      return initialValue;
    });

    this.cache.set(key, new WeakRef(state));
    this.registry.register(state, key, state);

    return state;
  }
}

const selectPools = new WeakMap<Core.Executor<any>, SelectPool<any>>();

export function select<T, K extends keyof T>(
  parent: Core.Executor<T>,
  key: K,
  options?: SelectOptions<T[K]>
): Core.Executor<T[K]> {
  let pool = selectPools.get(parent);
  if (!pool) {
    pool = new SelectPool<T & object>();
    selectPools.set(parent, pool);
  }
  return pool.select(parent as Core.Executor<T & object>, key, options);
}
