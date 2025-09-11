/** facilities to add multiple instances (key set) */
import { createExecutor } from "./executor";
import { meta } from "./meta";
import { custom, validate } from "./ssch";
import { Core, Meta } from "./types";
import { type StandardSchemaV1 } from "./types";

type MultiExecutor<T, K> = Core.Executor<(k: K) => Core.Accessor<T>> &
  ((key: K) => Core.Executor<T>) & {
    release: (scope: Core.Scope) => Promise<void>;
    id: Meta.MetaFn<unknown>;
  };

export type DependentFn<T, K, D> = (
  dependencies: D,
  key: K,
  scope: Core.Controller
) => Core.Output<T>;

type Option<K> = {
  keySchema: StandardSchemaV1<K>;
  /** Key transform will be used to store and retrieve */
  keyTransform?: (key: K) => unknown;
};

type DeriveOption<K, D> = Option<K> & {
  dependencies: D;
};

class MultiExecutorImpl<T, K> {
  private option: Option<K>;
  private poolId: Meta.MetaFn<any>;
  private keyPool: Map<unknown, Core.Executor<T>>;
  private createNewExecutor: (key: K) => Core.Executor<T>;
  public id: Meta.MetaFn<any>;

  constructor(
    option: Option<K>,
    poolId: Meta.MetaFn<any>,
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
      const { transformedKey } = this.processKey(key);
      let executor = this.keyPool.get(transformedKey);
      if (!executor) {
        executor = this.newProvider(key);
      }
      return ctl.scope.accessor(executor);
    };
  }

  async release(scope: Core.Scope): Promise<void> {
    const entries = scope.entries();
    for (const [executor] of entries) {
      const check = this.poolId.some ? this.poolId.some(executor) : this.poolId.find(executor);
      if (check && (Array.isArray(check) ? check.length > 0 : check)) {
        await scope.release(executor);
      }
    }
  }
}

function createMultiExecutor<T, K>(
  option: Option<K>,
  poolId: Meta.MetaFn<any>,
  keyPool: Map<unknown, Core.Executor<T>>,
  createNewExecutor: (key: K) => Core.Executor<T>,
  providerMetas: Meta.Meta[]
): MultiExecutor<T, K> {
  const impl = new MultiExecutorImpl(option, poolId, keyPool, createNewExecutor);

  const provider = createExecutor(
    (ctl: Core.Controller) => impl.providerFactory(ctl),
    undefined,
    providerMetas
  );

  const multiExecutor: MultiExecutor<T, K> = ((key: K) => impl.__call(key)) as any;

  Object.assign(multiExecutor, provider);
  multiExecutor.release = (scope: Core.Scope) => impl.release(scope);
  multiExecutor.id = impl.id;

  return multiExecutor;
}

export function provide<T, K>(
  option: Option<K>,
  valueFn: (key: K, controller: Core.Controller) => T | Promise<T>,
  ...metas: Meta.Meta[]
): MultiExecutor<T, K> {
  const poolId = meta(Symbol(), custom<undefined>());
  const keyPool = new Map<unknown, Core.Executor<T>>();

  const createNewExecutor = (key: K) => {
    const validatedKey = validate(option.keySchema, key);
    return createExecutor(
      (ctl: Core.Controller) => valueFn(validatedKey, ctl),
      undefined,
      [poolId(undefined), ...metas]
    );
  };

  return createMultiExecutor(option, poolId, keyPool, createNewExecutor, [
    poolId(undefined),
    ...metas,
  ]);
}

export function derive<T, K, D extends Core.DependencyLike>(
  option: DeriveOption<K, { [K in keyof D]: D[K] }>,
  valueFn: DependentFn<T, K, Core.InferOutput<D>>,
  ...metas: Meta.Meta[]
): MultiExecutor<T, K> {
  const poolId = meta(Symbol(), custom<void>());
  const keyPool = new Map<unknown, Core.Executor<T>>();

  const createNewExecutor = (key: K) => {
    const validatedKey = validate(option.keySchema, key);
    return createExecutor(
      (dependencies, ctl) => valueFn(dependencies as any, validatedKey, ctl),
      option.dependencies as any,
      metas
    );
  };

  return createMultiExecutor(option, poolId, keyPool, createNewExecutor, metas);
}
