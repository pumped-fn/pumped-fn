import { createExecutor } from "./executor";
import { tag } from "./tag";
import { Promised } from "./promises";
import { custom, validate } from "./ssch";
import {
  type Core,
  type Multi,
  type StandardSchemaV1,
} from "./types";
import { type Tag } from "./tag-types";

class MultiExecutorImpl<T, K, PoolIdType = unknown> {
  private option: Multi.Option<K>;
  private poolId: Tag.Tag<PoolIdType, true>;
  private keyPool: Map<unknown, Core.Executor<T>>;
  private createNewExecutor: (key: K) => Core.Executor<T>;
  public id: Tag.Tag<PoolIdType, true>;

  constructor(
    option: Multi.Option<K>,
    poolId: Tag.Tag<PoolIdType, true>,
    keyPool: Map<unknown, Core.Executor<T>>,
    createNewExecutor: (key: K) => Core.Executor<T>
  ) {
    this.option = option;
    this.poolId = poolId;
    this.keyPool = keyPool;
    this.createNewExecutor = createNewExecutor;
    this.id = poolId;
  }

  processKey(key: K) {
    const validatedKey = validate(this.option.keySchema, key);
    const transformedKey = this.option.keyTransform
      ? this.option.keyTransform(validatedKey)
      : validatedKey;
    return { validatedKey, transformedKey };
  }

  newProvider(key: K): Core.Executor<T> {
    const { transformedKey } = this.processKey(key);
    const executor = this.createNewExecutor(key);
    this.keyPool.set(transformedKey, executor);
    return executor;
  }

  __call(key: K): Core.Executor<T> {
    const { transformedKey } = this.processKey(key);
    return this.keyPool.get(transformedKey) || this.newProvider(key);
  }

  providerFactory(ctl: Core.Controller) {
    return (key: K) => {
      const executor = this.__call(key);
      return ctl.scope.accessor(executor);
    };
  }

  release(scope: Core.Scope): Promised<void> {
    return Promised.create((async () => {
      const entries = scope.entries();
      for (const [executor] of entries) {
        const check = this.poolId.some
          ? this.poolId.some(executor)
          : this.poolId.find(executor);
        if (check && (Array.isArray(check) ? check.length > 0 : check)) {
          await scope.release(executor);
        }
      }
    })());
  }
}

function createValidatedExecutor<T, K>(
  option: Multi.Option<K>,
  key: K,
  createExecutorFn: (validatedKey: K) => Core.Executor<T>
): Core.Executor<T> {
  const validatedKey = validate(option.keySchema, key);
  return createExecutorFn(validatedKey);
}

function createMultiExecutor<T, K, PoolIdType>(
  option: Multi.Option<K>,
  poolId: Tag.Tag<PoolIdType, true>,
  keyPool: Map<unknown, Core.Executor<T>>,
  createNewExecutor: (key: K) => Core.Executor<T>,
  providerTags: Tag.Tagged[]
): Multi.MultiExecutor<T, K> {
  const impl = new MultiExecutorImpl<T, K, PoolIdType>(
    option,
    poolId,
    keyPool,
    createNewExecutor
  );

  const provider = createExecutor(
    (ctl: Core.Controller) => impl.providerFactory(ctl),
    undefined,
    providerTags
  );

  const callableFn = (key: K) => impl.__call(key);
  const multiExecutor = Object.assign(callableFn, provider, {
    release: (scope: Core.Scope) => impl.release(scope),
    id: impl.id,
  }) as Multi.MultiExecutor<T, K>;

  return multiExecutor;
}

export function provide<T, K>(
  option: Multi.Option<K>,
  valueFn: (key: K, controller: Core.Controller) => T | Promise<T>,
  ...tags: Tag.Tagged[]
): Multi.MultiExecutor<T, K> {
  const poolId = tag(custom<null>(), { label: Symbol().toString(), default: null }) as Tag.Tag<null, true>;
  const keyPool = new Map<unknown, Core.Executor<T>>();

  const createNewExecutor = (key: K) => {
    return createValidatedExecutor(option, key, (validatedKey) =>
      createExecutor(
        (ctl: Core.Controller) => valueFn(validatedKey, ctl),
        undefined,
        [poolId(null), ...tags]
      )
    );
  };

  return createMultiExecutor(option, poolId, keyPool, createNewExecutor, [
    poolId(null),
    ...tags,
  ]);
}

export function derive<T, K, D extends Core.DependencyLike>(
  option: Multi.DeriveOption<K, { [K in keyof D]: D[K] }>,
  valueFn: Multi.DependentFn<T, K, Core.InferOutput<D>>,
  ...tags: Tag.Tagged[]
): Multi.MultiExecutor<T, K> {
  const poolId = tag(custom<null>(), { label: Symbol().toString(), default: null }) as Tag.Tag<null, true>;
  const keyPool = new Map<unknown, Core.Executor<T>>();

  const createNewExecutor = (key: K) => {
    return createValidatedExecutor(option, key, (validatedKey) => {
      const factory: Core.DependentFn<T, unknown> = (dependencies, ctl) =>
        valueFn(dependencies as Core.InferOutput<D>, validatedKey, ctl);

      const deps = option.dependencies as
        | Core.UExecutor
        | ReadonlyArray<Core.UExecutor>
        | Record<string, Core.UExecutor>;

      return createExecutor(factory, deps, tags);
    });
  };

  return createMultiExecutor(option, poolId, keyPool, createNewExecutor, tags);
}
