import { type StandardSchemaV1, type Meta, type Executor, provide, isExecutor } from "@pumped-fn/core";

export declare namespace Def {
  export interface API<I, O> extends Record<string | symbol, unknown> {
    readonly input: StandardSchemaV1<I>;
    readonly output: StandardSchemaV1<O>;
    readonly metas?: Meta<unknown>[];
  }

  export interface Stream<MI, MO, I, O> extends API<I, O> {
    readonly messageIn: StandardSchemaV1<MI>;
    readonly messageOut: StandardSchemaV1<MO>;
  }

  export type AnyAPI = API<unknown, unknown>;

  export type Service = Record<string, AnyAPI> & {
    readonly metas?: Meta<unknown>[];
  };
}

export declare namespace Impl {
  export interface API<
    S extends Def.Service,
    Key extends keyof S,
    I extends StandardSchemaV1.InferInput<S[Key]["input"]> = StandardSchemaV1.InferInput<S[Key]["input"]>,
    O extends StandardSchemaV1.InferOutput<S[Key]["output"]> = StandardSchemaV1.InferOutput<S[Key]["output"]>,
  > extends Def.API<I, O> {
    def: S;
    id: Key;
    handler: (context: I) => O | Promise<O>;
  }

  export type AnyAPI = API<any, any, any, any>;

  export type Service = {
    routes: Record<string, Executor<AnyAPI>>;
    metas?: Meta[];
  };
}

export const define = {
  api<I, O>(api: Def.API<I, O>): typeof api {
    return api;
  },
  stream<MI, MO, I, O>(stream: Def.Stream<MI, MO, I, O>): typeof stream {
    return stream;
  },
  service<Service extends Record<string, Def.AnyAPI>>(service: Service) {
    return service;
  },
} as const;

export const impl = {
  api<S extends Def.Service, K extends keyof S>(
    service: S,
    path: K,
    impl: Executor<Impl.API<S, K>["handler"]>,
    ...metas: Meta[]
  ): Executor<Impl.API<S, K>> {
    return provide(
      impl,
      (impl) => ({
        id: path,
        def: service,
        handler: impl,
        input: service[path]["input"],
        output: service[path]["output"],
      }),
      ...(service[path].metas || []),
      ...metas,
    );
  },
  service<S extends Def.Service>(
    service: S,
    impls: {
      [K in keyof S]: Executor<Impl.API<S, K> | Impl.API<S, K>["handler"]>;
    },
    ...metas: Meta[]
  ): Impl.Service {
    const result: Impl.Service = {
      routes: {},
      metas: service.metas ? [...service.metas, ...metas] : metas,
    };

    for (const key in service) {
      const route = impls[key];

      if (isExecutor(route)) {
        result.routes[key] = route as any;
      } else {
        result.routes[key] = provide(() => impls) as any;
      }
    }

    return result;
  },
};
