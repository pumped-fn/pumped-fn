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

function createMultiExecutor<T, K>(
  option: Option<K>,
  poolId: Meta.MetaFn<any>,
  keyPool: Map<unknown, Core.Executor<T>>,
  createNewExecutor: (key: K) => Core.Executor<T>,
  providerMetas: Meta.Meta[]
): MultiExecutor<T, K> {
  const processKey = (key: K) => {
    const validatedKey = validate(option.keySchema, key);
    const transformedKey = option.keyTransform
      ? option.keyTransform(validatedKey)
      : validatedKey;
    return { validatedKey, transformedKey };
  };

  const newProvider = (key: K) => {
    const { transformedKey } = processKey(key);
    const executor = createNewExecutor(key);
    keyPool.set(transformedKey, executor);
    return executor;
  };

  const provider = createExecutor(
    (ctl: Core.Controller) => {
      return (key: K) => {
        const { transformedKey } = processKey(key);
        let executor = keyPool.get(transformedKey);
        if (!executor) {
          executor = newProvider(key);
        }
        return ctl.scope.accessor(executor);
      };
    },
    undefined,
    providerMetas
  );

  const multiExecutor: MultiExecutor<T, K> = ((key: K) => {
    const { transformedKey } = processKey(key);
    return keyPool.get(transformedKey) || newProvider(key);
  }) as any;

  Object.assign(multiExecutor, provider);
  multiExecutor.release = async (scope: Core.Scope) => {
    const entries = scope.entries();
    for (const [executor] of entries) {
      const check = poolId.some ? poolId.some(executor) : poolId.find(executor);
      if (check && (Array.isArray(check) ? check.length > 0 : check)) {
        await scope.release(executor);
      }
    }
  };
  multiExecutor.id = poolId as any;

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

// code may look like this
// const multi = provide(schema <K>, (key: K) => { /// value: T}) --> MultiExecutor<T,K>
// const hardcodedMulti = multi({ key }) // Core.Executor<T>
