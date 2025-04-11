import { Meta, isMeta } from "../meta";
import {
  Effect,
  EffectExecutor,
  EnvelopExecutor,
  EnvelopLike,
  ExecutionScope,
  Executor,
  ExecutorKind,
  executorSymbol,
  Immutable,
  ImmutableExecutor,
  InferOutput,
  isExecutor,
  Mutable,
  MutableExecutor,
  Reactive,
  ReactiveExecutor,
  ReactiveResource,
  ReactiveResourceExecutor,
  ReferenceExecutor,
  Resource,
  ResourceExecutor,
  Scope,
} from "../types";

class CreateExecutorError extends Error {
  constructor(message: string, cause?: any) {
    super(message, { cause });
    this.name = "CreateExecutorError";
  }
}

function isAllValuesExecutor(input: unknown): input is Executor<unknown>[] | Record<string, Executor<unknown>> {
  if (typeof input !== "object" || input === null) {
    return true;
  }

  return Object.values(input).every(isExecutor);
}

function isAllMetas(input: unknown[] | undefined): input is Meta<unknown>[] {
  if (!input) {
    return true;
  }

  return input.every(isMeta);
}

export function anyCreate<P, T, K extends ExecutorKind>(
  kind: K,
  id: string,
  ...params: unknown[]
): K extends Immutable
  ? ImmutableExecutor<P>
  : K extends Mutable
    ? MutableExecutor<P>
    : K extends Effect
      ? EffectExecutor
      : K extends Reactive
        ? ReactiveExecutor<P>
        : K extends Resource
          ? ResourceExecutor<P>
          : K extends ReactiveResource
            ? ReactiveResourceExecutor<P>
            : never {
  if (params.length === 0) {
    throw new CreateExecutorError(`failed to create resource ${kind.kind}:${id}, params are empty`);
  }

  if (typeof params[0] === "function") {
    const [factory, ...metas] = params;

    if (!isAllMetas(metas)) {
      throw new CreateExecutorError(`failed to create resource ${kind.kind}:${id}, metas are invalid`, metas);
    }

    return createExecutor(kind, (_, scope) => factory(scope), undefined, id, metas as Meta<unknown>[] | undefined);
  }

  if (isExecutor(params[0]) || (isAllValuesExecutor(params[0]) && typeof params[1] === "function")) {
    const [dependencies, factory, ...metas] = params;

    if (!isAllMetas(metas)) {
      throw new CreateExecutorError(`failed to create resource ${kind.kind}:${id}, metas are invalid`, metas);
    }

    return createExecutor(kind, factory as any, dependencies, id, metas as Meta<unknown>[] | undefined);
  }

  throw new CreateExecutorError(`failed to create resource ${kind.kind}:${id}, invalid param set`, params);
}

export function createExecutor<T, K extends ExecutorKind>(
  kind: K,
  factory: (dependencies: any, scope: Scope | ExecutionScope) => any,
  dependencies: Executor<unknown>[] | Record<string, Executor<unknown>> | Executor<unknown> | undefined,
  id: string,
  meta: Meta<unknown>[] | undefined,
): K extends Immutable
  ? ImmutableExecutor<T>
  : K extends Mutable
    ? MutableExecutor<T>
    : K extends Effect
      ? EffectExecutor
      : K extends Reactive
        ? ReactiveExecutor<T>
        : K extends Resource
          ? ResourceExecutor<T>
          : K extends ReactiveResource
            ? ReactiveResourceExecutor<T>
            : never {
  const executor = {} as Executor<T>;

  Object.defineProperties(executor, {
    [executorSymbol]: {
      value: kind,
      writable: false,
      configurable: false,
      enumerable: false,
    },
    factory: {
      value: factory,
      writable: false,
      configurable: false,
      enumerable: false,
    },
    dependencies: {
      value: dependencies,
      writable: false,
      configurable: false,
      enumerable: false,
    },
    id: {
      value: id,
      writable: false,
      configurable: false,
      enumerable: false,
    },
    metas: {
      value: meta,
      writable: false,
      configurable: false,
      enumerable: false,
    },
  });

  const ref = createRefExecutor(executor);
  const envelop = createEnvelop(executor);

  Object.defineProperty(executor, "ref", {
    value: ref,
    writable: false,
    configurable: false,
    enumerable: true,
  });

  Object.defineProperty(executor, "envelop", {
    value: envelop,
    writable: false,
    configurable: false,
    enumerable: true,
  });

  return executor as any;
}

export function isRefExecutor(executor: Executor<unknown>): executor is ReferenceExecutor<any> {
  return executor[executorSymbol].kind === "reference";
}

export function isEnvelopExecutor(executor: Executor<unknown>): executor is EnvelopExecutor<any> {
  return executor[executorSymbol].kind === "envelop";
}

function createEnvelop<T extends Executor<unknown>>(executor: T): EnvelopExecutor<T> {
  if (executor[executorSymbol].kind === "envelop") {
    throw new Error(`an envelop couldn't be enveloped`);
  }

  return Object.defineProperties<EnvelopExecutor<T>>({} as EnvelopExecutor<T>, {
    [executorSymbol]: {
      value: { kind: "envelop" },
      writable: false,
      configurable: false,
      enumerable: false,
    },
    factory: {
      value: (resolved: InferOutput<T>, scope: Scope): EnvelopLike<T> => {
        return {
          content: resolved,
          metas: executor.metas,
        };
      },
      writable: false,
      configurable: false,
      enumerable: false,
    },
    dependencies: {
      value: [executor],
      writable: false,
      configurable: false,
      enumerable: false,
    },
    id: {
      value: `envelop(${executor.id})`,
      writable: false,
      configurable: false,
      enumerable: false,
    },
    ref: {
      get() {
        throw new Error(`an envelop couldn't be refed`);
      },
    },
    envelop: {
      get() {
        throw new Error(`an envelop couldn't be enveloped`);
      },
    },
  });
}

function createRefExecutor<T extends Executor<unknown>>(executor: T): ReferenceExecutor<T> {
  if (executor[executorSymbol].kind === "reference") {
    throw new Error(`a ref couldn't be refed`);
  }

  return Object.defineProperties<ReferenceExecutor<T>>({} as ReferenceExecutor<T>, {
    [executorSymbol]: {
      value: { kind: "reference" },
      writable: false,
      configurable: false,
      enumerable: false,
    },
    factory: {
      value: async (_: unknown, scope: Scope) => {
        await scope.resolve(executor);

        return executor;
      },
      writable: false,
      configurable: false,
      enumerable: false,
    },
    dependencies: {
      value: [executor],
      writable: false,
      configurable: false,
      enumerable: false,
    },
    id: {
      value: `ref(${executor.id})`,
      writable: false,
      configurable: false,
      enumerable: false,
    },
    ref: {
      get() {
        throw new Error(`a ref couldn't be refed`);
      },
    },
    envelop: {
      get() {
        throw new Error(`a ref couldn't be enveloped`);
      },
    },
  });
}
